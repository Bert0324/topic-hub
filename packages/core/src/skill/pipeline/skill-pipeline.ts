import { SkillRegistry } from '../registry/skill-registry';
import { SkillConfigService } from '../config/skill-config.service';
import { SkillAiRuntime } from './skill-ai-runtime';
import { TopicContext } from '../interfaces/type-skill';
import { DispatchService } from '../../services/dispatch.service';
import type { DispatchMeta } from '../../services/dispatch.service';
import { OpenClawBridge } from '../../bridge/openclaw-bridge';
import type { TopicHubLogger } from '../../common/logger';
import type { SkillPipelinePort } from '../../command/handlers/create.handler';

export class SkillPipeline implements SkillPipelinePort {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly configService: SkillConfigService,
    private readonly skillAiRuntime: SkillAiRuntime | null,
    private readonly dispatchService: DispatchService | null,
    private readonly logger: TopicHubLogger,
    private readonly bridge: OpenClawBridge | null = null,
  ) {}

  async execute(
    tenantId: string,
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
    dispatchMeta?: DispatchMeta,
  ): Promise<void> {
    const ctx: TopicContext = {
      topic: topicData,
      actor,
      tenantId,
      timestamp: new Date(),
    };

    await this.runTypeSkillHook(tenantId, operation, topicData, ctx, extra);
    await this.runSkillAi(tenantId, operation, topicData, actor, extra);
    await this.createTaskDispatch(tenantId, operation, topicData, actor, extra, dispatchMeta);
    await this.runBridgeNotifications(tenantId, operation, topicData);
  }

  private async runTypeSkillHook(
    tenantId: string,
    operation: string,
    topicData: any,
    ctx: TopicContext,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const topicType = topicData?.type;
    if (!topicType) return;

    const typeSkill = this.registry.getTypeSkillForType(topicType);
    if (!typeSkill) return;

    const enabled = await this.configService.isEnabledForTenant(
      tenantId,
      typeSkill.manifest.name,
    );
    if (!enabled) return;

    const hookMap: Record<string, keyof typeof typeSkill> = {
      created: 'onTopicCreated',
      updated: 'onTopicUpdated',
      status_changed: 'onTopicStatusChanged',
      assigned: 'onTopicAssigned',
      closed: 'onTopicClosed',
      reopened: 'onTopicReopened',
      signal_attached: 'onSignalAttached',
      tag_changed: 'onTagChanged',
    };

    const hookName = hookMap[operation];
    if (!hookName) return;

    const hook = typeSkill[hookName];
    if (typeof hook !== 'function') return;

    try {
      await (hook as Function).call(typeSkill, { ...ctx, ...extra });
    } catch (err) {
      this.logger.error(
        `Type skill ${typeSkill.manifest.name} hook ${String(hookName)} failed`,
        String(err),
      );
    }
  }

  private async runSkillAi(
    tenantId: string,
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.skillAiRuntime) return;

    const topicType = topicData?.type;
    if (!topicType) return;

    const typeSkill = this.registry.getTypeSkillForType(topicType);
    if (!typeSkill) return;

    const enabled = await this.configService.isEnabledForTenant(
      tenantId,
      typeSkill.manifest.name,
    );
    if (!enabled) return;

    try {
      await this.skillAiRuntime.executeIfApplicable(
        tenantId,
        typeSkill.manifest.name,
        operation,
        topicData,
        actor,
        extra,
      );
    } catch (err) {
      this.logger.error(
        `Skill AI runtime failed for ${typeSkill.manifest.name}: ${(err as Error).message}`,
      );
    }
  }

  private async createTaskDispatch(
    tenantId: string,
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
    dispatchMeta?: DispatchMeta,
  ): Promise<void> {
    if (!this.dispatchService) return;

    const topicType = topicData?.type;
    if (!topicType) return;

    const typeSkill = this.registry.getTypeSkillForType(topicType);
    if (!typeSkill) return;

    const enabled = await this.configService.isEnabledForTenant(
      tenantId,
      typeSkill.manifest.name,
    );
    if (!enabled) return;

    const topicId = topicData._id?.toString?.() ?? String(topicData._id ?? '');
    if (!topicId) return;

    try {
      await this.dispatchService.create({
        tenantId,
        topicId,
        eventType: operation,
        skillName: typeSkill.manifest.name,
        enrichedPayload: {
          topic: {
            id: topicId,
            type: topicData.type ?? '',
            title: topicData.title ?? '',
            status: topicData.status ?? '',
            metadata: topicData.metadata ?? {},
            groups: (topicData.groups ?? []).map((g: any) => ({
              platform: g.platform,
              groupId: g.groupId,
            })),
            assignees: (topicData.assignees ?? []).map((a: any) => ({
              userId: a.userId,
            })),
            tags: topicData.tags ?? [],
            signals: (topicData.signals ?? []).map((s: any) => ({
              label: s.label,
              url: s.url,
              description: s.description,
            })),
            createdAt: topicData.createdAt?.toISOString?.() ?? '',
            updatedAt: topicData.updatedAt?.toISOString?.() ?? '',
          },
          event: {
            type: operation,
            actor,
            timestamp: new Date(),
            payload: extra,
          },
        },
        ...dispatchMeta,
      });
    } catch (err) {
      this.logger.error(
        `Failed to create task dispatch for skill=${typeSkill.manifest.name} topic=${topicId}`,
        String(err),
      );
    }
  }

  private async runBridgeNotifications(
    tenantId: string,
    operation: string,
    topicData: any,
  ): Promise<void> {
    if (!this.bridge) return;

    const notifyOps = ['created', 'updated', 'status_changed', 'assigned', 'closed', 'reopened'];
    if (!notifyOps.includes(operation)) return;

    try {
      const topicType = topicData?.type;
      if (!topicType) return;

      const typeSkill = this.registry.getTypeSkillForType(topicType);
      if (!typeSkill) return;

      const card = typeSkill.renderCard(topicData);
      await this.bridge.notifyTenantChannels(tenantId, card, topicData.type);
    } catch (err) {
      this.logger.error(
        `Bridge notification failed for operation ${operation}`,
        String(err),
      );
    }
  }
}
