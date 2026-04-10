import * as fs from 'fs';
import * as path from 'path';
import type { TopicHubLogger } from '../../common/logger';

export interface SkillManifestInfo {
  name: string;
  version: string;
  mainPath?: string;
  dir: string;
  skillMdContent?: string;
  mdOnly: boolean;
}

export class SkillLoader {
  constructor(
    private readonly skillsDir: string | undefined,
    private readonly logger: TopicHubLogger,
  ) {}

  scanDirectory(dir?: string): SkillManifestInfo[] {
    const targetDir = dir ?? this.skillsDir;
    const results: SkillManifestInfo[] = [];

    if (!targetDir) {
      return results;
    }

    if (!fs.existsSync(targetDir)) {
      this.logger.warn(`Skills directory not found: ${targetDir}`);
      return results;
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(targetDir, entry.name);
      const pkgPath = path.join(skillDir, 'package.json');
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      const hasPkg = fs.existsSync(pkgPath);
      const hasSkillMd = fs.existsSync(skillMdPath);

      if (!hasPkg && !hasSkillMd) {
        this.logger.warn(`No package.json or SKILL.md in skill directory: ${skillDir}`);
        continue;
      }

      let skillMdContent: string | undefined;
      if (hasSkillMd) {
        try {
          skillMdContent = fs.readFileSync(skillMdPath, 'utf-8');
        } catch (readErr) {
          this.logger.warn(`Failed to read SKILL.md in ${skillDir}: ${(readErr as Error).message}`);
        }
      }

      if (hasPkg) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

          if (pkg.main) {
            const mainPath = path.resolve(skillDir, pkg.main);
            results.push({
              name: pkg.name ?? entry.name,
              version: pkg.version ?? '0.0.0',
              mainPath,
              dir: skillDir,
              skillMdContent,
              mdOnly: false,
            });
          } else {
            results.push({
              name: pkg.name ?? entry.name,
              version: pkg.version ?? '0.0.0',
              dir: skillDir,
              skillMdContent,
              mdOnly: true,
            });
          }
        } catch (err) {
          this.logger.error(`Failed to read package.json in ${skillDir}`, String(err));
        }
      } else {
        results.push({
          name: entry.name,
          version: '0.0.0',
          dir: skillDir,
          skillMdContent,
          mdOnly: true,
        });
      }
    }

    return results;
  }

  loadSkill(modulePath: string): any {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(modulePath);
      return mod.default ?? mod;
    } catch (err) {
      this.logger.error(`Failed to load skill module: ${modulePath}`, String(err));
      throw err;
    }
  }
}
