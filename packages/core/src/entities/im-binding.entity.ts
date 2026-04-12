import {
  prop,
  modelOptions,
  index,
} from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'im_bindings', timestamps: true },
})
@index({ platform: 1, platformUserId: 1 }, { unique: true })
@index({ executorToken: 1 })
@index({ identityId: 1 })
export class ImBinding {
  @prop({ required: true })
  platform!: string;

  @prop({ required: true })
  platformUserId!: string;

  @prop({ required: true })
  executorToken!: string;

  @prop({ required: true })
  identityId!: string;

  @prop({ required: true, default: true })
  active!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}
