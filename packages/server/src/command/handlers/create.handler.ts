import { Injectable, Logger } from '@nestjs/common';
import { TopicService } from '../../core/services/topic.service';
import { SkillRegistry } from '../../skill/registry/skill-registry';
import { SkillPipeline } from '../../skill/pipeline/skill-pipeline';
import { ParsedCommand } from '../parser/command-parser';
import { CommandContext } from '../router/command-router';

@Injectable()
export class CreateHandler {
  private readonly logger = new Logger(CreateHandler.name);

  constructor(
    private readonly topicService: TopicService,
    private readonly skillRegistry: SkillRegistry,
    private readonly skillPipeline: SkillPipeline,
  ) {}

  async execute(tenantId: string, parsed: ParsedCommand, context: CommandContext) {
    const topicType = parsed.type;
    if (!topicType) {
      return { success: false, error: 'Topic type is required. Usage: /topichub create <type> --title "Title"' };
    }

    const typeSkill = this.skillRegistry.getTypeSkillForType(topicType);
    if (!typeSkill) {
      return { success: false, error: `Unknown topic type: ${topicType}` };
    }

    const metadata: Record<string, unknown> = { ...parsed.args };
    delete metadata.title;

    const validation = typeSkill.validateMetadata(metadata);
    if (!validation.valid) {
      const errorMessages = validation.errors?.map((e) => `${e.field}: ${e.message}`).join('; ');
      return { success: false, error: `Validation failed: ${errorMessages}` };
    }

    const existing = await this.topicService.findActiveTopicByGroup(
      tenantId,
      context.platform,
      context.groupId,
    );
    if (existing) {
      return {
        success: false,
        error: 'An active topic already exists in this group. Close or resolve it first.',
      };
    }

    const title = (parsed.args.title as string) || `${topicType} topic`;

    try {
      const topic = await this.topicService.create(tenantId, {
        type: topicType,
        title,
        metadata,
        createdBy: context.userId,
        groupInfo: {
          platform: context.platform,
          groupId: context.groupId,
        },
      });

      await this.skillPipeline.execute(
        tenantId,
        'created',
        topic,
        context.userId,
      );

      return { success: true, data: topic, message: `Topic "${title}" created successfully.` };
    } catch (err) {
      this.logger.error('Failed to create topic', err);
      return { success: false, error: `Failed to create topic: ${(err as Error).message}` };
    }
  }
}
