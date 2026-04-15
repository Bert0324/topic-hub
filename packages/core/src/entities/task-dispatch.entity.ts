import {
  prop,
  modelOptions,
  index,
  Severity,
} from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { DispatchStatus, DispatchEventType } from '../common/enums';

@modelOptions({ schemaOptions: { _id: false } })
export class TopicSnapshot {
  @prop({ required: true })
  id!: string;

  @prop({ required: true })
  type!: string;

  @prop({ required: true })
  title!: string;

  @prop()
  status!: string;

  @prop({ type: () => mongoose.Schema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;

  @prop({ type: () => [mongoose.Schema.Types.Mixed], default: [] })
  groups!: Array<{ platform: string; groupId: string }>;

  @prop({ type: () => [mongoose.Schema.Types.Mixed], default: [] })
  assignees!: Array<{ userId: string }>;

  @prop({ type: () => [String], default: [] })
  tags!: string[];

  @prop({ type: () => [mongoose.Schema.Types.Mixed], default: [] })
  signals!: Array<{ label: string; url?: string; description?: string }>;

  @prop()
  createdAt!: string;

  @prop()
  updatedAt!: string;
}

@modelOptions({ schemaOptions: { _id: false } })
export class EventContext {
  @prop({ required: true })
  type!: string;

  @prop({ required: true })
  actor!: string;

  @prop({ required: true })
  timestamp!: Date;

  @prop({ type: () => mongoose.Schema.Types.Mixed })
  payload?: Record<string, unknown>;
}

@modelOptions({ schemaOptions: { _id: false } })
export class SkillFrontmatterSnapshot {
  @prop({ required: true })
  name!: string;

  @prop({ required: true })
  description!: string;

  @prop()
  executor?: string;

  @prop()
  maxTurns?: number;

  @prop({ type: () => [String] })
  allowedTools?: string[];

  @prop()
  topicType?: string;
}

@modelOptions({ schemaOptions: { _id: false } })
export class SkillInstructions {
  @prop({ required: true })
  primaryInstruction!: string;

  @prop({ required: true })
  fullBody!: string;

  @prop()
  eventName?: string;

  @prop({ required: true, type: () => SkillFrontmatterSnapshot })
  frontmatter!: SkillFrontmatterSnapshot;
}

@modelOptions({ schemaOptions: { _id: false } })
export class EnrichedPayload {
  @prop({ required: true, type: () => TopicSnapshot })
  topic!: TopicSnapshot;

  @prop({ required: true, type: () => EventContext })
  event!: EventContext;

  @prop({ type: () => SkillInstructions })
  skillInstructions?: SkillInstructions;

  /** Mirrors `event.payload.topichubAgentOp` for IM `/agent` dispatches — survives strict nested persistence. */
  @prop({ type: String, enum: ['list', 'create', 'delete'] })
  imAgentControlOp?: 'list' | 'create' | 'delete';
}

@modelOptions({ schemaOptions: { _id: false } })
export class DispatchResult {
  @prop()
  text?: string;

  /** Short plain-text summary for IM (from local executor); full output remains in `text`. */
  @prop()
  imSummary?: string;

  @prop()
  executorType?: string;

  @prop({ type: () => mongoose.Schema.Types.Mixed })
  tokenUsage?: { input: number; output: number };

  @prop()
  durationMs?: number;
}

const MAX_RETRY_COUNT = 3;
const DISPATCH_TTL_DAYS = 30;

@modelOptions({
  schemaOptions: { collection: 'task_dispatches', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
@index({ status: 1, createdAt: 1 })
@index({ targetUserId: 1, status: 1, createdAt: 1 })
@index({ targetExecutorToken: 1, status: 1, createdAt: 1 })
@index({ topicId: 1 })
@index({ status: 1, claimExpiry: 1 })
@index({ createdAt: 1 }, { expireAfterSeconds: DISPATCH_TTL_DAYS * 86400 })
export class TaskDispatch {
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true, type: () => mongoose.Schema.Types.ObjectId })
  topicId!: mongoose.Types.ObjectId;

  @prop({ required: true, enum: DispatchEventType })
  eventType!: DispatchEventType;

  @prop({ required: true, index: true })
  skillName!: string;

  /**
   * IM `/agent list|create|delete` — stored at document root so SSE/claim JSON never loses the op
   * when nested `enrichedPayload.event.payload` is dropped or flattened by a host stack.
   */
  @prop({ type: String, enum: ['list', 'create', 'delete'] })
  imAgentControlOp?: 'list' | 'create' | 'delete';

  @prop({ required: true, enum: DispatchStatus, default: DispatchStatus.UNCLAIMED })
  status!: DispatchStatus;

  @prop({ default: null })
  claimedBy?: string | null;

  @prop({ default: null })
  claimExpiry?: Date | null;

  @prop({ default: 0 })
  retryCount!: number;

  @prop({ required: true, type: () => EnrichedPayload })
  enrichedPayload!: EnrichedPayload;

  @prop({ type: () => DispatchResult })
  result?: DispatchResult;

  @prop({ default: null })
  error?: string | null;

  @prop({ default: null })
  targetUserId?: string | null;

  /** Routes dispatch to the serve session that generated the pairing code (same as binding.claimToken). */
  @prop({ default: null })
  targetExecutorToken?: string | null;

  @prop({ default: null })
  sourceChannel?: string | null;

  @prop({ default: null })
  sourcePlatform?: string | null;

  @prop()
  completedAt?: Date;

  @prop({ default: null })
  reminderSentAt?: Date | null;

  createdAt!: Date;
  updatedAt!: Date;

  static get MAX_RETRY_COUNT() {
    return MAX_RETRY_COUNT;
  }
}
