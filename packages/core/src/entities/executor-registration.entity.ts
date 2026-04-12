import {
  prop,
  modelOptions,
  index,
  Severity,
} from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'executor_registrations', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
@index({ identityId: 1 })
@index({ executorToken: 1 }, { unique: true })
@index({ status: 1 })
export class ExecutorRegistration {
  @prop({ required: true })
  identityId!: string;

  @prop({ required: true, unique: true })
  executorToken!: string;

  @prop({ required: true, default: 'active' })
  status!: string;

  @prop({ required: true })
  lastSeenAt!: Date;

  @prop({ type: () => Object })
  executorMeta?: {
    agentType: string;
    maxConcurrentAgents: number;
    hostname: string;
    pid: number;
  };

  createdAt!: Date;
  updatedAt!: Date;
}
