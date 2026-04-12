import {
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  Res,
  Sse,
  RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import {
  HEARTBEAT_INTERVAL_MS,
  NATIVE_INTEGRATION_SEGMENT,
  buildChatCompletionNoopResponse,
  connectExecutorTaskSse,
  type ChatCompletionNoopOptions,
  type ExecutorSseEvent,
} from '@topichub/core';
import { TopicHubService } from './topichub.provider';

/**
 * Relative POST path for OpenClaw noop chat (after global HTTP prefix).
 * Read from env when this module loads — `main.ts` imports `dotenv/config` first so `.env` applies.
 */
function chatCompletionNoopPostPath(): string {
  const rel =
    process.env.TOPICHUB_CHAT_COMPLETION_NOOP_PATH?.trim() || 'v1/chat/completions';
  const normalized = rel.replace(/^\/+/, '').replace(/\/+$/g, '');
  return normalized.length > 0 ? normalized : 'v1/chat/completions';
}

const CHAT_COMPLETION_NOOP_ROUTE = chatCompletionNoopPostPath();

function chatCompletionNoopExplicitlyDisabled(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'off' || v === 'no';
}

/**
 * Nest HTTP bindings only: paths, raw body, Express response, and RxJS `@Sse()` adapter.
 * Behaviour lives in `@topichub/core`.
 */
@Controller()
export class TopicHubController {
  private readonly sseHeartbeatIntervalMs: number;
  private readonly chatCompletionNoopOptions: ChatCompletionNoopOptions;
  private readonly chatCompletionNoopDisabled: boolean;

  constructor(
    private readonly hub: TopicHubService,
    config: ConfigService,
  ) {
    const raw = config.get<string>('TOPICHUB_SSE_HEARTBEAT_INTERVAL_MS');
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    this.sseHeartbeatIntervalMs =
      Number.isFinite(parsed) && parsed > 0 ? parsed : HEARTBEAT_INTERVAL_MS;

    const noopId = config.get<string>('TOPICHUB_CHAT_COMPLETION_NOOP_ID');
    const noopModel = config.get<string>('TOPICHUB_CHAT_COMPLETION_NOOP_MODEL');
    this.chatCompletionNoopOptions = {
      ...(noopId ? { id: noopId } : {}),
      ...(noopModel ? { model: noopModel } : {}),
    };
    this.chatCompletionNoopDisabled = chatCompletionNoopExplicitlyDisabled(
      config.get<string>('TOPICHUB_CHAT_COMPLETION_NOOP_ENABLED'),
    );
  }

  @Post('webhooks/openclaw')
  handleOpenClaw(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: unknown,
  ) {
    return this.hub.getHub().webhook.handleOpenClaw(
      payload,
      req.rawBody,
      req.headers as Record<string, string | string[] | undefined>,
    );
  }

  @Post(NATIVE_INTEGRATION_SEGMENT)
  async nativeIntegrationGateway(
    @Req() req: Request,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const th = this.hub.getHub();
    const { status, body: json } = await th.nativeGateway.handle(
      body,
      req.headers as Record<string, string | string[] | undefined>,
    );
    res.status(status).json(json);
  }

  @Post(CHAT_COMPLETION_NOOP_ROUTE)
  handleChatCompletionNoop() {
    if (this.chatCompletionNoopDisabled) {
      throw new NotFoundException();
    }
    return buildChatCompletionNoopResponse(this.chatCompletionNoopOptions);
  }

  @Sse(`${NATIVE_INTEGRATION_SEGMENT}/stream`)
  stream(@Req() req: Request): Observable<ExecutorSseEvent> {
    return new Observable<ExecutorSseEvent>((sub) => {
      let dispose: (() => void) | undefined;
      let cancelled = false;
      const th = this.hub.getHub();

      connectExecutorTaskSse(
        th,
        req.headers as Record<string, string | string[] | undefined>,
        { heartbeatIntervalMs: this.sseHeartbeatIntervalMs },
        { next: (ev: ExecutorSseEvent) => sub.next(ev) },
      )
        .then((d: () => void) => {
          dispose = d;
          if (cancelled) dispose?.();
        })
        .catch((err: unknown) => {
          if (!cancelled) sub.error(err);
        });

      return () => {
        cancelled = true;
        dispose?.();
      };
    });
  }
}
