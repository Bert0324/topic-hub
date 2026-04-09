import { Injectable, Logger } from '@nestjs/common';
import { TopicService } from '../../core/services/topic.service';
import { SkillPipeline } from '../../skill/pipeline/skill-pipeline';
import { TopicStatus } from '../../common/enums';
import { ParsedCommand } from '../parser/command-parser';
import { CommandContext } from '../router/command-router';

const STATUS_VALUES = Object.values(TopicStatus) as string[];

@Injectable()
export class UpdateHandler {
  private readonly logger = new Logger(UpdateHandler.name);

  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipeline,
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
      this.logger.error('Failed to update topic status', err);
      return { success: false, error: `Failed to update status: ${(err as Error).message}` };
    }
  }
}
