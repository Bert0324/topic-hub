import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadAdminToken, loadIdToken } from '../../auth/auth.js';
import { loadConfig } from '../../config/config.js';
import { ApiClient } from '../../api-client/api-client.js';
import {
  PublishPayloadSchema,
  SkillManifestSchema,
} from '../../validation/skill-manifest.js';

const REGISTRATION_ID_HEX = /^[a-fA-F0-9]{24}$/;

/** Resolve a user-supplied path to the skill root directory (contains package.json). */
function resolveSkillDir(rawPath: string): string {
  const abs = path.resolve(process.cwd(), rawPath);
  if (!fs.existsSync(abs)) {
    console.error(`Path not found: ${rawPath}`);
    process.exit(2);
  }

  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    return abs;
  }

  const base = path.basename(abs);
  if (base === 'SKILL.md' || base === 'package.json') {
    return path.dirname(abs);
  }

  console.error(
    'Expected a skill directory, or a path to SKILL.md / package.json inside the skill.',
  );
  process.exit(2);
}

function buildSkillPayload(skillDir: string) {
  const pkgPath = path.join(skillDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error(`Missing package.json in skill directory: ${skillDir}`);
    process.exit(2);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const manifestCheck = SkillManifestSchema.safeParse(pkg);
  if (!manifestCheck.success) {
    console.error('Invalid skill manifest:', manifestCheck.error.message);
    process.exit(2);
  }

  const topichub = pkg.topichub ?? {};
  const category = topichub.category ?? 'type';

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillMdRaw = fs.existsSync(skillMdPath)
    ? fs.readFileSync(skillMdPath, 'utf-8')
    : '';

  const mainFile = pkg.main ?? 'src/index.ts';
  const entryPath = path.join(skillDir, mainFile);
  const entryPoint = fs.existsSync(entryPath) ? fs.readFileSync(entryPath, 'utf-8') : '';

  return {
    name: pkg.name ?? path.basename(skillDir),
    category,
    version: pkg.version ?? '0.0.0',
    metadata: topichub,
    skillMdRaw,
    entryPoint,
    files: {} as Record<string, string>,
    manifest: pkg,
  };
}

function stripFlags(args: string[]): { pathArg: string | undefined; registrationId?: string } {
  const registrationIdx = args.indexOf('--id');
  let registrationId: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id') {
      registrationId = args[i + 1];
      if (!registrationId || registrationId.startsWith('-')) {
        console.error('Usage: ... publish [--id <registrationId>] <path>');
        process.exit(1);
      }
      i += 1;
      continue;
    }
    rest.push(args[i]);
  }
  const pathArg = rest.find((a) => !a.startsWith('-'));
  if (registrationId && !REGISTRATION_ID_HEX.test(registrationId)) {
    console.error('--id must be a 24-character hexadecimal MongoDB ObjectId (see `skills list`).');
    process.exit(1);
  }
  return { pathArg, registrationId };
}

export async function handlePublishCommand(args: string[]): Promise<void> {
  const { pathArg, registrationId } = stripFlags(args);
  if (!pathArg) {
    console.error(
      'Usage: topichub-admin publish [--id <registrationId>] <path-to-skill-dir|SKILL.md|package.json>',
    );
    process.exit(1);
  }

  const admin = await loadAdminToken();
  const idToken = await loadIdToken();
  if (!admin && !idToken) {
    console.error(
      'Not authenticated. Save an identity or executor token (init / login), or an admin token.',
    );
    process.exit(1);
  }

  let serverUrl: string;
  try {
    serverUrl = loadConfig().serverUrl;
  } catch {
    console.error('No server URL configured. Run `topichub-admin init` first.');
    process.exit(1);
  }

  const skillDir = resolveSkillDir(pathArg);
  const skill = {
    ...buildSkillPayload(skillDir),
    ...(registrationId ? { registrationId } : {}),
  };

  const payloadParsed = PublishPayloadSchema.safeParse({ isPublic: false, skills: [skill] });
  if (!payloadParsed.success) {
    console.error('Invalid publish payload:', payloadParsed.error.flatten());
    process.exit(2);
  }

  const client = new ApiClient(serverUrl);
  console.log(`Publishing ${skill.name}@${skill.version} to ${serverUrl}…`);

  try {
    const result = await client.post('/admin/skills/publish', payloadParsed.data);

    const body = result as {
      published?: Array<{ name: string; status: string }>;
      errors?: Array<{ name: string; error: string }>;
    };

    if (body.published) {
      for (const p of body.published) {
        const row = p as { name: string; status: string; id?: string };
        const idPart = row.id ? ` id=${row.id}` : '';
        console.log(`  ✓ ${row.name} (${row.status})${idPart}`);
      }
    }
    if (body.errors && body.errors.length > 0) {
      for (const e of body.errors) {
        console.error(`  ✗ ${e.name}: ${e.error}`);
      }
      process.exit(3);
    }

    console.log(`Done. skills list shows package.json version (${skill.version}); bump it to release a new version.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
      console.error('Permission denied (only the skill author can publish updates).');
      process.exit(4);
    }
    console.error('Publish failed:', err);
    process.exit(3);
  }
}
