import type { Model } from 'mongoose';
import { SkillRegistry } from '../registry/skill-registry';
import { OPERATION_TO_EVENT } from '../interfaces/skill-md';
import { SkillMdParser } from '../registry/skill-md-parser';
import { DispatchService } from '../../services/dispatch.service';
import type { DispatchMeta } from '../../services/dispatch.service';
import { OpenClawBridge } from '../../bridge/openclaw-bridge';
import type { TopicHubLogger } from '../../common/logger';
import type { SkillPipelinePort } from '../../command/handlers/create.handler';
import { buildSkillInstructionsSnapshot } from './skill-instructions-snapshot';

export class SkillPipeline implements SkillPipelinePort {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly dispatchService: DispatchService | null,
    private readonly logger: TopicHubLogger,
    private readonly bridge: OpenClawBridge | null = null,
    private readonly skillMdParser?: SkillMdParser,
    private readonly skillRegistrationModel?: Model<any>,
  ) {}

  async execute(
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
    dispatchMeta?: DispatchMeta,
    options?: { dispatchSkillName?: string },
  ): Promise<void> {
    await this.createTaskDispatch(operation, topicData, actor, extra, dispatchMeta, options);
    await this.runBridgeNotifications(operation, topicData);
  }

  /** Group IM notification only (no executor dispatch). */
  async notifyChannelsOnly(operation: string, topicData: unknown): Promise<void> {
    await this.runBridgeNotifications(operation, topicData as any);
  }

  private async loadParsedMdFromMongo(skillName: string) {
    if (!this.skillMdParser || !this.skillRegistrationModel) return null;
    const doc = (await this.skillRegistrationModel
      .findOne({ name: skillName })
      .select('publishedContent')
      .lean()
      .exec()) as { publishedContent?: { skillMdRaw?: string } } | null;
    const raw = doc?.publishedContent?.skillMdRaw;
    if (typeof raw !== 'string' || !raw.trim()) {
      return null;
    }
    return this.skillMdParser.parseContent(raw, `mongo://${skillName}`);
  }

  /**
   * Resolve SKILL.md for this dispatch: in-memory registry first, then Mongo
   * `publishedContent.skillMdRaw` (Skill Center publish / server catalog).
   */
  private async resolveParsedSkillMd(
    operation: string,
    topicData: any,
    extra?: Record<string, unknown>,
    options?: { dispatchSkillName?: string },
  ) {
    const invokeNameRaw =
      options?.dispatchSkillName ??
      (typeof extra?.skillName === 'string' ? (extra.skillName as string).trim() : undefined);

    if (invokeNameRaw) {
      return this.registry.getSkillMd(invokeNameRaw) ?? (await this.loadParsedMdFromMongo(invokeNameRaw));
    }

    const topicType = topicData?.type != null ? String(topicData.type) : '';
    if (topicType && OPERATION_TO_EVENT[operation as keyof typeof OPERATION_TO_EVENT]) {
      return this.registry.getSkillMd(topicType) ?? null;
    }

    return null;
  }

  private async createTaskDispatch(
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
    dispatchMeta?: DispatchMeta,
    options?: { dispatchSkillName?: string },
  ): Promise<void> {
    if (!this.dispatchService) return;
    if (!dispatchMeta?.targetUserId || !dispatchMeta?.targetExecutorToken) return;

    const topicId = topicData._id?.toString?.() ?? String(topicData._id ?? '');
    if (!topicId) return;

    try {
      const enrichedPayload: Record<string, unknown> = {
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
          tags: (topicData.tags ?? []),
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
      };

      if (this.skillMdParser) {
        try {
          const parsed = await this.resolveParsedSkillMd(operation, topicData, extra, options);
          if (parsed?.hasAiInstructions) {
            enrichedPayload.skillInstructions = buildSkillInstructionsSnapshot(operation, parsed);
          }
        } catch (err) {
          this.logger.warn(`skillInstructions enrichment skipped: ${String(err)}`);
        }
      }

      await this.dispatchService.create({
        topicId,
        eventType: operation,
        skillName: options?.dispatchSkillName ?? topicData.type ?? 'unknown',
        enrichedPayload,
        targetUserId: dispatchMeta.targetUserId,
        targetExecutorToken: dispatchMeta.targetExecutorToken,
        sourceChannel: dispatchMeta.sourceChannel,
        sourcePlatform: dispatchMeta.sourcePlatform,
      });
    } catch (err) {
      this.logger.error(
        `Failed to create task dispatch for topic=${topicId}`,
        String(err),
      );
    }
  }

  private async runBridgeNotifications(
    operation: string,
    topicData: any,
  ): Promise<void> {
    if (!this.bridge) return;

    const notifyOps = ['created', 'updated', 'status_changed', 'assigned', 'closed', 'reopened'];
    if (!notifyOps.includes(operation)) return;

    try {
      const groups = topicData?.groups ?? [];
      for (const g of groups) {
        const ok = await this.bridge.sendMessage(g.platform, g.groupId, `Topic ${topicData.title} — ${operation}`);
        if (!ok) {
          this.logger.warn(`Bridge topic notify failed for ${g.platform}/${g.groupId}`);
        }
      }
    } catch (err) {
      this.logger.error(
        `Bridge notification failed for operation ${operation}`,
        String(err),
      );
    }
  }
}
