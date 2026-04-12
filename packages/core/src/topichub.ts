import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { TopicHubConfigSchema, TopicHubConfig } from './config';
import { defaultLoggerFactory, LoggerFactory, TopicHubLogger } from './common/logger';
import { ConflictError, NotFoundError, TopicHubError } from './common/errors';
import { getBuiltinSkills } from './builtin-skills';

import { Topic } from './entities/topic.entity';
import { TimelineEntry } from './entities/timeline-entry.entity';
import { SkillRegistration } from './entities/skill-registration.entity';
import { TaskDispatch } from './entities/task-dispatch.entity';

import { UserIdentityBinding } from './entities/user-identity-binding.entity';
import { ExecutorHeartbeat } from './entities/executor-heartbeat.entity';
import { QaExchange } from './entities/qa-exchange.entity';
import { PairingCode } from './identity/pairing-code.entity';

import { SecretManager, CryptoService } from './services/crypto.service';
import { TopicService } from './services/topic.service';
import { TimelineService } from './services/timeline.service';
import { SearchService } from './services/search.service';
import { DispatchService } from './services/dispatch.service';
import { IdentityService } from './identity/identity.service';
import type {
  ClaimResult,
  ResolvedPlatformUser,
  ResolvedClaimTokenUser,
  PairingRotatedPayload,
} from './identity/identity.service';
import { DISPATCH_UNCLAIMED_REMINDER_MS } from './identity/identity-types';
import type { CreateIdentityInput } from './identity/identity-types';
import { HeartbeatService } from './services/heartbeat.service';
import type { ExecutorHeartbeatMeta, RegisterExecutorResult } from './services/heartbeat.service';
import { QaService } from './services/qa.service';
import { SuperadminService } from './services/superadmin.service';
import { SkillCenterService } from './services/skill-center.service';
import { PublishedSkillCatalog } from './services/published-skill-catalog';
import type { InitResult, CreateIdentityResult } from './services/superadmin.service';
import { AuthService } from './services/auth.service';
import type { ResolvedAuth } from './services/auth.service';
import { Identity } from './entities/identity.entity';
import { ExecutorRegistration } from './entities/executor-registration.entity';
import { ImBinding } from './entities/im-binding.entity';
import { formatQaReminderMessage } from './im/im-list-format.js';
import { SkillLike } from './entities/skill-like.entity';
import { SkillUsage } from './entities/skill-usage.entity';

import { SkillLoader } from './skill/registry/skill-loader';
import { SkillMdParser } from './skill/registry/skill-md-parser';
import { SkillRegistry } from './skill/registry/skill-registry';
import { SkillPipeline } from './skill/pipeline/skill-pipeline';
import { pickImNotifyBody } from './im/im-notify-body';
import { getImTaskCompletionBodyBudgetChars, IM_TASK_COMPLETED_PREFIX } from './im/im-platform-limits';
import { CommandParser } from './command/command-parser';
import { CommandRouter, CommandContext } from './command/command-router';
import { createCompositeSkillCommandMatcher } from './command/composite-skill-command-matcher';
import { CreateHandler } from './command/handlers/create.handler';
import { UpdateHandler } from './command/handlers/update.handler';
import { AssignHandler } from './command/handlers/assign.handler';
import { ShowHandler } from './command/handlers/show.handler';
import { TimelineHandler } from './command/handlers/timeline.handler';
import { ReopenHandler } from './command/handlers/reopen.handler';
import { HistoryHandler } from './command/handlers/history.handler';
import { HelpHandler } from './command/handlers/help.handler';
import { RelayHandler } from './command/handlers/relay.handler';
import { SkillInvokeHandler } from './command/handlers/skill-invoke.handler';
import { SkillsHandler } from './command/handlers/skills.handler';

import { IngestionService } from './ingestion/ingestion.service';
import {
  WebhookHandler,
  WebhookResult,
  WebhookIdentityOps,
  WebhookHeartbeatOps,
  WebhookQaOps,
} from './webhook/webhook-handler';
import { OpenClawBridge } from './bridge/openclaw-bridge';
import { BridgeManager } from './bridge/bridge-manager';
import type { OpenClawConfig, BridgeConfig } from './bridge/openclaw-types';

// --- Operation namespace types ---

export interface TopicOperations {
  list(query?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ topics: any[]; total: number }>;
  get(topicId: string): Promise<any>;
  create(data: {
    type: string;
    title: string;
    sourceUrl?: string;
    metadata?: Record<string, unknown>;
    createdBy: string;
  }): Promise<any>;
  update(topicId: string, updates: {
    status?: string;
    tags?: string[];
    assignees?: string[];
    metadata?: Record<string, unknown>;
  }, actor: string): Promise<any>;
  addTimeline(topicId: string, entry: {
    actor: string;
    actionType: string;
    payload?: Record<string, unknown>;
  }): Promise<any>;
  updateStatus(topicId: string, status: string, actor: string): Promise<any>;
  addTag(topicId: string, tag: string, actor: string): Promise<void>;
  removeTag(topicId: string, tag: string, actor: string): Promise<void>;
  assignUser(topicId: string, userId: string, actor: string): Promise<void>;
  unassignUser(topicId: string, userId: string, actor: string): Promise<void>;
}

