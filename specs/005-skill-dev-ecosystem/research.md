# Research: Skill Development Ecosystem

**Feature**: 005-skill-dev-ecosystem | **Date**: 2026-04-10

## R1: CLI Interactive Q&A Engine Pattern

**Decision**: Use a sequential prompt-based Q&A engine built on Node.js `readline` (or `inquirer`-style library) within the CLI, not Ink/React components.

**Rationale**: The existing CLI does not actually use Ink for interactive flows — `init` and other commands use plain console output. Adding a prompt library keeps consistency and avoids the complexity of building React-based interactive forms. The Q&A flow is linear (category → category-specific questions → scaffold), which maps cleanly to a sequential prompt pattern.

**Alternatives considered**:
- Ink interactive components: Rejected — adds rendering complexity for a linear form; no existing Ink usage pattern to build on
- CLI flags only (no interactive): Rejected — contradicts the spec requirement for guided Q&A

## R2: Skill Repo Scaffolding Structure

**Decision**: A skill repo is a standalone npm/TypeScript project with the following structure:

```text
my-skills/
├── package.json           # name, version, topichub config (tenantId, serverUrl)
├── tsconfig.json          # TypeScript config
├── .cursor/rules/         # Bundled cursor rules for writing-topic-hub
├── AGENTS.md              # Agent skill for Claude Code / Codex
├── CLAUDE.md              # Agent skill for Claude Code
├── skills/
│   └── <skill-name>/      # Each skill is a subdirectory
│       ├── package.json   # Skill manifest (name, category, metadata)
│       ├── SKILL.md       # Agent instructions (gray-matter frontmatter)
│       ├── src/
│       │   └── index.ts   # Entry point
│       └── README.md
└── README.md
```

**Rationale**: Mirrors the server's `SKILLS_DIR` structure where each skill is a subdirectory with its own `package.json`. The root `package.json` adds repo-level metadata (tenant, server URL). Agent skill files at the root apply to the entire repo.

**Alternatives considered**:
- Single-skill repos: Rejected — spec clarification chose repo-first with multi-skill support
- Monorepo with workspaces per skill: Rejected — overengineered for typical 1–5 skills per repo

## R3: Batch Publish Mechanism

**Decision**: The `publish` CLI command packages all skills from the `skills/` directory and sends them to the server via a single `POST /admin/skills/publish` endpoint with a multipart or JSON payload containing the full skill data (manifest, SKILL.md content, source code as a tarball or flattened structure).

**Rationale**: The existing `AdminService.installSkill` works from a file path. For remote publish, we need a network-capable equivalent. A single batch endpoint reduces round-trips and ensures atomicity (all skills from a repo are published together or none are). The server stores skill data in MongoDB (not on disk), so publish uploads the skill content directly.

**Alternatives considered**:
- One API call per skill: Rejected — loses atomicity guarantee; more network overhead
- Git-based push (server pulls from git): Rejected — adds git server dependency; complicates auth
- Package tarball upload per skill: Rejected — unnecessary packaging complexity when we can send JSON

## R4: Tenant-Scoped Skill Storage

**Decision**: Add `tenantId` (nullable) and `isPrivate` fields to the `SkillRegistration` entity. Public skills have `tenantId = null` and `isPrivate = false`. Private skills have `tenantId` set and `isPrivate = true`. Skill queries are filtered by `(isPrivate = false) OR (tenantId = requestingTenantId)`.

**Rationale**: Minimal change to the existing data model. The current `skill_registrations` collection has no tenant scoping — all skills are global. Adding these two fields enables tenant isolation with a simple query filter. The `isPrivate` flag provides an explicit semantics beyond just checking `tenantId != null`.

**Alternatives considered**:
- Separate collection for private skills: Rejected — duplicates schema; complicates unified skill listing
- Tenant-prefixed skill names: Rejected — breaks existing skill name references; fragile

## R5: Platform Webhook and Command Pipeline Integration

**Decision**: Reuse the existing webhook controller pattern (`POST /webhooks/:platform`). Platform skills already define `handleWebhook` and `createGroup` interfaces. The CLI `group create` command calls a new `POST /admin/groups` server endpoint which delegates to the platform skill's `createGroup` method. No new webhook infrastructure needed.

