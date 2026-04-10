import { prop, modelOptions, Severity, index } from '@typegoose/typegoose';
import mongoose from 'mongoose';
import { SkillCategory } from '../../common/enums';

export interface SkillMdData {
  name: string;
  description: string;
  systemPrompt: string;
  eventPrompts: Record<string, string>;
  hasAiInstructions: boolean;
}

export class PublishedSkillContent {
  @prop({ type: () => Object })
  manifest!: Record<string, unknown>;

  @prop()
  skillMdRaw!: string;

  @prop()
  entryPoint!: string;

  @prop({ type: () => Object })
  files!: Record<string, string>;
}

@index({ name: 1, tenantId: 1 }, { unique: true })
@index({ tenantId: 1, isPrivate: 1 })
@modelOptions({
  schemaOptions: { collection: 'skill_registrations', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
export class SkillRegistration {
  @prop({ required: true })
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

  @prop({ type: String, default: null })
  tenantId!: string | null;

  @prop({ default: false })
  isPrivate!: boolean;

  @prop({ type: () => PublishedSkillContent, default: null, _id: false })
  publishedContent!: PublishedSkillContent | null;
}
