import * as fs from 'node:fs';
import * as path from 'node:path';
import { ApiClient } from '../../api-client/api-client.js';

const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

const api = new ApiClient();

function findRepoRoot(from: string): string | null {
  let dir = path.resolve(from);
  while (true) {
    if (fs.existsSync(path.join(dir, '.topichub-repo.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function handleSkillCommand(sub: string, args: string[]) {
  switch (sub) {
    case 'create': {
      const repoRoot = findRepoRoot(process.cwd());
      if (!repoRoot) {
        console.error('Not in a skill repo. Create one with: topichub skill-repo create <name>');
        process.exit(1);
      }

      const categoryIdx = args.indexOf('--category');
      const category = categoryIdx !== -1 ? args[categoryIdx + 1] : undefined;
      const nameIdx = args.indexOf('--name');
      let name: string | undefined;
      if (nameIdx !== -1) {
        const raw = args[nameIdx + 1];
        if (!raw || raw.startsWith('-')) {
          console.error('Usage: --name requires a non-empty value (e.g. topichub skill create --name my-skill)');
          process.exit(3);
        }
        if (!SKILL_NAME_PATTERN.test(raw)) {
          console.error(
            'Invalid --name: must match /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/ (3–64 chars, lowercase, hyphens allowed).',
          );
          process.exit(3);
        }
        name = raw;
      }
      const nonInteractive = args.includes('--non-interactive');

      const { runQaFlow } = await import('../../scaffold/qa-flow.js');
      const qa = await runQaFlow({ category, name, nonInteractive });

      const { scaffoldSkill } = await import('../../scaffold/skill-scaffold.js');
      const skillsDir = path.join(repoRoot, 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      await scaffoldSkill(skillsDir, qa);
      break;
    }
    case 'list': {
      const scopeIdx = args.indexOf('--scope');
      const scope = scopeIdx !== -1 ? args[scopeIdx + 1] : undefined;
      const categoryIdx = args.indexOf('--category');
      const category = categoryIdx !== -1 ? args[categoryIdx + 1] : undefined;

      const params = new URLSearchParams();
      if (scope && scope !== 'all') params.set('scope', scope);
      if (category) params.set('category', category);
      const qs = params.toString();
      const endpoint = '/admin/skills' + (qs ? `?${qs}` : '');

      const data = await api.get<{ skills?: Array<{ name: string; category: string; version: string; enabled: boolean; isPrivate?: boolean }> }>(
        endpoint,
      );
      console.log('\nInstalled Skills:');
      console.log('─'.repeat(72));
      if (!data.skills?.length) {
        console.log('  No skills installed.');
        return;
      }
      console.log(
        '  ' + 'Name'.padEnd(20) + 'Category'.padEnd(12) + 'Scope'.padEnd(10) + 'Version'.padEnd(10) + 'Enabled',
      );
      console.log('  ' + '─'.repeat(64));
      for (const s of data.skills) {
        console.log(
          '  ' +
            s.name.padEnd(20) +
            s.category.padEnd(12) +
            (s.isPrivate ? 'private' : 'public').padEnd(10) +
            s.version.padEnd(10) +
            (s.enabled ? '✓' : '✗'),
        );
      }
      break;
    }
    case 'install': {
      const pkg = args[0];
      if (!pkg) {
        console.log('Usage: skill install <package-or-path>');
        return;
      }
      const result = await api.post<{ name: string; version: string; category: string }>('/admin/skills', {
        packagePath: pkg,
      });
      console.log(`✓ Installed ${result.name} v${result.version} (${result.category})`);
      break;
    }
    case 'enable': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill enable <name>');
        return;
      }
      await api.patch(`/admin/tenants/current/skills/${name}`, { enabled: true });
      console.log(`✓ Enabled ${name}`);
      break;
    }
    case 'disable': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill disable <name>');
        return;
      }
      await api.patch(`/admin/tenants/current/skills/${name}`, { enabled: false });
      console.log(`✓ Disabled ${name}`);
      break;
    }
    case 'setup': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill setup <name>');
        return;
      }
      console.log(`Running setup for ${name}...`);
      console.log('(Skill setup delegates to Skill.runSetup - not yet fully implemented)');
      break;
    }
    case 'config': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill config <name> --show');
        return;
      }
      const config = await api.get(`/admin/tenants/current/skills/${name}`);
      console.log(JSON.stringify(config, null, 2));
      break;
    }
    case 'uninstall': {
      const name = args[0];
      if (!name) {
        console.log('Usage: skill uninstall <name>');
        return;
      }
      await api.delete(`/admin/skills/${name}`);
      console.log(`✓ Uninstalled ${name}`);
      break;
    }
    default:
      console.log('Usage: topichub-admin skill <create|list|install|enable|disable|setup|config|uninstall>');
  }
}
