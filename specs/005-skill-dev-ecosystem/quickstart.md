# Quickstart: Skill Development Ecosystem

**Feature**: 005-skill-dev-ecosystem | **Date**: 2026-04-10

## Developer Workflow Overview

```text
cli init → skill-repo create → skill create (Q&A) → develop with AI → publish → serve (debug)
```

## Step 1: Initialize CLI

```bash
topichub init
# Prompts for: server URL, admin token, tenant ID, executor preference
# Stores config in ~/.topichub/config.json
```

## Step 2: Create a Skill Repository

```bash
topichub skill-repo create my-team-skills
cd my-team-skills
```

This creates a project with:
- Agent skill files (`.cursor/rules/`, `AGENTS.md`, `CLAUDE.md`) for AI-assisted development
- `skills/` directory for individual skills
- `.topichub-repo.json` with tenant and server configuration

## Step 3: Create a Skill (Interactive Q&A)

```bash
topichub skill create

# Q&A prompts:
# ? Skill name: github-adapter
# ? Category: adapter
# ? External system: github
# ? Auth requirement: oauth2
# ? OAuth scopes: repo, read:user
```

Or with pre-selected options:

```bash
topichub skill create my-topic-skill --category topic
```

## Step 4: Develop the Skill

Open the repo in your AI coding tool:

```bash
# Cursor
cursor .

# Claude Code
claude .

# Codex
codex .
```

The bundled agent skills guide your AI through:
- Implementing the required interfaces for your skill category
- Writing the SKILL.md agent instructions
- Creating tests

### Skill Implementation Files

```text
skills/github-adapter/
├── package.json    # Manifest with topichub.category, topichub.sourceSystem, etc.
├── SKILL.md        # Agent instructions (gray-matter frontmatter + markdown body)
├── src/
│   └── index.ts    # Implements AdapterSkill interface
└── README.md
```

## Step 5: Test Locally

```bash
# In a separate terminal, start the local executor
topichub serve --executor claude-code

# Dispatch will be claimed and processed locally
# SKILL.md changes are picked up on next dispatch (hot-reload)
```

Debug output:
```text
[DISPATCH] Received: topic-123 / github-adapter / created
[CLAIM]    Claimed dispatch abc-def
[AGENT]    Running claude-code with github-adapter...
[RESULT]   Completed in 4200ms
```

## Step 6: Publish to Server

```bash
# Publish as private (default — regular tenant admin)
topichub publish

# Output:
# Publishing 2 skill(s) from my-team-skills... (private)
# ✓ github-adapter (created)
# ✓ bug-report-handler (updated)
# Published 2 skills to https://topichub.example.com

# Publish as public (super-admin only)
topichub publish --public

# Output:
# Publishing 2 skill(s) from my-team-skills... (public)
# ✓ github-adapter (created)
# ✓ bug-report-handler (updated)
# Published 2 public skills to https://topichub.example.com
```

Dry-run mode to validate first:

```bash
topichub publish --dry-run
```

> **Note**: The development workflow is the same for public and private skills.
> The only difference is `--public` at publish time (requires super-admin).
> Public skills can also be loaded from the server's `SKILLS_DIR` for direct editing.

## Step 7: Create IM Groups (Platform Skills)

```bash
topichub group create "Bug Triage" --platform feishu --members user1,user2
# ✓ Created group "Bug Triage" on Feishu (group ID: og_xxxx)
```

## Common Operations

### List skills

```bash
topichub skill list                    # All skills (public + private)
topichub skill list --scope private    # Only tenant's private skills
topichub skill list --category adapter # Filter by category
```

### Check publish validation

```bash
topichub publish --dry-run
# Validates manifests, SKILL.md parsing, name format
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Not authenticated" | Run `topichub init` or `topichub auth <token>` |
| "Not in a skill repo" | Navigate to a directory with `.topichub-repo.json` or create one with `skill-repo create` |
| "Skill name conflict" | Choose a different name or the existing skill will be overwritten on publish |
| "Server unreachable" | Check `serverUrl` in `.topichub-repo.json` or use `--server` flag |
