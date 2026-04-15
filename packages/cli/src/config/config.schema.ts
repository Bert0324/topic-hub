import { z } from 'zod';

export const ExecutorType = z.enum(['claude-code', 'codex', 'none']);
export type ExecutorType = z.infer<typeof ExecutorType>;

export const LocalConfigSchema = z.object({
  serverUrl: z.string().url(),
  executor: ExecutorType,
  executorArgs: z.array(z.string()).optional(),
  maxConcurrentAgents: z.number().int().min(1).max(10).optional(),
  skillsDir: z.string().min(1),
});

export type LocalConfig = z.infer<typeof LocalConfigSchema>;