export interface CommandOperations {
  execute(rawCommand: string, context: {
    platform: string;
    groupId: string;
    userId: string;
  }): Promise<{ success: boolean; result?: unknown; error?: string }>;
}

export interface IngestionOperations {
  ingest(payload: {
    type: string;
    title: string;
    sourceUrl?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
    assignees?: string[];
  }): Promise<{ topic: any; created: boolean }>;
}

export interface WebhookOperations {
  handleOpenClaw(
    payload: unknown,
    rawBody?: Buffer | string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<WebhookResult>;
}

export interface MessagingOperations {
  send(platform: string, params: {
    groupId: string;
    message: string;
  }): Promise<void>;
}

export interface SearchOperations {
  search(query: {
    q?: string;
    status?: string;
    type?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<{ topics: any[]; total: number }>;
}

export interface SkillOperations {
  listRegistered(): Array<{
    name: string;
    version: string;
  }>;
}

export interface SkillCenterOperations {
  publishSkills(
    body: unknown,
    authorIdentityId: string,
  ): Promise<{
    published: Array<{ name: string; status: string; id: string }>;
    errors: Array<{ name: string; error: string }>;
  }>;
  listCatalog(query: Record<string, unknown>): Promise<{
    skills: Array<{
      id: string;
      name: string;
      description: string;
      version: string;
      authorIdentityId: string;
      authorDisplayName: string;
      likeCount: number;
      usageCount: number;
      publishedAt: string | null;
    }>;
    total: number;
    page: number;
    limit: number;
  }>;
  getSkillContent(name: string): Promise<{
    id: string;
    name: string;
    version: string;
    skillMdRaw: string;
    manifest: Record<string, unknown>;
  }>;
  getSkillContentByRegistrationId(registrationId: string): Promise<{
    id: string;
    name: string;
    version: string;
    skillMdRaw: string;
    manifest: Record<string, unknown>;
  }>;
  toggleLike(name: string, identityId: string): Promise<{ liked: boolean; likeCount: number }>;
  deleteSkill(registrationId: string, identityId: string): Promise<{ deleted: true; id: string }>;
}

export interface DispatchOperations {
  list(filters: { executorToken: string; status?: string; limit?: number }): Promise<any[]>;
  findById(dispatchId: string): Promise<any | null>;
  /** Executor-scoped read for queue / status polling (returns null if not found or token mismatch). */
  findByIdForExecutor(
    dispatchId: string,
    executorToken: string,
  ): Promise<{ id: string; status: string; topicId: string } | null>;
  onTask(listener: (task: any) => void): () => void;
  /** Returns the claimed dispatch document (incl. `enrichedPayload`), or `null` if not claimable. */
  claim(taskId: string, claimedBy: string, executorToken: string): Promise<any | null>;
  /** Keeps an active claim from expiring while the executor is still working. */
  renewClaim(taskId: string, executorToken: string): Promise<boolean>;
  complete(taskId: string, result: unknown, executorToken: string): Promise<void>;
  fail(taskId: string, error: string, executorToken: string, retryable?: boolean): Promise<void>;
}

export interface IdentityOperations {
  generateExecutorPairingCode(topichubUserId: string, executorClaimToken: string): Promise<{ code: string; expiresAt: Date }>;
  claimPairingCode(platform: string, platformUserId: string, code: string): Promise<ClaimResult>;
  resolveUserByPlatform(platform: string, platformUserId: string): Promise<ResolvedPlatformUser | undefined>;
  resolveUserByClaimToken(claimToken: string): Promise<ResolvedClaimTokenUser | undefined>;
  deactivateBinding(platform: string, platformUserId: string): Promise<boolean>;
  deactivateAllBindings(claimToken: string): Promise<number>;
  getBindingsForUser(topichubUserId: string): Promise<any[]>;
  subscribePairingRotations(
    executorToken: string,
    handler: (payload: PairingRotatedPayload) => void,
  ): () => void;
}

export interface HeartbeatOperations {
  registerExecutor(topichubUserId: string, claimToken: string, force: boolean, executorMeta?: ExecutorHeartbeatMeta): Promise<RegisterExecutorResult>;
  heartbeat(topichubUserId: string): Promise<{ pendingDispatches: number }>;
  deregister(topichubUserId: string): Promise<void>;
  isAvailable(topichubUserId: string): Promise<boolean>;
  isBoundExecutorSessionLive(
    topichubUserId: string,
    boundExecutorToken: string,
  ): Promise<boolean>;
  getHeartbeat(topichubUserId: string): Promise<any | null>;
}

export interface QaOperations {
  createQuestion(dispatchId: string, topichubUserId: string, questionText: string, questionContext: { skillName: string; topicTitle: string } | undefined, sourceChannel: string, sourcePlatform: string): Promise<any>;
  findPendingByDispatch(dispatchId: string): Promise<any[]>;
  findPendingByUser(topichubUserId: string): Promise<any | null>;
  findAllPendingByUser(topichubUserId: string): Promise<any[]>;
  submitAnswer(qaId: string, answerText: string): Promise<any | null>;
  findAnsweredByDispatch(dispatchId: string): Promise<any[]>;
  findByDispatchAndStatus(dispatchId: string, status?: string): Promise<any[]>;
}

export interface SuperadminOperations {
  init(): Promise<InitResult>;
  createIdentity(input: CreateIdentityInput): Promise<CreateIdentityResult>;
  listIdentities(): Promise<any[]>;
  revokeIdentity(identityId: string): Promise<{ executorsRevoked: number }>;
  regenerateToken(identityId: string): Promise<{ token: string; executorsRevoked: number }>;
  registerExecutor(identityToken: string, executorMeta?: { agentType: string; maxConcurrentAgents: number; hostname: string; pid: number }): Promise<{ executorToken: string; identityId: string; identityUniqueId: string }>;
  revokeExecutor(executorToken: string): Promise<void>;
  listExecutors(): Promise<any[]>;
  resolveExecutorToken(executorToken: string): Promise<{ identityId: string; executorToken: string } | null>;
  resolveIdentityToken(identityToken: string): Promise<{ identityId: string; isSuperAdmin: boolean } | null>;
}

export interface IdentityAuthOperations {
  resolveFromHeaders(headers: Record<string, string | string[] | undefined>): Promise<ResolvedAuth>;
  requireSuperadmin(headers: Record<string, string | string[] | undefined>): Promise<{ identityId: string }>;
  requireExecutor(headers: Record<string, string | string[] | undefined>): Promise<{ identityId: string; executorToken: string }>;
}

// --- TopicHub Facade ---

const REMINDER_CHECK_INTERVAL_MS = 60_000;

/** Optional extra cap on IM completion body (min with per-platform budget). */
const IM_COMPLETE_NOTIFY_ABS_MAX_CHARS = 50_000_000;

function resolveOptionalImBodyHardCap(): number | null {
  const raw = process.env.TOPICHUB_IM_COMPLETE_MAX_CHARS?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, IM_COMPLETE_NOTIFY_ABS_MAX_CHARS);
}

export class TopicHub {
  private reminderTimer?: ReturnType<typeof setInterval>;

