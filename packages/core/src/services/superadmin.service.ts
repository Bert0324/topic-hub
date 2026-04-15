import { Model } from 'mongoose';
import type { TopicHubLogger } from '../common/logger';
import { ConflictError, NotFoundError, UnauthorizedError } from '../common/errors';
import { safeCreate, safeSave } from '../common/safe-create';
import {
  generateSuperadminToken,
  generateIdentityToken,
  generateExecutorToken,
} from '../common/token-utils';
import type { CreateIdentityInput } from '../identity/identity-types';
import { IDENTITY_STATUS } from '../identity/identity-types';
import { EXECUTOR_STATUS } from '../identity/executor-types';

export interface InitResult {
  superadminToken: string;
  uniqueId: string;
  displayName: string;
}

export interface CreateIdentityResult {
  id: string;
  uniqueId: string;
  displayName: string;
  token: string;
}

export class SuperadminService {
  constructor(
    private readonly identityModel: Model<any>,
    private readonly executorModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async init(): Promise<InitResult> {
    const existing = await this.identityModel.findOne({ isSuperAdmin: true }).exec();
    if (existing) {
      throw new ConflictError('System already initialized');
    }

    const token = generateSuperadminToken();
    const identity = await safeCreate(this.identityModel, {
      uniqueId: 'superadmin',
      displayName: 'Super Admin',
      token,
      isSuperAdmin: true,
      status: IDENTITY_STATUS.ACTIVE,
    });

    this.logger.log(`System initialized — superadmin created (id=${identity._id})`);

    return {
      superadminToken: token,
      uniqueId: 'superadmin',
      displayName: 'Super Admin',
    };
  }

  async isInitialized(): Promise<boolean> {
    const count = await this.identityModel.countDocuments({ isSuperAdmin: true }).exec();
    return count > 0;
  }

  async validateSuperadmin(token: string): Promise<{ identityId: string }> {
    const identity = await this.identityModel.findOne({
      token,
      isSuperAdmin: true,
      status: IDENTITY_STATUS.ACTIVE,
    }).exec();
    if (!identity) {
      throw new UnauthorizedError('Invalid or missing superadmin token');
    }
    return { identityId: identity._id.toString() };
  }

  async createIdentity(input: CreateIdentityInput): Promise<CreateIdentityResult> {
    const existing = await this.identityModel.findOne({ uniqueId: input.uniqueId }).exec();
    if (existing) {
      throw new ConflictError(`Identity with uniqueId '${input.uniqueId}' already exists`);
    }

    const token = generateIdentityToken();
    const identity = await safeCreate(this.identityModel, {
      uniqueId: input.uniqueId,
      displayName: input.displayName,
      token,
      isSuperAdmin: false,
      status: IDENTITY_STATUS.ACTIVE,
    });

    this.logger.log(`Identity created: ${input.uniqueId} (id=${identity._id})`);

    return {
      id: identity._id.toString(),
      uniqueId: input.uniqueId,
      displayName: input.displayName,
      token,
    };
  }

  async listIdentities(): Promise<any[]> {
    const identities = await this.identityModel
      .find()
      .select('-token')
      .sort({ createdAt: 1 })
      .exec();

    const result = [];
    for (const identity of identities) {
      const executorCount = await this.executorModel.countDocuments({
        identityId: identity._id.toString(),
        status: EXECUTOR_STATUS.ACTIVE,
      }).exec();
      result.push({
        id: identity._id.toString(),
        uniqueId: identity.uniqueId,
        displayName: identity.displayName,
        isSuperAdmin: identity.isSuperAdmin,
        status: identity.status,
        executorCount,
        createdAt: identity.createdAt,
      });
    }

    return result;
  }

  async revokeIdentity(identityId: string): Promise<{ executorsRevoked: number }> {
    const identity = await this.identityModel.findById(identityId).exec();
    if (!identity) {
      throw new NotFoundError('Identity not found');
    }
    if (identity.isSuperAdmin) {
      throw new ConflictError('Cannot revoke superadmin identity');
    }

    identity.status = IDENTITY_STATUS.REVOKED;
    await safeSave(identity);

    const result = await this.executorModel.updateMany(
      { identityId, status: EXECUTOR_STATUS.ACTIVE },
      { $set: { status: EXECUTOR_STATUS.REVOKED } },
    ).exec();

    this.logger.log(`Identity revoked: ${identity.uniqueId} (executors=${result.modifiedCount})`);

    return { executorsRevoked: result.modifiedCount };
  }

  async regenerateToken(identityId: string): Promise<{ token: string; executorsRevoked: number }> {
    const identity = await this.identityModel.findById(identityId).exec();
    if (!identity) {
      throw new NotFoundError('Identity not found');
    }

    const newToken = identity.isSuperAdmin
      ? generateSuperadminToken()
      : generateIdentityToken();

    identity.token = newToken;
    await safeSave(identity);

    const result = await this.executorModel.updateMany(
      { identityId, status: EXECUTOR_STATUS.ACTIVE },
      { $set: { status: EXECUTOR_STATUS.REVOKED } },
    ).exec();

    this.logger.log(`Token regenerated for ${identity.uniqueId} (executors revoked=${result.modifiedCount})`);

    return { token: newToken, executorsRevoked: result.modifiedCount };
  }

  async registerExecutor(
    identityToken: string,
    executorMeta?: { agentType: string; maxConcurrentAgents: number; hostname: string; pid: number },
  ): Promise<{ executorToken: string; identityId: string; identityUniqueId: string }> {
    const identity = await this.identityModel.findOne({
      token: identityToken,
      status: IDENTITY_STATUS.ACTIVE,
    }).exec();
    if (!identity) {
      throw new UnauthorizedError('Invalid or revoked identity token');
    }

    const idStr = identity._id.toString();
    const revoked = await this.executorModel
      .updateMany(
        { identityId: idStr, status: EXECUTOR_STATUS.ACTIVE },
        { $set: { status: EXECUTOR_STATUS.REVOKED } },
      )
      .exec();
    if (revoked.modifiedCount > 0) {
      this.logger.log(
        `Revoked ${revoked.modifiedCount} prior executor session(s) for identity ${identity.uniqueId}`,
      );
    }

    const executorToken = generateExecutorToken();
    await safeCreate(this.executorModel, {
      identityId: idStr,
      executorToken,
      status: EXECUTOR_STATUS.ACTIVE,
      lastSeenAt: new Date(),
      executorMeta,
    });

    this.logger.log(`Executor registered for ${identity.uniqueId} (token=${executorToken.slice(0, 12)}...)`);

    return {
      executorToken,
      identityId: idStr,
      identityUniqueId: identity.uniqueId,
    };
  }

  async revokeExecutor(executorToken: string): Promise<void> {
    const result = await this.executorModel.findOneAndUpdate(
      { executorToken, status: EXECUTOR_STATUS.ACTIVE },
      { $set: { status: EXECUTOR_STATUS.REVOKED } },
    ).exec();
    if (!result) {
      throw new NotFoundError('Executor token not found');
    }
    this.logger.log(`Executor revoked: ${executorToken.slice(0, 12)}...`);
  }

  async listExecutors(): Promise<any[]> {
    const executors = await this.executorModel
      .find({ status: EXECUTOR_STATUS.ACTIVE })
      .sort({ lastSeenAt: -1 })
      .exec();

    const result = [];
    for (const executor of executors) {
      const identity = await this.identityModel.findById(executor.identityId).exec();
      result.push({
        executorToken: executor.executorToken.slice(0, 12) + '...',
        identityId: executor.identityId,
        identityUniqueId: identity?.uniqueId ?? 'unknown',
        status: executor.status,
        lastSeenAt: executor.lastSeenAt,
        executorMeta: executor.executorMeta,
      });
    }

    return result;
  }

  async resolveExecutorToken(executorToken: string): Promise<{
    identityId: string;
    executorToken: string;
  } | null> {
    const executor = await this.executorModel.findOne({
      executorToken,
      status: EXECUTOR_STATUS.ACTIVE,
    }).exec();
    if (!executor) return null;
    return {
      identityId: executor.identityId,
      executorToken: executor.executorToken,
    };
  }

  async resolveIdentityToken(identityToken: string): Promise<{
    identityId: string;
    isSuperAdmin: boolean;
  } | null> {
    const identity = await this.identityModel.findOne({
      token: identityToken,
      status: IDENTITY_STATUS.ACTIVE,
    }).exec();
    if (!identity) return null;
    return {
      identityId: identity._id.toString(),
      isSuperAdmin: identity.isSuperAdmin,
    };
  }
}
