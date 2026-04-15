import { z } from 'zod';
import type { Connection } from 'mongoose';
import { TopicHubBridgeConfigSchema } from './bridge/openclaw-types';
import type { TopicHubMongoAdapter } from './persistence/topic-hub-mongo-adapter';

const EncryptionConfigSchema = z.object({
  masterKey: z.string().min(1),
});

export const TopicHubConfigSchema = z.object({
  mongoConnection: z.custom<Connection>().optional(),
  mongoUri: z.string().url().optional(),
  /** Host-built models + connection; mutually exclusive with `mongoConnection` / `mongoUri`. */
  mongoAdapter: z.custom<TopicHubMongoAdapter>().optional(),
  collectionPrefix: z.string().regex(/^[a-z0-9_]*$/).optional(),
  skillsDir: z.string().min(1).optional(),
  builtins: z.boolean().optional().default(true),
  logger: z.custom<import('./common/logger').LoggerFactory>().optional(),
  encryption: EncryptionConfigSchema.optional(),
  bridge: TopicHubBridgeConfigSchema.optional(),
  /**
   * When `true` with `bridge`, lease + embedded gateway start later via
   * {@link TopicHub.startEmbeddedBridgeWhenDeferred} (after host HTTP listen) so bootstrap stays fast.
   */
  deferEmbeddedBridge: z.boolean().optional().default(false),
})
  .refine(
    (data) => !!(data.mongoConnection ?? data.mongoUri ?? data.mongoAdapter),
    { message: 'Provide mongoConnection, mongoUri, or mongoAdapter' },
  )
  .refine(
    (data) => !(data.mongoConnection && data.mongoUri),
    { message: 'Provide either mongoConnection or mongoUri, not both' },
  )
  .refine(
    (data) => {
      if (!data.mongoAdapter) return true;
      return !data.mongoConnection && !data.mongoUri;
    },
    { message: 'mongoAdapter cannot be combined with mongoConnection or mongoUri' },
  )
  .refine(
    (data) => !data.deferEmbeddedBridge || !!data.bridge,
    { message: 'deferEmbeddedBridge requires bridge config', path: ['deferEmbeddedBridge'] },
  );

export type TopicHubConfig = z.input<typeof TopicHubConfigSchema>;
export type EncryptionConfig = z.infer<typeof EncryptionConfigSchema>;
