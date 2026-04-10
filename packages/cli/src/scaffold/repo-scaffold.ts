import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

interface RepoOptions {
  tenantId: string;
  serverUrl: string;
}

export async function scaffoldRepo(
  repoName: string,
  parentDir: string,
  options: RepoOptions,
): Promise<void> {
  const repoDir = path.join(parentDir, repoName);

  if (fs.existsSync(repoDir)) {
    console.error(`Directory ${repoName} already exists.`);
    process.exit(2);
  }

  if (!/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(repoName)) {
    console.error('Invalid repo name. Use lowercase letters, numbers, and hyphens (3-64 chars).');
    process.exit(3);
  }

  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'skills', 'topics'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'skills', 'platforms'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, 'skills', 'adapters'), { recursive: true });
  fs.mkdirSync(path.join(repoDir, '.cursor', 'rules'), { recursive: true });

  fs.writeFileSync(path.join(repoDir, '.topichub-repo.json'), JSON.stringify({
    tenantId: options.tenantId,
    serverUrl: options.serverUrl,
    createdAt: new Date().toISOString(),
    cliVersion: '0.1.0',
  }, null, 2));

  fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
    name: repoName,
    version: '1.0.0',
    private: true,
    topichub: {
      tenantId: options.tenantId,
      serverUrl: options.serverUrl,
    },
  }, null, 2));

  fs.writeFileSync(path.join(repoDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'Node16',
      moduleResolution: 'Node16',
      strict: true,
      esModuleInterop: true,
      outDir: './dist',
      rootDir: '.',
      declaration: true,
    },
    include: ['skills/**/*.ts'],
  }, null, 2));

  fs.writeFileSync(path.join(repoDir, '.gitignore'), [
    'node_modules/',
    'dist/',
    '*.log',
    '.env*',
    '.DS_Store',
  ].join('\n') + '\n');

  fs.writeFileSync(path.join(repoDir, 'README.md'), [
    `# ${repoName}`,
    '',
    'Topic Hub skill repository.',
    '',
    '## Getting Started',
    '',
    '```bash',
    '# Create a new skill',
    'topichub skill create',
    '',
    '# Publish all skills to server',
    'topichub publish',
    '```',
    '',
    '## Development',
    '',
    'Open this repo in Cursor, Claude Code, or Codex. The bundled agent skills',
    'will guide your AI through writing Topic Hub skills.',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(repoDir, '.cursor', 'rules', 'writing-topic-hub.mdc'), [
    '---',
    'description: "Guide for writing Topic Hub skills — covers manifests, interfaces, SKILL.md, publishing, and testing"',
    'globs: ["skills/**"]',
    '---',
    '',
    '# Writing Topic Hub Skills',
    '',
    'Skills are organized by category: `skills/topics/`, `skills/platforms/`, `skills/adapters/`.',
    'Each skill lives in `skills/{category}/<skill-name>/` and is a self-contained package',
    'that plugs into the Topic Hub dispatch loop via one of three category interfaces.',
    '',
    '## Skill Categories',
    '',
    '| Category | `topichub.category` | Key | Purpose |',
    '|----------|---------------------|-----|---------|',
    '| **type** | `type` | `topicType` | Topic type with lifecycle hooks, field schema, status transitions, card rendering |',
    '| **platform** | `platform` | `platform` | IM integration — webhook handling, command parsing, card posting, group management |',
    '| **adapter** | `adapter` | `sourceSystem` | External system connector — transforms webhooks into topic events |',
    '',
    '## Skill Manifest (`package.json`)',
    '',
    'Declared under the `topichub` key. Must include `category` and the',
    'category-specific identifier (`topicType`, `platform`, or `sourceSystem`).',
    '',
    '## SKILL.md Frontmatter',
    '',
    'YAML frontmatter controls agent execution:',
    '- `executor`: `claude` | `cursor` | `codex` | `none`',
    '- `maxTurns`: max agent loop iterations',
    '- `allowedTools`: array of MCP tool names the agent may call',
    '',
    'The Markdown body becomes the system prompt. Use `## on<EventName>`',
    'headings for per-event instructions.',
    '',
    '## Interface Contracts',
    '',
    '### TypeSkill',
    'Required: `manifest`, `renderCard`, `validateMetadata`.',
    'Lifecycle hooks (optional): `onTopicCreated`, `onTopicUpdated`,',
    '`onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`,',
    '`onTopicReopened`, `onSignalAttached`, `onTagChanged`.',
    '',
    '### PlatformSkill',
    'Required: `manifest`.',
    'Key methods: `handleWebhook`, `createGroup`, `postCard`,',
    '`resolveTenantId`, `runSetup`.',
    'Webhook pipeline: handleWebhook → command parsing → routing → response.',
    '',
    '### AdapterSkill',
    'Required: `manifest`, `transformWebhook`.',
    'Optional: `runSetup` for credential configuration.',
    '',
    '## Publish Workflow',
    '',
    '```bash',
    'topichub publish',
    '```',
    '',
    'Scans category subdirectories (`skills/topics/`, `skills/platforms/`,',
    '`skills/adapters/`), validates each skill\'s `package.json`, bundles SKILL.md',
    'and source, POSTs batch to server. Server upserts registrations and enables for tenant.',
    '',
    '## Testing',
    '',
    '- Unit test hooks and `renderCard`/`validateMetadata` directly.',
    '- Test `transformWebhook` with sample payloads.',
    '- Integration: `topichub serve --executor none` to verify dispatch pipeline.',
    '',
    '## File Layout',
    '',
    '```',
    'skills/{category}/<skill-name>/',
    '  package.json      # manifest',
    '  SKILL.md          # agent instructions',
    '  src/index.ts      # category interface implementation',
    '  tests/',
    '```',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(repoDir, 'AGENTS.md'), [
    '# Topic Hub Skill Development',
    '',
    'This repository contains Topic Hub skills. Each skill is a self-contained',
    'package that plugs into the Topic Hub dispatch loop.',
    '',
    'Skills are organized by category: `skills/topics/`, `skills/platforms/`, `skills/adapters/`.',
    'Each skill lives in `skills/{category}/<skill-name>/`.',
    '',
    '## Skill Categories',
    '',
    '- **type** (`topichub.category = "type"`, key: `topicType`)',
    '  Topic type with lifecycle hooks (`onTopicCreated`, `onTopicUpdated`,',
    '  `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`,',
    '  `onSignalAttached`, `onTagChanged`), field schema validation, status',
    '  transitions, and card rendering.',
    '',
    '- **platform** (`topichub.category = "platform"`, key: `platform`)',
    '  IM integration — `handleWebhook`, `createGroup`, `postCard`, `sendMessage`.',
    '  Must implement `resolveTenantId` for multi-tenant webhook dispatch.',
    '',
    '- **adapter** (`topichub.category = "adapter"`, key: `sourceSystem`)',
    '  External system connector — `transformWebhook` converts inbound webhooks',
    '  into `TopicEventPayload`. Optional `runSetup` for credentials.',
    '',
    '## Key Conventions',
    '',
    '- Manifest: `package.json` with `topichub` section (`category` + type key).',
    '- Agent instructions: `SKILL.md` with YAML frontmatter (`executor`,',
    '  `maxTurns`, `allowedTools`). Markdown body = system prompt.',
    '  Use `## on<EventName>` headings for per-event prompts.',
    '- Entry point: `main` field in package.json (usually `src/index.ts`).',
    '- Skill name regex: `^[a-z][a-z0-9-]{1,62}[a-z0-9]$`.',
    '- Publish: `topichub publish` (batch upload to server).',
    '- Local dev: `topichub serve` hot-reloads SKILL.md on every dispatch.',
    '',
    '## Required Exports',
    '',
    '- **Type**: `manifest`, `renderCard`, `validateMetadata` + optional hooks.',
    '- **Platform**: `manifest` + optional `handleWebhook`, `createGroup`, `postCard`.',
    '- **Adapter**: `manifest`, `transformWebhook` + optional `runSetup`.',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(repoDir, 'CLAUDE.md'), [
    '# Topic Hub Skills Repo',
    '',
    'See AGENTS.md for full skill development conventions, interface contracts,',
    'manifest schemas, and testing patterns.',
    '',
    'Skills are organized by category under `skills/topics/`, `skills/platforms/`,',
    'and `skills/adapters/`. Each skill has:',
    '- `package.json` — manifest with `topichub` config (`category`, type-specific key)',
    '- `SKILL.md` — agent instructions (YAML frontmatter: `executor`, `maxTurns`, `allowedTools`)',
    '- `src/index.ts` — entry point exporting the category interface',
    '',
    'Publish with `topichub publish`. Test locally with `topichub serve`.',
    '',
  ].join('\n'));

  try {
    execSync('git init', { cwd: repoDir, stdio: 'pipe' });
  } catch {
    // Git not available — skip silently
  }

  console.log(`✓ Created skill repo: ${repoName}/`);
  console.log('');
  console.log('Next steps:');
  console.log(`  cd ${repoName}`);
  console.log('  topichub skill create    # Create your first skill');
  console.log('  topichub publish         # Publish to server');
}
