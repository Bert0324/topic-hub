import { z } from 'zod';

export const ExecutorMetaSchema = z.object({
  agentType: z.string().min(1).max(64),
  maxConcurrentAgents: z.number().int().positive().max(10).default(1),
  hostname: z.string().min(1).max(253),
  pid: z.number().int().nonnegative().max(2_147_483_647),
});

export type ExecutorMeta = z.infer<typeof ExecutorMetaSchema>;

export const RegisterExecutorSchema = z.object({
  executorMeta: ExecutorMetaSchema.optional(),
});

export type RegisterExecutorInput = z.infer<typeof RegisterExecutorSchema>;

export const EXECUTOR_STATUS = {
  ACTIVE: 'active' as const,
  REVOKED: 'revoked' as const,
};

export type ExecutorStatus = (typeof EXECUTOR_STATUS)[keyof typeof EXECUTOR_STATUS];
