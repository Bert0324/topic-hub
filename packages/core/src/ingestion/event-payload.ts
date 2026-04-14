import { z } from 'zod';

export const EventPayloadSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1).max(255),
  sourceUrl: z.string().url().optional(),
  status: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  assignees: z.array(z.string()).optional().default([]),
});

export type EventPayload = z.infer<typeof EventPayloadSchema>;
