import { Injectable } from '@nestjs/common';
import { TopicService } from '../../core/services/topic.service';
import { CommandContext } from '../router/command-router';

@Injectable()
export class HistoryHandler {
  constructor(private readonly topicService: TopicService) {}

  async execute(tenantId: string, _parsed: unknown, context: CommandContext) {
    const topics = await this.topicService.findGroupHistory(
      tenantId,
      context.platform,
      context.groupId,
    );

    return {
      success: true,
      data: topics.map((t) => ({
        id: t._id.toString(),
        type: t.type,
        title: t.title,
        status: t.status,
        createdAt: t.createdAt,
      })),
    };
  }
}