  private constructor(
    private readonly connection: mongoose.Connection,
    private readonly ownsConnection: boolean,
    private readonly topicService: TopicService,
    private readonly timelineService: TimelineService,
    private readonly searchService: SearchService,
    private readonly dispatchService: DispatchService,
    private readonly skillRegistry: SkillRegistry,
    private readonly skillPipeline: SkillPipeline,
    private readonly ingestionService: IngestionService,
    private readonly commandParser: CommandParser,
    private readonly commandRouter: CommandRouter,
    private readonly webhookHandler: WebhookHandler,
    private readonly handlers: Map<string, any>,
    private readonly logger: TopicHubLogger,
    private readonly bridge: OpenClawBridge | null,
    private readonly bridgeManager: BridgeManager | null,
    private readonly identityService: IdentityService,
    private readonly heartbeatService: HeartbeatService,
    private readonly qaService: QaService,
    private readonly superadminService: SuperadminService,
    private readonly authServiceNew: AuthService,
    private readonly publishedSkillCatalog: PublishedSkillCatalog,
    private readonly skillCenterService: SkillCenterService,
  ) {}

  static async create(config: TopicHubConfig): Promise<TopicHub> {
    const validated = TopicHubConfigSchema.parse(config);

    const loggerFactory: LoggerFactory = validated.logger ?? defaultLoggerFactory;
    const mainLogger = loggerFactory('TopicHub');

    let connection: mongoose.Connection;
    let ownsConnection: boolean;
    if (validated.mongoConnection) {
      connection = validated.mongoConnection;
      ownsConnection = false;
    } else {
      const masked = validated.mongoUri!.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
      mainLogger.log(`MongoDB connecting: ${masked}`);
      connection = mongoose.createConnection(validated.mongoUri!);
      await connection.asPromise();
      ownsConnection = true;
    }

    const { host, port, name: dbName } = connection;
    mainLogger.log(`MongoDB connected: ${host}:${port}/${dbName}`);

    const p = validated.collectionPrefix ?? '';
    const model = <T extends new (...args: any[]) => any>(cls: T, collection: string) =>
      getModelForClass(cls, {
        existingConnection: connection,
        schemaOptions: { collection: `${p}${collection}` },
      });

    const TopicModel = model(Topic, 'topics');
    const TimelineEntryModel = model(TimelineEntry, 'timeline_entries');
    const SkillRegistrationModel = model(SkillRegistration, 'skill_registrations');
    const TaskDispatchModel = model(TaskDispatch, 'task_dispatches');
    const UserIdentityBindingModel = model(UserIdentityBinding, 'user_identity_bindings');
    const PairingCodeModel = model(PairingCode, 'pairing_codes');
    const ExecutorHeartbeatModel = model(ExecutorHeartbeat, 'executor_heartbeats');
    const QaExchangeModel = model(QaExchange, 'qa_exchanges');
    const IdentityModel = model(Identity, 'identities');
    const ExecutorRegistrationModel = model(ExecutorRegistration, 'executor_registrations');
    const ImBindingModel = model(ImBinding, 'im_bindings');
    const SkillLikeModel = model(SkillLike, 'skill_likes');
    const SkillUsageModel = model(SkillUsage, 'skill_usages');

    const publishedSkillCatalog = new PublishedSkillCatalog(
      SkillRegistrationModel,
      loggerFactory('PublishedSkillCatalog'),
    );

    // Crypto
    const secretManager = new SecretManager(
      loggerFactory('SecretManager'),
      validated.encryption?.masterKey,
    );
    const cryptoService = new CryptoService(secretManager);

    // Core services
    const topicService = new TopicService(TopicModel, TimelineEntryModel, loggerFactory('TopicService'));
    const timelineService = new TimelineService(TimelineEntryModel, loggerFactory('TimelineService'));
    const searchService = new SearchService(TopicModel, loggerFactory('SearchService'));
    const dispatchService = new DispatchService(TaskDispatchModel, loggerFactory('DispatchService'));
    const identityService = new IdentityService(UserIdentityBindingModel, PairingCodeModel, loggerFactory('IdentityService'));
    const heartbeatService = new HeartbeatService(ExecutorHeartbeatModel, loggerFactory('HeartbeatService'));
    const qaService = new QaService(QaExchangeModel, loggerFactory('QaService'));
    const superadminService = new SuperadminService(IdentityModel, ExecutorRegistrationModel, loggerFactory('SuperadminService'));
    const authServiceNew = new AuthService(IdentityModel, ExecutorRegistrationModel);

    let bridge: OpenClawBridge | null = null;
    let bridgeManager: BridgeManager | null = null;

    if (validated.bridge) {
      const bridgeConfig = validated.bridge as BridgeConfig;
      bridgeManager = new BridgeManager(bridgeConfig, loggerFactory('BridgeManager'));
      await bridgeManager.start();
      bridge = OpenClawBridge.fromBridgeManager(
        bridgeManager.port!,
        bridgeManager.webhookSecret!,
        Object.keys(bridgeConfig.channels),
        loggerFactory('OpenClawBridge'),
      );
      mainLogger.log('OpenClaw bridge auto-started — IM messaging enabled');
    } else if (validated.openclaw) {
      bridge = new OpenClawBridge(validated.openclaw as OpenClawConfig, loggerFactory('OpenClawBridge'));
      mainLogger.log('OpenClaw bridge configured (external) — IM messaging enabled');
    } else {
      mainLogger.log('OpenClaw bridge not configured — IM messaging disabled');
    }

    // Skill system
    const skillLoader = new SkillLoader(validated.skillsDir, loggerFactory('SkillLoader'));
    const skillMdParser = new SkillMdParser(loggerFactory('SkillMdParser'));

    const skillCenterService = new SkillCenterService(
      SkillRegistrationModel,
      SkillLikeModel,
      IdentityModel,
      skillMdParser,
      loggerFactory('SkillCenter'),
      publishedSkillCatalog,
    );

    const skillRegistry = new SkillRegistry(
      skillLoader,
      skillMdParser,
      SkillRegistrationModel,
      loggerFactory('SkillRegistry'),
    );

    const skillPipeline = new SkillPipeline(
      skillRegistry,
      dispatchService,
      loggerFactory('SkillPipeline'),
      bridge,
      skillMdParser,
      SkillRegistrationModel,
    );

    // Command system
    const commandParser = new CommandParser();
    const commandRouter = new CommandRouter(
      createCompositeSkillCommandMatcher(publishedSkillCatalog, (token) =>
        skillRegistry.matchSkillCommandToken(token),
      ),
    );

    const createHandler = new CreateHandler(topicService, skillPipeline, loggerFactory('CreateHandler'));
    const updateHandler = new UpdateHandler(topicService, skillPipeline, loggerFactory('UpdateHandler'));
    const assignHandler = new AssignHandler(topicService, skillPipeline, loggerFactory('AssignHandler'));
    const showHandler = new ShowHandler(topicService);
    const timelineHandler = new TimelineHandler(topicService, timelineService);
    const reopenHandler = new ReopenHandler(topicService, skillPipeline, loggerFactory('ReopenHandler'));
    const historyHandler = new HistoryHandler(topicService);
    const helpHandler = new HelpHandler();
    const relayHandler = new RelayHandler(topicService, skillPipeline, loggerFactory('RelayHandler'));
    const skillInvokeHandler = new SkillInvokeHandler(topicService, skillPipeline, loggerFactory('SkillInvokeHandler'));
    const skillsHandler = new SkillsHandler(skillCenterService, loggerFactory('SkillsHandler'));

    const handlers = new Map<string, any>([
      ['create', createHandler],
      ['update', updateHandler],
      ['assign', assignHandler],
      ['show', showHandler],
      ['timeline', timelineHandler],
      ['reopen', reopenHandler],
      ['history', historyHandler],
      ['help', helpHandler],
      ['relay', relayHandler],
      ['skill_invoke', skillInvokeHandler],
      ['skills', skillsHandler],
    ]);

    // Ingestion
    const ingestionService = new IngestionService(
      topicService,
      timelineService,
      skillPipeline,
      loggerFactory('IngestionService'),
    );

    // Webhook
    const commandDispatcher = async (
      handler: string,
      parsed: any,
      context: CommandContext,
    ) => {
      const h = handlers.get(handler);
      if (!h) return { success: false, error: `Unknown handler: ${handler}` };
      return h.execute(parsed, context);
    };

    const webhookIdentityOps: WebhookIdentityOps = {
      claimPairingCode: (platform, platformUserId, code) =>
        identityService.claimPairingCode(platform, platformUserId, code),
      resolveUserByPlatform: (platform, platformUserId) =>
        identityService.resolveUserByPlatform(platform, platformUserId),
      deactivateBinding: (platform, platformUserId) =>
        identityService.deactivateBinding(platform, platformUserId),
      invalidateLeakedPairingCode: (code, meta) =>
        identityService.invalidateLeakedPairingCodeAndRotate(code, meta),
    };

    const webhookHeartbeatOps: WebhookHeartbeatOps = {
      isAvailable: (topichubUserId) =>
        heartbeatService.isAvailable(topichubUserId),
      isBoundExecutorSessionLive: (topichubUserId, boundExecutorToken) =>
        heartbeatService.isBoundExecutorSessionLive(topichubUserId, boundExecutorToken),
    };

    const webhookQaOps: WebhookQaOps = {
      findPendingByUser: (topichubUserId) => qaService.findPendingByUser(topichubUserId),
      findAllPendingByUser: (topichubUserId) => qaService.findAllPendingByUser(topichubUserId),
      submitAnswer: (qaId, answerText) => qaService.submitAnswer(qaId, answerText),
    };

    const webhookDispatchQueueOps = {
      listClaimedDispatchesForTopic: async (topicId: string, executorToken: string) => {
        const rows = await dispatchService.findClaimedByTopicExecutor(topicId, executorToken);
        return (rows as any[]).map((r) => ({
          id: String(r._id),
          skillName: String(r.skillName ?? 'unknown'),
          createdAt:
            r.createdAt instanceof Date
              ? r.createdAt.toISOString()
              : r.createdAt != null
                ? String(r.createdAt)
                : null,
        }));
      },
    };

    const webhookHandler = new WebhookHandler(
      commandParser,
      commandRouter,
      topicService,
      ingestionService,
      commandDispatcher,
      loggerFactory('WebhookHandler'),
      bridge ?? undefined,
      webhookIdentityOps,
      webhookHeartbeatOps,
      webhookQaOps,
      publishedSkillCatalog,
      webhookDispatchQueueOps,
    );

    // Stage 1: Load built-in md-only skills (unless builtins: false)
    if (validated.builtins !== false) {
      const builtins = getBuiltinSkills();
      for (const entry of builtins) {
        await skillRegistry.registerBuiltinMd(entry.name, entry.mdContent, entry.version);
      }
      mainLogger.log(`Loaded ${builtins.length} built-in skill(s)`);
    }

    // Stage 2: Load filesystem skills from skillsDir (may override builtins)
    if (validated.skillsDir) {
      await skillRegistry.loadAll();
    }

    // Init dispatch
    dispatchService.init();

    const hub = new TopicHub(
      connection,
      ownsConnection,
      topicService,
      timelineService,
      searchService,
      dispatchService,
      skillRegistry,
      skillPipeline,
      ingestionService,
      commandParser,
      commandRouter,
      webhookHandler,
      handlers,
      mainLogger,
      bridge,
      bridgeManager,
      identityService,
      heartbeatService,
      qaService,
      superadminService,
      authServiceNew,
      publishedSkillCatalog,
      skillCenterService,
    );

    hub.startReminderTimer();

    return hub;
  }

