import { ZodError } from 'zod';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TopicHubError,
  UnauthorizedError,
  ValidationError,
} from '../common/errors';
import { EventPayloadSchema } from '../ingestion/event-payload';
import { CreateIdentitySchema, PostQuestionRequestSchema } from '../identity/identity-types';
import { formatQaHowToReplyLine } from '../im/im-list-format';
import { NativeGatewayEnvelopeSchema } from './native-gateway.schema';
import type { TopicHub } from '../topichub';

export type NativeGatewaySuccess = {
  ok: true;
  v: number;
  op: string;
  data: unknown;
};

export type NativeGatewayFailure = {
  ok: false;
  v: number;
  op: string;
  error: { code: string; message: string };
};

export type NativeGatewayResponseBody = NativeGatewaySuccess | NativeGatewayFailure;

function extractBearer(headers: Record<string, string | string[] | undefined>): string {
  const auth = headers.authorization ?? headers.Authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing authorization');
  }
  return auth.slice(7);
}

function extractIdentityBearer(headers: Record<string, string | string[] | undefined>): string {
  return extractBearer(headers);
}

function mapError(op: string, v: number, err: unknown): { status: number; body: NativeGatewayFailure } {
  const base = { ok: false as const, v, op, error: { code: 'INTERNAL', message: 'Unexpected error' } };
  if (err instanceof ZodError) {
    const msg = err.issues[0]?.message ?? err.message;
    return { status: 400, body: { ...base, error: { code: 'VALIDATION_ERROR', message: msg } } };
  }
  if (err instanceof UnauthorizedError) {
    return { status: 401, body: { ...base, error: { code: 'UNAUTHORIZED', message: err.message } } };
  }
  if (err instanceof ForbiddenError) {
    return { status: 403, body: { ...base, error: { code: 'FORBIDDEN', message: err.message } } };
  }
  if (err instanceof ValidationError) {
    return { status: 400, body: { ...base, error: { code: 'VALIDATION_ERROR', message: err.message } } };
  }
  if (err instanceof NotFoundError) {
    return { status: 404, body: { ...base, error: { code: 'NOT_FOUND', message: err.message } } };
  }
  if (err instanceof ConflictError) {
    return { status: 409, body: { ...base, error: { code: 'CONFLICT', message: err.message } } };
  }
  if (err instanceof TopicHubError) {
    return { status: 500, body: { ...base, error: { code: 'TOPICHUB_ERROR', message: err.message } } };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { ...base, error: { code: 'INTERNAL', message: msg } } };
}

function ok(v: number, op: string, data: unknown, status = 200): { status: number; body: NativeGatewaySuccess } {
  return { status, body: { ok: true, v, op, data } };
}

/**
 * Multiplexes native-side integration behind a single HTTP ingress (`POST /topic-hub`).
 * OpenClaw webhook and SSE stream are separate routes on the server.
 */
export class NativeIntegrationGateway {
  constructor(private readonly getHub: () => TopicHub) {}

