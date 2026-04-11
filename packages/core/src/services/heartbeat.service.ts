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
    topichubUserId: string,
    claimToken: string,
    force: boolean,
    executorMeta?: ExecutorHeartbeatMeta,
  ): Promise<RegisterExecutorResult> {
    const existing = await this.heartbeatModel
      .findOne({ topichubUserId })
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
      topichubUserId,
      claimToken,
      lastSeenAt: now,
    };
    if (executorMeta !== undefined) {
      $set.executorMeta = executorMeta;
    }

    await this.heartbeatModel
      .findOneAndUpdate(
        { topichubUserId },
        { $set },
        { upsert: true, new: true },
      )
      .exec();

    this.logger.log(
      `Executor heartbeat registered user=${topichubUserId} force=${force}`,
    );

    return { conflict: false };
  }

  async heartbeat(
    topichubUserId: string,
  ): Promise<{ pendingDispatches: number }> {
    await this.heartbeatModel
      .findOneAndUpdate(
        { topichubUserId },
        { $set: { lastSeenAt: new Date() } },
      )
      .exec();

    return { pendingDispatches: 0 };
  }

  async deregister(topichubUserId: string): Promise<void> {
    await this.heartbeatModel.deleteOne({ topichubUserId }).exec();
  }

  async isAvailable(topichubUserId: string): Promise<boolean> {
    const doc = await this.heartbeatModel
      .findOne({ topichubUserId })
      .exec();
    if (!doc) return false;
    return this.isFresh(doc.lastSeenAt);
  }

  async isBoundExecutorSessionLive(
    topichubUserId: string,
    boundExecutorToken: string,
  ): Promise<boolean> {
    const doc = await this.heartbeatModel
      .findOne({ topichubUserId })
      .exec();
    if (!doc) return false;
    return (
      this.isFresh(doc.lastSeenAt) &&
      typeof doc.claimToken === 'string' &&
      doc.claimToken === boundExecutorToken
    );
  }

  async getHeartbeat(
    topichubUserId: string,
  ): Promise<any | null> {
    return this.heartbeatModel.findOne({ topichubUserId }).exec();
  }
}
