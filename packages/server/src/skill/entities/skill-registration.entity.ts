import { prop, modelOptions, Severity } from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { SkillCategory } from '../../common/enums';

export interface SkillMdData {
  name: string;
  description: string;
  systemPrompt: string;
  eventPrompts: Record<string, string>;
  hasAiInstructions: boolean;
}

@modelOptions({
  schemaOptions: { collection: 'skill_registrations', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
export class SkillRegistration {
  @prop({ required: true, unique: true })
  name!: string;

  @prop({ required: true, enum: SkillCategory })
  category!: SkillCategory;

  @prop({ required: true })
  version!: string;

  @prop({ required: true })
  modulePath!: string;

  @prop({ type: () => Object, default: {} })
  metadata!: Record<string, unknown>;

  @prop({ type: () => mongoose.Schema.Types.Mixed, default: null })
  skillMd!: SkillMdData | null;
}
