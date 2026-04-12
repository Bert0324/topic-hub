import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  Res,
  Sse,
  Headers,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  ForbiddenException,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, defer, from, interval, map, merge, mergeMap } from 'rxjs';
import { ZodError } from 'zod';
import {
  EventPayloadSchema,
  RegisterExecutorRequestSchema,
  PostQuestionRequestSchema,
  CreateIdentitySchema,
  TopicHubError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  formatQaHowToReplyLine,
} from '@topichub/core';
import { TopicHubService } from './topichub.provider';

function toHttpError(err: unknown): never {
  if (err instanceof NotFoundError) throw new NotFoundException(err.message);
  if (err instanceof ValidationError) throw new BadRequestException(err.message);
  if (err instanceof ConflictError) throw new ConflictException(err.message);
  if (err instanceof UnauthorizedError) throw new UnauthorizedException(err.message);
  if (err instanceof ForbiddenError) throw new ForbiddenException(err.message);
  if (err instanceof TopicHubError) throw new InternalServerErrorException(err.message);
  throw err;
}

// ── Webhooks (no auth — IM platforms POST directly) ─────────────────

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly hub: TopicHubService) { }

  @Post('openclaw')
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

}

// ── All other routes ────────────────────────────────────────────────

@Controller()
export class ApiController {
  constructor(private readonly hub: TopicHubService) { }

  @Get('health')
  health() {
    try {
      this.hub.getHub();
      return { status: 'ok' };
    } catch {
      return { status: 'degraded', reason: 'TopicHub not initialized' };
    }
  }

  private async requireSuperadmin(req: Request) {
    return this.hub.getHub().identityAuth.requireSuperadmin(
      req.headers as Record<string, string>,
    );
  }

  private async requireExecutor(req: Request) {
    return this.hub.getHub().identityAuth.requireExecutor(
      req.headers as Record<string, string>,
    );
  }

  private async resolveAuth(req: Request) {
    return this.hub.getHub().identityAuth.resolveFromHeaders(
      req.headers as Record<string, string>,
    );
  }

  // ─── System Init (Phase 4) ────────────────────────────────────────

