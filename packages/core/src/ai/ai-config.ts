import { z } from 'zod';

export const AI_CONFIG_DEFAULTS = {
  provider: 'ark',
  model: 'doubao-seed-2-0-pro-260215',
  timeoutMs: 10_000,
  rateLimitGlobal: 1000,
  circuitBreakerThreshold: 3,
  circuitBreakerCooldownMs: 30_000,
} as const;

export const aiConfigSchema = z.object({
  AI_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  AI_PROVIDER: z.string().default(AI_CONFIG_DEFAULTS.provider),
  AI_API_URL: z.string().url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default(AI_CONFIG_DEFAULTS.model),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(AI_CONFIG_DEFAULTS.timeoutMs),
  AI_RATE_LIMIT_GLOBAL: z.coerce
    .number()
    .int()
    .positive()
    .default(AI_CONFIG_DEFAULTS.rateLimitGlobal),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export function loadAiConfig(env: Record<string, string | undefined> = process.env as any): AiConfig {
  return aiConfigSchema.parse(env);
}
