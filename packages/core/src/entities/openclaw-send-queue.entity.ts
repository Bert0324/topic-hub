import { index, modelOptions, prop } from '@typegoose/typegoose';

export type OpenClawSendQueueStatus = 'pending' | 'processing' | 'done' | 'failed';

/**
 * Embedded OpenClaw: lease followers enqueue `message` tool sends here; the lease leader
 * polls and executes them against the local gateway (`/tools/invoke`).
 */
@index({ status: 1, createdAt: 1 })
@modelOptions({ schemaOptions: { versionKey: false } })
export class OpenClawSendQueueEntry {
  @prop({ type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' })
  status!: OpenClawSendQueueStatus;

  @prop({ required: true })
  channel!: string;

  @prop({ required: true })
  target!: string;

  @prop({ required: true })
  message!: string;

  @prop({ required: true })
  sessionKey!: string;

  @prop()
  httpStatus?: number;

  @prop()
  resultOk?: boolean;

  @prop()
  errorSnippet?: string;

  /** Set when status becomes `processing` (for stale reclaim). */
  @prop()
  processingSince?: Date;

  @prop({ default: () => new Date() })
  createdAt!: Date;

  @prop()
  finishedAt?: Date;
}
