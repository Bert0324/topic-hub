import { z } from 'zod';

const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

export const SkillManifestSchema = z.object({
  name: z.string().regex(SKILL_NAME_REGEX, 'Skill name must be 3-64 chars, lowercase, hyphens allowed'),
  version: z.string().optional(),
  main: z.string({ required_error: 'main entry point is required' }),
  topichub: z.object({
    category: z.enum(['type', 'platform', 'adapter'], {
      errorMap: () => ({ message: 'category must be type, platform, or adapter' }),
    }),
    topicType: z.string().optional(),
    platform: z.string().optional(),
    sourceSystem: z.string().optional(),
    hooks: z.array(z.string()).optional(),
    schema: z.record(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    webhookPath: z.string().optional(),
    auth: z.object({
      type: z.enum(['oauth2', 'api_key', 'none']),
      scopes: z.array(z.string()).optional(),
    }).optional(),
    supportedEvents: z.array(z.string()).optional(),
  }),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export function validateManifest(pkg: unknown): { success: true; data: SkillManifest } | { success: false; errors: string[] } {
  const result = SkillManifestSchema.safeParse(pkg);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  };
}
