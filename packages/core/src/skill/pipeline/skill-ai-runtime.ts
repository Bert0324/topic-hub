import { Model } from 'mongoose';
import { TimelineActionType } from '../../common/enums';
import type { TopicHubLogger } from '../../common/logger';
import type { AiMessage, AiServicePort } from '../../ai/ai-provider.interface';
import {
  OPERATION_TO_EVENT,
  TopicSnapshot,
  EventContext,
  SkillAiResult,
  ParsedSkillMd,
} from '../interfaces/skill-md';

export interface SkillMdProvider {
  getSkillMd(skillName: string): ParsedSkillMd | null;
}

export class SkillAiRuntime {
  constructor(
    private readonly skillMdProvider: SkillMdProvider,
    private readonly aiService: AiServicePort | null,
    private readonly timelineModel: Model<any>,
    private readonly topicModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async executeIfApplicable(
    tenantId: string,
    skillName: string,
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const parsedMd = this.skillMdProvider.getSkillMd(skillName);
    if (!parsedMd || !parsedMd.hasAiInstructions) {
      return;
    }

    const eventName = OPERATION_TO_EVENT[operation];
    if (!eventName) {
      return;
    }

    const systemPromptContent =
      parsedMd.eventPrompts.get(eventName) ?? parsedMd.systemPrompt;

    if (!systemPromptContent || systemPromptContent.trim().length === 0) {
      return;
    }

    if (!this.aiService) {
      return;
    }

    const topicSnapshot = this.buildTopicSnapshot(topicData);
    const eventContext: EventContext = {
      eventType: eventName,
      actor,
      timestamp: new Date().toISOString(),
      extra,
    };

    const input: AiMessage[] = [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPromptContent }],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({ event: eventContext, topic: topicSnapshot }),
          },
        ],
      },
    ];

    const response = await this.aiService.complete({
      tenantId,
      skillName,
      input,
    });

    if (!response) {
      return;
    }

    const topicId = topicData._id?.toString?.() ?? topicData._id;
    const result: SkillAiResult = {
      skillName,
      content: response.content,
      model: response.model,
      reasoning: response.reasoning,
      usage: response.usage,
      timestamp: new Date().toISOString(),
    };

    await Promise.all([
      this.timelineModel.create({
        tenantId,
        topicId,
        actor: `ai:${skillName}`,
        actionType: TimelineActionType.AI_RESPONSE,
        payload: result,
      }),
      this.topicModel.updateOne(
        { _id: topicId, tenantId },
        { $set: { [`metadata._ai.${skillName}`]: result } },
      ),
    ]);

    this.logger.log(
      `AI response recorded for skill=${skillName} topic=${topicId} ` +
        `tokens=${response.usage.totalTokens}`,
    );
  }

  private buildTopicSnapshot(topicData: any): TopicSnapshot {
    return {
      _id: topicData._id?.toString?.() ?? String(topicData._id ?? ''),
      tenantId: topicData.tenantId ?? '',
      type: topicData.type ?? '',
      title: topicData.title ?? '',
      sourceUrl: topicData.sourceUrl,
      status: topicData.status ?? '',
      metadata: topicData.metadata ?? {},
      createdBy: topicData.createdBy ?? '',
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
    };
  }
}
