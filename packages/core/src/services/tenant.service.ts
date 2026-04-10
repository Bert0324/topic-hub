import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { CryptoService } from './crypto.service';
import type { TopicHubLogger } from '../common/logger';

export class TenantService {
  constructor(
    private readonly tenantModel: Model<any>,
    private readonly crypto: CryptoService,
    private readonly logger: TopicHubLogger,
  ) {}

  async create(name: string, opts?: { isSuperAdmin?: boolean }) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const rawApiKey = randomBytes(32).toString('hex');
    const apiKey = this.crypto.encrypt(rawApiKey);
    const adminToken = randomBytes(48).toString('hex');
    const adminTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    );

    let isSuperAdmin = opts?.isSuperAdmin ?? false;
    if (!isSuperAdmin) {
      const count = await this.tenantModel.countDocuments().exec();
      if (count === 0) {
        isSuperAdmin = true;
        this.logger.log(`First tenant "${name}" — auto-promoting to super admin`);
      }
    }

    const tenant = await this.tenantModel.create({
      name,
      slug,
      apiKey,
      adminToken,
      adminTokenExpiresAt,
      isSuperAdmin,
    });

    return { tenant, rawApiKey, adminToken };
  }

  async findById(id: string) {
    return this.tenantModel.findById(id).exec();
  }

  async findAll() {
    return this.tenantModel.find().exec();
  }

  async findBySlug(slug: string) {
    return this.tenantModel.findOne({ slug }).exec();
  }

  async findByApiKey(encryptedKey: string) {
    return this.tenantModel.findOne({ apiKey: encryptedKey }).exec();
  }

  async findByAdminToken(token: string) {
    return this.tenantModel.findOne({ adminToken: token }).exec();
  }

  async validateToken(token: string): Promise<any | null> {
    const tenant = await this.findByAdminToken(token);
    if (!tenant) return null;
    if (tenant.adminTokenExpiresAt < new Date()) return null;
    return tenant;
  }

  async regenerateToken(tenantId: string) {
    const adminToken = randomBytes(48).toString('hex');
    const adminTokenExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    );

    const tenant = await this.tenantModel
      .findByIdAndUpdate(
        tenantId,
        { adminToken, adminTokenExpiresAt },
        { new: true },
      )
      .exec();

    return { tenant, adminToken };
  }

  async findByRawApiKey(rawApiKey: string) {
    const docs = await this.tenantModel.find().exec();
    for (const doc of docs) {
      try {
        const decrypted = this.crypto.decrypt(doc.apiKey);
        if (decrypted === rawApiKey) return doc;
      } catch {
        continue;
      }
    }
    return null;
  }
}
