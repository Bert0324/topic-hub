import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { checkbox } from '@inquirer/prompts';

export type AgentPlatform = 'cursor' | 'claude-code' | 'codex';

interface RepoOptions {
  tenantId: string;
  serverUrl: string;
}

interface InitOptions extends RepoOptions {
  platforms?: AgentPlatform[];
  force?: boolean;
}

interface WriteFileResult {
  written: string[];
  skipped: string[];
}

function writeIfAbsent(filePath: string, content: string, force: boolean): 'written' | 'skipped' {
  if (!force && fs.existsSync(filePath)) {
    return 'skipped';
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return 'written';
}

function getSkillContent(): string {
  return `# Writing Topic Hub Skills

Skills are organized by category: \`skills/topics/\`, \`skills/platforms/\`, \`skills/adapters/\`.
Each skill lives in \`skills/{category}/<skill-name>/\` and is a self-contained package
that plugs into the Topic Hub dispatch loop via one of three category interfaces.

There are two authoring modes: **code skills** (full TypeScript implementation) and
**md-only skills** (just a SKILL.md file with AI instructions, no code required).

## Skill Categories

| Category | \`topichub.category\` | Key | Purpose |
|----------|---------------------|-----|---------|
| **type** | \`type\` | \`topicType\` | Topic type with lifecycle hooks, field schema, status transitions, card rendering |
| **platform** | \`platform\` | \`platform\` | IM integration — webhook handling, command parsing, card posting, group management |
| **adapter** | \`adapter\` | \`sourceSystem\` | External system connector — transforms webhooks into topic events |

## Md-Only Skills (SKILL.md only, no code)

For AI-driven skills that don't need custom card rendering or validation,
create a directory with just a \`SKILL.md\` file:

\`\`\`
skills/topics/my-ai-skill/
  SKILL.md
\`\`\`

The SKILL.md frontmatter declares identity and category:

\`\`\`yaml
---
name: my-ai-skill
description: Analyzes topics and provides AI-driven insights
topicType: my-ai-type
executor: cursor
maxTurns: 6
allowedTools:
  - topichub_update_topic
  - topichub_add_timeline
---

# System prompt here

## onTopicCreated
Instructions for when a topic is created...
\`\`\`

## Skill Manifest (\`package.json\`) — Code Skills

Declared under the \`topichub\` key. Must include \`category\` and the
category-specific identifier (\`topicType\`, \`platform\`, or \`sourceSystem\`).

## SKILL.md Frontmatter

YAML frontmatter controls agent execution:
- \`executor\`: \`claude\` | \`cursor\` | \`codex\` | \`none\`
- \`maxTurns\`: max agent loop iterations
- \`allowedTools\`: array of MCP tool names the agent may call

The Markdown body becomes the system prompt. Use \`## on<EventName>\`
headings for per-event instructions.

## Interface Contracts

### TypeSkill
Required: \`manifest\`, \`renderCard\`, \`validateMetadata\`.
Lifecycle hooks (optional): \`onTopicCreated\`, \`onTopicUpdated\`,
\`onTopicStatusChanged\`, \`onTopicAssigned\`, \`onTopicClosed\`,
\`onTopicReopened\`, \`onSignalAttached\`, \`onTagChanged\`.

### PlatformSkill
Required: \`manifest\`.
Key methods: \`handleWebhook\`, \`createGroup\`, \`postCard\`,
\`resolveTenantId\`, \`runSetup\`.
Webhook pipeline: handleWebhook → command parsing → routing → response.

### AdapterSkill
Required: \`manifest\`, \`transformWebhook\`.
Optional: \`runSetup\` for credential configuration.

## Publish Workflow

\`\`\`bash
topichub publish
\`\`\`

Scans category subdirectories (\`skills/topics/\`, \`skills/platforms/\`,
\`skills/adapters/\`), validates each skill's \`package.json\`, bundles SKILL.md
and source, POSTs batch to server. Server upserts registrations and enables for tenant.

## Testing

- Unit test hooks and \`renderCard\`/\`validateMetadata\` directly.
- Test \`transformWebhook\` with sample payloads.
- Integration: \`topichub serve --executor none\` to verify dispatch pipeline.

## File Layout

### Code skill (full implementation)

\`\`\`
skills/{category}/<skill-name>/
  package.json      # manifest
  SKILL.md          # agent instructions
  src/index.ts      # category interface implementation
  tests/
\`\`\`

### Md-only skill (no code)

\`\`\`
skills/{category}/<skill-name>/
  SKILL.md          # frontmatter (name, description, topicType) + AI instructions
\`\`\`
`;
}

function getCursorSkillMd(): string {
  return `---
name: writing-topic-hub
description: >-
  Guide for writing Topic Hub skills — covers manifests, interfaces, SKILL.md
  authoring, publishing, and testing. Use when creating, modifying, or debugging
  Topic Hub skills, or when working in the skills/ directory.
---

${getSkillContent()}`;
}

function getCursorRuleMdc(): string {
  return `---
description: "Guide for writing Topic Hub skills — covers manifests, interfaces, SKILL.md, publishing, and testing"
globs: ["skills/**"]
---

${getSkillContent()}`;
}

function getAgentsMd(): string {
  return `# Topic Hub Skill Development

${getSkillContent()}`;
}

function getClaudeMd(): string {
  return `# Topic Hub Skills Repo

See AGENTS.md for full skill development conventions, interface contracts,
manifest schemas, and testing patterns.

Skills are organized by category under \`skills/topics/\`, \`skills/platforms/\`,
and \`skills/adapters/\`. Each skill has:
- \`package.json\` — manifest with \`topichub\` config (\`category\`, type-specific key)
- \`SKILL.md\` — agent instructions (YAML frontmatter: \`executor\`, \`maxTurns\`, \`allowedTools\`)
- \`src/index.ts\` — entry point exporting the category interface

Publish with \`topichub publish\`. Test locally with \`topichub serve\`.
`;
}

/**
 * Write platform-specific agent skill files based on selected platforms.
 */
export function writeAgentSkillFiles(
  targetDir: string,
  platforms: AgentPlatform[],
  force: boolean,
): WriteFileResult {
  const result: WriteFileResult = { written: [], skipped: [] };

  const files: Array<{ rel: string; content: string }> = [];

  if (platforms.includes('cursor')) {
    files.push(
      { rel: '.cursor/skills/writing-topic-hub/SKILL.md', content: getCursorSkillMd() },
      { rel: '.cursor/rules/writing-topic-hub.mdc', content: getCursorRuleMdc() },
    );
  }

  if (platforms.includes('claude-code')) {
    files.push({ rel: 'CLAUDE.md', content: getClaudeMd() });
  }

  if (platforms.includes('codex') || platforms.includes('claude-code')) {
    files.push({ rel: 'AGENTS.md', content: getAgentsMd() });
  }

  for (const { rel, content } of files) {
    const filePath = path.join(targetDir, rel);
    const status = writeIfAbsent(filePath, content, force);
    result[status === 'written' ? 'written' : 'skipped'].push(rel);
  }

  for (const sub of ['topics', 'platforms', 'adapters']) {
    fs.mkdirSync(path.join(targetDir, 'skills', sub), { recursive: true });
  }

  return result;
}

/**
 * Initialize skill development scaffolding in an existing repository.
 * Prompts for platform selection, then writes the appropriate agent skill files.
 */
export async function initSkillScaffold(
  targetDir: string,
  options: InitOptions,
): Promise<void> {
  const absDir = path.resolve(targetDir);
  const force = options.force ?? false;

  if (!fs.existsSync(absDir)) {
    console.error(`Directory does not exist: ${absDir}`);
    process.exit(2);
  }

  const markerPath = path.join(absDir, '.topichub-repo.json');
  if (fs.existsSync(markerPath) && !force) {
    console.error('This directory is already initialized as a skill repo (.topichub-repo.json exists).');
    console.error('Use --force to overwrite existing files.');
    process.exit(2);
  }

  const platforms: AgentPlatform[] = options.platforms ?? await checkbox({
    message: 'Select AI coding platforms to support:',
    choices: [
      { value: 'cursor' as const, name: 'Cursor', checked: true },
      { value: 'claude-code' as const, name: 'Claude Code' },
      { value: 'codex' as const, name: 'Codex' },
    ],
    required: true,
  });

  fs.writeFileSync(markerPath, JSON.stringify({
    tenantId: options.tenantId,
    serverUrl: options.serverUrl,
    platforms,
    createdAt: new Date().toISOString(),
    cliVersion: '0.1.0',
  }, null, 2));

  const result = writeAgentSkillFiles(absDir, platforms, force);

  console.log('✓ Initialized skill development scaffolding');
  console.log('');
  if (result.written.length > 0) {
    console.log('  Created:');
    for (const f of result.written) {
      console.log(`    + ${f}`);
    }
  }
  if (result.skipped.length > 0) {
    console.log('  Skipped (already exists):');
    for (const f of result.skipped) {
      console.log(`    ~ ${f}`);
    }
  }
  console.log('  Created: skills/{topics,platforms,adapters}/');
  console.log('  Created: .topichub-repo.json');
  console.log('');
  console.log('Next steps:');
  console.log('  topichub skill create    # Create a skill');
  console.log('  topichub publish         # Publish to server');
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

  writeAgentSkillFiles(repoDir, ['cursor', 'claude-code', 'codex'], true);

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
