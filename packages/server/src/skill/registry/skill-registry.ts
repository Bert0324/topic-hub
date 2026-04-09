import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ReturnModelType } from '@typegoose/typegoose';
import { SkillCategory } from '../../common/enums';
import { SkillRegistration } from '../entities/skill-registration.entity';
import { TenantSkillConfig } from '../entities/tenant-skill-config.entity';
import { TypeSkill } from '../interfaces/type-skill';
import { PlatformSkill } from '../interfaces/platform-skill';
import { AuthSkill } from '../interfaces/auth-skill';
import { AdapterSkill } from '../interfaces/adapter-skill';
import { SkillLoader } from './skill-loader';

type AnySkill = TypeSkill | PlatformSkill | AuthSkill | AdapterSkill;

interface RegisteredSkill {
  skill: AnySkill;
  registration: SkillRegistration;
}

@Injectable()
export class SkillRegistry implements OnModuleInit {
  private readonly logger = new Logger(SkillRegistry.name);
  private readonly skills = new Map<string, RegisteredSkill>();

  constructor(
    private readonly loader: SkillLoader,
    @InjectModel(SkillRegistration.name)
    private readonly registrationModel: ReturnModelType<
      typeof SkillRegistration
    >,
    @InjectModel(TenantSkillConfig.name)
    private readonly tenantConfigModel: ReturnModelType<
      typeof TenantSkillConfig
    >,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadAll();
  }

  register(skill: AnySkill, registration: SkillRegistration): void {
    this.skills.set(registration.name, { skill, registration });
    this.logger.log(
      `Registered skill: ${registration.name} [${registration.category}]`,
    );
  }

  unregister(name: string): void {
    this.skills.delete(name);
    this.logger.log(`Unregistered skill: ${name}`);
  }

  getByCategory(category: SkillCategory): RegisteredSkill[] {
    return [...this.skills.values()].filter(
      (s) => s.registration.category === category,
    );
  }

  getTypeSkillForType(topicType: string): TypeSkill | undefined {
    const found = [...this.skills.values()].find(
      (s) =>
        s.registration.category === SkillCategory.TYPE &&
        (s.registration.metadata as any)?.topicType === topicType,
    );
    return found?.skill as TypeSkill | undefined;
  }

  getPlatformSkills(): PlatformSkill[] {
    return this.getByCategory(SkillCategory.PLATFORM).map(
      (s) => s.skill as PlatformSkill,
    );
  }

  getAuthSkill(_tenantId: string): AuthSkill | undefined {
    const authSkills = this.getByCategory(SkillCategory.AUTH);
    return authSkills.length > 0
      ? (authSkills[0].skill as AuthSkill)
      : undefined;
  }

  async isTypeAvailable(
    topicType: string,
    tenantId: string,
  ): Promise<boolean> {
    const typeSkill = this.getTypeSkillForType(topicType);
    if (!typeSkill) return false;

    const config = await this.tenantConfigModel
      .findOne({ tenantId, skillName: typeSkill.manifest.name })
      .lean()
      .exec();

    return config?.enabled === true;
  }

  async loadAll(): Promise<void> {
    const manifests = this.loader.scanDirectory();
    this.logger.log(`Found ${manifests.length} skill(s) to load`);

    for (const manifest of manifests) {
      try {
        const skill = this.loader.loadSkill(manifest.mainPath);
        const skillManifest = skill.manifest;
        if (!skillManifest) {
          this.logger.warn(
            `Skill at ${manifest.mainPath} has no manifest, skipping`,
          );
          continue;
        }

        const category = this.resolveCategory(skill);

        const registration = await this.registrationModel
          .findOneAndUpdate(
            { name: skillManifest.name },
            {
              name: skillManifest.name,
              category,
              version: manifest.version,
              modulePath: manifest.mainPath,
              metadata: this.extractMetadata(skill, category),
            },
            { upsert: true, new: true },
          )
          .lean()
          .exec();

        this.register(skill, registration as unknown as SkillRegistration);
      } catch (err) {
        this.logger.error(`Failed to load skill: ${manifest.name}`, err);
      }
    }
  }

  async reload(): Promise<void> {
    this.skills.clear();
    await this.loadAll();
  }

  private resolveCategory(skill: AnySkill): SkillCategory {
    const manifest = skill.manifest as any;
    if ('topicType' in manifest) return SkillCategory.TYPE;
    if ('platform' in manifest) return SkillCategory.PLATFORM;
    if ('sourceSystem' in manifest) return SkillCategory.ADAPTER;
    if ('authorize' in skill) return SkillCategory.AUTH;
    return SkillCategory.TYPE;
  }

  private extractMetadata(
    skill: AnySkill,
    category: SkillCategory,
  ): Record<string, unknown> {
    const manifest = skill.manifest as any;
    switch (category) {
      case SkillCategory.TYPE:
        return { topicType: manifest.topicType };
      case SkillCategory.PLATFORM:
        return { platform: manifest.platform };
      case SkillCategory.ADAPTER:
        return { sourceSystem: manifest.sourceSystem };
      default:
        return {};
    }
  }
}
