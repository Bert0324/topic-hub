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
@index({ type: 1 })
@index({ status: 1 })
@index({ sourceUrl: 1 }, { unique: true, sparse: true })
@index({ createdAt: -1 })
@index({ tags: 1 })
@index({ 'groups.platform': 1, 'groups.groupId': 1 })
@index({ title: 'text' })
@index({ type: 1, status: 1, createdAt: -1 })
export class Topic {
  _id!: mongoose.Types.ObjectId;

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
