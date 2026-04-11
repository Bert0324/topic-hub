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
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, interval, map, merge } from 'rxjs';
import { ZodError } from 'zod';
import {
  EventPayloadSchema,
  RegisterExecutorRequestSchema,
  LinkRequestSchema,
  UnlinkRequestSchema,
  PostQuestionRequestSchema,
  CreateIdentitySchema,
  TopicHubError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
} from '@topichub/core';
import { TopicHubService } from './topichub.provider';

function toHttpError(err: unknown): never {
  if (err instanceof NotFoundError) throw new NotFoundException(err.message);
  if (err instanceof ValidationError) throw new BadRequestException(err.message);
  if (err instanceof ConflictError) throw new ConflictException(err.message);
  if (err instanceof UnauthorizedError) throw new UnauthorizedException(err.message);
  if (err instanceof TopicHubError) throw new InternalServerErrorException(err.message);
  throw err;
}

// ── Webhooks (no auth — IM platforms POST directly) ─────────────────

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly hub: TopicHubService) {}

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

  @Post(':platform')
  handle(
    @Param('platform') platform: string,
    @Body() payload: unknown,
    @Headers() headers: Record<string, string>,
  ) {
    return this.hub.getHub().webhook.handle(platform, payload, headers);
  }
}

// ── All other routes ────────────────────────────────────────────────

@Controller()
export class ApiController {
  constructor(private readonly hub: TopicHubService) {}

  @Get('health')
  health() {
    try {
      this.hub.getHub();
      return { status: 'ok' };
    } catch {
      return { status: 'degraded', reason: 'TopicHub not initialized' };
    }
  }

