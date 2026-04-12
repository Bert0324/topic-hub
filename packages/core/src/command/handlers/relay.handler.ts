import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';
import type { SkillPipelinePort } from './create.handler';
import { DispatchEventType } from '../../common/enums';
import { denyReasonIfCannotMutateTopic } from '../topic-mutation-access';

/**
 * Forwards non-slash messages in a topic group to the bound local executor as a dispatch.
 */
export class RelayHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(_parsed: ParsedCommand, context: CommandContext) {
    const relayText = (context.imChatLine ?? context.relayText ?? '').trim();
    if (!relayText) {
      return { success: false, error: 'Empty message.' };
    }

    const topic = await this.topicService.findActiveTopicByGroup(
      context.platform,
      context.groupId,
    );
    if (!topic) {
      return {
        success: false,
        error: 'No active topic in this group. Create one first with /create <type>.',
      };
    }

    const deny = denyReasonIfCannotMutateTopic(topic, context.userId);
    if (deny) {
      return { success: false, error: deny };
    }

    try {
      const payload: Record<string, unknown> = { text: relayText };
      if (context.publishedSkillRouting) {
        payload.publishedSkillRouting = context.publishedSkillRouting;
      }
      if (context.queueAfterDispatchId) {
        payload.queueAfterDispatchId = context.queueAfterDispatchId;
      }
      await this.skillPipeline.execute(
        DispatchEventType.USER_MESSAGE,
        topic,
        context.userId,
        payload,
        context.dispatchMeta,
      );
      return { success: true, message: '', deferOpenClawThreadReply: true };
    } catch (err) {
      this.logger.error('Relay to executor failed', String(err));
      return { success: false, error: `Relay failed: ${(err as Error).message}` };
    }
  }
}
