import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  Sse,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, defer, from, interval, map, merge, mergeMap } from 'rxjs';
import { NATIVE_INTEGRATION_SEGMENT } from '@topichub/core';
import { TopicHubService } from './topichub.provider';

/**
 * Single Nest surface: OpenClaw webhook, native `POST /topic-hub` gateway, SSE stream, noop chat (bridge).
 */
@Controller()
export class TopicHubController {
  constructor(private readonly hub: TopicHubService) {}

  @Post('webhooks/openclaw')
  async handleOpenClaw(
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
  stream(@Req() req: Request): Observable<{ data: string; type?: string }> {
    const th = this.hub.getHub();

    return defer(() =>
      from(th.identityAuth.requireExecutor(req.headers as Record<string, string | string[]>)),
    ).pipe(
      mergeMap(({ executorToken }) => {
        const dispatches$ = new Observable<{ data: string; type?: string }>((sub) => {
          const unsub = th.dispatch.onTask((task: unknown) => {
            const t = task as { targetExecutorToken?: string };
            if (t.targetExecutorToken !== executorToken) return;
            sub.next({ type: 'dispatch', data: JSON.stringify(task) });
          });
          return () => unsub();
        });

        const heartbeat$ = interval(30_000).pipe(
          map(() => ({
            type: 'heartbeat',
            data: JSON.stringify({ ts: new Date().toISOString() }),
          })),
        );

        const pairingRotated$ = new Observable<{ data: string; type?: string }>((sub) => {
          const unsub = th.identity.subscribePairingRotations(executorToken, (payload) => {
            sub.next({
              type: 'pairing_rotated',
              data: JSON.stringify({
                code: payload.code,
                expiresAt:
                  payload.expiresAt instanceof Date
                    ? payload.expiresAt.toISOString()
                    : String(payload.expiresAt),
              }),
            });
          });
          return () => unsub();
        });

        return merge(dispatches$, heartbeat$, pairingRotated$);
      }),
    );
  }

  /** OpenClaw agent compatibility — not part of the native JSON gateway. */
  @Post('v1/chat/completions')
  handleChatCompletionNoop() {
    return {
      id: 'chatcmpl-noop',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'noop',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: '' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }
}
