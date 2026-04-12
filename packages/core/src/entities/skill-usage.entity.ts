import {
  prop,
  modelOptions,
  index,
} from '@typegoose/typegoose';
import mongoose from 'mongoose';

const USAGE_TTL_DAYS = 90;

@modelOptions({
  schemaOptions: { collection: 'skill_usages', timestamps: { createdAt: true, updatedAt: false } },
})
@index({ skillId: 1, createdAt: 1 })
@index({ identityId: 1, createdAt: 1 })
@index({ createdAt: 1 }, { expireAfterSeconds: USAGE_TTL_DAYS * 86400 })
export class SkillUsage {
  @prop({ required: true, type: () => mongoose.Schema.Types.ObjectId })
  skillId!: mongoose.Types.ObjectId;

  @prop({ required: true })
  identityId!: string;

  @prop({ required: true })
  executorToken!: string;

  createdAt!: Date;
}
