import { prop, modelOptions, Severity } from '@typegoose/typegoose';
import { SkillCategory } from '../../common/enums';

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
}
