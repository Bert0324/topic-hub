import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { DispatchMeta } from '../../services/dispatch.service';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';

export interface SkillPipelinePort {
  execute(operation: string, topic: any, actor: string, extra?: Record<string, unknown>, dispatchMeta?: DispatchMeta): Promise<void>;
}

export class AssignHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(parsed: ParsedCommand, context: CommandContext) {
    const userId = (parsed.args.user as string) || (parsed.args.userId as string);
    if (!userId) {
      return { success: false, error: 'Missing --user flag. Usage: /topichub assign --user <userId>' };
    }

    const topic = await this.topicService.findActiveTopicByGroup(
      context.platform,
      context.groupId,
    );
    if (!topic) {
      return { success: false, error: 'No active topic found in this group.' };
    }

    try {
      const updated = await this.topicService.assignUser(
        topic._id.toString(),
        userId,
        context.userId,
      );

      await this.skillPipeline.execute(
        'assigned',
        updated,
        context.userId,
        { userId },
        context.dispatchMeta,
      );

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
