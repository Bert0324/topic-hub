import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import { loadAdminToken, loadIdentityToken, loadIdToken } from '../../auth/auth.js';
import { loadConfig } from '../../config/config.js';
import { ApiClient } from '../../api-client/api-client.js';
import {
  PublishPayloadSchema,
  SkillManifestSchema,
  SkillMdOnlyPublishFrontmatterSchema,
} from '../../validation/skill-manifest.js';

const REGISTRATION_ID_HEX = /^[a-fA-F0-9]{24}$/;

/** Resolve a user-supplied path to the skill root directory (SKILL.md and/or package.json). */
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

function buildSkillPayloadFromPackageJson(skillDir: string, pkg: Record<string, unknown>) {
  const manifestCheck = SkillManifestSchema.safeParse(pkg);
  if (!manifestCheck.success) {
    console.error('Invalid skill manifest:', manifestCheck.error.message);
    process.exit(2);
  }

  const topichub = (pkg.topichub as Record<string, unknown> | undefined) ?? {};
  const category = (topichub.category as 'type' | 'platform' | 'adapter' | undefined) ?? 'type';

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const skillMdRaw = fs.existsSync(skillMdPath)
    ? fs.readFileSync(skillMdPath, 'utf-8')
    : '';

  const mainFile = (pkg.main as string | undefined) ?? 'src/index.ts';
  const entryPath = path.join(skillDir, mainFile);
  const entryPoint = fs.existsSync(entryPath) ? fs.readFileSync(entryPath, 'utf-8') : '';

  return {
    name: (pkg.name as string | undefined) ?? path.basename(skillDir),
    category,
    version: (pkg.version as string | undefined) ?? '0.0.0',
    metadata: topichub,
    skillMdRaw,
    entryPoint,
    files: {} as Record<string, string>,
    manifest: pkg,
  };
}

function buildSkillPayloadFromSkillMdOnly(skillDir: string, skillMdRaw: string) {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(skillMdRaw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Invalid SKILL.md (could not parse frontmatter): ${msg}`);
    process.exit(2);
  }

  const fmCheck = SkillMdOnlyPublishFrontmatterSchema.safeParse(parsed.data);
  if (!fmCheck.success) {
    console.error('Invalid SKILL.md frontmatter for publish:', fmCheck.error.message);
    process.exit(2);
  }

  const fm = fmCheck.data;
  const topichub: Record<string, unknown> = { category: fm.category ?? 'type' };
  if (fm.topicType !== undefined) topichub.topicType = fm.topicType;
  if (fm.platform !== undefined) topichub.platform = fm.platform;
  if (fm.sourceSystem !== undefined) topichub.sourceSystem = fm.sourceSystem;

  const manifest: Record<string, unknown> = {
    name: fm.name,
    description: fm.description,
    topichub,
  };

  return {
    name: fm.name,
    category: (fm.category ?? 'type') as 'type' | 'platform' | 'adapter',
    metadata: topichub,
    skillMdRaw,
    entryPoint: '',
    files: {} as Record<string, string>,
    manifest,
  };
}

function buildSkillPayload(skillDir: string) {
  const pkgPath = path.join(skillDir, 'package.json');
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    return buildSkillPayloadFromPackageJson(skillDir, pkg);
  }

  if (!fs.existsSync(skillMdPath)) {
    console.error(
      `Missing package.json and SKILL.md in skill directory: ${skillDir}\n` +
        'Add package.json (code skill) or SKILL.md with name/description frontmatter (md-only skill).',
    );
    process.exit(2);
  }

  const skillMdRaw = fs.readFileSync(skillMdPath, 'utf-8');
  return buildSkillPayloadFromSkillMdOnly(skillDir, skillMdRaw);
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
  const identity = await loadIdentityToken();
  const idToken = await loadIdToken();
  if (!admin && !identity && !idToken) {
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
  const built = buildSkillPayload(skillDir);
  const skill = {
    ...built,
    ...(registrationId ? { registrationId } : {}),
  };

  const payloadParsed = PublishPayloadSchema.safeParse({ isPublic: false, skills: [skill] });
  if (!payloadParsed.success) {
    console.error('Invalid publish payload:', payloadParsed.error.flatten());
    process.exit(2);
  }

  const client = new ApiClient(serverUrl);
  const versionLabel = 'version' in built && built.version !== undefined ? built.version : 'auto';
  console.log(`Publishing ${skill.name}@${versionLabel} to ${serverUrl}…`);

  try {
    const result = await client.publishSkills(payloadParsed.data);

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

    if ('version' in skill && skill.version !== undefined) {
      console.log(
        `Done. skills list shows version ${skill.version}; change package.json version to publish a specific version.`,
      );
    } else {
      console.log(
        'Done. The server assigned the catalog version (auto patch bump on each publish without a version field).',
      );
    }
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
