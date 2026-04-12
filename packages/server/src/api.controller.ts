import {
  Body,
  Controller,
  OnModuleInit,
  Post,
  Req,
  Res,
  Sse,
  RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';
import type { Express } from 'express';
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

function normalizeChatCompletionNoopRelPath(raw: string | undefined): string {
  const rel = raw?.trim() || 'v1/chat/completions';
  const normalized = rel.replace(/^\/+/, '').replace(/\/+$/g, '');
  return normalized.length > 0 ? normalized : 'v1/chat/completions';
}

function chatCompletionNoopExplicitlyDisabled(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === 'false' || v === '0' || v === 'off' || v === 'no';
}

/**
 * Nest HTTP bindings: decorators for webhook, native gateway, SSE; OpenClaw noop POST is
 * registered on the underlying Express instance in {@link onModuleInit} so path/disable
 * come from {@link ConfigService} without touching `main.ts`.
 */
@Controller()
export class TopicHubController implements OnModuleInit {
  private readonly sseHeartbeatIntervalMs: number;
  private readonly chatCompletionNoopOptions: ChatCompletionNoopOptions;

  constructor(
    private readonly hub: TopicHubService,
    private readonly config: ConfigService,
    private readonly httpAdapterHost: HttpAdapterHost,
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
  }

  onModuleInit() {
    if (chatCompletionNoopExplicitlyDisabled(this.config.get<string>('TOPICHUB_CHAT_COMPLETION_NOOP_ENABLED'))) {
      return;
    }
    const rel = normalizeChatCompletionNoopRelPath(
      this.config.get<string>('TOPICHUB_CHAT_COMPLETION_NOOP_PATH'),
    );
    const path = `/${rel}`;
    const opts = this.chatCompletionNoopOptions;
    const server = this.httpAdapterHost.httpAdapter.getInstance() as Express;
    server.post(path, (_req, res) => {
      res.json(buildChatCompletionNoopResponse(opts));
    });
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
