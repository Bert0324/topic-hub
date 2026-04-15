import { prop, modelOptions, index } from '@typegoose/typegoose';
import mongoose from 'mongoose';

@modelOptions({
  schemaOptions: { collection: 'identities', timestamps: true },
})
@index({ uniqueId: 1 }, { unique: true })
@index({ token: 1 }, { unique: true })
export class Identity {
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true, unique: true })
  uniqueId!: string;

  @prop({ required: true })
  displayName!: string;

  @prop({ required: true, unique: true })
  token!: string;

  @prop({ required: true, default: false })
  isSuperAdmin!: boolean;

  @prop({ required: true, default: 'active' })
  status!: string;

  createdAt!: Date;
  updatedAt!: Date;
}
