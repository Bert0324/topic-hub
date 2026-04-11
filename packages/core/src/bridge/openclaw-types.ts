import { z } from 'zod';

export const OpenClawConfigSchema = z.object({
  gatewayUrl: z.string().url(),
  token: z.string().min(1),
  webhookSecret: z.string().min(1),
  /** Platforms enabled on this bridge (used to infer platform when webhook omits it). */
  platforms: z.array(z.string().min(1)).optional(),
});

export type OpenClawConfig = z.infer<typeof OpenClawConfigSchema>;

// --- Embedded bridge config (auto-managed OpenClaw gateway) ---

const FeishuChannelSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  domain: z.enum(['feishu', 'lark']).optional(),
  name: z.string().optional(),
});

const DiscordChannelSchema = z.object({
  botToken: z.string().min(1),
  applicationId: z.string().optional(),
  /** When set, guild channels require @bot before the OpenClaw agent replies (relay still sees all messages). */
  guildId: z.string().min(1).optional(),
});

const TelegramChannelSchema = z.object({
  botToken: z.string().min(1),
});

const SlackChannelSchema = z.object({
  botToken: z.string().min(1),
  appToken: z.string().min(1),
});

const ChannelsSchema = z.object({
  feishu: FeishuChannelSchema.optional(),
  discord: DiscordChannelSchema.optional(),
  telegram: TelegramChannelSchema.optional(),
  slack: SlackChannelSchema.optional(),
}).refine(
  (ch) => Object.values(ch).some((v) => v !== undefined),
  { message: 'At least one channel must be configured' },
);

export const BridgeConfigSchema = z.object({
  channels: ChannelsSchema,
  webhookUrl: z.string().url(),
  port: z.number().int().min(1024).max(65535).optional(),
  maxRestartRetries: z.number().int().min(0).max(10).optional(),
  startupTimeoutMs: z.number().int().min(5000).max(120_000).optional(),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

/** Coerce JSON numbers (Discord snowflakes) to strings so HMAC matches topichub-relay. */
const jsonString = (minLen: number) =>
  z.preprocess((v) => (v == null ? '' : String(v)), z.string().min(minLen));

const OpenClawWebhookDataSchema = z.object({
  channel: jsonString(1),
  user: jsonString(1),
  message: z.preprocess((v) => (v == null ? '' : String(v)), z.string()),
  sessionId: jsonString(1),
  platform: z.string().min(1).optional(),
});

/** Body signed by HMAC (embedded relay sends this as raw bytes + `X-TopicHub-Signature` header). */
export const OpenClawWebhookUnsignedPayloadSchema = z.object({
  event: jsonString(1),
  timestamp: z.preprocess((v) => (v == null ? '' : String(v)), z.string()),
  data: OpenClawWebhookDataSchema,
});

/** Legacy: signature embedded in JSON (external gateways; byte-stable signing is fragile). */
export const OpenClawWebhookPayloadSchema = OpenClawWebhookUnsignedPayloadSchema.extend({
  signature: z.string().min(1),
});

export type OpenClawWebhookUnsignedPayload = z.infer<typeof OpenClawWebhookUnsignedPayloadSchema>;
export type OpenClawWebhookPayload = z.infer<typeof OpenClawWebhookPayloadSchema>;

export interface OpenClawInboundResult {
  platform: string;
  channel: string;
  userId: string;
  rawCommand: string;
  sessionId: string;
}

export interface OpenClawSendParams {
  channel: string;
  target: string;
  message: string;
}
