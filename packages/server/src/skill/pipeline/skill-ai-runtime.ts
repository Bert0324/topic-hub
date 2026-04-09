import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { AiService } from '../../ai/ai.service';
import { TimelineActionType } from '../../common/enums';
import { TimelineEntry } from '../../core/entities/timeline-entry.entity';
import { Topic } from '../../core/entities/topic.entity';
import { SkillRegistry } from '../registry/skill-registry';
import {
  OPERATION_TO_EVENT,
  TopicSnapshot,
  EventContext,
  SkillAiResult,
} from '../interfaces/skill-md';
import type { AiMessage } from '../../ai/providers/ai-provider.interface';

@Injectable()
export class SkillAiRuntime {
  private readonly logger = new Logger(SkillAiRuntime.name);

  constructor(
    private readonly registry: SkillRegistry,
    private readonly aiService: AiService,
    @InjectModel(TimelineEntry.name)
    private readonly timelineModel: ReturnModelType<typeof TimelineEntry>,
    @InjectModel(Topic.name)
    private readonly topicModel: ReturnModelType<typeof Topic>,
  ) {}

  async executeIfApplicable(
    tenantId: string,
    skillName: string,
    operation: string,
    topicData: any,
    actor: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const parsedMd = this.registry.getSkillMd(skillName);
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
