import type { TopicService } from '../../services/topic.service';
import { formatImHistoryReply } from '../../im/im-topic-read-replies';
import type { CommandContext } from '../command-router';

export class HistoryHandler {
  constructor(private readonly topicService: TopicService) {}

  async execute(_parsed: unknown, context: CommandContext) {
    const topics = await this.topicService.findGroupHistory(
      context.platform,
      context.groupId,
    );

    const rows = topics.map((t: any) => ({
      id: t._id.toString(),
      type: t.type,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt,
    }));

    return {
      success: true,
      data: rows,
      message: formatImHistoryReply(topics as any),
    };
  }
}
