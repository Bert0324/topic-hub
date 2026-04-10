import { z } from 'zod';

export const TenantChannelEntrySchema = z.object({
  tenantId: z.string().min(1),
  platform: z.string().min(1),
});

export type TenantChannelEntry = z.infer<typeof TenantChannelEntrySchema>;

export const OpenClawConfigSchema = z.object({
  gatewayUrl: z.string().url(),
  token: z.string().min(1),
  webhookSecret: z.string().min(1),
  tenantMapping: z.record(z.string(), TenantChannelEntrySchema).refine(
    (mapping) => Object.keys(mapping).length > 0,
    { message: 'tenantMapping must have at least one entry' },
  ),
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
  tenantMapping: z.record(z.string(), TenantChannelEntrySchema).refine(
    (mapping) => Object.keys(mapping).length > 0,
    { message: 'tenantMapping must have at least one entry' },
  ),
  webhookUrl: z.string().url(),
  port: z.number().int().min(1024).max(65535).optional(),
  maxRestartRetries: z.number().int().min(0).max(10).optional(),
  startupTimeoutMs: z.number().int().min(5000).max(120_000).optional(),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

const OpenClawWebhookDataSchema = z.object({
  channel: z.string().min(1),
  user: z.string().min(1),
  message: z.string(),
  sessionId: z.string().min(1),
});

export const OpenClawWebhookPayloadSchema = z.object({
  event: z.string().min(1),
  timestamp: z.string(),
  data: OpenClawWebhookDataSchema,
  signature: z.string().min(1),
});

export type OpenClawWebhookPayload = z.infer<typeof OpenClawWebhookPayloadSchema>;

export interface OpenClawInboundResult {
  tenantId: string;
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
