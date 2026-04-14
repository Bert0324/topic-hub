import { z } from 'zod';
import type { Connection } from 'mongoose';
import { TopicHubBridgeConfigSchema } from './bridge/openclaw-types';

const EncryptionConfigSchema = z.object({
  masterKey: z.string().min(1),
});

export const TopicHubConfigSchema = z.object({
  mongoConnection: z.custom<Connection>().optional(),
  mongoUri: z.string().url().optional(),
  collectionPrefix: z.string().regex(/^[a-z0-9_]*$/).optional(),
  skillsDir: z.string().min(1).optional(),
  builtins: z.boolean().optional().default(true),
  logger: z.custom<import('./common/logger').LoggerFactory>().optional(),
  encryption: EncryptionConfigSchema.optional(),
  bridge: TopicHubBridgeConfigSchema.optional(),
}).refine(
  (data) => !!(data.mongoConnection ?? data.mongoUri),
  { message: 'Either mongoConnection or mongoUri must be provided' }
).refine(
  (data) => !(data.mongoConnection && data.mongoUri),
  { message: 'Provide either mongoConnection or mongoUri, not both' }
);

export type TopicHubConfig = z.input<typeof TopicHubConfigSchema>;
export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;
