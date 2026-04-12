import { loadConfig } from '../../config/config.js';
import { ApiClient } from '../../api-client/api-client.js';

function pickArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  return args[i + 1];
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

/**
 * Minimal skill-repo surface (FR-008): list published skills from the Skill Center API.
 */
export async function handleSkillRepoCommand(subcommand: string | undefined, args: string[]): Promise<void> {
  if (!subcommand || subcommand === 'help' || subcommand === '-h' || subcommand === '--help') {
    console.log(`
  Usage:
    topichub-admin skill-repo list [--page <n>] [--limit <n>] [--sort popular|recent|usage]
                                      Published skills (same catalog as \`skills list\`)
`);
    if (!subcommand) process.exit(1);
    return;
  }

  if (subcommand !== 'list') {
    console.error(`Unknown skill-repo subcommand: ${subcommand}. Try: skill-repo list`);
    process.exit(1);
  }

  let serverUrl: string;
  try {
    const cfg = loadConfig();
    serverUrl = cfg.serverUrl;
  } catch {
    console.error('No configuration. Run `topichub-admin init` first.');
    process.exit(1);
  }

  const client = new ApiClient(serverUrl);
  const page = pickArg(args, '--page') ?? '1';
  const limit = pickArg(args, '--limit') ?? '50';
  const sort = pickArg(args, '--sort') ?? 'popular';
  const q = new URLSearchParams({ page, limit, sort });
  const pathStr = `/api/v1/skills?${q.toString()}`;

  try {
    const body = await client.get<{
      skills: Array<{
        id: string;
        name: string;
        authorDisplayName: string;
        version: string;
        usageCount: number;
        likeCount: number;
      }>;
      total: number;
      page: number;
      limit: number;
    }>(pathStr, { auth: false });

    if (body.skills.length === 0) {
      console.log('No published skills on this server.');
      return;
    }

    const wId = 26;
    const wName = 28;
    const wVer = 10;
    const wAuthor = 22;
    console.log(
      `${pad('ID', wId)} ${pad('NAME', wName)} ${pad('VERSION', wVer)} ${pad('AUTHOR', wAuthor)} USES LIKES`,
    );
    for (const s of body.skills) {
      console.log(
        `${pad(s.id, wId)} ${pad(s.name, wName)} ${pad(s.version, wVer)} ${pad(s.authorDisplayName, wAuthor)} ${String(s.usageCount)} ${String(s.likeCount)}`,
      );
    }
    console.log(`\nTotal: ${body.total} (page ${body.page}, limit ${body.limit})`);
  } catch (e) {
    console.error('skill-repo list failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
