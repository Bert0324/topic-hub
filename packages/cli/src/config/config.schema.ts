import { z } from 'zod';

export const ExecutorType = z.enum(['claude-code', 'codex', 'none']);
export type ExecutorType = z.infer<typeof ExecutorType>;

export const LocalConfigSchema = z.object({
  serverUrl: z.string().url(),
  tenantId: z.string().min(1),
  executor: ExecutorType,
  executorArgs: z.array(z.string()).optional(),
  skillsDir: z.string().min(1),
  openclawGatewayUrl: z.string().url().optional(),
  openclawToken: z.string().min(1).optional(),
  openclawWebhookSecret: z.string().min(1).optional(),
  openclawTenantMapping: z.string().optional(),
});

export type LocalConfig = z.infer<typeof LocalConfigSchema>;
