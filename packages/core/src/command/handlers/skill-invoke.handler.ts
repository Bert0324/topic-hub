import type { TopicService } from '../../services/topic.service';
import type { TopicHubLogger } from '../../common/logger';
import type { ParsedCommand } from '../command-parser';
import type { CommandContext } from '../command-router';
import type { SkillPipelinePort } from './create.handler';
import { DispatchEventType } from '../../common/enums';
import { denyReasonIfCannotMutateTopic } from '../topic-mutation-access';
import { IM_PAYLOAD_AGENT_SLOT_KEY } from '../../im/agent-slot-constants.js';
import { stripAgentSlotFromSlashInvocationLine } from '../../im/agent-slot-parse.js';

/**
 * IM slash `/RegisteredSkillName …` — dispatches to the local executor for that skill directory.
 */
export class SkillInvokeHandler {
  constructor(
    private readonly topicService: TopicService,
    private readonly skillPipeline: SkillPipelinePort,
    private readonly logger: TopicHubLogger,
  ) {}

  async execute(parsed: ParsedCommand, context: CommandContext) {
    const skillName = context.skillInvocationName;
    if (!skillName) {
      return { success: false, error: 'Internal error: missing skillInvocationName.' };
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
      const rawLine = context.imChatLine ?? context.relayText ?? '';
      const { agentSlot, imText } = stripAgentSlotFromSlashInvocationLine(rawLine);
      const payload: Record<string, unknown> = {
        skillName,
        slashArgs: parsed.args,
        slashTypeArg: parsed.type,
        imText,
      };
      if (context.imTargetAgentSlot != null) {
        payload[IM_PAYLOAD_AGENT_SLOT_KEY] = context.imTargetAgentSlot;
      } else if (agentSlot != null) {
        payload[IM_PAYLOAD_AGENT_SLOT_KEY] = agentSlot;
      }
      await this.skillPipeline.execute(
        DispatchEventType.SKILL_INVOCATION,
        topic,
        context.userId,
        payload,
        context.dispatchMeta,
        { dispatchSkillName: skillName },
      );
      return { success: true, message: '', deferOpenClawThreadReply: true };
    } catch (err) {
      this.logger.error('Skill invoke dispatch failed', String(err));
      return { success: false, error: `Skill invoke failed: ${(err as Error).message}` };
    }
  }
}
