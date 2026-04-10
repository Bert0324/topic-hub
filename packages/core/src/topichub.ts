import mongoose from 'mongoose';
import { getModelForClass } from '@typegoose/typegoose';
import { TopicHubConfigSchema, TopicHubConfig } from './config';
import { defaultLoggerFactory, LoggerFactory, TopicHubLogger } from './common/logger';
import { NotFoundError, UnauthorizedError, TopicHubError } from './common/errors';
import { SkillCategory, TimelineActionType } from './common/enums';
import { getBuiltinSkills } from './builtin-skills';

import { Topic } from './entities/topic.entity';
import { TimelineEntry } from './entities/timeline-entry.entity';
import { SkillRegistration } from './entities/skill-registration.entity';
import { TenantSkillConfig } from './entities/tenant-skill-config.entity';
import { Tenant } from './entities/tenant.entity';
import { TaskDispatch } from './entities/task-dispatch.entity';
import { AiUsageRecord } from './entities/ai-usage.entity';
import { UserIdentityBinding } from './entities/user-identity-binding.entity';
import { ExecutorHeartbeat } from './entities/executor-heartbeat.entity';
import { QaExchange } from './entities/qa-exchange.entity';
import { PairingCode } from './identity/pairing-code.entity';

import { SecretManager, CryptoService } from './services/crypto.service';
import { TopicService } from './services/topic.service';
import { TimelineService } from './services/timeline.service';
import { TenantService } from './services/tenant.service';
import { SearchService } from './services/search.service';
import { DispatchService } from './services/dispatch.service';
import { IdentityService } from './identity/identity.service';
import type { ClaimResult, ResolvedPlatformUser, ResolvedClaimTokenUser } from './identity/identity.service';
import { DISPATCH_UNCLAIMED_REMINDER_MS } from './identity/identity-types';
import { HeartbeatService } from './services/heartbeat.service';
import type { ExecutorHeartbeatMeta, RegisterExecutorResult } from './services/heartbeat.service';
import { QaService } from './services/qa.service';

import { AiUsageService } from './ai/ai-usage.service';
import { AiService } from './ai/ai.service';
import { ArkProvider } from './ai/ark-provider';
import { AI_CONFIG_DEFAULTS, loadAiConfig } from './ai/ai-config';
import type { AiProvider } from './ai/ai-provider.interface';

import { SkillLoader } from './skill/registry/skill-loader';
import { SkillMdParser } from './skill/registry/skill-md-parser';
import { SkillRegistry } from './skill/registry/skill-registry';
import { SkillConfigService } from './skill/config/skill-config.service';
import { SkillPipeline } from './skill/pipeline/skill-pipeline';
import { CommandParser } from './command/command-parser';
import { CommandRouter, CommandContext } from './command/command-router';
import { CreateHandler } from './command/handlers/create.handler';
import { UpdateHandler } from './command/handlers/update.handler';
import { AssignHandler } from './command/handlers/assign.handler';
import { ShowHandler } from './command/handlers/show.handler';
import { TimelineHandler } from './command/handlers/timeline.handler';
import { ReopenHandler } from './command/handlers/reopen.handler';
import { HistoryHandler } from './command/handlers/history.handler';
import { HelpHandler } from './command/handlers/help.handler';

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
  list(tenantId: string, query?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ topics: any[]; total: number }>;
  get(tenantId: string, topicId: string): Promise<any>;
  create(tenantId: string, data: {
    type: string;
    title: string;
    sourceUrl?: string;
    metadata?: Record<string, unknown>;
    createdBy: string;
  }): Promise<any>;
  update(tenantId: string, topicId: string, updates: {
    status?: string;
    tags?: string[];
    assignees?: string[];
    metadata?: Record<string, unknown>;
  }, actor: string): Promise<any>;
  addTimeline(tenantId: string, topicId: string, entry: {
    actor: string;
    actionType: string;
    payload?: Record<string, unknown>;
  }): Promise<any>;
  updateStatus(tenantId: string, topicId: string, status: string, actor: string): Promise<any>;
  addTag(tenantId: string, topicId: string, tag: string, actor: string): Promise<void>;
  removeTag(tenantId: string, topicId: string, tag: string, actor: string): Promise<void>;
  assignUser(tenantId: string, topicId: string, userId: string, actor: string): Promise<void>;
  unassignUser(tenantId: string, topicId: string, userId: string, actor: string): Promise<void>;
}

