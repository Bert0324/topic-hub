import { Model } from 'mongoose';
import type { TopicHubLogger } from '../common/logger';
import { HEARTBEAT_STALE_THRESHOLD_MS } from '../identity/identity-types';

export type ExecutorHeartbeatMeta = {
  agentType: string;
  maxConcurrentAgents: number;
  hostname: string;
  pid: number;
};

export type RegisterExecutorResult =
  | {
      conflict: true;
      existing: { hostname: string; lastSeenAt: Date };
    }
  | { conflict: false };

export class HeartbeatService {
  constructor(
    private readonly heartbeatModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  private isFresh(lastSeenAt: Date): boolean {
    return lastSeenAt.getTime() > Date.now() - HEARTBEAT_STALE_THRESHOLD_MS;
  }

  async registerExecutor(
    tenantId: string,
    topichubUserId: string,
    claimToken: string,
    force: boolean,
    executorMeta?: ExecutorHeartbeatMeta,
  ): Promise<RegisterExecutorResult> {
    const existing = await this.heartbeatModel
      .findOne({ tenantId, topichubUserId })
      .exec();

    if (existing && this.isFresh(existing.lastSeenAt)) {
      if (!force) {
        return {
          conflict: true,
          existing: {
            hostname: existing.executorMeta?.hostname ?? '',
            lastSeenAt: existing.lastSeenAt,
          },
        };
      }
    }

    const now = new Date();
    const $set: Record<string, unknown> = {
      tenantId,
      topichubUserId,
      claimToken,
      lastSeenAt: now,
    };
    if (executorMeta !== undefined) {
      $set.executorMeta = executorMeta;
    }

    await this.heartbeatModel
      .findOneAndUpdate(
        { tenantId, topichubUserId },
        { $set },
        { upsert: true, new: true },
      )
      .exec();

    this.logger.log(
      `Executor heartbeat registered tenant=${tenantId} user=${topichubUserId} force=${force}`,
    );

    return { conflict: false };
  }

  async heartbeat(
    tenantId: string,
    topichubUserId: string,
  ): Promise<{ pendingDispatches: number }> {
    await this.heartbeatModel
      .findOneAndUpdate(
        { tenantId, topichubUserId },
        { $set: { lastSeenAt: new Date() } },
      )
      .exec();

    return { pendingDispatches: 0 };
  }

  async deregister(tenantId: string, topichubUserId: string): Promise<void> {
    await this.heartbeatModel.deleteOne({ tenantId, topichubUserId }).exec();
  }

  async isAvailable(tenantId: string, topichubUserId: string): Promise<boolean> {
    const doc = await this.heartbeatModel
      .findOne({ tenantId, topichubUserId })
      .exec();
    if (!doc) return false;
    return this.isFresh(doc.lastSeenAt);
  }

  async getHeartbeat(
    tenantId: string,
    topichubUserId: string,
  ): Promise<any | null> {
    return this.heartbeatModel.findOne({ tenantId, topichubUserId }).exec();
  }
}
