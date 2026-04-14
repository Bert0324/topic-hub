import { z } from 'zod';
import mongoose from 'mongoose';

const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

const RegistrationIdSchema = z
  .string()
  .refine((s) => mongoose.Types.ObjectId.isValid(s), { message: 'registrationId must be a valid Mongo ObjectId' });

export const SkillManifestSchema = z.object({
  name: z
    .string()
    .regex(
      SKILL_NAME_REGEX,
      'Skill name must be 3-64 chars, lowercase, hyphens allowed',
    ),
  version: z.string().optional(),
  main: z.string().optional(),
  topichub: z.object({
    category: z.enum(['type', 'platform', 'adapter']),
    topicType: z.string().optional(),
    platform: z.string().optional(),
    sourceSystem: z.string().optional(),
    hooks: z.array(z.string()).optional(),
    schema: z.record(z.string(), z.string()).optional(),
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

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export const PublishSkillItemSchema = z.object({
  /** When set, updates this `skill_registrations` document (must match `name` in body). Omit to upsert by `name`. */
  registrationId: RegistrationIdSchema.optional(),
  name: z.string().regex(SKILL_NAME_REGEX),
  category: z.enum(['type', 'platform', 'adapter']),
  version: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  skillMdRaw: z.string(),
  entryPoint: z.string(),
  files: z.record(z.string(), z.string()).optional(),
  manifest: z.record(z.string(), z.unknown()),
});

export const PublishPayloadSchema = z.object({
  isPublic: z.boolean().optional().default(false),
  skills: z.array(PublishSkillItemSchema).min(1).max(50),
});

export type PublishPayload = z.infer<typeof PublishPayloadSchema>;
export type PublishSkillItem = z.infer<typeof PublishSkillItemSchema>;
