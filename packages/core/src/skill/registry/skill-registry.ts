import { Model } from 'mongoose';
import { ParsedSkillMd } from '../interfaces/skill-md';
import { SkillLoader } from './skill-loader';
import { SkillMdParser } from './skill-md-parser';
import { createMdOnlyTypeSkill } from './md-only-skill';
import type { TopicHubLogger } from '../../common/logger';

export interface RegisteredSkill {
  skill: any;
  registration: any;
}

export class SkillRegistry {
  private readonly skills = new Map<string, RegisteredSkill>();
  private readonly skillMdCache = new Map<string, ParsedSkillMd>();

  constructor(
    private readonly loader: SkillLoader,
    private readonly skillMdParser: SkillMdParser,
    private readonly registrationModel: Model<any>,
    private readonly logger: TopicHubLogger,
  ) {}

  register(skill: any, registration: any): void {
    this.skills.set(registration.name, { skill, registration });
    this.logger.log(`Registered skill: ${registration.name}`);
  }

  unregister(name: string): void {
    this.skills.delete(name);
    this.logger.log(`Unregistered skill: ${name}`);
  }

  resolve(name: string): RegisteredSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * Map first slash token to a registered skill name (case-insensitive).
   * Used for IM commands like `/my-skill --flag value` when `my-skill` is a loaded skill.
   */
  matchSkillCommandToken(token: string): string | undefined {
    const key = token.toLowerCase();
    for (const name of this.skills.keys()) {
      if (name.toLowerCase() === key) {
        return name;
      }
    }
    return undefined;
  }

  listAll(): RegisteredSkill[] {
    return [...this.skills.values()];
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
    const skill = createMdOnlyTypeSkill(manifest.name, frontmatter);

    this.skillMdCache.set(manifest.name, parsedMd);
    const skillMdData = {
      name: frontmatter.name,
      description: frontmatter.description,
      systemPrompt: parsedMd.systemPrompt,
      eventPrompts: Object.fromEntries(parsedMd.eventPrompts),
      hasAiInstructions: parsedMd.hasAiInstructions,
    };

    const registration = await this.registrationModel
      .findOneAndUpdate(
        { name: manifest.name },
        {
          name: manifest.name,
          version: manifest.version,
          modulePath: `md-only://${manifest.name}`,
          metadata: {},
          skillMd: skillMdData,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    this.register(skill, registration);
    this.logger.log(
      `Md-only skill ${manifest.name} loaded (AI instructions: ${parsedMd.hasAiInstructions})`,
    );
  }

  private async loadCodeSkill(manifest: import('./skill-loader').SkillManifestInfo): Promise<void> {
    const skill = this.loader.loadSkill(manifest.mainPath!);
    const skillManifest = skill.manifest;
    if (!skillManifest) {
      this.logger.warn(`Skill at ${manifest.mainPath} has no manifest, skipping`);
      return;
    }

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
    }

    const registration = await this.registrationModel
      .findOneAndUpdate(
        { name: skillManifest.name },
        {
          name: skillManifest.name,
          version: manifest.version,
          modulePath: manifest.mainPath,
          metadata: {},
          skillMd: skillMdData,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    this.register(skill, registration);
  }

  async registerBuiltinMd(name: string, mdContent: string, version: string): Promise<void> {
    const parsedMd = this.skillMdParser.parseContent(mdContent, `builtin://${name}`);
    if (!parsedMd) {
      this.logger.warn(`Built-in skill ${name} has invalid SKILL.md content, skipping`);
      return;
    }

    const frontmatter = parsedMd.frontmatter;
    const skill = createMdOnlyTypeSkill(name, frontmatter);

    this.skillMdCache.set(name, parsedMd);
    const skillMdData = {
      name: frontmatter.name,
      description: frontmatter.description,
      systemPrompt: parsedMd.systemPrompt,
      eventPrompts: Object.fromEntries(parsedMd.eventPrompts),
      hasAiInstructions: parsedMd.hasAiInstructions,
    };

    const registration = await this.registrationModel
      .findOneAndUpdate(
        { name },
        {
          name,
          version,
          modulePath: `builtin://${name}`,
          metadata: {},
          skillMd: skillMdData,
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();

    this.register(skill, registration);
    this.logger.log(`Built-in skill ${name} registered (AI instructions: ${parsedMd.hasAiInstructions})`);
  }

  async reload(): Promise<void> {
    this.skills.clear();
    this.skillMdCache.clear();
    await this.loadAll();
  }
}
