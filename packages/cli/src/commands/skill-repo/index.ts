import { loadConfig } from '../../config/config.js';
import { loadAdminToken } from '../../auth/auth.js';
import { scaffoldRepo, initSkillScaffold } from '../../scaffold/repo-scaffold.js';

const REPO_NAME_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

export async function handleSkillRepoCommand(
  subcommand: string | undefined,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case 'create': {
      const token = await loadAdminToken();
      if (!token) {
        console.error('Not authenticated. Run `topichub init` first.');
        process.exit(1);
      }

      const repoName = args[0];
      if (!repoName) {
        console.error('Usage: topichub skill-repo create <repo-name> [--path <dir>]');
        process.exit(3);
      }

      if (!REPO_NAME_PATTERN.test(repoName)) {
        console.error(
          'Invalid repo name: must match /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/ (3–64 chars, lowercase, hyphens allowed).',
        );
        process.exit(3);
      }

      const pathIdx = args.indexOf('--path');
      const parentDir = pathIdx !== -1 ? args[pathIdx + 1] : (process.env.INIT_CWD ?? process.cwd());

      const config = await loadConfig();
      await scaffoldRepo(repoName, parentDir, {
        tenantId: config.tenantId ?? '',
        serverUrl: config.serverUrl ?? 'http://localhost:3000',
      });
      break;
    }
    case 'init': {
      const token = await loadAdminToken();
      if (!token) {
        console.error('Not authenticated. Run `topichub init` first.');
        process.exit(1);
      }

      const force = args.includes('--force');
      const pathIdx = args.indexOf('--path');
      const targetDir = pathIdx !== -1 ? args[pathIdx + 1] : (process.env.INIT_CWD ?? process.cwd());

      const config = await loadConfig();
      await initSkillScaffold(targetDir, {
        tenantId: config.tenantId ?? '',
        serverUrl: config.serverUrl ?? 'http://localhost:3000',
        force,
      });
      break;
    }
    default:
      console.log('Usage: topichub skill-repo <subcommand>');
      console.log('Subcommands: create, init');
      console.log('');
      console.log('  create <name>   Create a new skill repository');
      console.log('  init            Add skill scaffolding to an existing repository');
  }
}
