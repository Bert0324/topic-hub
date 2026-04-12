import { z } from 'zod';

const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

export const SkillPublishPayloadSchema = z.object({
  name: z.string().regex(SKILL_NAME_PATTERN, 'Skill name must be 3-64 lowercase alphanumeric characters or hyphens, starting with a letter'),
  description: z.string().min(1).max(500),
  version: z.string().optional().default('0.0.0'),
  skillMdRaw: z.string().min(1, 'SKILL.md content is required'),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type SkillPublishPayload = z.infer<typeof SkillPublishPayloadSchema>;

export const SkillListQuerySchema = z.object({
  q: z.string().optional(),
  author: z.string().optional(),
  sort: z.enum(['popular', 'recent', 'usage']).optional().default('popular'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export type SkillListQuery = z.infer<typeof SkillListQuerySchema>;
