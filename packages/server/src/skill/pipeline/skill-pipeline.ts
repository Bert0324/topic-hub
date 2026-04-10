import { Injectable, Logger, Optional } from '@nestjs/common';
import { SkillRegistry } from '../registry/skill-registry';
import { SkillConfigService } from '../config/skill-config.service';
import { SkillAiRuntime } from './skill-ai-runtime';
import { TopicContext } from '../interfaces/type-skill';
import { DispatchService } from '../../dispatch/dispatch.service';

@Injectable()
export class SkillPipeline {
  private readonly logger = new Logger(SkillPipeline.name);

  constructor(
    private readonly registry: SkillRegistry,
    private readonly configService: SkillConfigService,
    @Optional() private readonly skillAiRuntime: SkillAiRuntime | null,
    @Optional() private readonly dispatchService: DispatchService | null,
  ) {}

  async execute(
    tenantId: string,
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const ctx: TopicContext = {
      topic: topicData,
      actor,
      tenantId,
      timestamp: new Date(),
    };

    await this.runTypeSkillHook(tenantId, operation, topicData, ctx, extra);
    await this.runSkillAi(tenantId, operation, topicData, actor, extra);
    await this.createTaskDispatch(tenantId, operation, topicData, actor, extra);
    await this.runPlatformSkills(tenantId, operation, topicData, ctx);
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
        err,
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
      });
    } catch (err) {
      this.logger.error(
        `Failed to create task dispatch for skill=${typeSkill.manifest.name} topic=${topicId}`,
        err,
      );
    }
  }

  private async runPlatformSkills(
    tenantId: string,
    operation: string,
    topicData: any,
    ctx: TopicContext,
  ): Promise<void> {
    const platformSkills = this.registry.getPlatformSkills();
    const topicType = topicData?.type;
    const typeSkill = topicType
      ? this.registry.getTypeSkillForType(topicType)
      : undefined;

    for (const platformSkill of platformSkills) {
      const enabled = await this.configService.isEnabledForTenant(
        tenantId,
        platformSkill.manifest.name,
      );
      if (!enabled) continue;

      try {
        if (
          (operation === 'created' || operation === 'updated') &&
          typeSkill &&
          platformSkill.postCard
        ) {
          const card = typeSkill.renderCard(topicData);
          const groupId = topicData?.groupId;
          if (groupId) {
            const method =
              operation === 'created' ? 'postCard' : 'updateCard';
            const fn = platformSkill[method];
            if (typeof fn === 'function') {
              await fn.call(platformSkill, {
                tenantId,
                platform: platformSkill.manifest.platform,
                groupId,
                card,
              });
            }
          }
        }
      } catch (err) {
        this.logger.error(
          `Platform skill ${platformSkill.manifest.name} failed for operation ${operation}`,
          err,
        );
      }
    }
  }
}
