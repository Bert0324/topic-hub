import * as crypto from 'node:crypto';
import mongoose, { Connection, Model } from 'mongoose';
import { TopicHubError } from '../common/errors';
import type { TopicHubLogger } from '../common/logger';
import { safeCreate } from '../common/safe-create';
import { generateWebhookSecret } from './bridge-config-generator';
import { TOPICHUB_WEBHOOK_HMAC_ENV } from './bridge-manager';

/** Single logical document id for the cluster-wide embedded OpenClaw lease. */
const DOC_ID = 'embedded_openclaw_singleton';

const DEFAULT_LEASE_MS = 30_000;
const RETRY_MS = 250;

function resolveLeaseMs(): number {
  const raw = process.env.TOPICHUB_BRIDGE_EMBED_LEASE_MS?.trim();
  if (!raw) return DEFAULT_LEASE_MS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 5000) return DEFAULT_LEASE_MS;
  return Math.min(n, 120_000);
}

/** Max wall time for `join()` so serverless parents (e.g. Goofy ~30s child check) are not blocked forever. */
function resolveJoinDeadlineMs(): number {
  const raw = process.env.TOPICHUB_BRIDGE_EMBED_JOIN_DEADLINE_MS?.trim();
  if (!raw) return 20_000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 3000) return 20_000;
  return Math.min(n, 120_000);
}

function resolveSecretFromEnv(): string | undefined {
  return process.env[TOPICHUB_WEBHOOK_HMAC_ENV]?.trim();
}

export interface EmbeddedBridgeJoinResult {
  isLeader: boolean;
  webhookSecret: string;
  /**
   * Leader: stops lease renewal and expires the lease so another instance can take over.
   * Call after the embedded gateway has been stopped.
   */
  postGatewayShutdown: () => Promise<void>;
}

interface BridgeLeaderDoc {
  _id: string;
  holderId: string;
  leaseUntil: Date;
  webhookSecret: string;
  /** Set by the lease leader on acquire/renew; followers trust the lease only while this is fresh. */
  lastLeaderPing?: Date;
}

function getOrCreateModel(connection: Connection, collectionName: string): Model<BridgeLeaderDoc> {
  const modelName = 'BridgeEmbeddedLeaderSingleton';
  if (connection.models[modelName]) {
    return connection.models[modelName] as Model<BridgeLeaderDoc>;
  }
  const schema = new mongoose.Schema<BridgeLeaderDoc>(
    {
      _id: { type: String, required: true },
      holderId: { type: String, required: true },
      leaseUntil: { type: Date, required: true },
      webhookSecret: { type: String, required: true },
      lastLeaderPing: { type: Date, required: false },
    },
    { versionKey: false },
  );
  return connection.model<BridgeLeaderDoc>(modelName, schema, collectionName);
}

/**
 * MongoDB-backed lease so only one process runs the embedded OpenClaw gateway (`BridgeManager`).
 * Other instances use the same `webhookSecret` and `publicGatewayBaseUrl` to reach the leader.
 */
export class EmbeddedBridgeCluster {
  private renewTimer?: ReturnType<typeof setInterval>;
  private readonly holderId = crypto.randomUUID();

  constructor(
    private readonly connection: Connection,
    private readonly collectionName: string,
    private readonly logger: TopicHubLogger,
  ) {}

  private model(): Model<BridgeLeaderDoc> {
    return getOrCreateModel(this.connection, this.collectionName);
  }

