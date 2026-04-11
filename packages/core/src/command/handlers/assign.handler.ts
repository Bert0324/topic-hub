import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';
import type { SkillPipelinePort } from './create.handler';
import { denyReasonIfCannotMutateTopic } from '../topic-mutation-access';

export class AssignHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(parsed: ParsedCommand, context: CommandContext) {
    const userId = (parsed.args.user as string) || (parsed.args.userId as string);
    if (!userId) {
      return { success: false, error: 'Missing --user flag. Usage: /assign --user <userId>' };
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
      const updated = await this.topicService.assignUser(
        topic._id.toString(),
        userId,
        context.userId,
      );

      await this.skillPipeline.notifyChannelsOnly('assigned', updated);

      return {
        success: true,
        data: updated,
        message: `User ${userId} assigned to topic.`,
      };
    } catch (err) {
      this.logger.error('Failed to assign user', String(err));
      return { success: false, error: `Failed to assign user: ${(err as Error).message}` };
    }
  }
}
