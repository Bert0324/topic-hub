import { prop, modelOptions, index } from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'im_identity_links', timestamps: true },
})
@index({ platform: 1, platformUserId: 1 }, { unique: true })
@index({ identityId: 1 })
export class ImIdentityLink {
  @prop({ required: true })
  platform!: string;

  @prop({ required: true })
  platformUserId!: string;

  /** `Identity` document id string */
  @prop({ required: true })
  identityId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}
