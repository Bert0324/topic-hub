import { Injectable, Logger } from '@nestjs/common';
import { TopicService } from '../../core/services/topic.service';
import { SkillPipeline } from '../../skill/pipeline/skill-pipeline';
import { TopicStatus } from '../../common/enums';
import { ParsedCommand } from '../parser/command-parser';
import { CommandContext } from '../router/command-router';

@Injectable()
export class ReopenHandler {
  private readonly logger = new Logger(ReopenHandler.name);

  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipeline,
  ) {}

  async execute(tenantId: string, _parsed: ParsedCommand, context: CommandContext) {
    const topics = await this.topicService.findGroupHistory(
      tenantId,
      context.platform,
      context.groupId,
    );

    const closedTopic = topics.find((t) => t.status === TopicStatus.CLOSED);
    if (!closedTopic) {
      return { success: false, error: 'No closed topic found in this group to reopen.' };
    }

    const activeTopic = topics.find(
      (t) => t.status === TopicStatus.OPEN || t.status === TopicStatus.IN_PROGRESS,
    );
    if (activeTopic) {
      return {
        success: false,
        error: 'Cannot reopen: an active topic already exists in this group.',
      };
    }

    try {
      const updated = await this.topicService.updateStatus(
        tenantId,
        closedTopic._id.toString(),
        TopicStatus.OPEN,
        context.userId,
      );

      await this.skillPipeline.execute(
        tenantId,
        'reopened',
        updated,
        context.userId,
      );

      return {
        success: true,
        data: updated,
        message: `Topic "${closedTopic.title}" reopened.`,
      };
    } catch (err) {
      this.logger.error('Failed to reopen topic', err);
      return { success: false, error: `Failed to reopen topic: ${(err as Error).message}` };
    }
  }
}
