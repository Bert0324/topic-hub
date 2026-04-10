import { z } from 'zod';
import type { TypeSkill, TypeSkillManifest, CardData, ValidationResult } from '../interfaces/type-skill';
import type { SkillMdFrontmatter } from '../interfaces/skill-md';

/**
 * Creates a default TypeSkill for SKILL.md-only skills that have no code entry point.
 * All business logic is driven by SkillAiRuntime via the SKILL.md instructions;
 * this stub provides the minimal manifest/renderCard/validateMetadata required
 * by the TypeSkill interface.
 */
export function createMdOnlyTypeSkill(
  name: string,
  frontmatter: SkillMdFrontmatter,
): TypeSkill {
  const topicType = frontmatter.topicType ?? name;

  const manifest: TypeSkillManifest = {
    name,
    topicType,
    version: '0.0.0',
    fieldSchema: z.record(z.unknown()),
    groupNamingTemplate: `[${topicType}] {title}`,
    cardTemplate: {
      headerTemplate: '{title}',
      fields: [],
      actions: [],
    },
    ai: true,
  };

  return {
    manifest,

    renderCard(topic: any): CardData {
      const meta: Record<string, unknown> = topic.metadata ?? {};
      const fields = Object.entries(meta)
        .filter(([k]) => !k.startsWith('_'))
        .slice(0, 10)
        .map(([k, v]) => ({
          label: k,
          value: String(v ?? ''),
          type: 'text' as const,
        }));

      return {
        title: topic.title ?? name,
        fields,
        status: topic.status ?? 'open',
      };
    },

    validateMetadata(): ValidationResult {
      return { valid: true };
    },
  };
}