  private startReminderTimer(): void {
    if (!this.bridge) return;

    this.reminderTimer = setInterval(
      () => this.checkUnclaimedReminders().catch((err) => this.logger.error('Unclaimed reminder check failed', String(err))),
      REMINDER_CHECK_INTERVAL_MS,
    );
    if (this.reminderTimer.unref) {
      this.reminderTimer.unref();
    }
  }

  /** OpenClaw `to` peer for a DM when only the platform user id is known (from identity binding). */
  private static openClawDmTarget(platformUserId: string): string {
    const id = String(platformUserId).trim();
    if (!id) return '';
    return id.startsWith('user:') ? id : `user:${id}`;
  }

  private async checkUnclaimedReminders(): Promise<void> {
    if (!this.bridge) return;

    const stale = await this.dispatchService.findUnclaimedWithReminder(DISPATCH_UNCLAIMED_REMINDER_MS);
    for (const dispatch of stale) {
      try {
        const topichubUserId = dispatch.targetUserId as string | null | undefined;
        const boundToken = dispatch.targetExecutorToken as string | null | undefined;
        const platform = dispatch.sourcePlatform as string | null | undefined;
        if (!topichubUserId || !boundToken || !platform) {
          continue;
        }

        const sessionLive = await this.heartbeatService.isBoundExecutorSessionLive(
          topichubUserId,
          boundToken,
        );
        if (sessionLive) {
          // Heartbeat says the executor is up — skip noisy group pings while the queue catches up.
          continue;
        }

        const bindings = await this.identityService.getBindingsForUser(topichubUserId);
        const binding = bindings.find((b: { platform: string }) => b.platform === platform);
        const dmTarget = binding?.platformUserId
          ? TopicHub.openClawDmTarget(binding.platformUserId)
          : '';
        if (!dmTarget) {
          this.logger.warn(
            `Unclaimed dispatch ${dispatch._id}: no active IM binding for platform ${platform}; cannot send DM reminder`,
          );
          continue;
        }

        await this.bridge.sendMessage(
          platform,
          dmTarget,
          'Your task is still waiting, but your local executor has no active heartbeat (disconnected or session out of date). Start `topichub-admin serve`; if the terminal shows a new pairing code, DM the bot with `/register <code>`.',
        );
        await this.dispatchService.markReminderSent(dispatch._id.toString());
      } catch (err) {
        this.logger.error(`Reminder send failed for dispatch ${dispatch._id}`, String(err));
      }
    }

    await this.checkQaReminders();
    await this.checkQaTimeouts();
  }

