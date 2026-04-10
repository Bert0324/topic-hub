import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadAdminToken } from '../../auth/auth.js';
import { ApiClient } from '../../api-client/api-client.js';
import { loadConfig } from '../../config/config.js';
import {
  PublishPayloadSchema,
  SkillManifestSchema,
} from '../../validation/skill-manifest.js';

interface RepoMeta {
  tenantId: string;
  serverUrl: string;
  createdAt: string;
  cliVersion: string;
}

function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.topichub-repo.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

export async function handlePublishCommand(args: string[]): Promise<void> {
  const token = await loadAdminToken();
  if (!token) {
    console.error('Not authenticated. Run `topichub init` first.');
    process.exit(1);
  }

  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    console.error('Not in a skill repo. No .topichub-repo.json found.');
    console.error('Create a repo first: topichub skill-repo create <name>');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const isPublic = args.includes('--public');
  const serverOverrideIdx = args.indexOf('--server');
  const repoMeta: RepoMeta = JSON.parse(
    fs.readFileSync(path.join(repoRoot, '.topichub-repo.json'), 'utf-8'),
  );

  const serverUrl = serverOverrideIdx !== -1
    ? args[serverOverrideIdx + 1]
    : repoMeta.serverUrl;

  const skillsDir = path.join(repoRoot, 'skills');
  if (!fs.existsSync(skillsDir)) {
    console.error('No skills/ directory found in repo.');
    process.exit(2);
  }

  const CATEGORY_SUBDIRS = ['topics', 'platforms', 'adapters'] as const;
  const skillDirs: Array<{ name: string; dir: string }> = [];
  for (const cat of CATEGORY_SUBDIRS) {
    const catDir = path.join(skillsDir, cat);
    if (!fs.existsSync(catDir)) continue;
    const entries = fs.readdirSync(catDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    for (const entry of entries) {
      skillDirs.push({ name: entry.name, dir: path.join(catDir, entry.name) });
    }
  }

  if (skillDirs.length === 0) {
    console.error('No skills found in skills/{topics,platforms,adapters}/ directories.');
    process.exit(2);
  }

  const skills: Array<{
    name: string;
    category: string;
    version: string;
    metadata: Record<string, unknown>;
    skillMdRaw: string;
    entryPoint: string;
    files: Record<string, string>;
    manifest: Record<string, unknown>;
  }> = [];

  const errors: Array<{ name: string; error: string }> = [];

  for (const { name: skillName, dir: skillDir } of skillDirs) {
    const pkgPath = path.join(skillDir, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      errors.push({ name: skillName, error: 'Missing package.json' });
      continue;
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const manifestCheck = SkillManifestSchema.safeParse(pkg);
      if (!manifestCheck.success) {
        errors.push({
          name: skillName,
          error: manifestCheck.error.message,
        });
        continue;
      }

      const topichub = pkg.topichub ?? {};
      const category = topichub.category ?? 'type';

      const skillMdPath = path.join(skillDir, 'SKILL.md');
      const skillMdRaw = fs.existsSync(skillMdPath)
        ? fs.readFileSync(skillMdPath, 'utf-8')
        : '';

      const mainFile = pkg.main ?? 'src/index.ts';
      const entryPath = path.join(skillDir, mainFile);
      const entryPoint = fs.existsSync(entryPath)
        ? fs.readFileSync(entryPath, 'utf-8')
        : '';

      skills.push({
        name: pkg.name ?? skillName,
        category,
        version: pkg.version ?? '0.0.0',
        metadata: topichub,
        skillMdRaw,
        entryPoint,
        files: {},
        manifest: pkg,
      });
    } catch (err) {
      errors.push({ name: skillName, error: String(err) });
    }
  }

  if (errors.length > 0) {
    console.error('Validation errors:');
    for (const e of errors) {
      console.error(`  ✗ ${e.name}: ${e.error}`);
    }
  }

  if (skills.length === 0) {
    console.error('No valid skills to publish.');
    process.exit(2);
  }

  if (dryRun) {
    console.log('Dry run — would publish:');
    for (const s of skills) {
      console.log(`  ${s.name} (${s.category})`);
    }
    return;
  }

  const scope = isPublic ? 'public' : 'private';
  console.log(`Publishing ${skills.length} skill(s) from ${path.basename(repoRoot)}... (${scope})`);

  const config = await loadConfig();
  const tenantId = (repoMeta.tenantId ?? config.tenantId ?? '').trim();
  const payloadParsed = PublishPayloadSchema.safeParse({ tenantId, isPublic, skills });
  if (!payloadParsed.success) {
    console.error('Invalid publish payload:', payloadParsed.error.flatten());
    process.exit(2);
  }

  const client = new ApiClient(serverUrl, token);
  try {
    const result = await client.post('/admin/skills/publish', payloadParsed.data);

    const body = result as { published?: Array<{ name: string; status: string }>; errors?: Array<{ name: string; error: string }> };

    if (body.published) {
      for (const p of body.published) {
        console.log(`  ✓ ${p.name} (${p.status})`);
      }
    }
    if (body.errors && body.errors.length > 0) {
      for (const e of body.errors) {
        console.error(`  ✗ ${e.name}: ${e.error}`);
      }
    }

    console.log(`Published ${isPublic ? 'public' : ''} to ${serverUrl}`);
  } catch (err: any) {
    if (err?.status === 403 || err?.statusCode === 403 || String(err).includes('403')) {
      console.error('Permission denied. Only super-admins can publish public skills.');
      process.exit(4);
    }
    console.error('Publish failed:', err);
    process.exit(3);
  }
}
