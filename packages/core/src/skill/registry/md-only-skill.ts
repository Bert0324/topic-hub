import { z } from 'zod';
import type { TypeSkillManifest, CardData, ValidationResult } from '../interfaces/type-skill';
import type { SkillMdFrontmatter } from '../interfaces/skill-md';

export function createMdOnlyTypeSkill(
  name: string,
  frontmatter: SkillMdFrontmatter,
) {
  const topicType = frontmatter.topicType ?? name;

  const manifest: TypeSkillManifest = {
    name,
    topicType,
    version: '0.0.0',
    fieldSchema: z.record(z.string(), z.unknown()),
    groupNamingTemplate: `[${topicType}] {title}`,
    cardTemplate: {
      headerTemplate: '{title}',
      fields: [],
      actions: [],
    },
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
