import { Injectable, Logger, NotFoundException, BadGatewayException, ForbiddenException } from '@nestjs/common';
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
import { TimelineActionType, SkillCategory } from '../common/enums';
import type { PlatformSkill } from '../skill/interfaces/platform-skill';
import type { PublishPayload } from '../skill/interfaces';

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

  async listSkills(
    options: {
      scope?: 'all' | 'public' | 'private';
      tenantId?: string;
    } = {},
  ) {
    const { scope = 'all', tenantId } = options;

    let filter: Record<string, unknown> = {};
    if (scope === 'public') {
      filter = { isPrivate: false };
    } else if (scope === 'private' && tenantId) {
      filter = { isPrivate: true, tenantId };
    } else if (scope === 'all' && tenantId) {
      filter = { $or: [{ isPrivate: false }, { tenantId }] };
    }

    return this.registrationModel.find(filter).lean().exec();
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

  async createGroup(params: {
    name: string;
    platform: string;
    memberIds?: string[];
    topicType?: string;
  }): Promise<{
    groupId: string;
    platform: string;
    name: string;
    inviteLink: string | null;
  }> {
    const platformSkills = this.skillRegistry.getByCategory(SkillCategory.PLATFORM);
    const match = platformSkills.find(
      (s) => (s.registration.metadata as any)?.platform === params.platform,
    );

    if (!match) {
      throw new NotFoundException(
        `No platform skill registered for platform: ${params.platform}`,
      );
    }

    const platformSkill = match.skill as PlatformSkill;
    if (!platformSkill.createGroup) {
      throw new NotFoundException(
        `Platform skill "${match.registration.name}" does not support group creation`,
      );
    }

    try {
      const result = await platformSkill.createGroup({
        tenantId: '',
        topicId: '',
        name: params.name,
        members: params.memberIds ?? [],
      });

      return {
        groupId: result.groupId,
        platform: params.platform,
        name: params.name,
        inviteLink: result.groupUrl ?? null,
      };
    } catch (err) {
      this.logger.error(`Platform API failed for ${params.platform}`, err);
      throw new BadGatewayException(
        `Platform API error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async publishSkills(
    payload: PublishPayload,
    requestingTenantId?: string,
  ): Promise<{
    published: Array<{ name: string; status: string }>;
    errors: Array<{ name: string; error: string }>;
  }> {
    const isPublic = payload.isPublic ?? false;

    if (isPublic) {
      const tenant = await this.tenantService.findById(requestingTenantId ?? payload.tenantId);
      if (!tenant || !tenant.isSuperAdmin) {
        throw new ForbiddenException('Only super-admins can publish public skills');
      }
    }

    const effectiveTenantId = isPublic ? null : payload.tenantId;
    const published: Array<{ name: string; status: string }> = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const skill of payload.skills) {
      try {
        const existing = await this.registrationModel
          .findOne({ name: skill.name, tenantId: effectiveTenantId })
          .lean()
          .exec();

        await this.registrationModel
          .findOneAndUpdate(
            { name: skill.name, tenantId: effectiveTenantId },
            {
              name: skill.name,
              category: skill.category,
              version: skill.version ?? '0.0.0',
              modulePath: isPublic
                ? `published://public/${skill.name}`
                : `published://${payload.tenantId}/${skill.name}`,
              metadata: skill.metadata ?? {},
              isPrivate: !isPublic,
              tenantId: effectiveTenantId,
              publishedContent: {
                manifest: skill.manifest,
                skillMdRaw: skill.skillMdRaw,
                entryPoint: skill.entryPoint,
                files: skill.files ?? {},
              },
            },
            { upsert: true, new: true },
          )
          .lean()
          .exec();

        await this.tenantConfigModel
          .findOneAndUpdate(
            { tenantId: payload.tenantId, skillName: skill.name },
            { tenantId: payload.tenantId, skillName: skill.name, enabled: true },
            { upsert: true },
          )
          .exec();

        published.push({
          name: skill.name,
          status: existing ? 'updated' : 'created',
        });
      } catch (err) {
        errors.push({ name: skill.name, error: String(err) });
      }
    }

    return { published, errors };
  }

  async reloadSkills() {
    await this.skillRegistry.reload();
    this.logger.log('Skills reloaded');
  }
}
