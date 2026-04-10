import { z } from 'zod';
import type { Connection } from 'mongoose';
import { OpenClawConfigSchema, BridgeConfigSchema } from './bridge/openclaw-types';

const AiProviderConfigSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  model: z.string().optional(),
  baseUrl: z.string().url().optional(),
  maxRetries: z.number().int().positive().optional(),
});

const EncryptionConfigSchema = z.object({
  masterKey: z.string().min(1),
});

export const TopicHubConfigSchema = z.object({
  mongoConnection: z.custom<Connection>().optional(),
  mongoUri: z.string().url().optional(),
  collectionPrefix: z.string().regex(/^[a-z0-9_]*$/).optional(),
  skillsDir: z.string().min(1).optional(),
  builtins: z.boolean().optional().default(true),
  ai: AiProviderConfigSchema.optional(),
  logger: z.custom<import('./common/logger').LoggerFactory>().optional(),
  encryption: EncryptionConfigSchema.optional(),
  openclaw: OpenClawConfigSchema.optional(),
  bridge: BridgeConfigSchema.optional(),
}).refine(
  (data) => !!(data.mongoConnection ?? data.mongoUri),
  { message: 'Either mongoConnection or mongoUri must be provided' }
).refine(
  (data) => !(data.mongoConnection && data.mongoUri),
  { message: 'Provide either mongoConnection or mongoUri, not both' }
).refine(
  (data) => !(data.openclaw && data.bridge),
  { message: 'Provide either openclaw (external) or bridge (auto-managed), not both' }
);

export type TopicHubConfig = z.input<typeof TopicHubConfigSchema>;
export type AiProviderConfig = z.infer<typeof AiProviderConfigSchema>;
export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;