  async handle(
    body: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ status: number; body: NativeGatewayResponseBody }> {
    const parsed = NativeGatewayEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        body: {
          ok: false,
          v: 1,
          op: '',
          error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
        },
      };
    }
    const { v, op, payload } = parsed.data;

    try {
      const hub = () => this.getHub();

      switch (op) {
        case 'health':
          return ok(v, op, { status: 'ok', gateway: 'native' });

        case 'system.init': {
          const result = await hub().superadmin.init();
          return ok(v, op, {
            superadminToken: result.superadminToken,
            uniqueId: result.uniqueId,
            displayName: result.displayName,
            message:
              'System initialized. Store this token securely — it cannot be retrieved again.',
          });
        }

        case 'admin.identities.create': {
          await hub().identityAuth.requireSuperadmin(headers);
          const bodyParsed = CreateIdentitySchema.parse(payload);
          const result = await hub().superadmin.createIdentity(bodyParsed);
          return ok(v, op, {
            ...result,
            message: 'Identity created. Distribute this token to the user securely.',
          });
        }
        case 'admin.identities.list': {
          await hub().identityAuth.requireSuperadmin(headers);
          const identities = await hub().superadmin.listIdentities();
          return ok(v, op, { identities });
        }
        case 'admin.identities.revoke': {
          await hub().identityAuth.requireSuperadmin(headers);
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          const result = await hub().superadmin.revokeIdentity(id);
          return ok(v, op, { status: 'revoked', ...result });
        }
        case 'admin.identities.regenerate_token': {
          await hub().identityAuth.requireSuperadmin(headers);
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          const result = await hub().superadmin.regenerateToken(id);
          return ok(v, op, {
            ...result,
            message: 'Token regenerated. All existing executors for this identity have been revoked.',
          });
        }

        case 'admin.executors.list': {
          await hub().identityAuth.requireSuperadmin(headers);
          const executors = await hub().superadmin.listExecutors();
          return ok(v, op, { executors });
        }
        case 'admin.executors.revoke': {
          await hub().identityAuth.requireSuperadmin(headers);
          const executorToken = String((payload as { executorToken?: string }).executorToken ?? '');
          if (!executorToken) throw new ValidationError('Missing payload.executorToken');
          await hub().superadmin.revokeExecutor(executorToken);
          return ok(v, op, { status: 'revoked' });
        }

        case 'admin.skills.registered_list':
          return ok(v, op, { skills: hub().skills.listRegistered() });

        case 'admin.skills.publish': {
          const auth = await hub().identityAuth.resolveFromHeaders(headers);
          const published = await hub().skillCenter.publishSkills(payload, auth.identityId);
          return ok(v, op, published);
        }

        case 'events.ingest': {
          const eventPayload = EventPayloadSchema.parse(payload);
          const result = await hub().ingestion.ingest(eventPayload);
          return ok(v, op, result, result.created ? 201 : 200);
        }

        case 'commands.execute': {
          const rawCommand = String((payload as { rawCommand?: string }).rawCommand ?? '');
          const context = (payload as { context?: { platform: string; groupId: string; userId: string } }).context;
          if (!rawCommand) throw new ValidationError('Missing payload.rawCommand');
          if (!context?.platform || !context.groupId || !context.userId) {
            throw new ValidationError('Missing payload.context (platform, groupId, userId)');
          }
          const out = await hub().commands.execute(rawCommand, context);
          return ok(v, op, out);
        }

        case 'topics.search': {
          const p = payload as Record<string, unknown>;
          const tag = p.tag ?? p.tags;
          const tags = tag == null ? undefined : Array.isArray(tag) ? (tag as string[]) : [String(tag)];
          const limit = parseInt(String(p.pageSize ?? '20'), 10);
          const pageNum = parseInt(String(p.page ?? '1'), 10);
          return ok(
            v,
            op,
            await hub().search.search({
              q: p.q as string | undefined,
              status: p.status as string | undefined,
              type: p.type as string | undefined,
              tags,
              limit,
              offset: (pageNum - 1) * limit,
            }),
          );
        }
        case 'topics.get': {
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          const topic = await hub().topics.get(id);
          if (!topic) throw new NotFoundError('Topic not found');
          return ok(v, op, topic);
        }
        case 'topics.patch': {
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          const patch = (payload as { patch?: Record<string, unknown> }).patch ?? {};
          return ok(v, op, await hub().topics.update(id, patch, 'api'));
        }
        case 'topics.timeline.append': {
          const topicId = String((payload as { topicId?: string }).topicId ?? '');
          if (!topicId) throw new ValidationError('Missing payload.topicId');
          const actionType = String((payload as { actionType?: string }).actionType ?? '');
          if (!actionType) throw new ValidationError('Missing payload.actionType');
          const actor = (payload as { actor?: string }).actor ?? 'api';
          const pl = (payload as { payload?: Record<string, unknown> }).payload;
          return ok(
            v,
            op,
            await hub().topics.addTimeline(topicId, {
              actor,
              actionType,
              payload: pl,
            }),
          );
        }

        case 'dispatches.list': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const p = payload as { status?: string; limit?: number };
          const dispatches = await hub().dispatch.list({
            status: p.status,
            limit: p.limit,
            executorToken,
          });
          return ok(v, op, { dispatches });
        }
        case 'dispatches.get': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          const row = await hub().dispatch.findByIdForExecutor(id, executorToken);
          if (!row) throw new NotFoundError('Dispatch not found for this executor');
          return ok(v, op, row);
        }
        case 'dispatches.claim': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const id = String((payload as { id?: string }).id ?? '');
          const claimedBy = String((payload as { claimedBy?: string }).claimedBy ?? '');
          if (!id || !claimedBy) throw new ValidationError('Missing payload.id or payload.claimedBy');
          const doc = await hub().dispatch.claim(id, claimedBy, executorToken);
          if (!doc) throw new ConflictError('Already claimed or not found');
          const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
          return ok(v, op, {
            id,
            status: 'claimed',
            claimedBy,
            enrichedPayload: plain.enrichedPayload,
            imAgentControlOp: plain.imAgentControlOp,
            skillName: plain.skillName,
            eventType: plain.eventType,
            topicId: plain.topicId != null ? String(plain.topicId) : undefined,
            sourcePlatform: plain.sourcePlatform ?? undefined,
          });
        }
        case 'dispatches.touch_claim': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          const okRenew = await hub().dispatch.renewClaim(id, executorToken);
          if (!okRenew) {
            throw new ConflictError(
              'Dispatch is not claimed by this executor (or claim expired).',
            );
          }
          return ok(v, op, { id, status: 'claim_renewed' });
        }
        case 'dispatches.notify_queued_local': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          return ok(v, op, await hub().dispatch.notifyExecutorQueuedIm(id, executorToken));
        }
        case 'dispatches.complete': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          await hub().dispatch.complete(id, (payload as { result?: unknown }).result, executorToken);
          return ok(v, op, { id, status: 'completed' });
        }
        case 'dispatches.fail': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          const errMsg = String((payload as { error?: string }).error ?? '');
          if (!errMsg) throw new ValidationError('Missing payload.error');
          await hub().dispatch.fail(
            id,
            errMsg,
            executorToken,
            Boolean((payload as { retryable?: boolean }).retryable),
          );
          return ok(v, op, { id, status: 'failed' });
        }

        case 'qa.post_question': {
          const dispatchId = String((payload as { dispatchId?: string }).dispatchId ?? '');
          if (!dispatchId) throw new ValidationError('Missing payload.dispatchId');
          const parsedQ = PostQuestionRequestSchema.parse(payload);
          const d = await hub().dispatch.findById(dispatchId);
          if (!d) throw new NotFoundError('Dispatch not found');
          const sourceChannel = d.sourceChannel as string | undefined;
          const sourcePlatform = d.sourcePlatform as string | undefined;
          const topichubUserId = d.targetUserId as string;

          const qa = await hub().qa.createQuestion(
            dispatchId,
            topichubUserId,
            parsedQ.questionText,
            parsedQ.questionContext,
            String(sourceChannel ?? ''),
            String(sourcePlatform ?? ''),
          );

          const allPending = await hub().qa.findAllPendingByUser(topichubUserId);
          const refIdx = allPending.findIndex((x) => String(x._id) === String(qa._id));
          const answerRef = refIdx >= 0 ? refIdx + 1 : Math.max(1, allPending.length);

          if (sourceChannel && sourcePlatform) {
            const ctx = parsedQ.questionContext;
            const header = ctx
              ? `🔔 **Agent Question** (${ctx.skillName} / ${ctx.topicTitle})`
              : '🔔 **Agent Question**';
            const imMessage =
              `${header}\n\n${parsedQ.questionText}\n\n` +
              `${formatQaHowToReplyLine(answerRef, qa)}`;
            hub()
              .messaging.send(sourcePlatform, {
                groupId: sourceChannel,
                message: imMessage,
              })
              .catch(() => {
                /* non-fatal */
              });
          }
          return ok(v, op, { qaId: String(qa._id), status: qa.status }, 201);
        }
        case 'qa.list': {
          const dispatchId = String((payload as { dispatchId?: string }).dispatchId ?? '');
          if (!dispatchId) throw new ValidationError('Missing payload.dispatchId');
          const status = (payload as { status?: string }).status;
          const exchanges = await hub().qa.findByDispatchAndStatus(dispatchId, status);
          return ok(v, op, { exchanges });
        }

        case 'skills.catalog_list': {
          const query = (payload as { query?: Record<string, unknown> }).query ?? (payload as Record<string, unknown>);
          return ok(v, op, await hub().skillCenterHttp.listCatalog(query));
        }
        case 'skills.content_by_id': {
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          return ok(v, op, await hub().skillCenterHttp.getSkillContentByRegistrationId(id));
        }
        case 'skills.content_by_name': {
          const name = String((payload as { name?: string }).name ?? '');
          if (!name) throw new ValidationError('Missing payload.name');
          return ok(v, op, await hub().skillCenterHttp.getSkillContent(decodeURIComponent(name)));
        }
        case 'skills.delete_by_id': {
          const id = String((payload as { id?: string }).id ?? '');
          if (!id) throw new ValidationError('Missing payload.id');
          return ok(v, op, await hub().skillCenterHttp.deleteSkill(id, headers));
        }
        case 'skills.like': {
          const name = String((payload as { name?: string }).name ?? '');
          if (!name) throw new ValidationError('Missing payload.name');
          return ok(
            v,
            op,
            await hub().skillCenterHttp.toggleLike(decodeURIComponent(name), headers),
          );
        }

        case 'identity.me': {
          const token = extractIdentityBearer(headers);
          const resolved = await hub().superadmin.resolveIdentityToken(token);
          if (!resolved) throw new UnauthorizedError('Invalid token');
          const identities = await hub().superadmin.listIdentities();
          const identity = identities.find((i: { id: string }) => i.id === resolved.identityId);
          return ok(v, op, {
            identityId: resolved.identityId,
            uniqueId: identity?.uniqueId ?? 'unknown',
            displayName: identity?.displayName ?? 'unknown',
            isSuperAdmin: resolved.isSuperAdmin,
            status: identity?.status ?? 'active',
            executorCount: identity?.executorCount ?? 0,
            createdAt: identity?.createdAt,
          });
        }

        case 'executors.register': {
          const token = extractBearer(headers);
          const meta = (payload as { executorMeta?: Record<string, unknown> }).executorMeta as
            | { agentType: string; maxConcurrentAgents: number; hostname: string; pid: number }
            | undefined;
          const result = await hub().superadmin.registerExecutor(token, meta);
          await hub().heartbeat.registerExecutor(
            result.identityId,
            result.executorToken,
            true,
            meta,
          );
          await hub().identity.repointActiveBindingsClaimToken(
            result.identityId,
            result.executorToken,
          );
          return ok(v, op, result);
        }
        case 'executors.heartbeat': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const executor = await hub().superadmin.resolveExecutorToken(executorToken);
          if (!executor) throw new UnauthorizedError('Invalid executor token');
          await hub().heartbeat.heartbeat(executor.identityId);
          return ok(v, op, {
            status: 'ok',
            executorToken: executorToken.slice(0, 12) + '...',
          });
        }
        case 'executors.deregister': {
          const { executorToken } = await hub().identityAuth.requireExecutor(headers);
          const executor = await hub().superadmin.resolveExecutorToken(executorToken);
          if (!executor) throw new UnauthorizedError('Invalid executor token');
          await hub().superadmin.revokeExecutor(executorToken);
          await hub().identity.deactivateAllBindings(executorToken);
          await hub().heartbeat.deregister(executor.identityId);
          return ok(v, op, { status: 'deregistered' });
        }
        case 'executors.pairing_code': {
          const { executorToken, identityId } = await hub().identityAuth.requireExecutor(headers);
          const result = await hub().identity.generateExecutorPairingCode(identityId, executorToken);
          return ok(v, op, {
            code: result.code,
            ...(result.expiresAt != null ? { expiresAt: result.expiresAt } : {}),
          });
        }

        default:
          return {
            status: 404,
            body: {
              ok: false,
              v,
              op,
              error: { code: 'UNKNOWN_OP', message: `Unknown op: ${op}` },
            },
          };
      }
    } catch (err) {
      const { status, body } = mapError(op, v, err);
      return { status, body };
    }
  }
}
