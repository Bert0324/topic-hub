import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';
import type { SkillPipelinePort } from './create.handler';
import { DispatchEventType } from '../../common/enums';
import {
  IM_PAYLOAD_AGENT_DELETE_SLOT_KEY,
  IM_PAYLOAD_AGENT_OP_KEY,
} from '../../im/agent-slot-constants.js';
import { denyReasonIfCannotMutateTopic } from '../topic-mutation-access';

/**
 * IM `/agent list|create|delete` — dispatches a lightweight control op to the bound local executor.
 */
export class AgentHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(parsed: ParsedCommand, context: CommandContext) {
    const sub = (parsed.type ?? '').toLowerCase();
    if (!sub || !['list', 'create', 'delete'].includes(sub)) {
      return {
        success: false,
        error: 'Usage: `/agent list`, `/agent create`, or `/agent delete #N`.',
      };
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

    let deleteSlot: number | undefined;
    if (sub === 'delete') {
      const m = (context.imChatLine ?? '').match(/delete\s+#(\d+)/i);
      if (!m) {
        return {
          success: false,
          error: 'Usage: `/agent delete #N` (include the slot number).',
        };
      }
      deleteSlot = parseInt(m[1], 10);
      if (!Number.isFinite(deleteSlot) || deleteSlot < 1) {
        return { success: false, error: 'Invalid slot — use `/agent delete #N` with a positive number.' };
      }
    }

    const payload: Record<string, unknown> = {
      [IM_PAYLOAD_AGENT_OP_KEY]: sub,
    };
    if (deleteSlot != null) {
      payload[IM_PAYLOAD_AGENT_DELETE_SLOT_KEY] = deleteSlot;
    }

    try {
      await this.skillPipeline.execute(
        DispatchEventType.USER_MESSAGE,
        topic,
        context.userId,
        payload,
        context.dispatchMeta,
        { dispatchSkillName: 'topichub-im-agent' },
      );
      return { success: true, message: '', deferOpenClawThreadReply: true };
    } catch (err) {
      this.logger.error('Agent command dispatch failed', String(err));
      return { success: false, error: `Agent command failed: ${(err as Error).message}` };
    }
  }
}
