import { prop, modelOptions, index } from '@typegoose/typegoose';
import mongoose from 'mongoose';

@modelOptions({
  schemaOptions: { collection: 'tenants', timestamps: true },
})
@index({ slug: 1 }, { unique: true })
@index({ apiKey: 1 }, { unique: true })
export class Tenant {
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true })
  name!: string;

  @prop({ required: true, unique: true })
  slug!: string;

  @prop({ required: true, unique: true })
  apiKey!: string;

  @prop({ required: true })
  adminToken!: string;

  @prop({ required: true })
  adminTokenExpiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}