export interface CommandOperations {
  execute(tenantId: string, rawCommand: string, context: {
    platform: string;
    groupId: string;
    userId: string;
  }): Promise<{ success: boolean; result?: unknown; error?: string }>;
}

export interface IngestionOperations {
  ingest(tenantId: string, payload: {
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
  handle(platform: string, payload: unknown, headers: Record<string, string>): Promise<WebhookResult>;
  handleOpenClaw(
    payload: unknown,
    rawBody?: Buffer | string,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<WebhookResult>;
}

export interface MessagingOperations {
  send(platform: string, params: {
    tenantId: string;
    groupId: string;
    message: string;
  }): Promise<void>;
}

export interface AuthOperations {
  resolveTenant(apiKey: string): Promise<{ tenantId: string; slug: string } | null>;
  resolveFromHeaders(headers: Record<string, string | string[] | undefined>): Promise<{ tenantId: string; slug: string }>;
}

export interface SearchOperations {
  search(tenantId: string, query: {
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
    category: string;
    version: string;
  }>;
  isTypeAvailable(type: string, tenantId: string): Promise<boolean>;
}

export interface DispatchOperations {
  list(tenantId: string, filters?: { status?: string; limit?: number; targetUserId?: string }): Promise<any[]>;
  findById(dispatchId: string): Promise<any | null>;
  onTask(listener: (task: any) => void): () => void;
  claim(taskId: string, claimedBy: string, targetUserId?: string): Promise<boolean>;
  complete(taskId: string, result?: unknown): Promise<void>;
  fail(taskId: string, error: string): Promise<void>;
}

export interface AiOperationResult {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  timelineEntryId: string;
}

export interface AiOperations {
  summarize(tenantId: string, topicId: string): Promise<AiOperationResult>;
  ask(tenantId: string, topicId: string, question: string): Promise<AiOperationResult>;
  isAvailable(): boolean;
}

export interface AdminOperations {
  listTenants(): Promise<any[]>;
  createTenant(name: string): Promise<{ id: string; apiKey: string; adminToken: string; isSuperAdmin: boolean }>;
  regenerateToken(tenantId: string): Promise<{ adminToken: string }>;
  getStats(tenantId: string): Promise<Record<string, number>>;
  getAiStatus(): { enabled: boolean; provider: string | null; model: string };
}

export interface IdentityOperations {
  generatePairingCode(tenantId: string, platform: string, platformUserId: string, channel: string): Promise<string>;
  claimPairingCode(tenantId: string, code: string, claimToken: string): Promise<ClaimResult | null>;
  resolveUserByPlatform(tenantId: string, platform: string, platformUserId: string): Promise<ResolvedPlatformUser | undefined>;
  resolveUserByClaimToken(claimToken: string): Promise<ResolvedClaimTokenUser | undefined>;
  deactivateBinding(tenantId: string, platform: string, platformUserId: string): Promise<boolean>;
  deactivateAllBindings(claimToken: string): Promise<number>;
  getBindingsForUser(tenantId: string, topichubUserId: string): Promise<any[]>;
}

export interface HeartbeatOperations {
  registerExecutor(tenantId: string, topichubUserId: string, claimToken: string, force: boolean, executorMeta?: ExecutorHeartbeatMeta): Promise<RegisterExecutorResult>;
  heartbeat(tenantId: string, topichubUserId: string): Promise<{ pendingDispatches: number }>;
  deregister(tenantId: string, topichubUserId: string): Promise<void>;
  isAvailable(tenantId: string, topichubUserId: string): Promise<boolean>;
  getHeartbeat(tenantId: string, topichubUserId: string): Promise<any | null>;
}

export interface QaOperations {
  createQuestion(tenantId: string, dispatchId: string, topichubUserId: string, questionText: string, questionContext: { skillName: string; topicTitle: string } | undefined, sourceChannel: string, sourcePlatform: string): Promise<any>;
  findPendingByDispatch(dispatchId: string): Promise<any[]>;
  findPendingByUser(topichubUserId: string): Promise<any | null>;
  findAllPendingByUser(topichubUserId: string): Promise<any[]>;
  submitAnswer(qaId: string, answerText: string): Promise<any | null>;
  findAnsweredByDispatch(dispatchId: string): Promise<any[]>;
  findByDispatchAndStatus(dispatchId: string, status?: string): Promise<any[]>;
}

// --- TopicHub Facade ---

const REMINDER_CHECK_INTERVAL_MS = 60_000;

export class TopicHub {
  private reminderTimer?: ReturnType<typeof setInterval>;

  private constructor(
    private readonly connection: mongoose.Connection,
    private readonly ownsConnection: boolean,
    private readonly topicService: TopicService,
    private readonly timelineService: TimelineService,
    private readonly tenantService: TenantService,
    private readonly searchService: SearchService,
    private readonly dispatchService: DispatchService,
    private readonly skillRegistry: SkillRegistry,
    private readonly skillPipeline: SkillPipeline,
    private readonly ingestionService: IngestionService,
    private readonly commandParser: CommandParser,
    private readonly commandRouter: CommandRouter,
    private readonly webhookHandler: WebhookHandler,
    private readonly aiService: AiService,
    private readonly handlers: Map<string, any>,
    private readonly logger: TopicHubLogger,
    private readonly bridge: OpenClawBridge | null,
    private readonly bridgeManager: BridgeManager | null,
    private readonly identityService: IdentityService,
    private readonly heartbeatService: HeartbeatService,
    private readonly qaService: QaService,
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
    const TenantSkillConfigModel = model(TenantSkillConfig, 'tenant_skill_configs');
    const TenantModel = model(Tenant, 'tenants');
    const TaskDispatchModel = model(TaskDispatch, 'task_dispatches');
    const AiUsageRecordModel = model(AiUsageRecord, 'ai_usage_records');
    const UserIdentityBindingModel = model(UserIdentityBinding, 'user_identity_bindings');
    const PairingCodeModel = model(PairingCode, 'pairing_codes');
    const ExecutorHeartbeatModel = model(ExecutorHeartbeat, 'executor_heartbeats');
    const QaExchangeModel = model(QaExchange, 'qa_exchanges');

    // Crypto
    const secretManager = new SecretManager(
      loggerFactory('SecretManager'),
      validated.encryption?.masterKey,
    );
    const cryptoService = new CryptoService(secretManager);

    // Core services
    const topicService = new TopicService(TopicModel, TimelineEntryModel, loggerFactory('TopicService'));
    const timelineService = new TimelineService(TimelineEntryModel, loggerFactory('TimelineService'));
    const tenantService = new TenantService(TenantModel, cryptoService, loggerFactory('TenantService'));
    const searchService = new SearchService(TopicModel, loggerFactory('SearchService'));
    const dispatchService = new DispatchService(TaskDispatchModel, loggerFactory('DispatchService'));
    const identityService = new IdentityService(UserIdentityBindingModel, PairingCodeModel, loggerFactory('IdentityService'));
    const heartbeatService = new HeartbeatService(ExecutorHeartbeatModel, loggerFactory('HeartbeatService'));
    const qaService = new QaService(QaExchangeModel, loggerFactory('QaService'));

    // AI
    const aiUsageService = new AiUsageService(AiUsageRecordModel, loggerFactory('AiUsageService'));

    let aiProvider: AiProvider | null = null;
    let aiConfig = loadAiConfig({});

    if (validated.ai) {
      aiProvider = new ArkProvider({
        apiUrl: validated.ai.baseUrl ?? `https://ark.cn-beijing.volces.com/api/v3`,
        apiKey: validated.ai.apiKey,
        model: validated.ai.model ?? AI_CONFIG_DEFAULTS.model,
        timeoutMs: AI_CONFIG_DEFAULTS.timeoutMs,
      });
      aiConfig = loadAiConfig({
        AI_ENABLED: 'true',
        AI_PROVIDER: validated.ai.provider,
        AI_API_KEY: validated.ai.apiKey,
        AI_MODEL: validated.ai.model ?? AI_CONFIG_DEFAULTS.model,
        AI_API_URL: validated.ai.baseUrl,
      });
    }

    const aiService = new AiService(
      aiConfig,
      aiProvider,
      aiUsageService,
      TenantSkillConfigModel,
      loggerFactory('AiService'),
    );

    let bridge: OpenClawBridge | null = null;
    let bridgeManager: BridgeManager | null = null;

    if (validated.bridge) {
      const bridgeConfig = validated.bridge as BridgeConfig;
      bridgeManager = new BridgeManager(bridgeConfig, loggerFactory('BridgeManager'));
      await bridgeManager.start();
      bridge = OpenClawBridge.fromBridgeManager(
        bridgeManager.port!,
        bridgeManager.webhookSecret!,
        bridgeConfig.tenantMapping as Record<string, { tenantId: string; platform: string }>,
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
    const skillRegistry = new SkillRegistry(
      skillLoader,
      skillMdParser,
      SkillRegistrationModel,
      TenantSkillConfigModel,
      loggerFactory('SkillRegistry'),
    );

    const skillConfigService = new SkillConfigService(
      TenantSkillConfigModel,
      cryptoService,
      loggerFactory('SkillConfigService'),
    );

    const skillPipeline = new SkillPipeline(
      skillRegistry,
      skillConfigService,
      dispatchService,
      loggerFactory('SkillPipeline'),
      bridge,
    );

    // Command system
    const commandParser = new CommandParser();
    const commandRouter = new CommandRouter(skillRegistry);

    const createHandler = new CreateHandler(topicService, skillRegistry, skillPipeline, loggerFactory('CreateHandler'));
    const updateHandler = new UpdateHandler(topicService, skillPipeline, loggerFactory('UpdateHandler'));
    const assignHandler = new AssignHandler(topicService, skillPipeline, loggerFactory('AssignHandler'));
    const showHandler = new ShowHandler(topicService);
    const timelineHandler = new TimelineHandler(topicService, timelineService);
    const reopenHandler = new ReopenHandler(topicService, skillPipeline, loggerFactory('ReopenHandler'));
    const historyHandler = new HistoryHandler(topicService);
    const helpHandler = new HelpHandler(skillRegistry);

    const handlers = new Map<string, any>([
      ['create', createHandler],
      ['update', updateHandler],
      ['assign', assignHandler],
      ['show', showHandler],
      ['timeline', timelineHandler],
      ['reopen', reopenHandler],
      ['history', historyHandler],
      ['help', helpHandler],
    ]);

    // Ingestion
    const ingestionService = new IngestionService(
      topicService,
      timelineService,
      skillRegistry,
      skillPipeline,
      loggerFactory('IngestionService'),
    );

    // Webhook
    const commandDispatcher = async (
      handler: string,
      tenantId: string,
      parsed: any,
      context: CommandContext,
    ) => {
      const h = handlers.get(handler);
      if (!h) return { success: false, error: `Unknown handler: ${handler}` };
      return h.execute(tenantId, parsed, context);
    };

    const webhookIdentityOps: WebhookIdentityOps = {
      generatePairingCode: (tenantId, platform, platformUserId, channel) =>
        identityService.generatePairingCode(tenantId, platform, platformUserId, channel),
      resolveUserByPlatform: (tenantId, platform, platformUserId) =>
        identityService.resolveUserByPlatform(tenantId, platform, platformUserId),
      deactivateBinding: (tenantId, platform, platformUserId) =>
        identityService.deactivateBinding(tenantId, platform, platformUserId),
    };

    const webhookHeartbeatOps: WebhookHeartbeatOps = {
      isAvailable: (tenantId, topichubUserId) =>
        heartbeatService.isAvailable(tenantId, topichubUserId),
    };

    const webhookQaOps: WebhookQaOps = {
      findPendingByUser: (topichubUserId) => qaService.findPendingByUser(topichubUserId),
      findAllPendingByUser: (topichubUserId) => qaService.findAllPendingByUser(topichubUserId),
      submitAnswer: (qaId, answerText) => qaService.submitAnswer(qaId, answerText),
    };

    const webhookHandler = new WebhookHandler(
      skillRegistry,
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
      tenantService,
      searchService,
      dispatchService,
      skillRegistry,
      skillPipeline,
      ingestionService,
      commandParser,
      commandRouter,
      webhookHandler,
      aiService,
      handlers,
      mainLogger,
      bridge,
      bridgeManager,
      identityService,
      heartbeatService,
      qaService,
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

  private async checkUnclaimedReminders(): Promise<void> {
    if (!this.bridge) return;

    const stale = await this.dispatchService.findUnclaimedWithReminder(DISPATCH_UNCLAIMED_REMINDER_MS);
    for (const dispatch of stale) {
      try {
        await this.bridge.sendMessage(
          dispatch.sourcePlatform,
          dispatch.sourceChannel,
          'Your task is still waiting. Is your local agent running? Start with: `topichub-admin serve`',
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
        await this.bridge.sendMessage(
          qa.sourcePlatform,
          qa.sourceChannel,
          'Reminder: your agent is waiting for an answer. Reply with `/answer <your response>`.',
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
      list: async (tenantId, query) => {
        const filters = {
          type: query?.type,
          status: query?.status,
          page: query?.offset ? Math.floor(query.offset / (query.limit ?? 20)) + 1 : 1,
          pageSize: query?.limit ?? 20,
        };
        const result = await this.searchService.search(tenantId, filters);
        return { topics: result.results, total: result.total };
      },
      get: (tenantId, topicId) => this.topicService.findById(tenantId, topicId),
      create: (tenantId, data) => this.topicService.create(tenantId, data),
      update: async (tenantId, topicId, updates, actor) => {
        if (updates.status) {
          await this.topicService.updateStatus(tenantId, topicId, updates.status as any, actor);
        }
        if (updates.tags) {
          const topic = await this.topicService.findById(tenantId, topicId);
          const existing = topic?.tags ?? [];
          for (const tag of updates.tags.filter((t: string) => !existing.includes(t))) {
            await this.topicService.addTag(tenantId, topicId, tag, actor);
          }
        }
        if (updates.assignees) {
          for (const userId of updates.assignees) {
            await this.topicService.assignUser(tenantId, topicId, userId, actor);
          }
        }
        return this.topicService.findById(tenantId, topicId);
      },
      addTimeline: async (tenantId, topicId, entry) => {
        return this.timelineService.append(
          tenantId, topicId, entry.actor, entry.actionType as any, entry.payload,
        );
      },
      updateStatus: (tenantId, topicId, status, actor) =>
        this.topicService.updateStatus(tenantId, topicId, status as any, actor),
      addTag: async (tenantId, topicId, tag, actor) => {
        await this.topicService.addTag(tenantId, topicId, tag, actor);
      },
      removeTag: async (tenantId, topicId, tag, actor) => {
        await this.topicService.removeTag(tenantId, topicId, tag, actor);
      },
      assignUser: async (tenantId, topicId, userId, actor) => {
        await this.topicService.assignUser(tenantId, topicId, userId, actor);
      },
      unassignUser: async (_tenantId, _topicId, _userId, _actor) => {
        throw new TopicHubError('unassignUser not yet implemented');
      },
    };
  }

  get commands(): CommandOperations {
    return {
      execute: async (tenantId, rawCommand, context) => {
        const parsed = this.commandParser.parse(rawCommand);
        const activeTopic = await this.topicService.findActiveTopicByGroup(
          tenantId,
          context.platform,
          context.groupId,
        );
        const routeContext: CommandContext = {
          ...context,
          tenantId,
          hasActiveTopic: !!activeTopic,
        };
        const route = this.commandRouter.route(parsed, routeContext);
        if (route.error) {
          return { success: false, error: route.error };
        }

        const handler = this.handlers.get(route.handler);
        if (!handler) {
          return { success: false, error: `Unknown command handler: ${route.handler}` };
        }

        const result = await handler.execute(tenantId, parsed, routeContext);
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
      ingest: (tenantId, payload) =>
        this.ingestionService.ingest(tenantId, {
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
      handle: (platform, payload, headers) =>
        this.webhookHandler.handle(platform, payload, headers),
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

  get auth(): AuthOperations {
    return {
      resolveTenant: async (apiKey) => {
        const tenant = await this.tenantService.findByRawApiKey(apiKey);
        if (!tenant) return null;
        return { tenantId: tenant._id.toString(), slug: tenant.slug };
      },
      resolveFromHeaders: async (headers) => {
        const apiKey = headers['x-api-key'];
        if (apiKey && typeof apiKey === 'string') {
          const result = await this.tenantService.findByRawApiKey(apiKey);
          if (result) return { tenantId: result._id.toString(), slug: result.slug };
        }
        const auth = headers['authorization'] ?? headers['Authorization'];
        if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
          const token = auth.slice(7);
          const result = await this.tenantService.findByRawApiKey(token);
          if (result) return { tenantId: result._id.toString(), slug: result.slug };
        }
        throw new UnauthorizedError('Missing or invalid authentication');
      },
    };
  }

  get search(): SearchOperations {
    return {
      search: async (tenantId, query) => {
        const result = await this.searchService.search(tenantId, {
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
        const all = [
          ...this.skillRegistry.getByCategory(SkillCategory.TYPE),
          ...this.skillRegistry.getByCategory(SkillCategory.ADAPTER),
        ];
        return all.map((s) => ({
          name: s.registration.name,
          category: s.registration.category,
          version: s.registration.version,
        }));
      },
      isTypeAvailable: (type, tenantId) =>
        this.skillRegistry.isTypeAvailable(type, tenantId),
    };
  }

  get dispatch(): DispatchOperations {
    return {
      list: (tenantId, filters) =>
        this.dispatchService.findUnclaimed(tenantId, {
          limit: filters?.limit,
          targetUserId: filters?.targetUserId,
        }),
      findById: (dispatchId) =>
        this.dispatchService.findById(dispatchId),
      onTask: (listener) => {
        this.dispatchService.onNewDispatch(listener);
        return () => this.dispatchService.offNewDispatch(listener);
      },
      claim: async (taskId, claimedBy, targetUserId?) => {
        const result = await this.dispatchService.claim(taskId, claimedBy, targetUserId);
        if (result && result.sourceChannel && result.sourcePlatform && this.bridge) {
          this.bridge
            .sendMessage(result.sourcePlatform, result.sourceChannel, 'Task picked up by your local agent. Processing...')
            .catch((err) => this.logger.error('IM claim notification failed', String(err)));
        }
        return result !== null;
      },
      complete: async (taskId, result) => {
        const dispatch = await this.dispatchService.complete(taskId, result as any);
        if (dispatch?.sourceChannel && dispatch?.sourcePlatform && this.bridge) {
          const summary = dispatch.result?.text
            ? `Task completed: ${dispatch.result.text.slice(0, 200)}`
            : 'Task completed successfully.';
          this.bridge
            .sendMessage(dispatch.sourcePlatform, dispatch.sourceChannel, summary)
            .catch((err) => this.logger.error('IM complete notification failed', String(err)));
        }
      },
      fail: async (taskId, error) => {
        const dispatch = await this.dispatchService.fail(taskId, error);
        if (dispatch?.sourceChannel && dispatch?.sourcePlatform && this.bridge) {
          this.bridge
            .sendMessage(dispatch.sourcePlatform, dispatch.sourceChannel, `Task failed: ${error}`)
            .catch((err) => this.logger.error('IM fail notification failed', String(err)));
        }
      },
    };
  }

  get admin(): AdminOperations {
    return {
      listTenants: async () => this.tenantService.findAll(),
      createTenant: async (name) => {
        const { tenant, rawApiKey, adminToken } = await this.tenantService.create(name);
        return {
          id: tenant._id.toString(),
          apiKey: rawApiKey,
          adminToken,
          isSuperAdmin: tenant.isSuperAdmin,
        };
      },
      regenerateToken: async (tenantId) => {
        const { adminToken } = await this.tenantService.regenerateToken(tenantId);
        return { adminToken };
      },
      getStats: async (tenantId) => {
        const dispatches = await this.dispatchService.countByStatus(tenantId);
        return dispatches as any;
      },
      getAiStatus: () => this.aiService.getConfig(),
    };
  }

  get ai(): AiOperations {
    return {
      summarize: async (tenantId, topicId) => {
        const topic = await this.topicService.findById(tenantId, topicId);
        if (!topic) throw new NotFoundError(`Topic ${topicId} not found`);

        const timeline = await this.timelineService.findByTopic(tenantId, topicId, 1, 20);
        const entries = timeline?.entries ?? [];

        const contextParts = [
          `Title: ${topic.title}`,
          `Type: ${topic.type}`,
          `Status: ${topic.status}`,
          topic.tags?.length ? `Tags: ${topic.tags.join(', ')}` : '',
          topic.metadata ? `Metadata: ${JSON.stringify(topic.metadata)}` : '',
          entries.length ? `\nTimeline (${entries.length} entries):\n${entries.map((e: any) => `- [${e.actionType}] ${e.actor}: ${JSON.stringify(e.payload ?? {})}`).join('\n')}` : '',
        ].filter(Boolean).join('\n');

        const response = await this.aiService.complete({
          tenantId,
          skillName: 'ai:summarize',
          input: [
            { role: 'system', content: [{ type: 'input_text', text: 'You are a topic summarizer. Provide a concise summary of the topic based on the provided context. Focus on key information, status, and any notable patterns or issues.' }] },
            { role: 'user', content: [{ type: 'input_text', text: contextParts }] },
          ],
        });

        if (!response) {
          throw new TopicHubError('AI service unavailable');
        }

        const entry = await this.timelineService.append(
          tenantId, topicId, 'ai:summarize', TimelineActionType.AI_RESPONSE,
          { operation: 'summarize', content: response.content, model: response.model, usage: response.usage },
        );

        return {
          content: response.content,
          model: response.model,
          usage: response.usage,
          timelineEntryId: entry._id.toString(),
        };
      },

      ask: async (tenantId, topicId, question) => {
        const topic = await this.topicService.findById(tenantId, topicId);
        if (!topic) throw new NotFoundError(`Topic ${topicId} not found`);

        const timeline = await this.timelineService.findByTopic(tenantId, topicId, 1, 20);
        const entries = timeline?.entries ?? [];

        const contextParts = [
          `Title: ${topic.title}`,
          `Type: ${topic.type}`,
          `Status: ${topic.status}`,
          topic.tags?.length ? `Tags: ${topic.tags.join(', ')}` : '',
          topic.metadata ? `Metadata: ${JSON.stringify(topic.metadata)}` : '',
          entries.length ? `\nTimeline (${entries.length} entries):\n${entries.map((e: any) => `- [${e.actionType}] ${e.actor}: ${JSON.stringify(e.payload ?? {})}`).join('\n')}` : '',
        ].filter(Boolean).join('\n');

        const response = await this.aiService.complete({
          tenantId,
          skillName: 'ai:assistant',
          input: [
            { role: 'system', content: [{ type: 'input_text', text: `You are a topic assistant. Answer the user's question based on the topic context provided. Be concise and helpful.\n\nTopic context:\n${contextParts}` }] },
            { role: 'user', content: [{ type: 'input_text', text: question }] },
          ],
        });

        if (!response) {
          throw new TopicHubError('AI service unavailable');
        }

        const entry = await this.timelineService.append(
          tenantId, topicId, 'ai:assistant', TimelineActionType.AI_RESPONSE,
          { operation: 'ask', question, content: response.content, model: response.model, usage: response.usage },
        );

        return {
          content: response.content,
          model: response.model,
          usage: response.usage,
          timelineEntryId: entry._id.toString(),
        };
      },

      isAvailable: () => this.aiService.isAvailable(),
    };
  }

  get identity(): IdentityOperations {
    return {
      generatePairingCode: (tenantId, platform, platformUserId, channel) =>
        this.identityService.generatePairingCode(tenantId, platform, platformUserId, channel),
      claimPairingCode: (tenantId, code, claimToken) =>
        this.identityService.claimPairingCode(tenantId, code, claimToken),
      resolveUserByPlatform: (tenantId, platform, platformUserId) =>
        this.identityService.resolveUserByPlatform(tenantId, platform, platformUserId),
      resolveUserByClaimToken: (claimToken) =>
        this.identityService.resolveUserByClaimToken(claimToken),
      deactivateBinding: (tenantId, platform, platformUserId) =>
        this.identityService.deactivateBinding(tenantId, platform, platformUserId),
      deactivateAllBindings: (claimToken) =>
        this.identityService.deactivateAllBindings(claimToken),
      getBindingsForUser: (tenantId, topichubUserId) =>
        this.identityService.getBindingsForUser(tenantId, topichubUserId),
    };
  }

  get heartbeat(): HeartbeatOperations {
    return {
      registerExecutor: (tenantId, topichubUserId, claimToken, force, executorMeta) =>
        this.heartbeatService.registerExecutor(tenantId, topichubUserId, claimToken, force, executorMeta),
      heartbeat: (tenantId, topichubUserId) =>
        this.heartbeatService.heartbeat(tenantId, topichubUserId),
      deregister: (tenantId, topichubUserId) =>
        this.heartbeatService.deregister(tenantId, topichubUserId),
      isAvailable: (tenantId, topichubUserId) =>
        this.heartbeatService.isAvailable(tenantId, topichubUserId),
      getHeartbeat: (tenantId, topichubUserId) =>
        this.heartbeatService.getHeartbeat(tenantId, topichubUserId),
    };
  }

  get qa(): QaOperations {
    return {
      createQuestion: (tenantId, dispatchId, topichubUserId, questionText, questionContext, sourceChannel, sourcePlatform) =>
        this.qaService.createQuestion(tenantId, dispatchId, topichubUserId, questionText, questionContext, sourceChannel, sourcePlatform),
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

  async shutdown(): Promise<void> {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = undefined;
    }
    this.bridge?.destroy();
    if (this.bridgeManager) {
      await this.bridgeManager.stop();
    }
    this.dispatchService.destroy();
    if (this.ownsConnection) {
      await this.connection.close();
    }
  }

}