  @Post('api/v1/init')
  async init() {
    try {
      const result = await this.hub.getHub().superadmin.init();
      return {
        superadminToken: result.superadminToken,
        uniqueId: result.uniqueId,
        displayName: result.displayName,
        message: 'System initialized. Store this token securely — it cannot be retrieved again.',
      };
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Admin: Identities (Phase 5) ──────────────────────────────────

  @Post('api/v1/admin/identities')
  async createIdentity(@Req() req: Request) {
    try {
      await this.requireSuperadmin(req);
      const body = CreateIdentitySchema.parse(req.body);
      const result = await this.hub.getHub().superadmin.createIdentity(body);
      return { ...result, message: 'Identity created. Distribute this token to the user securely.' };
    } catch (err) {
      if (err instanceof ZodError)
        throw new BadRequestException({ message: 'Validation failed', errors: err.errors });
      toHttpError(err);
    }
  }

  @Get('api/v1/admin/identities')
  async listIdentities(@Req() req: Request) {
    try {
      await this.requireSuperadmin(req);
      const identities = await this.hub.getHub().superadmin.listIdentities();
      return { identities };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/admin/identities/:id/revoke')
  async revokeIdentity(@Req() req: Request, @Param('id') id: string) {
    try {
      await this.requireSuperadmin(req);
      const result = await this.hub.getHub().superadmin.revokeIdentity(id);
      return { status: 'revoked', ...result };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/admin/identities/:id/regenerate-token')
  async regenerateIdentityToken(@Req() req: Request, @Param('id') id: string) {
    try {
      await this.requireSuperadmin(req);
      const result = await this.hub.getHub().superadmin.regenerateToken(id);
      return { ...result, message: 'Token regenerated. All existing executors for this identity have been revoked.' };
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Admin: Executors (Phase 6) ───────────────────────────────────

  @Get('api/v1/admin/executors')
  async listExecutors(@Req() req: Request) {
    try {
      await this.requireSuperadmin(req);
      const executors = await this.hub.getHub().superadmin.listExecutors();
      return { executors };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/admin/executors/:executorToken/revoke')
  async revokeExecutor(@Req() req: Request, @Param('executorToken') executorToken: string) {
    try {
      await this.requireSuperadmin(req);
      await this.hub.getHub().superadmin.revokeExecutor(executorToken);
      return { status: 'revoked' };
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Admin: Skills ────────────────────────────────────────────────

  @Get('admin/skills')
  listSkills() {
    return { skills: this.hub.getHub().skills.listRegistered() };
  }

  @Post('admin/skills/publish')
  async publishSkills(@Req() req: Request) {
    try {
      const auth = await this.hub.getHub().identityAuth.resolveFromHeaders(
        req.headers as Record<string, string | string[] | undefined>,
      );
      return await this.hub.getHub().skillCenter.publishSkills(req.body, auth.identityId);
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Ingestion ─────────────────────────────────────────────────────

  @Post('api/v1/events')
  async ingest(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    let payload;
    try {
      payload = EventPayloadSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError)
        throw new BadRequestException({ message: 'Validation failed', errors: err.errors });
      throw err;
    }
    try {
      const result = await this.hub.getHub().ingestion.ingest(payload);
      res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
      return result;
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Commands ──────────────────────────────────────────────────────

  @Post('api/v1/commands')
  async command(
    @Body() body: { rawCommand: string; context: { platform: string; groupId: string; userId: string } },
  ) {
    try {
      return await this.hub.getHub().commands.execute(body.rawCommand, body.context);
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Topics ────────────────────────────────────────────────────────

  @Get('api/v1/search/topics')
  async searchTopics(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('tag') tag?: string | string[],
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const tags = tag ? (Array.isArray(tag) ? tag : [tag]) : undefined;
    const limit = parseInt(pageSize ?? '20', 10);
    const pageNum = parseInt(page ?? '1', 10);
    try {
      return await this.hub.getHub().search.search({
        q, status, type, tags, limit, offset: (pageNum - 1) * limit,
      });
    } catch (err) {
      toHttpError(err);
    }
  }

  @Get('api/v1/topics/:id')
  async getTopic(@Param('id') id: string) {
    try {
      const topic = await this.hub.getHub().topics.get(id);
      if (!topic) throw new NotFoundException('Topic not found');
      return topic;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      toHttpError(err);
    }
  }

  @Patch('api/v1/topics/:id')
  async updateTopic(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      return await this.hub.getHub().topics.update(id, body, 'api');
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/topics/:id/timeline')
  async addTimeline(
    @Param('id') id: string,
    @Body() body: { actionType: string; actor?: string; payload?: Record<string, unknown> },
  ) {
    try {
      return await this.hub.getHub().topics.addTimeline(id, {
        actor: body.actor ?? 'api',
        actionType: body.actionType,
        payload: body.payload,
      });
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Dispatch (for local agent) ─────────────────────────────────────

  @Get('api/v1/dispatches')
  async listDispatches(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      const dispatches = await this.hub.getHub().dispatch.list({
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
        executorToken,
      });
      return { dispatches };
    } catch (err) {
      toHttpError(err);
    }
  }

  /** Must be registered before `dispatches/:id` so `stream` is not captured as an ObjectId. */
  @Sse('api/v1/dispatches/stream')
  stream(@Req() req: Request): Observable<{ data: string; type?: string }> {
    const hub = this.hub.getHub();

    return defer(() => from(this.requireExecutor(req))).pipe(
      mergeMap(({ executorToken }) => {
        const dispatches$ = new Observable<{ data: string; type?: string }>((sub) => {
          const unsub = hub.dispatch.onTask((task: any) => {
            if (task.targetExecutorToken !== executorToken) return;
            sub.next({ type: 'dispatch', data: JSON.stringify(task) });
          });
          return () => unsub();
        });

        const heartbeat$ = interval(30_000).pipe(
          map(() => ({ type: 'heartbeat', data: JSON.stringify({ ts: new Date().toISOString() }) })),
        );

        const pairingRotated$ = new Observable<{ data: string; type?: string }>((sub) => {
          const unsub = hub.identity.subscribePairingRotations(executorToken, (payload) => {
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

  @Get('api/v1/dispatches/:id')
  async getDispatchById(@Req() req: Request, @Param('id') id: string) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      const row = await this.hub.getHub().dispatch.findByIdForExecutor(id, executorToken);
      if (!row) {
        throw new NotFoundException('Dispatch not found for this executor');
      }
      return row;
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/dispatches/:id/claim')
  async claim(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { claimedBy: string },
  ) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      const doc = await this.hub.getHub().dispatch.claim(id, body.claimedBy, executorToken);
      if (!doc) throw new ConflictException('Already claimed or not found');
      const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
      return {
        id,
        status: 'claimed',
        claimedBy: body.claimedBy,
        enrichedPayload: plain.enrichedPayload,
        skillName: plain.skillName,
        eventType: plain.eventType,
        topicId: plain.topicId != null ? String(plain.topicId) : undefined,
        sourcePlatform: plain.sourcePlatform ?? undefined,
      };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/dispatches/:id/touch-claim')
  async touchClaim(@Req() req: Request, @Param('id') id: string) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      const ok = await this.hub.getHub().dispatch.renewClaim(id, executorToken);
      if (!ok) {
        throw new ConflictException('Dispatch is not claimed by this executor (or claim expired).');
      }
      return { id, status: 'claim_renewed' };
    } catch (err) {
      toHttpError(err);
    }
  }

  /** Local `serve` per-slot queue: IM hint before claim while another task holds the same roster slot. */
  @Post('api/v1/dispatches/:id/notify-queued-local')
  async notifyQueuedLocal(@Req() req: Request, @Param('id') id: string) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      return await this.hub.getHub().dispatch.notifyExecutorQueuedIm(id, executorToken);
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/dispatches/:id/complete')
  async complete(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { result: unknown },
  ) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      await this.hub.getHub().dispatch.complete(id, body.result, executorToken);
      return { id, status: 'completed' };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/dispatches/:id/fail')
  async fail(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { error: string; retryable?: boolean },
  ) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      await this.hub.getHub().dispatch.fail(id, body.error, executorToken, body.retryable ?? false);
      return { id, status: 'failed' };
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Q&A Relay ─────────────────────────────────────────────────────

  @Post('api/v1/dispatches/:id/question')
  async postQuestion(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    let parsed;
    try {
      parsed = PostQuestionRequestSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError)
        throw new BadRequestException({ message: 'Validation failed', errors: err.errors });
      throw err;
    }

    const hub = this.hub.getHub();
    const dispatch = await hub.dispatch.findById(id);
    if (!dispatch) throw new NotFoundException('Dispatch not found');

    const sourceChannel = dispatch.sourceChannel;
    const sourcePlatform = dispatch.sourcePlatform;
    const topichubUserId = dispatch.targetUserId;

    const qa = await hub.qa.createQuestion(
      id,
      topichubUserId,
      parsed.questionText,
      parsed.questionContext,
      sourceChannel,
      sourcePlatform,
    );

    const allPending = await hub.qa.findAllPendingByUser(topichubUserId);
    const refIdx = allPending.findIndex((x) => String(x._id) === String(qa._id));
    const answerRef = refIdx >= 0 ? refIdx + 1 : Math.max(1, allPending.length);

    if (sourceChannel && sourcePlatform) {
      const ctx = parsed.questionContext;
      const header = ctx
        ? `🔔 **Agent Question** (${ctx.skillName} / ${ctx.topicTitle})`
        : '🔔 **Agent Question**';

      const imMessage =
        `${header}\n\n${parsed.questionText}\n\n` +
        `${formatQaHowToReplyLine(answerRef, qa)}`;

      hub.messaging.send(sourcePlatform, {
        groupId: sourceChannel,
        message: imMessage,
      }).catch(() => { /* non-fatal */ });
    }

    res.status(HttpStatus.CREATED);
    return { qaId: String(qa._id), status: qa.status };
  }

  @Get('api/v1/dispatches/:id/qa')
  async listQaExchanges(
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    const hub = this.hub.getHub();
    const exchanges = await hub.qa.findByDispatchAndStatus(id, status);
    return { exchanges };
  }
}

// ── Executor management ──────────────────────────────────────────────

@Controller('api/v1/executors')
export class ExecutorController {
  constructor(private readonly hub: TopicHubService) { }

  private extractBearerToken(req: Request): string {
    const auth = req.headers['authorization'] ?? '';
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    throw new UnauthorizedException('Missing authorization');
  }

  private async requireExecutor(req: Request) {
    return this.hub.getHub().identityAuth.requireExecutor(
      req.headers as Record<string, string>,
    );
  }

  @Post('register')
  async register(@Req() req: Request, @Body() body: unknown) {
    const token = this.extractBearerToken(req);
    try {
      const meta = (body as { executorMeta?: { agentType: string; maxConcurrentAgents: number; hostname: string; pid: number } })?.executorMeta;
      const result = await this.hub.getHub().superadmin.registerExecutor(token, meta);
      // IM commands use HeartbeatService.isAvailable(identityId); it must be populated here and refreshed by POST …/heartbeat.
      await this.hub.getHub().heartbeat.registerExecutor(
        result.identityId,
        result.executorToken,
        true,
        meta,
      );
      return result;
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('heartbeat')
  async heartbeat(@Req() req: Request) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      const executor = await this.hub.getHub().superadmin.resolveExecutorToken(executorToken);
      if (!executor) throw new UnauthorizedException('Invalid executor token');
      await this.hub.getHub().heartbeat.heartbeat(executor.identityId);
      return { status: 'ok', executorToken: executorToken.slice(0, 12) + '...' };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('deregister')
  async deregister(@Req() req: Request) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      const executor = await this.hub.getHub().superadmin.resolveExecutorToken(executorToken);
      if (!executor) throw new UnauthorizedException('Invalid executor token');
      await this.hub.getHub().superadmin.revokeExecutor(executorToken);
      await this.hub.getHub().identity.deactivateAllBindings(executorToken);
      await this.hub.getHub().heartbeat.deregister(executor.identityId);
      return { status: 'deregistered' };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('pairing-code')
  async generatePairingCode(@Req() req: Request) {
    try {
      const { executorToken, identityId } = await this.requireExecutor(req);
      const result = await this.hub.getHub().identity.generateExecutorPairingCode(
        identityId,
        executorToken,
      );
      return { code: result.code, expiresAt: result.expiresAt };
    } catch (err) {
      toHttpError(err);
    }
  }
}

// ── Identity binding ─────────────────────────────────────────────────

@Controller('api/v1/identity')
export class IdentityController {
  constructor(private readonly hub: TopicHubService) { }

  private extractBearerToken(req: Request): string {
    const auth = req.headers['authorization'] ?? '';
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    throw new UnauthorizedException('Missing Bearer token');
  }

  @Get('me')
  async me(@Req() req: Request) {
    const token = this.extractBearerToken(req);
    try {
      const resolved = await this.hub.getHub().superadmin.resolveIdentityToken(token);
      if (!resolved) throw new UnauthorizedException('Invalid token');

      const identities = await this.hub.getHub().superadmin.listIdentities();
      const identity = identities.find((i: any) => i.id === resolved.identityId);

      return {
        identityId: resolved.identityId,
        uniqueId: identity?.uniqueId ?? 'unknown',
        displayName: identity?.displayName ?? 'unknown',
        isSuperAdmin: resolved.isSuperAdmin,
        status: identity?.status ?? 'active',
        executorCount: identity?.executorCount ?? 0,
        createdAt: identity?.createdAt,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      toHttpError(err);
    }
  }
}

// ── Noop OpenAI-compatible endpoint (used by OpenClaw bridge) ───────
//
// OpenClaw's agent pipeline runs on every inbound message. Topic Hub doesn't
// use the agent — commands are handled via the relay hook. This endpoint
// returns a valid but empty chat completion so the agent "succeeds" silently
// instead of crashing with "Unknown model: openai/none".

@Controller('v1')
export class NoopModelController {
  @Post('chat/completions')
  handleChatCompletion() {
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
