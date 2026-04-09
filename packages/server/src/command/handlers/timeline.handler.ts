import { Injectable } from '@nestjs/common';
import { TopicService } from '../../core/services/topic.service';
import { TimelineService } from '../../core/services/timeline.service';
import { ParsedCommand } from '../parser/command-parser';
import { CommandContext } from '../router/command-router';

@Injectable()
export class TimelineHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly timelineService: TimelineService,
  ) {}

  async execute(
    tenantId: string,
    parsed: ParsedCommand,
    context: CommandContext,
  ) {
    const topic = await this.topicService.findActiveTopicByGroup(
      tenantId,
      context.platform,
      context.groupId,
    );

    if (!topic) {
      return { success: false, error: 'No active topic in this group.' };
    }

    const page = parseInt((parsed.args.page as string) ?? '1', 10);
    const timeline = await this.timelineService.findByTopic(
      tenantId,
      topic._id.toString(),
      page,
    );

    return { success: true, data: timeline };
  }
}
