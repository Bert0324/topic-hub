import crypto from 'node:crypto';
import { Model } from 'mongoose';
import type { TopicHubLogger } from '../common/logger';
import { generatePairingCode, PAIRING_CODE_TTL_MS } from './identity-types';

export interface ClaimResult {
  topichubUserId: string;
  platform: string;
  platformUserId: string;
}

export interface ResolvedPlatformUser {
  topichubUserId: string;
  claimToken: string;
}

export interface ResolvedClaimTokenUser {
  tenantId: string;
  topichubUserId: string;
}

export class IdentityService {
  constructor(
    private readonly bindingModel: Model<any>,
    private readonly pairingCodeModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async generatePairingCode(
    tenantId: string,
    platform: string,
    platformUserId: string,
    channel: string,
  ): Promise<string> {
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    await this.pairingCodeModel.create({
      tenantId,
      code,
      platform,
      platformUserId,
      channel,
      claimed: false,
      expiresAt,
    });

    this.logger.log(`Pairing code generated for ${platform}:${platformUserId} tenant=${tenantId}`);
    return code;
  }

  async claimPairingCode(
    tenantId: string,
    code: string,
    claimToken: string,
  ): Promise<ClaimResult | null> {
    const now = new Date();

    const pairingCode = await this.pairingCodeModel
      .findOneAndUpdate(
        {
          tenantId,
          code,
          claimed: false,
          expiresAt: { $gt: now },
        },
        { $set: { claimed: true } },
        { new: true },
      )
      .exec();

    if (!pairingCode) {
      this.logger.debug(`Pairing code claim failed: code=${code} tenant=${tenantId}`);
      return null;
    }

    const existingBinding = await this.bindingModel
      .findOne({ claimToken, active: true })
      .exec();

    const topichubUserId = existingBinding
      ? existingBinding.topichubUserId
      : `usr_${crypto.randomBytes(8).toString('hex')}`;

    await this.bindingModel
      .findOneAndUpdate(
        {
          tenantId,
          platform: pairingCode.platform,
          platformUserId: pairingCode.platformUserId,
        },
        {
          $set: {
            topichubUserId,
            claimToken,
            active: true,
          },
        },
        { upsert: true, new: true },
      )
      .exec();

    await this.pairingCodeModel
      .findOneAndUpdate(
        { _id: pairingCode._id },
        { $set: { claimedByUserId: topichubUserId } },
      )
      .exec();

    this.logger.log(
      `Pairing code claimed: code=${code} user=${topichubUserId} platform=${pairingCode.platform}`,
    );

    return {
      topichubUserId,
      platform: pairingCode.platform,
      platformUserId: pairingCode.platformUserId,
    };
  }

  async resolveUserByPlatform(
    tenantId: string,
    platform: string,
    platformUserId: string,
  ): Promise<ResolvedPlatformUser | undefined> {
    const binding = await this.bindingModel
      .findOne({ tenantId, platform, platformUserId, active: true })
      .exec();

    if (!binding) return undefined;

    return {
      topichubUserId: binding.topichubUserId,
      claimToken: binding.claimToken,
    };
  }

  async resolveUserByClaimToken(
    claimToken: string,
  ): Promise<ResolvedClaimTokenUser | undefined> {
    const binding = await this.bindingModel
      .findOne({ claimToken, active: true })
      .exec();

    if (!binding) return undefined;

    return {
      tenantId: binding.tenantId,
      topichubUserId: binding.topichubUserId,
    };
  }

  async deactivateBinding(
    tenantId: string,
    platform: string,
    platformUserId: string,
  ): Promise<boolean> {
    const result = await this.bindingModel
      .findOneAndUpdate(
        { tenantId, platform, platformUserId, active: true },
        { $set: { active: false } },
      )
      .exec();

    if (result) {
      this.logger.log(`Binding deactivated: ${platform}:${platformUserId} tenant=${tenantId}`);
    }

    return result != null;
  }

  async deactivateAllBindings(claimToken: string): Promise<number> {
    const result = await this.bindingModel
      .updateMany(
        { claimToken, active: true },
        { $set: { active: false } },
      )
      .exec();

    if (result.modifiedCount > 0) {
      this.logger.log(`Deactivated ${result.modifiedCount} binding(s) for claimToken`);
    }

    return result.modifiedCount;
  }

  async getBindingsForUser(
    tenantId: string,
    topichubUserId: string,
  ): Promise<any[]> {
    return this.bindingModel
      .find({ tenantId, topichubUserId, active: true })
      .exec();
  }
}
