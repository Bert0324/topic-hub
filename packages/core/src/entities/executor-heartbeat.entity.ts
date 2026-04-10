import {
  prop,
  modelOptions,
  index,
  Severity,
} from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: { collection: 'executor_heartbeats', timestamps: true },
  options: { allowMixed: Severity.ALLOW },
})
@index({ tenantId: 1, topichubUserId: 1 }, { unique: true })
export class ExecutorHeartbeat {
  @prop({ required: true })
  tenantId!: string;

  @prop({ required: true })
  topichubUserId!: string;

  @prop({ required: true })
  claimToken!: string;

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
