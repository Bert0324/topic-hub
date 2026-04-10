import {
  prop,
  modelOptions,
  index,
  Severity,
} from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { QaExchangeStatus } from '../common/enums';

@modelOptions({
  schemaOptions: { collection: 'qa_exchanges', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
@index({ dispatchId: 1, status: 1 })
@index({ topichubUserId: 1, status: 1 })
export class QaExchange {
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true })
  tenantId!: string;

  @prop({ required: true, type: () => mongoose.Schema.Types.ObjectId })
  dispatchId!: mongoose.Types.ObjectId;

  @prop({ required: true })
  topichubUserId!: string;

  @prop({ required: true })
  questionText!: string;

  @prop({ type: () => Object })
  questionContext?: {
    skillName: string;
    topicTitle: string;
  };

  @prop()
  answerText?: string;

  @prop({ required: true, enum: QaExchangeStatus, default: QaExchangeStatus.PENDING })
  status!: QaExchangeStatus;

  @prop({ required: true })
  sourceChannel!: string;

  @prop({ required: true })
  sourcePlatform!: string;

  @prop({ required: true })
  questionedAt!: Date;

  @prop()
  answeredAt?: Date;

  @prop()
  reminderSentAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}
