import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { checkbox } from '@inquirer/prompts';

export type AgentPlatform = 'cursor' | 'claude-code' | 'codex';

interface RepoOptions {
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

## Overview

Skills are self-contained packages that plug into the Topic Hub dispatch loop.
Two categories: **type** (topic lifecycle) and **adapter** (external system connector).
Two authoring modes: **code skills** (TypeScript) and **md-only skills** (just a SKILL.md).

IM platform integration is handled by the built-in OpenClaw bridge at the server level — not by skills.

## When to Use

- Creating a new skill (type or adapter)
- Modifying an existing skill's manifest, hooks, or SKILL.md
- Debugging skill loading, registration, or dispatch
- Working in \`skills/topics/\` or \`skills/adapters/\`

Do **not** use for IM platform integration — that is configured at the server level via the OpenClaw bridge.

## Quick Reference

| Category | \`topichub.category\` | Key | Purpose | Md-only? |
|----------|---------------------|-----|---------|----------|
| **type** | \`type\` | \`topicType\` | Topic lifecycle hooks, field schema, card rendering | Yes |
| **adapter** | \`adapter\` | \`sourceSystem\` | Transform external webhooks into topic events | No (requires code) |

### Required Exports

| Category | Required | Optional |
|----------|----------|----------|
| **TypeSkill** | \`manifest\`, \`renderCard\`, \`validateMetadata\` | \`onTopicCreated\`, \`onTopicUpdated\`, \`onTopicStatusChanged\`, \`onTopicAssigned\`, \`onTopicClosed\`, \`onTopicReopened\`, \`onSignalAttached\`, \`onTagChanged\` |
| **AdapterSkill** | \`manifest\`, \`transformWebhook\` | \`runSetup\` |

## File Layout

### Code skill

\`\`\`
skills/{topics,adapters}/<skill-name>/
  package.json      # manifest with topichub config
  SKILL.md          # agent instructions (frontmatter + system prompt)
  src/index.ts      # implements TypeSkill or AdapterSkill
  tests/
\`\`\`

### Md-only skill (type category only)

\`\`\`
skills/topics/<skill-name>/
  SKILL.md          # frontmatter declares name, topicType, executor, etc.
\`\`\`

The system auto-generates a TypeSkill stub with \`ai: true\`, generic card rendering,
and permissive metadata validation. All logic is AI-driven via the SKILL.md prompt.

## Manifest (\`package.json\`)

### Type skill

\`\`\`json
{
  "name": "my-bug-tracker",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "type",
    "topicType": "bug"
  },
  "dependencies": {
    "@topichub/core": "workspace:*"
  }
}
\`\`\`

### Adapter skill

\`\`\`json
{
  "name": "github-adapter",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "adapter",
    "sourceSystem": "github",
    "webhookPath": "/webhooks/github"
  },
  "dependencies": {
    "@topichub/core": "workspace:*"
  }
}
\`\`\`

Skill name regex: \`^[a-z][a-z0-9-]{1,62}[a-z0-9]$\`

## SKILL.md Frontmatter

\`\`\`yaml
---
name: my-skill
description: What this skill does
topicType: my-type          # for type skills
executor: cursor            # claude | cursor | codex | none
maxTurns: 6
allowedTools:
  - topichub_update_topic
  - topichub_add_timeline
---
\`\`\`

The markdown body becomes the AI system prompt.
Use \`## on<EventName>\` headings for per-event instructions.

## Md-Only Skill Example

\`\`\`yaml
---
name: github-trends
description: Tracks GitHub trending repos and enriches topics
topicType: github-trend
executor: cursor
maxTurns: 8
allowedTools:
  - topichub_update_topic
  - topichub_add_timeline
---

# GitHub Trends Tracker

## onTopicCreated
1. Read the repo URL from topic metadata.
2. Fetch repository stats.
3. Classify by domain and add tags.
4. Post analysis summary to timeline.
\`\`\`

## Publish & Test

\`\`\`bash
topichub publish                      # publish all skills to server
topichub serve                        # local dev with hot-reload
topichub serve --executor none        # dry-run (no agent execution)
\`\`\`

Scans \`skills/topics/\` and \`skills/adapters/\`, validates manifests, bundles
SKILL.md + source, POSTs batch to server.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Md-only skill with \`category: adapter\` | Adapters require code — use a code skill with \`transformWebhook\` |
| Missing \`topicType\` in type skill manifest | Add \`topicType\` under \`topichub\` in package.json |
| SKILL.md frontmatter missing \`name\` | Add \`name\` field matching the directory name |
| Using \`platform\` category | Platform skills no longer exist — IM is handled by the OpenClaw bridge |
`;
}

function getCursorSkillMd(): string {
  return `---
name: writing-topic-hub
description: >-
  Use when creating, modifying, or debugging Topic Hub skills, or when working
  in the skills/ directory. Covers type skills, adapter skills, manifests,
  SKILL.md authoring, md-only skills, publishing, and testing.
---

${getSkillContent()}`;
}

function getCursorRuleMdc(): string {
  return `---
description: "Use when creating, modifying, or debugging Topic Hub skills, or when working in the skills/ directory"
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

Skills are organized by category under \`skills/topics/\` and \`skills/adapters/\`.
IM platform integration is handled by the OpenClaw bridge. Each skill has:
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

  for (const sub of ['topics', 'adapters']) {
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
  console.log('  Created: skills/{topics,adapters}/');
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
    serverUrl: options.serverUrl,
    createdAt: new Date().toISOString(),
    cliVersion: '0.1.0',
  }, null, 2));

  fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify({
    name: repoName,
    version: '1.0.0',
    private: true,
    topichub: {
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
