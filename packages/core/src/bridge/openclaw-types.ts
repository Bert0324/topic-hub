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
