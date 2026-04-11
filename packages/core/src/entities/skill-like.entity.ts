import {
  prop,
  modelOptions,
  index,
} from '@typegoose/typegoose';
import mongoose from 'mongoose';

@modelOptions({
  schemaOptions: { collection: 'skill_likes', timestamps: { createdAt: true, updatedAt: false } },
})
@index({ skillId: 1, identityId: 1 }, { unique: true })
@index({ skillId: 1 })
export class SkillLike {
  @prop({ required: true, type: () => mongoose.Schema.Types.ObjectId })
  skillId!: mongoose.Types.ObjectId;

  @prop({ required: true })
  identityId!: string;

  createdAt!: Date;
}
