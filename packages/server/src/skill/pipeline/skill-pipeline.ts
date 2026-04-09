import { Injectable, Logger } from '@nestjs/common';
import { SkillRegistry } from '../registry/skill-registry';
import { SkillConfigService } from '../config/skill-config.service';
import { TopicContext } from '../interfaces/type-skill';
import { UserIdentity } from '../interfaces/auth-skill';

@Injectable()
export class SkillPipeline {
  private readonly logger = new Logger(SkillPipeline.name);

  constructor(
    private readonly registry: SkillRegistry,
    private readonly configService: SkillConfigService,
  ) {}

  async execute(
    tenantId: string,
    operation: string,
    topicData: any,
    actor: string | UserIdentity,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const actorStr =
      typeof actor === 'string' ? actor : actor.userId;

    const ctx: TopicContext = {
      topic: topicData,
      actor: actorStr,
      tenantId,
      timestamp: new Date(),
    };

    const userIdentity: UserIdentity =
      typeof actor === 'object'
        ? actor
        : {
            userId: actor,
            platform: 'unknown',
            displayName: actor,
            verified: false,
          };

    await this.runAuthCheck(tenantId, operation, ctx, userIdentity);
    await this.runTypeSkillHook(tenantId, operation, topicData, ctx, extra);
    await this.runPlatformSkills(tenantId, operation, topicData, ctx);
  }

  private async runAuthCheck(
    tenantId: string,
    operation: string,
    ctx: TopicContext,
    userIdentity: UserIdentity,
  ): Promise<void> {
    const authSkill = this.registry.getAuthSkill(tenantId);
    if (!authSkill) return;

    try {
      const result = await authSkill.authorize({
        user: userIdentity,
        action: operation,
        tenantId,
        topicContext: ctx.topic,
      });

      if (!result.allowed) {
        const msg = result.reason ?? 'Unauthorized';
        const err = new Error(msg);
        (err as any).suggestedCommand = result.suggestedCommand;
        throw err;
      }
    } catch (err) {
      if ((err as any).suggestedCommand !== undefined) throw err;
      this.logger.error('Auth skill error', err);
    }
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
