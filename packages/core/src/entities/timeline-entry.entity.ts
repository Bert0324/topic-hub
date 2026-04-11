import {
  prop,
  modelOptions,
  index,
  Severity,
  Ref,
} from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { TimelineActionType } from '../common/enums';
import { Topic } from './topic.entity';

@modelOptions({
  schemaOptions: { collection: 'timeline_entries', timestamps: false },
  options: { allowMixed: Severity.ALLOW },
})
@index({ topicId: 1, timestamp: 1 })
export class TimelineEntry {
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true, ref: () => Topic })
  topicId!: Ref<Topic>;

  @prop({ default: () => new Date() })
  timestamp!: Date;

  @prop({ required: true })
  actor!: string;

  @prop({ required: true, enum: TimelineActionType })
  actionType!: TimelineActionType;

  @prop({ type: () => mongoose.Schema.Types.Mixed, default: {} })
  payload!: Record<string, unknown>;
}
