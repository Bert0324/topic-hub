import { TopicStatus } from '../../common/enums';
import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';
import type { SkillPipelinePort } from './create.handler';
import { denyReasonIfCannotMutateTopic } from '../topic-mutation-access';

export class ReopenHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(_parsed: ParsedCommand, context: CommandContext) {
    const topics = await this.topicService.findGroupHistory(
      context.platform,
      context.groupId,
    );

    const closedTopic = topics.find((t: any) => t.status === TopicStatus.CLOSED);
    if (!closedTopic) {
      return { success: false, error: 'No closed topic found in this group to reopen.' };
    }

    const activeTopic = topics.find(
      (t: any) => t.status === TopicStatus.OPEN || t.status === TopicStatus.IN_PROGRESS,
    );
    if (activeTopic) {
      return {
        success: false,
        error: 'Cannot reopen: an active topic already exists in this group.',
      };
    }

    const deny = denyReasonIfCannotMutateTopic(closedTopic, context.userId);
    if (deny) {
      return { success: false, error: deny };
    }

    try {
      const updated = await this.topicService.updateStatus(
        closedTopic._id.toString(),
        TopicStatus.OPEN,
        context.userId,
      );

      await this.skillPipeline.notifyChannelsOnly('reopened', updated);

      return {
        success: true,
        data: updated,
        message: `Topic "${closedTopic.title}" reopened.`,
      };
    } catch (err) {
      this.logger.error('Failed to reopen topic', String(err));
      return { success: false, error: `Failed to reopen topic: ${(err as Error).message}` };
    }
  }
}
