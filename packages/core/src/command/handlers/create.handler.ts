import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { DispatchMeta } from '../../services/dispatch.service';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';

/** Shared by handlers; {@link RelayHandler} and {@link SkillInvokeHandler} use {@link SkillPipelinePort.execute} for executor dispatch. */
export interface SkillPipelinePort {
  execute(
    operation: string,
    topic: unknown,
    actor: string,
    extra?: Record<string, unknown>,
    dispatchMeta?: DispatchMeta,
    options?: { dispatchSkillName?: string },
  ): Promise<void>;
  /** IM bridge line only — does not enqueue a local executor task. */
  notifyChannelsOnly(operation: string, topicData: unknown): Promise<void>;
}

export class CreateHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(parsed: ParsedCommand, context: CommandContext) {
    const topicType = parsed.type;
    if (!topicType) {
      return { success: false, error: 'Topic type is required. Usage: /create <type> --title "Title"' };
    }

    const metadata: Record<string, unknown> = { ...parsed.args };
    delete metadata.title;

    const existing = await this.topicService.findActiveTopicByGroup(
      context.platform,
      context.groupId,
    );
    if (existing) {
      return {
        success: false,
        error:
          'This group already has a topic that is not closed. Close it before creating another.',
      };
    }

    const title = (parsed.args.title as string) || `${topicType} topic`;

    try {
      const topic = await this.topicService.create({
        type: topicType,
        title,
        metadata,
        createdBy: context.userId,
        groupInfo: {
          platform: context.platform,
          groupId: context.groupId,
        },
      });

      await this.skillPipeline.notifyChannelsOnly('created', topic);

      return { success: true, data: topic, message: `Topic "${title}" created successfully.` };
    } catch (err) {
      this.logger.error('Failed to create topic', String(err));
      return { success: false, error: `Failed to create topic: ${(err as Error).message}` };
    }
  }
}
