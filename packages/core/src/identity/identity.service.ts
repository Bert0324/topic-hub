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
  topichubUserId: string;
}

export class IdentityService {
  constructor(
    private readonly bindingModel: Model<any>,
    private readonly pairingCodeModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  async generatePairingCode(
    platform: string,
    platformUserId: string,
    channel: string,
  ): Promise<string> {
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

    await this.pairingCodeModel.create({
      code,
      platform,
      platformUserId,
      channel,
      claimed: false,
      expiresAt,
    });

    this.logger.log(`Pairing code generated for ${platform}:${platformUserId}`);
    return code;
  }

  async claimPairingCode(
    code: string,
    claimToken: string,
  ): Promise<ClaimResult | null> {
    const now = new Date();

    const pairingCode = await this.pairingCodeModel
      .findOneAndUpdate(
        {
          code,
          claimed: false,
          expiresAt: { $gt: now },
        },
        { $set: { claimed: true } },
        { new: true },
      )
      .exec();

    if (!pairingCode) {
      this.logger.debug(`Pairing code claim failed: code=${code}`);
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
    platform: string,
    platformUserId: string,
  ): Promise<ResolvedPlatformUser | undefined> {
    const binding = await this.bindingModel
      .findOne({ platform, platformUserId, active: true })
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
      topichubUserId: binding.topichubUserId,
    };
  }

  async deactivateBinding(
    platform: string,
    platformUserId: string,
  ): Promise<boolean> {
    const result = await this.bindingModel
      .findOneAndUpdate(
        { platform, platformUserId, active: true },
        { $set: { active: false } },
      )
      .exec();

    if (result) {
      this.logger.log(`Binding deactivated: ${platform}:${platformUserId}`);
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
    topichubUserId: string,
  ): Promise<any[]> {
    return this.bindingModel
      .find({ topichubUserId, active: true })
      .exec();
  }
}
