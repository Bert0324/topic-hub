import type { ParsedSkillMd } from '../interfaces/skill-md';
import { OPERATION_TO_EVENT } from '../interfaces/skill-md';

/**
 * Build {@link EnrichedPayload.skillInstructions} from parsed SKILL.md + lifecycle operation.
 */
export function buildSkillInstructionsSnapshot(
  operation: string,
  parsed: ParsedSkillMd,
): {
  primaryInstruction: string;
  fullBody: string;
  eventName?: string;
  frontmatter: {
    name: string;
    description: string;
    executor?: string;
    maxTurns?: number;
    allowedTools?: string[];
    topicType?: string;
  };
} {
  const lifecycle = OPERATION_TO_EVENT[operation as keyof typeof OPERATION_TO_EVENT];
  const useEvent = lifecycle != null && parsed.eventPrompts.has(lifecycle);
  const primary = useEvent ? parsed.eventPrompts.get(lifecycle)! : parsed.systemPrompt;
  const fm = parsed.frontmatter;
  return {
    primaryInstruction: primary,
    fullBody: parsed.systemPrompt,
    ...(useEvent ? { eventName: lifecycle } : {}),
    frontmatter: {
      name: fm.name,
      description: fm.description,
      ...(fm.executor != null ? { executor: fm.executor } : {}),
      ...(fm.maxTurns != null ? { maxTurns: fm.maxTurns } : {}),
      ...(fm.allowedTools != null ? { allowedTools: fm.allowedTools } : {}),
      ...(fm.topicType != null ? { topicType: fm.topicType } : {}),
    },
  };
}
