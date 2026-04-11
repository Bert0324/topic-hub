import { Model } from 'mongoose';
import { NotFoundError } from '../../common/errors';
import { CryptoService } from '../../services/crypto.service';
import type { TopicHubLogger } from '../../common/logger';

const SECRET_FIELD_PREFIX = 'secret_';

export class SkillConfigService {
  constructor(
    private readonly configModel: Model<any>,
    private readonly crypto: CryptoService,
    private readonly logger: TopicHubLogger,
  ) {}

  async enableForTenant(skillName: string): Promise<void> {
    await this.configModel
      .findOneAndUpdate(
        { skillName },
        { enabled: true },
        { upsert: true, new: true },
      )
      .exec();
    this.logger.log(`Enabled skill ${skillName}`);
  }

  async disableForTenant(skillName: string): Promise<void> {
    await this.configModel
      .findOneAndUpdate(
        { skillName },
        { enabled: false },
        { upsert: true, new: true },
      )
      .exec();
    this.logger.log(`Disabled skill ${skillName}`);
  }

  async setConfig(
    skillName: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const encrypted = this.encryptSecrets(config);
    await this.configModel
      .findOneAndUpdate(
        { skillName },
        { config: encrypted },
        { upsert: true, new: true },
      )
      .exec();
  }

  async getConfig(
    skillName: string,
  ): Promise<Record<string, unknown>> {
    const doc: any = await this.configModel
      .findOne({ skillName })
      .lean()
      .exec();
    if (!doc) throw new NotFoundError('Skill config not found');
    return this.decryptSecrets(doc.config);
  }

  async getMaskedConfig(
    skillName: string,
  ): Promise<Record<string, unknown>> {
    const doc: any = await this.configModel
      .findOne({ skillName })
      .lean()
      .exec();
    if (!doc) throw new NotFoundError('Skill config not found');
    return this.maskSecrets(doc.config);
  }

  async isEnabledForTenant(
    skillName: string,
  ): Promise<boolean> {
    const doc: any = await this.configModel
      .findOne({ skillName })
      .lean()
      .exec();
    return doc?.enabled === true;
  }

  private encryptSecrets(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith(SECRET_FIELD_PREFIX) && typeof value === 'string') {
        result[key] = this.crypto.encrypt(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private decryptSecrets(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith(SECRET_FIELD_PREFIX) && typeof value === 'string') {
        try {
          result[key] = this.crypto.decrypt(value);
        } catch {
          this.logger.warn(`Failed to decrypt field: ${key}`);
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private maskSecrets(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith(SECRET_FIELD_PREFIX)) {
        result[key] = '***';
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
