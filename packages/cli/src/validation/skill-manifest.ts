import { z } from 'zod';

/** Matches server `packages/server/src/skill/interfaces/skill-manifest.ts`. */
const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
const REGISTRATION_ID_REGEX = /^[a-fA-F0-9]{24}$/;

/** SKILL.md frontmatter for md-only skills (no package.json). */
export const SkillMdOnlyPublishFrontmatterSchema = z.object({
  name: z
    .string()
    .regex(
      SKILL_NAME_REGEX,
      'Skill name must be 3-64 chars, lowercase, hyphens allowed',
    ),
  description: z.string().min(1).max(1024),
  category: z.enum(['type', 'platform', 'adapter']).optional(),
  topicType: z.string().optional(),
  platform: z.string().optional(),
  sourceSystem: z.string().optional(),
});

export const SkillManifestSchema = z.object({
  name: z
    .string()
    .regex(
      SKILL_NAME_REGEX,
      'Skill name must be 3-64 chars, lowercase, hyphens allowed',
    ),
  version: z.string().optional(),
  main: z.string(),
  topichub: z.object({
    category: z.enum(['type', 'platform', 'adapter']),
    topicType: z.string().optional(),
    platform: z.string().optional(),
    sourceSystem: z.string().optional(),
    hooks: z.array(z.string()).optional(),
    schema: z.record(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    webhookPath: z.string().optional(),
    auth: z
      .object({
        type: z.enum(['oauth2', 'api_key', 'none']),
        scopes: z.array(z.string()).optional(),
      })
      .optional(),
    supportedEvents: z.array(z.string()).optional(),
  }),
});

export const PublishSkillItemSchema = z.object({
  registrationId: z.string().regex(REGISTRATION_ID_REGEX).optional(),
  name: z.string().regex(SKILL_NAME_REGEX),
  category: z.enum(['type', 'platform', 'adapter']),
  version: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  skillMdRaw: z.string(),
  entryPoint: z.string(),
  files: z.record(z.string()).optional(),
  manifest: z.record(z.unknown()),
});

export const PublishPayloadSchema = z.object({
  isPublic: z.boolean().optional().default(false),
  skills: z.array(PublishSkillItemSchema).min(1).max(50),
});

export type PublishPayload = z.infer<typeof PublishPayloadSchema>;