  async join(): Promise<EmbeddedBridgeJoinResult> {
    const Model = this.model();
    const LEASE_MS = resolveLeaseMs();
    const holderId = this.holderId;
    const joinDeadlineMs = resolveJoinDeadlineMs();
    const joinStarted = Date.now();
    const assertJoinDeadline = () => {
      if (Date.now() - joinStarted > joinDeadlineMs) {
        throw new TopicHubError(
          `Embedded OpenClaw bridge lease join timed out after ${joinDeadlineMs}ms (TOPICHUB_BRIDGE_EMBED_JOIN_DEADLINE_MS). ` +
            'Check Mongo connectivity, the openclaw_send_queue collection (embedded outbound), or a stuck lease doc missing `webhookSecret`.',
        );
      }
    };

    const pickSecret = (existing: BridgeLeaderDoc | null): string => {
      const env = resolveSecretFromEnv();
      if (env) return env;
      if (existing?.webhookSecret) return existing.webhookSecret;
      return generateWebhookSecret();
    };

    for (;;) {
      assertJoinDeadline();
      const now = new Date();
      const leaseUntil = new Date(now.getTime() + LEASE_MS);
      const ping = new Date();
      /** If the leader stops renewing this field, another instance may steal the lease. */
      const stalePingCutoff = new Date(now.getTime() - Math.floor(LEASE_MS * 0.65));
      const any = await Model.findById(DOC_ID).lean<BridgeLeaderDoc | null>();

      const stolen = await Model.findOneAndUpdate(
        {
          _id: DOC_ID,
          $or: [
            { leaseUntil: { $lte: now } },
            { leaseUntil: { $exists: false } },
            { lastLeaderPing: { $lte: stalePingCutoff } },
            /** Pre-lease-ping documents: allow takeover so a crashed leader cannot strand the cluster. */
            { lastLeaderPing: { $exists: false } },
          ],
        },
        {
          $set: {
            holderId,
            leaseUntil,
            lastLeaderPing: ping,
            webhookSecret: pickSecret(any),
          },
        },
        { new: true },
      ).exec();

      if (stolen && stolen.holderId === holderId) {
        this.logger.log('Acquired embedded OpenClaw bridge lease (cluster leader)');
        return this.makeLeaderResult(stolen.webhookSecret, Model, LEASE_MS, holderId);
      }

      const renewMine = await Model.findOneAndUpdate(
        { _id: DOC_ID, holderId },
        { $set: { leaseUntil, lastLeaderPing: ping } },
        { new: true },
      ).exec();
      if (renewMine) {
        this.logger.log('Renewed embedded OpenClaw bridge lease (cluster leader)');
        return this.makeLeaderResult(renewMine.webhookSecret, Model, LEASE_MS, holderId);
      }

      if (!any) {
        try {
          const secret = pickSecret(null);
          await safeCreate(Model, {
            _id: DOC_ID,
            holderId,
            leaseUntil,
            webhookSecret: secret,
            lastLeaderPing: ping,
          });
          const doc = await Model.findById(DOC_ID).exec();
          if (doc && doc.holderId === holderId) {
            this.logger.log('Created embedded OpenClaw bridge lease (cluster leader)');
            return this.makeLeaderResult(doc.webhookSecret, Model, LEASE_MS, holderId);
          }
        } catch (e: unknown) {
          const code = (e as { code?: number })?.code;
          if (code !== 11000) throw e;
        }
        await new Promise((r) => setTimeout(r, RETRY_MS));
        continue;
      }

      const leaderPingFresh =
        any.lastLeaderPing instanceof Date && any.lastLeaderPing > stalePingCutoff;

      if (any.leaseUntil > now && any.holderId !== holderId && leaderPingFresh) {
        if (any.webhookSecret) {
          this.logger.log(
            'Using shared embedded OpenClaw bridge (follower — gateway runs on lease leader)',
          );
          return {
            isLeader: false,
            webhookSecret: any.webhookSecret,
            postGatewayShutdown: async () => undefined,
          };
        }
        await new Promise((r) => setTimeout(r, RETRY_MS));
        continue;
      }

      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }

  private makeLeaderResult(
    webhookSecret: string,
    Model: Model<BridgeLeaderDoc>,
    leaseMs: number,
    holderId: string,
  ): EmbeddedBridgeJoinResult {
    const renew = async () => {
      const leaseUntil = new Date(Date.now() + leaseMs);
      const lastLeaderPing = new Date();
      await Model.updateOne({ _id: DOC_ID, holderId }, { $set: { leaseUntil, lastLeaderPing } }).exec();
    };

    this.renewTimer = setInterval(() => {
      void renew().catch((err) =>
        this.logger.error('Bridge embed lease renew failed', err instanceof Error ? err.message : String(err)),
      );
    }, Math.floor(leaseMs / 2));
    if (this.renewTimer.unref) {
      this.renewTimer.unref();
    }

    return {
      isLeader: true,
      webhookSecret,
      postGatewayShutdown: async () => {
        if (this.renewTimer) {
          clearInterval(this.renewTimer);
          this.renewTimer = undefined;
        }
        await Model.updateOne(
          { _id: DOC_ID, holderId },
          { $set: { leaseUntil: new Date(0), lastLeaderPing: new Date(0) } },
        ).exec();
      },
    };
  }
}