**Rationale**: The existing `webhook.controller.ts` already handles platform webhook dispatch. The command pipeline (`command-parser.ts` → `command-router.ts` → handlers) parses IM commands. What's missing is a CLI-initiated group creation path and ensuring the three-interface contract is clearly enforced.

**Alternatives considered**:
- Separate webhook service per platform: Rejected — existing single controller pattern works; adding services per platform violates simplicity
- CLI directly calls IM platform API: Rejected — bypasses server; loses audit trail and multi-tenant isolation

## R6: Adapter Credential Storage

**Decision**: Reuse the existing CLI credential storage pattern (keytar for OS keychain on desktop, encrypted file fallback). Adapter credentials are stored per `(userId, adapterName)` key. The adapter skill's `runSetup` method handles the auth flow and stores credentials via a `CredentialStore` interface injected by the system.

**Rationale**: The CLI already uses keytar for admin token storage. Extending this for adapter credentials maintains consistency. Storing per-user (not per-tenant) allows different users in the same tenant to have their own external platform credentials.

**Alternatives considered**:
- Server-side credential vault: Rejected — adds operational complexity; credentials should stay local to the user's machine for security
- Environment variables only: Rejected — poor UX; no persistence between sessions

## R7: SKILL.md Hot-Reload in Serve Mode

**Decision**: On each new dispatch, re-read the SKILL.md file from disk before building the agent prompt. No file-watcher needed — the read-on-dispatch pattern is sufficient since dispatches are infrequent (seconds/minutes apart) and file reads are cheap.

**Rationale**: The spec requires updated SKILL.md to be used without restart. File watching adds complexity (debouncing, error handling). Since the serve loop already loads skill metadata for each dispatch, reading SKILL.md at that point is a one-line change.

**Alternatives considered**:
- File watcher (chokidar/fs.watch): Rejected — unnecessary complexity for the dispatch frequency
- Manual reload command: Rejected — contradicts spec requirement for automatic reload

## R8: Writing-Topic-Hub Meta-Skill Design

**Decision**: The bundled meta-skill consists of three IDE-native files at the skill repo root:

1. **`.cursor/rules/writing-topic-hub.mdc`** — Cursor rules file containing Topic Hub skill conventions, manifest schema, interface contracts, and code generation guidelines
2. **`AGENTS.md`** — Agent instructions for Claude Code and Codex with equivalent content
3. **`CLAUDE.md`** — Claude Code-specific configuration (references AGENTS.md)

Content covers: skill manifest structure per category, SKILL.md frontmatter format, required interfaces to implement, testing patterns, and publish workflow.

**Rationale**: These three files cover the major AI coding tools. The content is generated from the same source of truth (skill interface definitions) so it stays consistent. Files are placed at the repo root where all tools automatically discover them.

**Alternatives considered**:
- Single SKILL.md at repo root: Rejected — SKILL.md is the convention for individual skill agent instructions, not repo-level meta-skills
- Separate npm package for the meta-skill: Rejected — spec clarification chose bundled-in-scaffold delivery

## R9: Unified Workflow with Role-Based Publish Scope

**Decision**: Public and private skills use the exact same development workflow (`skill-repo create → skill create → develop → publish`). The `publish` command accepts a `--public` flag. Only super-admins can use `--public`; regular tenant admins always publish as private. The server validates the requester's role before accepting public publish requests.

**Rationale**: A unified workflow reduces learning cost — developers don't need to learn two different processes. The difference between public and private is a single flag at publish time, enforced server-side. Public skills can also be loaded from the server's `SKILLS_DIR` as a fast-path for platform developers.

**Alternatives considered**:
- Repo-level scope setting (set at creation time): Rejected — less flexible; can't change scope without recreating the repo
- `--public` flag on publish (chosen): Simple, explicit, server-enforced
- Separate API endpoints for public vs private publish: Rejected — unnecessary duplication; a single endpoint with a flag is simpler

**Super-admin detection**: The server identifies super-admins via the admin token. The existing admin auth system needs a `role` or `isSuperAdmin` field. For initial implementation, this can be a simple flag on the `Tenant` entity or a dedicated super-admin token.
