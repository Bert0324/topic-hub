import { TopicStatus } from '../../common/enums';
import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';

export interface SkillPipelinePort {
  execute(tenantId: string, operation: string, topic: any, actor: string, extra?: Record<string, unknown>): Promise<void>;
}

const STATUS_VALUES = Object.values(TopicStatus) as string[];

export class UpdateHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(tenantId: string, parsed: ParsedCommand, context: CommandContext) {
    const newStatus = parsed.args.status as string | undefined;
    if (!newStatus) {
      return { success: false, error: 'Missing --status flag. Usage: /topichub update --status <status>' };
    }

    if (!STATUS_VALUES.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid status: ${newStatus}. Valid statuses: ${STATUS_VALUES.join(', ')}`,
      };
    }

    const topic = await this.topicService.findActiveTopicByGroup(
      tenantId,
      context.platform,
      context.groupId,
    );
    if (!topic) {
      return { success: false, error: 'No active topic found in this group.' };
    }

    try {
      const oldStatus = topic.status;
      const updated = await this.topicService.updateStatus(
        tenantId,
        topic._id.toString(),
        newStatus as TopicStatus,
        context.userId,
      );

      await this.skillPipeline.execute(
        tenantId,
        'status_changed',
        updated,
        context.userId,
        { from: oldStatus, to: newStatus },
      );

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
