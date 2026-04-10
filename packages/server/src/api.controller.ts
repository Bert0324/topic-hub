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
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, interval, map, merge } from 'rxjs';
import { ZodError } from 'zod';
import {
  EventPayloadSchema,
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
    @Req() req: Request,
    @Body() payload: unknown,
  ) {
    const rawBody = JSON.stringify(payload);
    return this.hub.getHub().webhook.handleOpenClaw(payload, rawBody);
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

  // ─── Admin: AI ────────────────────────────────────────────────────

  @Get('admin/ai/status')
  getAiStatus() {
    return this.hub.getHub().admin.getAiStatus();
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
  ) {
    try {
      const tenantId = await this.tenant(req);
      const dispatches = await this.hub.getHub().dispatch.list(tenantId, {
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return { dispatches };
    } catch (err) {
      toHttpError(err);
    }
  }

  @Post('api/v1/dispatches/:id/claim')
  async claim(@Param('id') id: string, @Body() body: { claimedBy: string }) {
    const ok = await this.hub.getHub().dispatch.claim(id, body.claimedBy);
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

  @Sse('api/v1/dispatches/stream')
  stream(@Req() req: Request): Observable<{ data: string; type?: string }> {
    const tenantId = (req.query as any).tenantId as string;
    const hub = this.hub.getHub();

    const dispatches$ = new Observable<{ data: string; type?: string }>((sub) => {
      const unsub = hub.dispatch.onTask((task: any) => {
        if (task.tenantId === tenantId)
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
