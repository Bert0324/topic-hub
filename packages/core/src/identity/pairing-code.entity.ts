import {
  prop,
  modelOptions,
  index,
} from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: {
    collection: 'pairing_codes',
    timestamps: { createdAt: true, updatedAt: false },
  },
})
@index({ code: 1 }, { unique: true })
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export class PairingCode {
  @prop({ required: true })
  code!: string;

  @prop({ required: true })
  platform!: string;

  @prop({ required: true })
  platformUserId!: string;

  @prop({ required: true })
  channel!: string;

  @prop({ required: true, default: false })
  claimed!: boolean;

  @prop()
  claimedByUserId?: string;

  @prop({ required: true })
  expiresAt!: Date;

  createdAt!: Date;
}
