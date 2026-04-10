import { z } from 'zod';

export const ExecutorType = z.enum(['claude-code', 'codex', 'none']);
export type ExecutorType = z.infer<typeof ExecutorType>;

export const LocalConfigSchema = z.object({
  serverUrl: z.string().url(),
  tenantId: z.string().min(1),
  executor: ExecutorType,
  skillsDir: z.string().min(1),
});

export type LocalConfig = z.infer<typeof LocalConfigSchema>;
