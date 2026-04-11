import { EventEmitter } from 'events';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { DispatchStatus } from '../common/enums';
import type { TopicHubLogger } from '../common/logger';

const CLAIM_TTL_MS = 5 * 60 * 1000;
const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;
const MAX_RETRY_COUNT = 3;

export interface DispatchMeta {
  targetUserId?: string;
  sourceChannel?: string;
  sourcePlatform?: string;
}

export interface CreateDispatchDto {
  topicId: string;
  eventType: string;
  skillName: string;
  enrichedPayload: any;
  targetUserId?: string;
  sourceChannel?: string;
  sourcePlatform?: string;
}

export class DispatchService {
  private readonly emitter = new EventEmitter();
  private expiryTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly dispatchModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) { }

  init(): void {
    this.expiryTimer = setInterval(
      () => this.releaseExpired().catch((err) => this.logger.error('Expiry check failed', String(err))),
      EXPIRY_CHECK_INTERVAL_MS,
    );
  }

  destroy(): void {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  onNewDispatch(listener: (dispatch: any) => void): void {
    this.emitter.on('newDispatch', listener);
  }

  offNewDispatch(listener: (dispatch: any) => void): void {
    this.emitter.off('newDispatch', listener);
  }

  async create(dto: CreateDispatchDto): Promise<any> {
    const dispatch = await this.dispatchModel.create({
      topicId: new mongoose.Types.ObjectId(dto.topicId),
      eventType: dto.eventType,
      skillName: dto.skillName,
      status: DispatchStatus.UNCLAIMED,
      retryCount: 0,
      enrichedPayload: dto.enrichedPayload,
      targetUserId: dto.targetUserId ?? null,
      sourceChannel: dto.sourceChannel ?? null,
      sourcePlatform: dto.sourcePlatform ?? null,
    });

    this.emitter.emit('newDispatch', dispatch);
    this.logger.log(
      `Dispatch created: ${dispatch._id} skill=${dto.skillName} topic=${dto.topicId}`,
    );

    return dispatch;
  }

  async findById(dispatchId: string): Promise<any | null> {
    return this.dispatchModel.findById(dispatchId).exec();
  }

  async findUnclaimed(
    options?: { limit?: number; since?: Date; targetUserId?: string },
  ): Promise<any[]> {
    const filter: Record<string, unknown> = {
      status: DispatchStatus.UNCLAIMED,
    };
    if (options?.since) {
      filter.createdAt = { $gt: options.since };
    }
    if (options?.targetUserId) {
      filter.$or = [
        { targetUserId: options.targetUserId },
        { targetUserId: null },
      ];
    }

    return this.dispatchModel
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(options?.limit ?? 20)
      .exec();
  }

  async findUnclaimedForUser(
    topichubUserId: string,
    options?: { limit?: number; since?: Date },
  ): Promise<any[]> {
    return this.findUnclaimed({
      ...options,
      targetUserId: topichubUserId,
    });
  }

  async claim(
    dispatchId: string,
    claimedBy: string,
    targetUserId?: string,
  ): Promise<any | null> {
    const claimExpiry = new Date(Date.now() + CLAIM_TTL_MS);

    const filter: Record<string, unknown> = {
      _id: dispatchId,
      status: DispatchStatus.UNCLAIMED,
    };
    if (targetUserId) {
      filter.$or = [
        { targetUserId },
        { targetUserId: null },
      ];
    }

    return this.dispatchModel
      .findOneAndUpdate(
        filter,
        {
          $set: {
            status: DispatchStatus.CLAIMED,
            claimedBy,
            claimExpiry,
          },
        },
        { new: true },
      )
      .exec();
  }

  async complete(
    dispatchId: string,
    result: { text: string; executorType: string; tokenUsage?: { input: number; output: number }; durationMs: number },
  ): Promise<any | null> {
    return this.dispatchModel
      .findOneAndUpdate(
        { _id: dispatchId, status: DispatchStatus.CLAIMED },
        {
          $set: {
            status: DispatchStatus.COMPLETED,
            result,
            completedAt: new Date(),
            claimExpiry: null,
          },
        },
        { new: true },
      )
      .exec();
  }

  async fail(
    dispatchId: string,
    error: string,
    retryable = false,
  ): Promise<any | null> {
    const dispatch = await this.dispatchModel.findById(dispatchId).exec();
    if (!dispatch || dispatch.status !== DispatchStatus.CLAIMED) return null;

    const shouldRetry =
      retryable && dispatch.retryCount < MAX_RETRY_COUNT;

    return this.dispatchModel
      .findOneAndUpdate(
        { _id: dispatchId },
        {
          $set: {
            status: shouldRetry
              ? DispatchStatus.UNCLAIMED
              : DispatchStatus.FAILED,
            error,
            claimedBy: shouldRetry ? null : dispatch.claimedBy,
            claimExpiry: null,
          },
          $inc: { retryCount: 1 },
        },
        { new: true },
      )
      .exec();
  }

  async suspend(dispatchId: string, reason: string): Promise<any | null> {
    return this.dispatchModel
      .findOneAndUpdate(
        { _id: dispatchId, status: { $in: [DispatchStatus.CLAIMED, DispatchStatus.UNCLAIMED] } },
        {
          $set: {
            status: DispatchStatus.SUSPENDED,
            error: reason,
            claimExpiry: null,
          },
        },
        { new: true },
      )
      .exec();
  }

  async releaseExpired(): Promise<number> {
    const now = new Date();

    const result = await this.dispatchModel
      .updateMany(
        {
          status: DispatchStatus.CLAIMED,
          claimExpiry: { $lt: now },
          retryCount: { $lt: MAX_RETRY_COUNT },
        },
        {
          $set: {
            status: DispatchStatus.UNCLAIMED,
            claimedBy: null,
            claimExpiry: null,
          },
          $inc: { retryCount: 1 },
        },
      )
      .exec();

    const released = result.modifiedCount;
    if (released > 0) {
      this.logger.warn(`Released ${released} expired dispatch claim(s)`);
    }

    await this.dispatchModel
      .updateMany(
        {
          status: DispatchStatus.CLAIMED,
          claimExpiry: { $lt: now },
          retryCount: { $gte: MAX_RETRY_COUNT },
        },
        {
          $set: {
            status: DispatchStatus.FAILED,
            error: 'Max retries exceeded',
            claimExpiry: null,
          },
        },
      )
      .exec();

    return released;
  }

  async findUnclaimedWithReminder(thresholdMs: number): Promise<any[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    return this.dispatchModel
      .find({
        status: DispatchStatus.UNCLAIMED,
        targetUserId: { $ne: null },
        sourceChannel: { $ne: null },
        sourcePlatform: { $ne: null },
        createdAt: { $lt: cutoff },
        reminderSentAt: null,
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async markReminderSent(dispatchId: string): Promise<void> {
    await this.dispatchModel
      .updateOne({ _id: dispatchId }, { $set: { reminderSentAt: new Date() } })
      .exec();
  }

  async countByStatus(): Promise<Record<DispatchStatus, number>> {
    const results = await this.dispatchModel
      .aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();

    const counts = {
      [DispatchStatus.UNCLAIMED]: 0,
      [DispatchStatus.CLAIMED]: 0,
      [DispatchStatus.COMPLETED]: 0,
      [DispatchStatus.FAILED]: 0,
      [DispatchStatus.SUSPENDED]: 0,
    };

    for (const r of results) {
      counts[r._id as DispatchStatus] = r.count;
    }

    return counts;
  }
}