  private async tenant(req: Request) {
    const { tenantId } = await this.hub.getHub().auth.resolveFromHeaders(
      req.headers as Record<string, string>,
    );
    return tenantId;
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

  // ─── Auth ─────────────────────────────────────────────────────────

  @Post('auth/validate')
  async validate(@Body() body: { apiKey?: string }) {
    if (body.apiKey) {
      const result = await this.hub.getHub().auth.resolveTenant(body.apiKey);
      if (result) return { valid: true, tenantId: result.tenantId };
    }
    return { valid: false };
  }

  // ─── Admin: Tenants ───────────────────────────────────────────────

  @Get('admin/tenants')
  listTenants() {
    return this.hub.getHub().admin.listTenants();
  }

  @Post('admin/tenants')
  async createTenant(@Body() body: { name: string }) {
    try {
      return await this.hub.getHub().admin.createTenant(body.name);
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('admin/tenants/:id/token/regenerate')
  async regenerateToken(@Param('id') id: string) {
    try {
      return await this.hub.getHub().admin.regenerateToken(id);
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Admin: Skills ────────────────────────────────────────────────

  @Get('admin/skills')
  listSkills() {
    return { skills: this.hub.getHub().skills.listRegistered() };
  }

  @Get('admin/stats')
  async getStats(@Req() req: Request) {
    try {
      const tenantId = await this.tenant(req);
      return await this.hub.getHub().admin.getStats(tenantId);
    } catch {
      return {};
    }
  }

  // ─── Ingestion (tenant-scoped) ────────────────────────────────────

  @Post('api/v1/events')
  async ingest(
    @Req() req: Request,
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
      const tenantId = await this.tenant(req);
      const result = await this.hub.getHub().ingestion.ingest(tenantId, payload);
      res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
      return result;
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Commands (tenant-scoped) ─────────────────────────────────────

  @Post('api/v1/commands')
  async command(
    @Req() req: Request,
    @Body() body: { rawCommand: string; context: { platform: string; groupId: string; userId: string } },
  ) {
    try {
      const tenantId = await this.tenant(req);
      return await this.hub.getHub().commands.execute(tenantId, body.rawCommand, body.context);
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Topics (tenant-scoped) ───────────────────────────────────────

  @Get('api/v1/search/topics')
  async searchTopics(
    @Req() req: Request,
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
      const tenantId = await this.tenant(req);
      return await this.hub.getHub().search.search(tenantId, {
        q, status, type, tags, limit, offset: (pageNum - 1) * limit,
      });
    } catch (err) {
      toHttpError(err);
    }
  }

  @Get('api/v1/topics/:id')
  async getTopic(@Req() req: Request, @Param('id') id: string) {
    try {
      const tenantId = await this.tenant(req);
      const topic = await this.hub.getHub().topics.get(tenantId, id);
      if (!topic) throw new NotFoundException('Topic not found');
      return topic;
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      toHttpError(err);
    }
  }

  @Patch('api/v1/topics/:id')
  async updateTopic(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    try {
      const tenantId = await this.tenant(req);
      return await this.hub.getHub().topics.update(tenantId, id, body, 'api');
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/topics/:id/timeline')
  async addTimeline(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { actionType: string; actor?: string; payload?: Record<string, unknown> },
  ) {
    try {
      const tenantId = await this.tenant(req);
      return await this.hub.getHub().topics.addTimeline(tenantId, id, {
        actor: body.actor ?? 'api',
        actionType: body.actionType,
        payload: body.payload,
      });
    } catch (err) {
      toHttpError(err);
    }
  }

  // ─── Dispatch (tenant-scoped, for local agent) ────────────────────

  @Get('api/v1/dispatches')
  async listDispatches(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('targetUserId') targetUserId?: string,
  ) {
    try {
      const tenantId = await this.tenant(req);
      const dispatches = await this.hub.getHub().dispatch.list(tenantId, {
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
        targetUserId,
      });
      return { dispatches };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/dispatches/:id/claim')
  async claim(@Param('id') id: string, @Body() body: { claimedBy: string; targetUserId?: string }) {
    const ok = await this.hub.getHub().dispatch.claim(id, body.claimedBy, body.targetUserId);
    if (!ok) throw new ConflictException('Already claimed or not found');
    return { id, status: 'claimed', claimedBy: body.claimedBy };
  }

  @Post('api/v1/dispatches/:id/complete')
  async complete(@Param('id') id: string, @Body() body: { result: unknown }) {
    await this.hub.getHub().dispatch.complete(id, body.result);
    return { id, status: 'completed' };
  }

  @Post('api/v1/dispatches/:id/fail')
  async fail(@Param('id') id: string, @Body() body: { error: string }) {
    await this.hub.getHub().dispatch.fail(id, body.error);
    return { id, status: 'failed' };
  }

  // ─── Q&A Relay (tenant-scoped) ──────────────────────────────────────

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

    const tenantId = dispatch.tenantId;
    const sourceChannel = dispatch.sourceChannel;
    const sourcePlatform = dispatch.sourcePlatform;
    const topichubUserId = dispatch.targetUserId ?? tenantId;

    const qa = await hub.qa.createQuestion(
      tenantId,
      id,
      topichubUserId,
      parsed.questionText,
      parsed.questionContext,
      sourceChannel,
      sourcePlatform,
    );

    if (sourceChannel && sourcePlatform) {
      const ctx = parsed.questionContext;
      const header = ctx
        ? `🔔 **Agent Question** (${ctx.skillName} / ${ctx.topicTitle})`
        : '🔔 **Agent Question**';

      const imMessage = `${header}\n\n${parsed.questionText}\n\nReply with: \`/answer <your response>\``;

      hub.messaging.send(sourcePlatform, {
        tenantId,
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

  @Sse('api/v1/dispatches/stream')
  stream(@Req() req: Request): Observable<{ data: string; type?: string }> {
    const tenantId = (req.query as any).tenantId as string;
    const targetUserId = (req.query as any).targetUserId as string | undefined;
    const executorToken = (req.query as any).executorToken as string | undefined;
    const hub = this.hub.getHub();

    const dispatches$ = new Observable<{ data: string; type?: string }>((sub) => {
      const unsub = hub.dispatch.onTask((task: any) => {
        if (tenantId && task.tenantId !== tenantId) return;
        if (targetUserId && task.targetUserId && task.targetUserId !== targetUserId) return;
        if (executorToken && task.targetExecutorToken && task.targetExecutorToken !== executorToken) return;
        sub.next({ type: 'dispatch', data: JSON.stringify(task) });
      });
      return () => unsub();
    });

    const heartbeat$ = interval(30_000).pipe(
      map(() => ({ type: 'heartbeat', data: JSON.stringify({ ts: new Date().toISOString() }) })),
    );

    return merge(dispatches$, heartbeat$);
  }
}

// ── Executor management ──────────────────────────────────────────────

@Controller('api/v1/executors')
export class ExecutorController {
  constructor(private readonly hub: TopicHubService) {}

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
      const result = await this.hub.getHub().superadmin.registerExecutor(
        token,
        (body as any)?.executorMeta,
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
      return { status: 'ok', executorToken: executorToken.slice(0, 12) + '...' };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('deregister')
  async deregister(@Req() req: Request) {
    try {
      const { executorToken } = await this.requireExecutor(req);
      await this.hub.getHub().superadmin.revokeExecutor(executorToken);
      return { status: 'deregistered' };
    } catch (err) {
      toHttpError(err);
    }
  }
}

// ── Identity binding ─────────────────────────────────────────────────

@Controller('api/v1/identity')
export class IdentityController {
  constructor(private readonly hub: TopicHubService) {}

  private async tenant(req: Request) {
    const { tenantId } = await this.hub.getHub().auth.resolveFromHeaders(
      req.headers as Record<string, string>,
    );
    return tenantId;
  }

  private extractBearerToken(req: Request): string {
    const auth = req.headers['authorization'] ?? '';
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    throw new UnauthorizedException('Missing Bearer token');
  }

  @Post('link')
  async link(@Req() req: Request, @Body() body: unknown) {
    let parsed;
    try {
      parsed = LinkRequestSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError)
        throw new BadRequestException({ message: 'Validation failed', errors: (err as ZodError).errors });
      throw err;
    }

    const tenantId = await this.tenant(req);
    const claimToken = this.extractBearerToken(req);

    try {
      const result = await this.hub.getHub().identity.claimPairingCode(
        tenantId,
        parsed.code,
        claimToken,
      );

      if (!result) {
        throw new BadRequestException('Invalid or expired pairing code');
      }

      return {
        status: 'linked',
        topichubUserId: result.topichubUserId,
        platform: result.platform,
        platformUserId: result.platformUserId,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      toHttpError(err);
    }
  }

  @Post('unlink')
  async unlink(@Req() req: Request, @Body() body: unknown) {
    let parsed;
    try {
      parsed = UnlinkRequestSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError)
        throw new BadRequestException({ message: 'Validation failed', errors: (err as ZodError).errors });
      throw err;
    }

    const tenantId = await this.tenant(req);
    const claimToken = this.extractBearerToken(req);

    try {
      if (parsed.platform && parsed.platformUserId) {
        await this.hub.getHub().identity.deactivateBinding(
          tenantId,
          parsed.platform,
          parsed.platformUserId,
        );
      } else {
        await this.hub.getHub().identity.deactivateAllBindings(claimToken);
      }

      return { status: 'unlinked', cancelledDispatches: 0 };
    } catch (err) {
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
