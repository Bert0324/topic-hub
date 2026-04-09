import { Injectable, Logger } from '@nestjs/common';
import { TopicService } from '../../core/services/topic.service';
import { SkillPipeline } from '../../skill/pipeline/skill-pipeline';
import { ParsedCommand } from '../parser/command-parser';
import { CommandContext } from '../router/command-router';

@Injectable()
export class AssignHandler {
  private readonly logger = new Logger(AssignHandler.name);

  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipeline,
  ) {}

  async execute(tenantId: string, parsed: ParsedCommand, context: CommandContext) {
    const userId = (parsed.args.user as string) || (parsed.args.userId as string);
    if (!userId) {
      return { success: false, error: 'Missing --user flag. Usage: /topichub assign --user <userId>' };
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
      const updated = await this.topicService.assignUser(
        tenantId,
        topic._id.toString(),
        userId,
        context.userId,
      );

      await this.skillPipeline.execute(
        tenantId,
        'assigned',
        updated,
        context.userId,
        { userId },
      );

      return {
        success: true,
        data: updated,
        message: `User ${userId} assigned to topic.`,
      };
    } catch (err) {
      this.logger.error('Failed to assign user', err);
      return { success: false, error: `Failed to assign user: ${(err as Error).message}` };
    }
  }
}
