import type { TopicService } from '../../services/topic.service';
import type { CommandContext } from '../command-router';

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
      data: topics.map((t: any) => ({
        id: t._id.toString(),
        type: t.type,
        title: t.title,
        status: t.status,
        createdAt: t.createdAt,
      })),
    };
  }
}
