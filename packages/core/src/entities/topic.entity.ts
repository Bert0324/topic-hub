import {
  prop,
  modelOptions,
  index,
  Severity,
} from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { TopicStatus } from '../common/enums';

@modelOptions({ schemaOptions: { _id: false } })
export class TopicGroup {
  @prop({ required: true })
  platform!: string;

  @prop({ required: true })
  groupId!: string;

  @prop()
  groupUrl?: string;

  @prop({ default: () => new Date() })
  createdAt!: Date;
}

@modelOptions({ schemaOptions: { _id: false } })
export class TopicAssignee {
  @prop({ required: true })
  userId!: string;

  @prop({ default: () => new Date() })
  assignedAt!: Date;
}

@modelOptions({ schemaOptions: { _id: true } })
export class Signal {
  @prop({ default: () => new mongoose.Types.ObjectId() })
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true })
  label!: string;

  @prop()
  url?: string;

  @prop()
  description?: string;

  @prop({ default: () => new Date() })
  createdAt!: Date;
}

@modelOptions({
  schemaOptions: { collection: 'topics', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
@index({ tenantId: 1, type: 1 })
@index({ tenantId: 1, status: 1 })
@index({ tenantId: 1, sourceUrl: 1 }, { unique: true, sparse: true })
@index({ tenantId: 1, createdAt: -1 })
@index({ tenantId: 1, tags: 1 })
@index({ tenantId: 1, 'groups.platform': 1, 'groups.groupId': 1 })
@index({ tenantId: 1, title: 'text' })
@index({ tenantId: 1, type: 1, status: 1, createdAt: -1 })
export class Topic {
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true, index: true })
  tenantId!: string;

  @prop({ required: true })
  type!: string;

  @prop({ required: true })
  title!: string;

  @prop()
  sourceUrl?: string;

  @prop({ enum: TopicStatus, default: TopicStatus.OPEN })
  status!: TopicStatus;

  @prop({ type: () => mongoose.Schema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;

  @prop({ required: true })
  createdBy!: string;

  @prop()
  closedAt?: Date;

  @prop({ type: () => [TopicGroup], default: [] })
  groups!: TopicGroup[];

  @prop({ type: () => [TopicAssignee], default: [] })
  assignees!: TopicAssignee[];

  @prop({ type: () => [String], default: [] })
  tags!: string[];

  @prop({ type: () => [Signal], default: [] })
  signals!: Signal[];

  createdAt!: Date;
  updatedAt!: Date;
}