  private async checkQaReminders(): Promise<void> {
    if (!this.bridge) return;

    const expired = await this.qaService.getExpiredForReminder();
    for (const qa of expired) {
      try {
        const allPending = await this.qaService.findAllPendingByUser(qa.topichubUserId);
        const refIdx = allPending.findIndex((x) => String(x._id) === String(qa._id));
        const answerRef = refIdx >= 0 ? refIdx + 1 : Math.max(1, allPending.length);
        await this.bridge.sendMessage(
          qa.sourcePlatform,
          qa.sourceChannel,
          formatQaReminderMessage(answerRef, qa),
        );
        await this.qaService.markReminderSent(String(qa._id));
      } catch (err) {
        this.logger.error(`QA reminder send failed for ${qa._id}`, String(err));
      }
    }
  }

  private async checkQaTimeouts(): Promise<void> {
    if (!this.bridge) return;

    const expired = await this.qaService.getExpiredForTimeout();
    for (const qa of expired) {
      try {
        await this.qaService.markTimedOut(String(qa._id));
        await this.dispatchService.suspend(
          String(qa.dispatchId),
          'QA timeout — no answer received',
        );
        await this.bridge.sendMessage(
          qa.sourcePlatform,
          qa.sourceChannel,
          'Your agent task has been suspended due to no response.',
        );
      } catch (err) {
        this.logger.error(`QA timeout processing failed for ${qa._id}`, String(err));
      }
    }
  }

