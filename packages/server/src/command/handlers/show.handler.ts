import { Injectable } from '@nestjs/common';
import { TopicService } from '../../core/services/topic.service';
import { CommandContext } from '../router/command-router';

@Injectable()
export class ShowHandler {
  constructor(private readonly topicService: TopicService) {}

  async execute(tenantId: string, _parsed: unknown, context: CommandContext) {
    const topic = await this.topicService.findActiveTopicByGroup(
      tenantId,
      context.platform,
      context.groupId,
    );

    if (!topic) {
      return { success: false, error: 'No active topic in this group.' };
    }

    return {
      success: true,
      data: {
        id: topic._id.toString(),
        type: topic.type,
        title: topic.title,
        status: topic.status,
        sourceUrl: topic.sourceUrl,
        signals: topic.signals,
        assignees: topic.assignees,
        groups: topic.groups,
        tags: topic.tags,
        metadata: topic.metadata,
        createdBy: topic.createdBy,
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
        closedAt: topic.closedAt,
      },
    };
  }
}
