import { TopicStatus } from '../../common/enums';
import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';
import type { SkillPipelinePort } from './create.handler';
import { denyReasonIfCannotMutateTopic } from '../topic-mutation-access';

const STATUS_VALUES = Object.values(TopicStatus) as string[];

export class UpdateHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(parsed: ParsedCommand, context: CommandContext) {
    const newStatus = parsed.args.status as string | undefined;
    if (!newStatus) {
      return { success: false, error: 'Missing --status flag. Usage: /update --status <status>' };
    }

    if (!STATUS_VALUES.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid status: ${newStatus}. Valid statuses: ${STATUS_VALUES.join(', ')}`,
      };
    }

    const topic = await this.topicService.findActiveTopicByGroup(
      context.platform,
      context.groupId,
    );
    if (!topic) {
      return { success: false, error: 'No active topic found in this group.' };
    }

    const deny = denyReasonIfCannotMutateTopic(topic, context.userId);
    if (deny) {
      return { success: false, error: deny };
    }

    try {
      const oldStatus = topic.status;
      const updated = await this.topicService.updateStatus(
        topic._id.toString(),
        newStatus as TopicStatus,
        context.userId,
      );

      await this.skillPipeline.notifyChannelsOnly('status_changed', updated);

      return {
        success: true,
        data: updated,
        message: `Topic status updated from ${oldStatus} to ${newStatus}.`,
      };
    } catch (err) {
      this.logger.error('Failed to update topic status', String(err));
      return { success: false, error: `Failed to update status: ${(err as Error).message}` };
    }
  }
}