  get topics(): TopicOperations {
    return {
      list: async (query) => {
        const filters = {
          type: query?.type,
          status: query?.status,
          page: query?.offset ? Math.floor(query.offset / (query.limit ?? 20)) + 1 : 1,
          pageSize: query?.limit ?? 20,
        };
        const result = await this.searchService.search(filters);
        return { topics: result.results, total: result.total };
      },
      get: (topicId) => this.topicService.findById(topicId),
      create: (data) => this.topicService.create(data),
      update: async (topicId, updates, actor) => {
        if (updates.status) {
          await this.topicService.updateStatus(topicId, updates.status as any, actor);
        }
        if (updates.tags) {
          const topic = await this.topicService.findById(topicId);
          const existing = topic?.tags ?? [];
          for (const tag of updates.tags.filter((t: string) => !existing.includes(t))) {
            await this.topicService.addTag(topicId, tag, actor);
          }
        }
        if (updates.assignees) {
          for (const userId of updates.assignees) {
            await this.topicService.assignUser(topicId, userId, actor);
          }
        }
        return this.topicService.findById(topicId);
      },
      addTimeline: async (topicId, entry) => {
        return this.timelineService.append(
          topicId, entry.actor, entry.actionType as any, entry.payload,
        );
      },
      updateStatus: (topicId, status, actor) =>
        this.topicService.updateStatus(topicId, status as any, actor),
      addTag: async (topicId, tag, actor) => {
        await this.topicService.addTag(topicId, tag, actor);
      },
      removeTag: async (topicId, tag, actor) => {
        await this.topicService.removeTag(topicId, tag, actor);
      },
      assignUser: async (topicId, userId, actor) => {
        await this.topicService.assignUser(topicId, userId, actor);
      },
      unassignUser: async (_topicId, _userId, _actor) => {
        throw new TopicHubError('unassignUser not yet implemented');
      },
    };
  }

  get commands(): CommandOperations {
    return {
      execute: async (rawCommand, context) => {
        const parsed = this.commandParser.parse(rawCommand);
        const activeTopic = await this.topicService.findActiveTopicByGroup(
          context.platform,
          context.groupId,
        );
        const routeContext: CommandContext = {
          ...context,
          hasActiveTopic: !!activeTopic,
        };
        await this.publishedSkillCatalog.refreshIfNeeded();
        const route = this.commandRouter.route(parsed, routeContext);
        if (route.error) {
          return { success: false, error: route.error };
        }

        const handler = this.handlers.get(route.handler);
        if (!handler) {
          return { success: false, error: `Unknown command handler: ${route.handler}` };
        }

        const execContext: CommandContext =
          route.skillInvocationName != null
            ? { ...routeContext, skillInvocationName: route.skillInvocationName }
            : route.publishedSkillMissToken != null
              ? {
                  ...routeContext,
                  publishedSkillRouting: {
                    status: 'miss',
                    token: route.publishedSkillMissToken,
                  },
                }
              : routeContext;

        const result = await handler.execute(parsed, execContext);
        return {
          success: result.success,
          result: result.data ?? result.message,
          error: result.error,
        };
      },
    };
  }

