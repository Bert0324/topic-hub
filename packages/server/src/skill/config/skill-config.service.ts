import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { TenantSkillConfig } from '../entities/tenant-skill-config.entity';
import { CryptoService } from '../../crypto/crypto.service';

const SECRET_FIELD_PREFIX = 'secret_';

@Injectable()
export class SkillConfigService {
  private readonly logger = new Logger(SkillConfigService.name);

  constructor(
    @InjectModel(TenantSkillConfig.name)
    private readonly configModel: ReturnModelType<typeof TenantSkillConfig>,
    private readonly crypto: CryptoService,
  ) {}

  async enableForTenant(tenantId: string, skillName: string): Promise<void> {
    await this.configModel
      .findOneAndUpdate(
        { tenantId, skillName },
        { enabled: true },
        { upsert: true, new: true },
      )
      .exec();
    this.logger.log(`Enabled skill ${skillName} for tenant ${tenantId}`);
  }

  async disableForTenant(tenantId: string, skillName: string): Promise<void> {
    await this.configModel
      .findOneAndUpdate(
        { tenantId, skillName },
        { enabled: false },
        { upsert: true, new: true },
      )
      .exec();
    this.logger.log(`Disabled skill ${skillName} for tenant ${tenantId}`);
  }

  async setConfig(
    tenantId: string,
    skillName: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const encrypted = this.encryptSecrets(config);
    await this.configModel
      .findOneAndUpdate(
        { tenantId, skillName },
        { config: encrypted },
        { upsert: true, new: true },
      )
      .exec();
  }

  async getConfig(
    tenantId: string,
    skillName: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.configModel
      .findOne({ tenantId, skillName })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Skill config not found');
    return this.decryptSecrets(doc.config);
  }

  async getMaskedConfig(
    tenantId: string,
    skillName: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.configModel
      .findOne({ tenantId, skillName })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Skill config not found');
    return this.maskSecrets(doc.config);
  }

  async isEnabledForTenant(
    tenantId: string,
    skillName: string,
  ): Promise<boolean> {
    const doc = await this.configModel
      .findOne({ tenantId, skillName })
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
