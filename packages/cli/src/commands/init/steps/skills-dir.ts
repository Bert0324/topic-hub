import * as fs from 'fs';
import * as path from 'path';
import { input } from '@inquirer/prompts';

const DEFAULT_SKILLS_DIR = path.join(process.env.HOME ?? '~', '.topichub', 'skills');

export async function promptSkillsDir(currentValue?: string): Promise<string> {
  const skillsDir = await input({
    message: 'Skills directory',
    default: currentValue ?? DEFAULT_SKILLS_DIR,
    validate: (val) => {
      if (!val.trim()) return 'Directory path is required';
      return true;
    },
  });

  const resolved = skillsDir.startsWith('~')
    ? path.join(process.env.HOME ?? '', skillsDir.slice(1))
    : path.resolve(skillsDir);

  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
    console.log(`  ✓ Created ${resolved}`);
  } else {
    console.log(`  ✓ Directory exists`);
  }

  return skillsDir;
}
