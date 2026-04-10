import * as fs from 'node:fs';
import * as path from 'node:path';
import type { QaResult } from './qa-flow.js';

const CATEGORY_SUBDIRS: Record<string, string> = {
  type: 'topics',
  platform: 'platforms',
  adapter: 'adapters',
};

export async function scaffoldSkill(skillsDir: string, qa: QaResult): Promise<void> {
  const categorySubdir = CATEGORY_SUBDIRS[qa.category] ?? qa.category;
  const skillDir = path.join(skillsDir, categorySubdir, qa.name);

  if (fs.existsSync(skillDir)) {
    console.error(`Skill "${qa.name}" already exists in this repo.`);
    process.exit(2);
  }

  let files: Record<string, string>;
  switch (qa.category) {
    case 'type': {
      const { generateTopicSkill } = await import('./templates/topic-skill.js');
      files = generateTopicSkill(qa);
      break;
    }
    case 'platform': {
      const { generatePlatformSkill } = await import('./templates/platform-skill.js');
      files = generatePlatformSkill(qa);
      break;
    }
    case 'adapter': {
      const { generateAdapterSkill } = await import('./templates/adapter-skill.js');
      files = generateAdapterSkill(qa);
      break;
    }
  }

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(skillDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  console.log(`✓ Created skill: skills/${categorySubdir}/${qa.name}/`);
}
