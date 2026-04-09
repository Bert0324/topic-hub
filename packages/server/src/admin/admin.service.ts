import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { SkillRegistry } from '../skill/registry/skill-registry';
import { SkillLoader } from '../skill/registry/skill-loader';
import { SkillConfigService } from '../skill/config/skill-config.service';
import { TenantService } from '../tenant/tenant.service';
import { SkillRegistration } from '../skill/entities/skill-registration.entity';
import { TenantSkillConfig } from '../skill/entities/tenant-skill-config.entity';
import { Topic } from '../core/entities/topic.entity';
import { TimelineEntry } from '../core/entities/timeline-entry.entity';
import { TimelineActionType } from '../common/enums';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly skillLoader: SkillLoader,
    private readonly skillConfigService: SkillConfigService,
    private readonly tenantService: TenantService,
    @InjectModel(SkillRegistration.name)
    private readonly registrationModel: ReturnModelType<typeof SkillRegistration>,
    @InjectModel(TenantSkillConfig.name)
    private readonly tenantConfigModel: ReturnModelType<typeof TenantSkillConfig>,
    @InjectModel(Topic.name)
    private readonly topicModel: ReturnModelType<typeof Topic>,
    @InjectModel(TimelineEntry.name)
    private readonly timelineModel: ReturnModelType<typeof TimelineEntry>,
  ) {}

  async installSkill(packagePath: string) {
    const skill = this.skillLoader.loadSkill(packagePath);
    const manifest = skill.manifest;
    if (!manifest) {
      throw new Error('Loaded module does not export a manifest');
    }

    const registration = await this.registrationModel
      .findOneAndUpdate(
        { name: manifest.name },
        {
          name: manifest.name,
          category: manifest.category ?? 'type',
          version: manifest.version ?? '0.0.0',
          modulePath: packagePath,
          metadata: manifest.metadata ?? {},
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    this.skillRegistry.register(
      skill,
      registration as unknown as SkillRegistration,
    );
    this.logger.log(`Installed skill: ${manifest.name}`);
    return registration;
  }

  async uninstallSkill(name: string) {
    this.skillRegistry.unregister(name);
    await this.registrationModel.deleteOne({ name });
    this.logger.log(`Uninstalled skill: ${name}`);
  }

  async listSkills() {
    return this.registrationModel.find().lean().exec();
  }

  async listTenantSkills(tenantId: string) {
    const skills = await this.registrationModel.find().lean().exec();
    const configs = await this.tenantConfigModel
      .find({ tenantId })
      .lean()
      .exec();

    const configMap = new Map(configs.map((c) => [c.skillName, c]));

    return skills.map((skill) => {
      const config = configMap.get(skill.name);
      return {
        ...skill,
        enabled: config?.enabled ?? false,
        config: config?.config ?? {},
      };
    });
  }

  async enableSkillForTenant(tenantId: string, skillName: string) {
    await this.skillConfigService.enableForTenant(tenantId, skillName);
  }

  async disableSkillForTenant(tenantId: string, skillName: string) {
    await this.skillConfigService.disableForTenant(tenantId, skillName);
  }

  async updateSkillConfig(
    tenantId: string,
    skillName: string,
    config: Record<string, unknown>,
  ) {
    await this.skillConfigService.setConfig(tenantId, skillName, config);
  }

  async getStats() {
    const [byType, byStatus, skillErrors24h] = await Promise.all([
      this.topicModel
        .aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }])
        .exec(),
      this.topicModel
        .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
        .exec(),
      this.timelineModel
        .countDocuments({
          actionType: TimelineActionType.SKILL_ERROR,
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        })
        .exec(),
    ]);

    return { topicsByType: byType, topicsByStatus: byStatus, skillErrors24h };
  }

  async getTenantStats(tenantId: string) {
    const [byType, byStatus, skillErrors24h] = await Promise.all([
      this.topicModel
        .aggregate([
          { $match: { tenantId } },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ])
        .exec(),
      this.topicModel
        .aggregate([
          { $match: { tenantId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.timelineModel
        .countDocuments({
          tenantId,
          actionType: TimelineActionType.SKILL_ERROR,
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        })
        .exec(),
    ]);

    return { topicsByType: byType, topicsByStatus: byStatus, skillErrors24h };
  }

  async reloadSkills() {
    await this.skillRegistry.reload();
    this.logger.log('Skills reloaded');
  }
}
