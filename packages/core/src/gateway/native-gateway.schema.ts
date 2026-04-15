import { z } from 'zod';

/** Inbound envelope for the native integration gateway (POST JSON body). */
export const NativeGatewayEnvelopeSchema = z.object({
  v: z.number().int().positive(),
  op: z.string().min(1),
  idempotencyKey: z.string().max(256).optional(),
  payload: z.record(z.string(), z.unknown()).optional().default(() => ({})),
});

export type NativeGatewayEnvelope = z.infer<typeof NativeGatewayEnvelopeSchema>;
