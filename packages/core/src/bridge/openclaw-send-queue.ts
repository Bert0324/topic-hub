import type { Model } from 'mongoose';
import type { TopicHubLogger } from '../common/logger';
import { OpenClawBridge } from './openclaw-bridge';
import type { OpenClawConfig } from './openclaw-types';

function resolveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function resolveStaleProcessingMs(): number {
  return resolveIntEnv('TOPICHUB_OPENCLAW_SEND_QUEUE_STALE_MS', 90_000, 10_000, 600_000);
}

/**
 * Lease leader: drain {@link OpenClawSendQueueEntry} `pending` rows and POST to the local embedded gateway.
 */
export function startOpenClawSendQueuePoller(params: {
  queueModel: Model<any>;
  gatewayBaseUrl: string;
  token: string;
  logger: TopicHubLogger;
}): () => void {
  const url = `${params.gatewayBaseUrl.replace(/\/+$/, '')}/tools/invoke`;
  const pollMs = resolveIntEnv('TOPICHUB_OPENCLAW_SEND_QUEUE_POLL_MS', 150, 20, 5000);
  const staleMs = resolveStaleProcessingMs();
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      const staleBefore = new Date(Date.now() - staleMs);
      const doc = await params.queueModel
        .findOneAndUpdate(
          {
            $or: [{ status: 'pending' }, { status: 'processing', processingSince: { $lte: staleBefore } }],
          },
          { $set: { status: 'processing', processingSince: new Date() } },
          { sort: { createdAt: 1 }, new: true },
        )
        .exec();
      if (!doc) return;

      const channel = String(doc.channel);
      const target = String(doc.target);
      const message = String(doc.message);
      const sessionKey = String(doc.sessionKey);

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.token}`,
            'X-OpenClaw-Message-Channel': channel,
          },
          body: JSON.stringify({
            tool: 'message',
            action: 'send',
            args: { to: target, message },
            sessionKey,
          }),
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        await params.queueModel
          .updateOne(
            { _id: doc._id },
            {
              $set: {
                status: 'failed',
                resultOk: false,
                errorSnippet: msg.slice(0, 500),
                finishedAt: new Date(),
              },
            },
          )
          .exec();
        params.logger.error(`[OpenClawSendQueue] leader fetch error id=${String(doc._id)}`, msg);
        return;
      }

      const ok = res.ok;
      const snippet = (await res.text().catch(() => '')).slice(0, 500);
      await params.queueModel
        .updateOne(
          { _id: doc._id },
          {
            $set: {
              status: ok ? 'done' : 'failed',
              httpStatus: res.status,
              resultOk: ok,
              ...(ok ? {} : { errorSnippet: snippet || res.statusText }),
              finishedAt: new Date(),
            },
          },
        )
        .exec();
      if (!ok) {
        params.logger.error(
          `[OpenClawSendQueue] leader invoke failed: status=${res.status} id=${String(doc._id)}`,
          snippet,
        );
      }
    } catch (e) {
      params.logger.error(
        '[OpenClawSendQueue] poller tick failed',
        e instanceof Error ? e.message : String(e),
      );
    }
  };

  timer = setInterval(() => {
    void tick();
  }, pollMs);
  if (timer.unref) timer.unref();
  void tick();

  return () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/**
 * Lease follower: same webhook verification as {@link OpenClawBridge}; `sendMessage` enqueues for the leader poller.
 */
export class OpenClawQueuedSendBridge extends OpenClawBridge {
  private readonly qLogger: TopicHubLogger;

  constructor(
    config: OpenClawConfig,
    logger: TopicHubLogger,
    private readonly queueModel: Model<any>,
    private readonly waitMs: number,
    private readonly followerPollMs: number,
  ) {
    super(config, logger);
    this.qLogger = logger;
  }

  static forFollower(params: {
    /** Used only for inherited verify helpers; outbound uses the queue. */
    gatewayBaseUrl: string;
    webhookSecret: string;
    platforms: string[];
    logger: TopicHubLogger;
    queueModel: Model<any>;
  }): OpenClawQueuedSendBridge {
    const base = params.gatewayBaseUrl.replace(/\/+$/, '');
    const config: OpenClawConfig = {
      gatewayUrl: base,
      token: params.webhookSecret,
      webhookSecret: params.webhookSecret,
      platforms: params.platforms,
    };
    const waitMs = resolveIntEnv('TOPICHUB_OPENCLAW_SEND_QUEUE_WAIT_MS', 60_000, 3000, 300_000);
    const followerPollMs = resolveIntEnv('TOPICHUB_OPENCLAW_SEND_QUEUE_FOLLOWER_POLL_MS', 80, 20, 2000);
    return new OpenClawQueuedSendBridge(config, params.logger, params.queueModel, waitMs, followerPollMs);
  }

  override async sendMessage(
    channel: string,
    target: string,
    message: string,
    opts?: { sessionKey?: string },
  ): Promise<boolean> {
    const sessionKey =
      opts?.sessionKey?.trim() || `agent:main:${channel}:channel:${target}`;

    const created = await this.queueModel.create({
      status: 'pending',
      channel,
      target,
      message,
      sessionKey,
      createdAt: new Date(),
    });
    const id = created._id;
    const deadline = Date.now() + this.waitMs;

    while (Date.now() < deadline) {
      const cur = await this.queueModel.findById(id).lean<{
        status: string;
        resultOk?: boolean;
      } | null>();
      if (!cur) return false;
      if (cur.status === 'done') return cur.resultOk === true;
      if (cur.status === 'failed') return false;
      await new Promise((r) => setTimeout(r, this.followerPollMs));
    }

    const timedOut = await this.queueModel
      .findOneAndUpdate(
        { _id: id, status: 'pending' },
        {
          $set: {
            status: 'failed',
            errorSnippet: 'follower_wait_timeout',
            finishedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (timedOut) {
      this.qLogger.error(`[OpenClawSendQueue] follower wait timeout id=${String(id)}`);
    }
    return false;
  }
}
