import { z } from 'zod';
import crypto from 'node:crypto';

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_STALE_THRESHOLD_MS = 60_000;
export const PAIRING_CODE_TTL_MS = 600_000;
export const PAIRING_CODE_LENGTH = 6;
export const DISPATCH_UNCLAIMED_REMINDER_MS = 120_000;
export const QA_REMINDER_MS = 300_000;
export const QA_TIMEOUT_MS = 600_000;
export const DEFAULT_MAX_CONCURRENT_AGENTS = 1;

export const SAFE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Pairing codes are exactly `PAIRING_CODE_LENGTH` chars from `SAFE_ALPHABET` (case-insensitive input). */
const PAIRING_CODE_PATTERN = new RegExp(
  `^[${SAFE_ALPHABET.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}]{${PAIRING_CODE_LENGTH}}$`,
  'i',
);

export const LinkRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(PAIRING_CODE_PATTERN, 'Invalid pairing code')),
});

export type LinkRequest = z.infer<typeof LinkRequestSchema>;

export const UnlinkRequestSchema = z.object({
  platform: z.string().min(1).max(64).optional(),
  platformUserId: z.string().min(1).max(512).optional(),
});

export type UnlinkRequest = z.infer<typeof UnlinkRequestSchema>;

export const RegisterExecutorRequestSchema = z.object({
  force: z.boolean().default(false),
  executorMeta: z
    .object({
      agentType: z.string().min(1).max(64),
      maxConcurrentAgents: z.number().int().positive().max(10).default(1),
      hostname: z.string().min(1).max(253),
      pid: z.number().int().nonnegative().max(2_147_483_647),
    })
    .optional(),
});

export type RegisterExecutorRequest = z.infer<typeof RegisterExecutorRequestSchema>;

export const PostQuestionRequestSchema = z.object({
  questionText: z.string().min(1).max(2000),
  questionContext: z
    .object({
      skillName: z.string().min(1).max(128),
      topicTitle: z.string().min(1).max(512),
    })
    .optional(),
});

export type PostQuestionRequest = z.infer<typeof PostQuestionRequestSchema>;

/** IM `/answer` body and stored answer text (webhook validates before persist). */
export const AnswerTextSchema = z.string().min(1).max(5000);

export type AnswerText = z.infer<typeof AnswerTextSchema>;

export function generatePairingCode(length = PAIRING_CODE_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += SAFE_ALPHABET[bytes[i] % SAFE_ALPHABET.length];
  }
  return code;
}
