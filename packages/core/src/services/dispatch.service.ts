import { EventEmitter } from 'events';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import { DispatchStatus } from '../common/enums';
import type { TopicHubLogger } from '../common/logger';

/** Minimum configurable claim TTL (ms). */
const MIN_DISPATCH_CLAIM_TTL_MS = 60_000;
/** Default 1h — previously 5m, which released long-running agent tasks before `complete`, so IM never got results. */
const DEFAULT_DISPATCH_CLAIM_TTL_MS = 60 * 60 * 1000;

export function resolveDispatchClaimTtlMs(): number {
  const raw =
    typeof process !== 'undefined' ? process.env.TOPICHUB_DISPATCH_CLAIM_TTL_MS : undefined;
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10);
    if (!Number.isNaN(n) && n >= MIN_DISPATCH_CLAIM_TTL_MS) {
      return n;
    }
  }
  return DEFAULT_DISPATCH_CLAIM_TTL_MS;
}

const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000;
const MAX_RETRY_COUNT = 3;

export interface DispatchMeta {
  targetUserId?: string;
  /** Same value as IM binding claimToken / pairing executorClaimToken — routes to one serve session. */
  targetExecutorToken?: string;
  sourceChannel?: string;
  sourcePlatform?: string;
}

export interface CreateDispatchDto {
  topicId: string;
  eventType: string;
  skillName: string;
  enrichedPayload: any;
  targetUserId?: string;
  targetExecutorToken?: string;
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

  /**
   * Persists a dispatch. **`targetExecutorToken`**, **`targetUserId`**, **`sourcePlatform`**, and
   * **`sourceChannel`** MUST be supplied only from trusted server context (webhook `dispatchMeta` /
   * admin pipelines) — never copy them from end-user message bodies. User content lives under
   * `enrichedPayload.event.payload` only.
   */
  async create(dto: CreateDispatchDto): Promise<any> {
    const dispatch = await this.dispatchModel.create({
      topicId: new mongoose.Types.ObjectId(dto.topicId),
      eventType: dto.eventType,
      skillName: dto.skillName,
      status: DispatchStatus.UNCLAIMED,
      retryCount: 0,
      enrichedPayload: dto.enrichedPayload,
      targetUserId: dto.targetUserId ?? null,
      targetExecutorToken: dto.targetExecutorToken ?? null,
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

  /** Running (claimed) dispatches for a topic and executor, oldest first. */
  async findClaimedByTopicExecutor(
    topicId: string,
    executorToken: string,
    limit = 50,
  ): Promise<any[]> {
    const oid = new mongoose.Types.ObjectId(topicId);
    return this.dispatchModel
      .find({
        topicId: oid,
        targetExecutorToken: executorToken,
        status: DispatchStatus.CLAIMED,
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .select('_id skillName createdAt')
      .lean()
      .exec();
  }

  /** Executor-scoped status read for CLI queue / polling. */
  async findByIdForExecutor(
    dispatchId: string,
    executorToken: string,
  ): Promise<{ id: string; status: DispatchStatus; topicId: string } | null> {
    if (!mongoose.isValidObjectId(dispatchId)) {
      return null;
    }
    const doc = (await this.dispatchModel
      .findOne({
        _id: dispatchId,
        targetExecutorToken: executorToken,
      })
      .select('_id status topicId')
      .lean()
      .exec()) as { _id: unknown; status: string; topicId: unknown } | null;
    if (!doc) return null;
    return {
      id: String(doc._id),
      status: doc.status as DispatchStatus,
      topicId: String(doc.topicId),
    };
  }

  async findUnclaimed(
    options?: { limit?: number; since?: Date; executorToken?: string },
  ): Promise<any[]> {
    const filter: Record<string, unknown> = {
      status: DispatchStatus.UNCLAIMED,
    };
    if (options?.since) {
      filter.createdAt = { $gt: options.since };
    }
    if (options?.executorToken) {
      filter.targetExecutorToken = options.executorToken;
    } else {
      // No unscoped listing: executor clients must always pass executorToken.
      return [];
    }

    return this.dispatchModel
      .find(filter)
      .sort({ createdAt: 1 })
      .limit(options?.limit ?? 20)
      .exec();
  }

  async claim(
    dispatchId: string,
    claimedBy: string,
    executorToken: string,
  ): Promise<any | null> {
    const claimExpiry = new Date(Date.now() + resolveDispatchClaimTtlMs());

    const filter: Record<string, unknown> = {
      _id: dispatchId,
      status: DispatchStatus.UNCLAIMED,
      targetExecutorToken: executorToken,
    };

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

  /**
   * Extends `claimExpiry` while the dispatch is still CLAIMED for this executor.
   * Used by `serve` so long-running agents are not released mid-flight.
   */
  async renewClaim(dispatchId: string, executorToken: string): Promise<boolean> {
    const claimExpiry = new Date(Date.now() + resolveDispatchClaimTtlMs());
    const updated = await this.dispatchModel
      .findOneAndUpdate(
        {
          _id: dispatchId,
          status: DispatchStatus.CLAIMED,
          targetExecutorToken: executorToken,
        },
        { $set: { claimExpiry } },
        { new: true },
      )
      .exec();
    return updated != null;
  }

  async complete(
    dispatchId: string,
    result: { text: string; executorType: string; tokenUsage?: { input: number; output: number }; durationMs: number },
    executorToken: string,
  ): Promise<any | null> {
    return this.dispatchModel
      .findOneAndUpdate(
        {
          _id: dispatchId,
          status: DispatchStatus.CLAIMED,
          targetExecutorToken: executorToken,
        },
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
    retryable: boolean,
    executorToken: string,
  ): Promise<any | null> {
    const dispatch = await this.dispatchModel
      .findOne({
        _id: dispatchId,
        status: DispatchStatus.CLAIMED,
        targetExecutorToken: executorToken,
      })
      .exec();
    if (!dispatch) return null;

    const shouldRetry =
      retryable && dispatch.retryCount < MAX_RETRY_COUNT;

    return this.dispatchModel
      .findOneAndUpdate(
        {
          _id: dispatchId,
          status: DispatchStatus.CLAIMED,
          targetExecutorToken: executorToken,
        },
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
        targetExecutorToken: { $ne: null },
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
