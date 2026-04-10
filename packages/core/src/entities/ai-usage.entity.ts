import { prop, modelOptions, index } from '@typegoose/typegoose';

@index({ tenantId: 1, skillName: 1, periodStart: 1 }, { unique: true })
@index({ tenantId: 1, periodStart: -1 })
@modelOptions({
  schemaOptions: {
    collection: 'ai_usage_records',
    timestamps: false,
  },
})
export class AiUsageRecord {
  @prop({ required: true, index: true })
  tenantId!: string;

  @prop({ required: true })
  skillName!: string;

  @prop({ required: true })
  periodStart!: Date;

  @prop({ required: true, default: 0 })
  count!: number;

  @prop({ default: 0 })
  totalTokens!: number;
}
