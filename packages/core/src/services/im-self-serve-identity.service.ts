import type { Model } from 'mongoose';
import type { TopicHubLogger } from '../common/logger';
import { ConflictError } from '../common/errors';
import { safeCreate } from '../common/safe-create';
import { generateIdentityToken } from '../common/token-utils';
import { generateImSelfServeUniqueId } from '../identity/generate-im-self-serve-unique-id';
import { IDENTITY_STATUS } from '../identity/identity-types';

export interface ImSelfServeIdentitySnapshot {
  /** Mongo identity id */
  id: string;
  uniqueId: string;
  displayName: string;
  token: string;
}

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export class ImSelfServeIdentityService {
  constructor(
    private readonly identityModel: Model<any>,
    private readonly linkModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  /**
   * Create a new Identity + ImIdentityLink for this IM account.
   * @param displayName IM display name when provided by relay; otherwise caller may pass user id.
   */
  async createFromIm(params: {
    platform: string;
    platformUserId: string;
    displayName: string;
  }): Promise<ImSelfServeIdentitySnapshot> {
    const platform = params.platform.trim();
    const platformUserId = params.platformUserId.trim();
    const displayName = params.displayName.trim() || platformUserId;

    const existing = await this.linkModel.findOne({ platform, platformUserId }).exec();
    if (existing) {
      throw new ConflictError(
        'This IM account is already registered. Use `/id me` to see your id, name, and token.',
      );
    }

    const uniqueId = generateImSelfServeUniqueId();
    const token = generateIdentityToken();

    let createdIdentityId: string | null = null;
    try {
      const created = await safeCreate(this.identityModel, {
        uniqueId,
        displayName,
        token,
        isSuperAdmin: false,
        status: IDENTITY_STATUS.ACTIVE,
      });
      const idStr = created?._id?.toString();
      if (!idStr) {
        throw new Error('Identity create returned no _id');
      }
      createdIdentityId = idStr;

      await safeCreate(this.linkModel, {
        platform,
        platformUserId,
        identityId: idStr,
      });

      this.logger.log(`IM self-serve identity created: platform=${platform} identityId=${idStr}`);

      return {
        id: idStr,
        uniqueId,
        displayName,
        token,
      };
    } catch (err) {
      if (createdIdentityId) {
        await this.identityModel.deleteOne({ _id: createdIdentityId }).exec();
      }
      if (isMongoDuplicateKey(err)) {
        throw new ConflictError(
          'This IM account is already registered. Use `/id me` to see your id, name, and token.',
        );
      }
      throw err;
    }
  }

  async getMeForIm(params: {
    platform: string;
    platformUserId: string;
  }): Promise<ImSelfServeIdentitySnapshot | null> {
    const platform = params.platform.trim();
    const platformUserId = params.platformUserId.trim();

    const link = await this.linkModel.findOne({ platform, platformUserId }).exec();
    if (!link) return null;

    const identity = await this.identityModel.findById(link.identityId).exec();
    if (!identity) {
      this.logger.warn(`ImIdentityLink orphan: platform=${platform} missing identity ${link.identityId}`);
      return null;
    }

    return this.toSnapshot(identity);
  }

  async getByIdentityId(identityId: string): Promise<ImSelfServeIdentitySnapshot | null> {
    const id = identityId.trim();
    if (!id) return null;

    const identity = await this.identityModel.findById(id).exec();
    if (!identity) {
      this.logger.warn(`Identity not found for /id me snapshot lookup: identityId=${id}`);
      return null;
    }

    return this.toSnapshot(identity);
  }

  private toSnapshot(identity: any): ImSelfServeIdentitySnapshot {
    return {
      id: identity._id.toString(),
      uniqueId: identity.uniqueId,
      displayName: identity.displayName,
      token: identity.token,
    };
  }
}
