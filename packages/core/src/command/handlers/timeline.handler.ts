import type { TopicService } from '../../services/topic.service';
import type { TimelineService } from '../../services/timeline.service';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';

export class TimelineHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly timelineService: TimelineService,
  ) {}

  async execute(
    parsed: ParsedCommand,
    context: CommandContext,
  ) {
    const topic = await this.topicService.findActiveTopicByGroup(
      context.platform,
      context.groupId,
    );

    if (!topic) {
      return { success: false, error: 'No active topic in this group.' };
    }

    const page = parseInt((parsed.args.page as string) ?? '1', 10);
    const timeline = await this.timelineService.findByTopic(
      topic._id.toString(),
      page,
    );

    return { success: true, data: timeline };
  }
}
