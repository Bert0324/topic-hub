import { Model } from 'mongoose';
import { SkillCategory } from '../../common/enums';
import { TypeSkill } from '../interfaces/type-skill';
import { AdapterSkill } from '../interfaces/adapter-skill';
import { ParsedSkillMd } from '../interfaces/skill-md';
import { SkillLoader } from './skill-loader';
import { SkillMdParser } from './skill-md-parser';
import { createMdOnlyTypeSkill } from './md-only-skill';
import type { TopicHubLogger } from '../../common/logger';
import type { SkillRegistryPort } from '../../command/command-router';

type AnySkill = TypeSkill | AdapterSkill;

export interface RegisteredSkill {
  skill: AnySkill;
  registration: any;
}

export class SkillRegistry implements SkillRegistryPort {
  private readonly skills = new Map<string, RegisteredSkill>();
  private readonly skillMdCache = new Map<string, ParsedSkillMd>();

  constructor(
    private readonly loader: SkillLoader,
    private readonly skillMdParser: SkillMdParser,
    private readonly registrationModel: Model<any>,
    private readonly tenantConfigModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  register(skill: AnySkill, registration: any): void {
    this.skills.set(registration.name, { skill, registration });
    this.logger.log(
      `Registered skill: ${registration.name} [${registration.category}]`,
    );
  }

  unregister(name: string): void {
    this.skills.delete(name);
    this.logger.log(`Unregistered skill: ${name}`);
  }

  resolve(name: string): RegisteredSkill | undefined {
    return this.skills.get(name);
  }

  getByCategory(category: SkillCategory): RegisteredSkill[] {
    return [...this.skills.values()].filter(
      (s) => s.registration.category === category,
    );
  }

  getTypeSkillForType(topicType: string): TypeSkill | undefined {
    const match = [...this.skills.values()].find(
      (s) =>
        s.registration.category === SkillCategory.TYPE &&
        (s.registration.metadata as any)?.topicType === topicType,
    );
    return match?.skill as TypeSkill | undefined;
  }

  async isTypeAvailable(topicType: string): Promise<boolean> {
    const typeSkill = this.getTypeSkillForType(topicType);
    if (!typeSkill) return false;

    const config = await this.tenantConfigModel
      .findOne({ skillName: typeSkill.manifest.name })
      .lean()
      .exec();

    return (config as any)?.enabled === true;
  }

  getSkillMd(skillName: string): ParsedSkillMd | null {
    return this.skillMdCache.get(skillName) ?? null;
  }

  async loadAll(): Promise<void> {
    const manifests = this.loader.scanDirectory();
    this.logger.log(`Found ${manifests.length} skill(s) to load`);

    for (const manifest of manifests) {
      try {
        if (manifest.mdOnly) {
          await this.loadMdOnlySkill(manifest);
        } else {
          await this.loadCodeSkill(manifest);
        }
      } catch (err) {
        this.logger.error(`Failed to load skill: ${manifest.name}`, String(err));
      }
    }
  }

  private async loadMdOnlySkill(manifest: import('./skill-loader').SkillManifestInfo): Promise<void> {
    const parsedMd = this.skillMdParser.parse(manifest.dir);
    if (!parsedMd) {
      this.logger.warn(`Md-only skill ${manifest.name} has no valid SKILL.md, skipping`);
      return;
    }

    const frontmatter = parsedMd.frontmatter;
    const category = this.resolveCategoryFromFrontmatter(frontmatter);
    const skill = createMdOnlyTypeSkill(manifest.name, frontmatter);

    this.skillMdCache.set(manifest.name, parsedMd);
    const skillMdData = {
      name: frontmatter.name,
      description: frontmatter.description,
      systemPrompt: parsedMd.systemPrompt,
      eventPrompts: Object.fromEntries(parsedMd.eventPrompts),
      hasAiInstructions: parsedMd.hasAiInstructions,
    };

    const metadata = this.extractMetadata(skill, category);
    const registration = await this.registrationModel
      .findOneAndUpdate(
        { name: manifest.name },
        {
          name: manifest.name,
          category,
          version: manifest.version,
          modulePath: `md-only://${manifest.name}`,
          metadata,
          skillMd: skillMdData,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    this.register(skill, registration);
    this.logger.log(
      `Md-only skill ${manifest.name} loaded [${category}] (AI instructions: ${parsedMd.hasAiInstructions})`,
    );
  }

  private async loadCodeSkill(manifest: import('./skill-loader').SkillManifestInfo): Promise<void> {
    const skill = this.loader.loadSkill(manifest.mainPath!);
    const skillManifest = skill.manifest;
    if (!skillManifest) {
      this.logger.warn(
        `Skill at ${manifest.mainPath} has no manifest, skipping`,
      );
      return;
    }

    const category = this.resolveCategory(skill);

    const parsedMd = this.skillMdParser.parse(manifest.dir);
    let skillMdData = null;
    if (parsedMd) {
      this.skillMdCache.set(skillManifest.name, parsedMd);
      skillMdData = {
        name: parsedMd.frontmatter.name,
        description: parsedMd.frontmatter.description,
        systemPrompt: parsedMd.systemPrompt,
        eventPrompts: Object.fromEntries(parsedMd.eventPrompts),
        hasAiInstructions: parsedMd.hasAiInstructions,
      };
      this.logger.log(
        `Skill ${skillManifest.name} loaded with SKILL.md (AI instructions: ${parsedMd.hasAiInstructions})`,
      );
    }

    const registration = await this.registrationModel
      .findOneAndUpdate(
        { name: skillManifest.name },
        {
          name: skillManifest.name,
          category,
          version: manifest.version,
          modulePath: manifest.mainPath,
          metadata: this.extractMetadata(skill, category),
          skillMd: skillMdData,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    this.register(skill, registration);
    this.initSkill(skill);
  }

  async registerBuiltinMd(name: string, mdContent: string, version: string): Promise<void> {
    const parsedMd = this.skillMdParser.parseContent(mdContent, `builtin://${name}`);
    if (!parsedMd) {
      this.logger.warn(`Built-in skill ${name} has invalid SKILL.md content, skipping`);
      return;
    }

    const frontmatter = parsedMd.frontmatter;
    const category = this.resolveCategoryFromFrontmatter(frontmatter);
    const skill = createMdOnlyTypeSkill(name, frontmatter);

    this.skillMdCache.set(name, parsedMd);
    const skillMdData = {
      name: frontmatter.name,
      description: frontmatter.description,
      systemPrompt: parsedMd.systemPrompt,
      eventPrompts: Object.fromEntries(parsedMd.eventPrompts),
      hasAiInstructions: parsedMd.hasAiInstructions,
    };

    const metadata = this.extractMetadata(skill, category);
    const registration = await this.registrationModel
      .findOneAndUpdate(
        { name },
        {
          name,
          category,
          version,
          modulePath: `builtin://${name}`,
          metadata,
          skillMd: skillMdData,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    this.register(skill, registration);
    this.logger.log(
      `Built-in skill ${name} registered [${category}] (AI instructions: ${parsedMd.hasAiInstructions})`,
    );
  }

  async reload(): Promise<void> {
    this.skills.clear();
    this.skillMdCache.clear();
    await this.loadAll();
  }

  private resolveCategory(skill: AnySkill): SkillCategory {
    const manifest = skill.manifest as any;
    if ('topicType' in manifest) return SkillCategory.TYPE;
    if ('sourceSystem' in manifest) return SkillCategory.ADAPTER;
    return SkillCategory.TYPE;
  }

  private resolveCategoryFromFrontmatter(frontmatter: import('../interfaces/skill-md').SkillMdFrontmatter): SkillCategory {
    if (frontmatter.category === 'adapter') return SkillCategory.ADAPTER;
    return SkillCategory.TYPE;
  }

  extractMetadata(
    skill: AnySkill,
    category: SkillCategory,
  ): Record<string, unknown> {
    const manifest = skill.manifest as any;
    switch (category) {
      case SkillCategory.TYPE:
        return { topicType: manifest.topicType };
      case SkillCategory.ADAPTER:
        return { sourceSystem: manifest.sourceSystem };
      default:
        return {};
    }
  }

  private initSkill(skill: AnySkill): void {
    if (typeof (skill as any).init !== 'function') return;

    const manifest = skill.manifest as any;

    try {
      (skill as any).init({});
    } catch (err) {
      this.logger.error(`Failed to init skill ${manifest.name}`, String(err));
    }
  }
}
