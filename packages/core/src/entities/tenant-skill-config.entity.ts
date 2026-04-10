import { prop, modelOptions, index, Severity } from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'tenant_skill_configs', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
@index({ tenantId: 1, skillName: 1 }, { unique: true })
export class TenantSkillConfig {
  @prop({ required: true })
  tenantId!: string;

  @prop({ required: true })
  skillName!: string;

  @prop({ default: false })
  enabled!: boolean;

  @prop({ type: () => Object, default: {} })
  config!: Record<string, unknown>;
}
