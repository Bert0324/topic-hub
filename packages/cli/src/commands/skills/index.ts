import * as fs from 'node:fs';
import * as path from 'node:path';
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

export async function handleSkillsCommand(subcommand: string | undefined, args: string[]): Promise<void> {
  if (!subcommand || subcommand === 'help' || subcommand === '-h' || subcommand === '--help') {
    console.log(`
  Usage:
    topichub-admin skills list [--page <n>] [--limit <n>] [--sort popular|recent|usage]
    topichub-admin skills publish [--id <id>] <path>   Same as topichub-admin publish (skill dir or SKILL.md / package.json)
    topichub-admin skills star <skill-name>      Like / star a skill (requires login token)
    topichub-admin skills view <name> | view --id <registrationId>
                                      Download SKILL.md (+ package.json) into skillsDir
    topichub-admin skills delete <registrationId>
                                      Unpublish by Mongo id (see skills list; author only)
`);
    if (!subcommand) process.exit(1);
    return;
  }

  if (subcommand === 'publish') {
    const { handlePublishCommand } = await import('../publish/index.js');
    await handlePublishCommand(args);
    return;
  }

  let serverUrl: string;
  let skillsDir: string;
  try {
    const cfg = loadConfig();
    serverUrl = cfg.serverUrl;
    skillsDir = cfg.skillsDir.startsWith('~')
      ? path.join(process.env.HOME ?? '', cfg.skillsDir.slice(1))
      : path.resolve(cfg.skillsDir);
  } catch {
    console.error('No configuration. Run `topichub-admin init` first.');
    process.exit(1);
  }

  const client = new ApiClient(serverUrl);

  if (subcommand === 'list') {
    const page = pickArg(args, '--page') ?? '1';
    const limit = pickArg(args, '--limit') ?? '50';
    const sort = pickArg(args, '--sort') ?? 'popular';
    try {
      const body = await client.nativeGatewayPublic<{
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
      }>('skills.catalog_list', { page, limit, sort });

      if (body.skills.length === 0) {
        console.log('No published skills on this server.');
        return;
      }

      const wId = 26;
      const wName = Math.min(
        32,
        Math.max(4, ...body.skills.map((s) => s.name.length)),
      );
      const wAuthor = Math.min(
        20,
        Math.max(6, ...body.skills.map((s) => s.authorDisplayName.length)),
      );

      console.log(
        `${pad('ID', wId)}  ${pad('NAME', wName)}  ${pad('AUTHOR', wAuthor)}  ${pad('VERSION', 10)}  ${pad('USES', 6)}  LIKES`,
      );
      console.log(`${'-'.repeat(wId + wName + wAuthor + 10 + 6 + 6 + 14)}`);
      for (const s of body.skills) {
        console.log(
          `${pad(s.id, wId)}  ${pad(s.name, wName)}  ${pad(s.authorDisplayName, wAuthor)}  ${pad(s.version, 10)}  ${pad(String(s.usageCount), 6)}  ${s.likeCount}`,
        );
      }
      console.log(`\nTotal: ${body.total}  (page ${body.page}, limit ${body.limit})`);
    } catch (e) {
      console.error('List failed:', e instanceof Error ? e.message : e);
      process.exit(3);
    }
    return;
  }

  if (subcommand === 'star') {
    const name = args.find((a) => !a.startsWith('-'));
    if (!name) {
      console.error('Usage: topichub-admin skills star <skill-name>');
      process.exit(1);
    }

    try {
      const res = await client.nativeGateway<{ liked: boolean; likeCount: number }>('skills.like', {
        name,
      });
      console.log(res.liked ? `Liked "${name}". Total likes: ${res.likeCount}` : `Unliked "${name}". Total likes: ${res.likeCount}`);
    } catch (e) {
      console.error('Like failed:', e instanceof Error ? e.message : e);
      process.exit(3);
    }
    return;
  }

  if (subcommand === 'view') {
    const regId = pickArg(args, '--id');
    const name = args.find((a) => !a.startsWith('-') && !(regId && a === regId));
    if (!regId && !name) {
      console.error('Usage: topichub-admin skills view <skill-name>  OR  skills view --id <registrationId>');
      process.exit(1);
    }
    if (regId && name) {
      console.error('Use either a skill name or --id, not both.');
      process.exit(1);
    }

    try {
      type SkillContent = {
        name: string;
        version: string;
        skillMdRaw: string;
        manifest: Record<string, unknown>;
      };
      const res = regId
        ? await client.nativeGatewayPublic<SkillContent>('skills.content_by_id', { id: regId })
        : await client.nativeGatewayPublic<SkillContent>('skills.content_by_name', { name: name! });

      const dir = path.join(skillsDir, res.name);
      fs.mkdirSync(dir, { recursive: true });

      const skillPath = path.join(dir, 'SKILL.md');
      fs.writeFileSync(skillPath, res.skillMdRaw, 'utf-8');

      const pkgPath = path.join(dir, 'package.json');
      const manifest = { ...res.manifest };
      if (typeof manifest === 'object' && manifest !== null && !('version' in manifest)) {
        (manifest as Record<string, unknown>).version = res.version;
      }
      fs.writeFileSync(pkgPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

      console.log(`Saved skill "${res.name}" to:`);
      console.log(`  ${path.resolve(skillPath)}`);
    } catch (e) {
      console.error('View/pull failed:', e instanceof Error ? e.message : e);
      process.exit(3);
    }
    return;
  }

  if (subcommand === 'delete') {
    const registrationId = args.find((a) => !a.startsWith('-'));
    if (!registrationId || !/^[a-fA-F0-9]{24}$/.test(registrationId)) {
      console.error('Usage: topichub-admin skills delete <registrationId>');
      console.error('  registrationId is the 24-char hex id from `skills list` (column ID).');
      process.exit(1);
    }

    try {
      await client.nativeGateway<{ deleted: true; id: string }>('skills.delete_by_id', {
        id: registrationId,
      });
      console.log(`Deleted published skill id=${registrationId} from the server catalog.`);
    } catch (e) {
      console.error('Delete failed:', e instanceof Error ? e.message : e);
      process.exit(3);
    }
    return;
  }

  console.error(`Unknown skills subcommand: ${subcommand}`);
  process.exit(1);
}