  get ingestion(): IngestionOperations {
    return {
      ingest: (payload) =>
        this.ingestionService.ingest({
          type: payload.type,
          title: payload.title,
          sourceUrl: payload.sourceUrl,
          status: payload.status,
          metadata: payload.metadata ?? {},
          tags: payload.tags ?? [],
          assignees: payload.assignees ?? [],
        }),
    };
  }

  get webhook(): WebhookOperations {
    return {
      handleOpenClaw: (
        payload: unknown,
        rawBody?: Buffer | string,
        headers?: Record<string, string | string[] | undefined>,
      ) => this.webhookHandler.handleOpenClaw(payload, rawBody, headers),
    };
  }

  get messaging(): MessagingOperations {
    return {
      send: async (platform, params) => {
        if (this.bridge) {
          await this.bridge.sendMessage(platform, params.groupId, params.message);
          return;
        }
        throw new NotFoundError(`Platform ${platform} does not support messaging`);
      },
    };
  }

  get search(): SearchOperations {
    return {
      search: async (query) => {
        const result = await this.searchService.search({
          q: query.q,
          status: query.status,
          type: query.type,
          tags: query.tags,
          page: query.offset ? Math.floor(query.offset / (query.limit ?? 20)) + 1 : 1,
          pageSize: query.limit ?? 20,
        });
        return { topics: result.results, total: result.total };
      },
    };
  }

  get skills(): SkillOperations {
    return {
      listRegistered: () => {
        return this.skillRegistry.listAll().map((s) => ({
          name: s.registration.name,
          version: s.registration.version,
        }));
      },
    };
  }

  get skillCenter(): SkillCenterOperations {
    return {
      publishSkills: (body, authorIdentityId) =>
        this.skillCenterService.publishSkills(body, authorIdentityId),
      listCatalog: (query) => this.skillCenterService.listCatalog(query),
      getSkillContent: (name) => this.skillCenterService.getSkillContent(name),
      getSkillContentByRegistrationId: (registrationId) =>
        this.skillCenterService.getSkillContentByRegistrationId(registrationId),
      toggleLike: (name, identityId) => this.skillCenterService.toggleLike(name, identityId),
      deleteSkill: (registrationId, identityId) =>
        this.skillCenterService.deleteSkill(registrationId, identityId),
    };
  }

  get dispatch(): DispatchOperations {
    return {
      list: (filters) =>
        this.dispatchService.findUnclaimed({
          limit: filters?.limit,
          executorToken: filters.executorToken,
        }),
      findById: (dispatchId) =>
        this.dispatchService.findById(dispatchId),
      findByIdForExecutor: (dispatchId, executorToken) =>
        this.dispatchService.findByIdForExecutor(dispatchId, executorToken),
      onTask: (listener) => {
        this.dispatchService.onNewDispatch(listener);
        return () => this.dispatchService.offNewDispatch(listener);
      },
      claim: async (taskId, claimedBy, executorToken) => {
        const result = await this.dispatchService.claim(taskId, claimedBy, executorToken);
        if (result && result.sourceChannel && result.sourcePlatform && this.bridge) {
          this.bridge
            .sendMessage(result.sourcePlatform, result.sourceChannel, 'Your local agent is running this task.')
            .catch((err) => this.logger.error('IM claim notification failed', String(err)));
        }
        return result;
      },
      renewClaim: (taskId, executorToken) =>
        this.dispatchService.renewClaim(taskId, executorToken),
      complete: async (taskId, result, executorToken) => {
        const dispatch = await this.dispatchService.complete(taskId, result as any, executorToken);
        if (!dispatch) {
          throw new ConflictError(
            'Cannot complete dispatch: not in claimed state, wrong executor token, or claim expired.',
          );
        }
        if (dispatch?.sourceChannel && dispatch?.sourcePlatform && this.bridge) {
          const bridge = this.bridge;
          const platformBudget = getImTaskCompletionBodyBudgetChars(dispatch.sourcePlatform);
          const hardCap = resolveOptionalImBodyHardCap();
          const maxBody = hardCap != null ? Math.min(platformBudget, hardCap) : platformBudget;
          const r = dispatch.result as { text?: string; imSummary?: string } | undefined;
          const raw = pickImNotifyBody(r?.text, r?.imSummary, maxBody);
          const summary = raw
            ? (raw.length > maxBody
              ? `${IM_TASK_COMPLETED_PREFIX}${raw.slice(0, maxBody)}…`
              : `${IM_TASK_COMPLETED_PREFIX}${raw}`)
            : 'Task completed successfully.';
          const platform = dispatch.sourcePlatform;
          const channel = dispatch.sourceChannel;
          const sendCompletionToIm = async () => {
            const ok = await bridge.sendMessage(platform, channel, summary);
            if (ok) return;
            this.logger.error('IM complete notification send failed; sending user-visible fallback', '');
            const fallback =
              '✅ 任务已完成，但详细结果未能发送到本群（OpenClaw/网关错误）。请查看服务端日志或通过 API 拉取该 dispatch 的 result。\n' +
              '(Task completed; the result could not be posted to this chat. Check server logs / OpenClaw gateway.)';
            const fallbackOk = await bridge.sendMessage(platform, channel, fallback);
            if (!fallbackOk) {
              this.logger.error('IM complete fallback notice also failed to send', '');
            }
          };
          sendCompletionToIm().catch((err) =>
            this.logger.error('IM complete notification failed', String(err)),
          );
        }
      },
      fail: async (taskId, error, executorToken, retryable = false) => {
        const dispatch = await this.dispatchService.fail(taskId, error, retryable, executorToken);
        if (!dispatch) {
          throw new ConflictError(
            'Cannot fail dispatch: not in claimed state, wrong executor token, or claim expired.',
          );
        }
        if (dispatch?.sourceChannel && dispatch?.sourcePlatform && this.bridge) {
          this.bridge
            .sendMessage(dispatch.sourcePlatform, dispatch.sourceChannel, `Task failed: ${error}`)
            .catch((err) => this.logger.error('IM fail notification failed', String(err)));
        }
      },
    };
  }

