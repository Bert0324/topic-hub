import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface SkillManifestInfo {
  name: string;
  version: string;
  mainPath: string;
  dir: string;
}

@Injectable()
export class SkillLoader {
  private readonly logger = new Logger(SkillLoader.name);
  private readonly skillsDir: string;

  constructor() {
    this.skillsDir = process.env.SKILLS_DIR ?? './skills';
  }

  scanDirectory(dir?: string): SkillManifestInfo[] {
    const targetDir = dir ?? this.skillsDir;
    const results: SkillManifestInfo[] = [];

    if (!fs.existsSync(targetDir)) {
      this.logger.warn(`Skills directory not found: ${targetDir}`);
      return results;
    }

    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(targetDir, entry.name);
      const pkgPath = path.join(skillDir, 'package.json');

      if (!fs.existsSync(pkgPath)) {
        this.logger.warn(`No package.json in skill directory: ${skillDir}`);
        continue;
      }

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const mainEntry = pkg.main ?? 'index.js';
        const mainPath = path.resolve(skillDir, mainEntry);

        results.push({
          name: pkg.name ?? entry.name,
          version: pkg.version ?? '0.0.0',
          mainPath,
          dir: skillDir,
        });
      } catch (err) {
        this.logger.error(`Failed to read package.json in ${skillDir}`, err);
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
      this.logger.error(`Failed to load skill module: ${modulePath}`, err);
      throw err;
    }
  }
}
