import {
  prop,
  modelOptions,
  index,
} from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'user_identity_bindings', timestamps: true },
})
@index({ platform: 1, platformUserId: 1 }, { unique: true })
@index({ topichubUserId: 1 })
@index({ claimToken: 1 })
export class UserIdentityBinding {
  @prop({ required: true })
  topichubUserId!: string;

  @prop({ required: true })
  platform!: string;

  @prop({ required: true })
  platformUserId!: string;

  @prop({ required: true })
  claimToken!: string;

  @prop({ required: true, default: true })
  active!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}