  get identity(): IdentityOperations {
    return {
      generateExecutorPairingCode: (topichubUserId, executorClaimToken) =>
        this.identityService.generateExecutorPairingCode(topichubUserId, executorClaimToken),
      claimPairingCode: (platform, platformUserId, code) =>
        this.identityService.claimPairingCode(platform, platformUserId, code),
      resolveUserByPlatform: (platform, platformUserId) =>
        this.identityService.resolveUserByPlatform(platform, platformUserId),
      resolveUserByClaimToken: (claimToken) =>
        this.identityService.resolveUserByClaimToken(claimToken),
      deactivateBinding: (platform, platformUserId) =>
        this.identityService.deactivateBinding(platform, platformUserId),
      deactivateAllBindings: (claimToken) =>
        this.identityService.deactivateAllBindings(claimToken),
      getBindingsForUser: (topichubUserId) =>
        this.identityService.getBindingsForUser(topichubUserId),
      subscribePairingRotations: (executorToken, handler) =>
        this.identityService.subscribePairingRotations(executorToken, handler),
    };
  }

  get heartbeat(): HeartbeatOperations {
    return {
      registerExecutor: (topichubUserId, claimToken, force, executorMeta) =>
        this.heartbeatService.registerExecutor(topichubUserId, claimToken, force, executorMeta),
      heartbeat: (topichubUserId) =>
        this.heartbeatService.heartbeat(topichubUserId),
      deregister: (topichubUserId) =>
        this.heartbeatService.deregister(topichubUserId),
      isAvailable: (topichubUserId) =>
        this.heartbeatService.isAvailable(topichubUserId),
      isBoundExecutorSessionLive: (topichubUserId, boundExecutorToken) =>
        this.heartbeatService.isBoundExecutorSessionLive(topichubUserId, boundExecutorToken),
      getHeartbeat: (topichubUserId) =>
        this.heartbeatService.getHeartbeat(topichubUserId),
    };
  }

  get qa(): QaOperations {
    return {
      createQuestion: (dispatchId, topichubUserId, questionText, questionContext, sourceChannel, sourcePlatform) =>
        this.qaService.createQuestion(dispatchId, topichubUserId, questionText, questionContext, sourceChannel, sourcePlatform),
      findPendingByDispatch: (dispatchId) =>
        this.qaService.findPendingByDispatch(dispatchId),
      findPendingByUser: (topichubUserId) =>
        this.qaService.findPendingByUser(topichubUserId),
      findAllPendingByUser: (topichubUserId) =>
        this.qaService.findAllPendingByUser(topichubUserId),
      submitAnswer: (qaId, answerText) =>
        this.qaService.submitAnswer(qaId, answerText),
      findAnsweredByDispatch: (dispatchId) =>
        this.qaService.findAnsweredByDispatch(dispatchId),
      findByDispatchAndStatus: (dispatchId, status) =>
        this.qaService.findByDispatchAndStatus(dispatchId, status),
    };
  }

  get superadmin(): SuperadminOperations {
    return {
      init: () => this.superadminService.init(),
      createIdentity: (input) => this.superadminService.createIdentity(input),
      listIdentities: () => this.superadminService.listIdentities(),
      revokeIdentity: (identityId) => this.superadminService.revokeIdentity(identityId),
      regenerateToken: (identityId) => this.superadminService.regenerateToken(identityId),
      registerExecutor: (identityToken, executorMeta) => this.superadminService.registerExecutor(identityToken, executorMeta),
      revokeExecutor: (executorToken) => this.superadminService.revokeExecutor(executorToken),
      listExecutors: () => this.superadminService.listExecutors(),
      resolveExecutorToken: (executorToken) => this.superadminService.resolveExecutorToken(executorToken),
      resolveIdentityToken: (identityToken) => this.superadminService.resolveIdentityToken(identityToken),
    };
  }

  get identityAuth(): IdentityAuthOperations {
    return {
      resolveFromHeaders: (headers) => this.authServiceNew.resolveFromHeaders(headers),
      requireSuperadmin: (headers) => this.authServiceNew.requireSuperadmin(headers),
      requireExecutor: (headers) => this.authServiceNew.requireExecutor(headers),
    };
  }

  async shutdown(): Promise<void> {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = undefined;
    }
    if (this.bridgeManager) {
      await this.bridgeManager.stop();
    }
    this.dispatchService.destroy();
    if (this.ownsConnection) {
      await this.connection.close();
    }
  }

}
