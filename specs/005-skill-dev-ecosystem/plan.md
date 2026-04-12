# Implementation Plan: Skill Development Ecosystem

**Branch**: `005-skill-dev-ecosystem` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-skill-dev-ecosystem/spec.md`

## Summary

Build a complete skill development ecosystem with a **unified workflow** for both public and private skills. The developer flow is identical: `init → skill-repo create → skill create (Q&A) → develop with AI agent → publish`. Regular tenant admins publish as private; super-admins can use `--public`. Public skills also support direct editing in `SKILLS_DIR`.

Skills are organized by **3 fixed categories** in subdirectories: `skills/topics/`, `skills/platforms/`, `skills/adapters/`. Each skill is a folder under its category. Both public (`packages/skills/`) and private repos use the same structure. All skill repos include bundled AI agent skills (writing-topic-hub) for Cursor/Claude Code/Codex.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Typegoose + Mongoose 8, zod, gray-matter, @modelcontextprotocol/sdk, keytar  
**Storage**: MongoDB 7  
**Testing**: Jest 29 + ts-jest, @nestjs/testing + supertest + mongodb-memory-server  
**Target Platform**: Node.js server (NestJS) + Node.js CLI  
**Project Type**: pnpm monorepo (`packages/server`, `packages/cli`) with Turbo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Code Quality | PASS | Existing lint config |
| Testing | PASS | Jest configured for both packages |
| UX Consistency | N/A | CLI-only |
| Performance: API p50 < 200ms | PASS | Existing Mongoose patterns |
| Simplicity: YAGNI | PASS | 3 categories justify templates; unified workflow reduces code paths |
| Security | PASS | Admin token guard; super-admin check for `--public`; zod validation |
| Workflow | PASS | Standard PR/CI flow |

**Post-Phase 1 Re-Check**: All gates PASS. Category-based directory structure simplifies skill discovery (predictable paths). Unified workflow = one publish code path with a flag.

## Project Structure

### Skill Directory Layout (unified for public and private)

```text
skills/
├── topics/                    # Topic type skills
│   └── <skill-name>/
│       ├── package.json       # Manifest with topichub.category = "type"
│       ├── SKILL.md           # Agent instructions
│       ├── src/index.ts       # Entry point
│       └── README.md
├── platforms/                 # Platform skills
│   └── <skill-name>/
│       └── ...
└── adapters/                  # Adapter skills
    └── <skill-name>/
        └── ...
```

### Public Skills (`packages/skills/`)

```text
packages/skills/
├── .cursor/rules/writing-topic-hub.mdc   # AI rules for public skill dev
├── AGENTS.md                              # Claude Code / Codex guide
├── CLAUDE.md                              # Claude Code config
├── topics/                                # Public topic skills
├── platforms/                             # Public platform skills
└── adapters/                              # Public adapter skills
```

### Source Code Changes (from previous implementation)

All core implementation is complete (T001–T053). The category-based directory structure is the latest delta:

**Modified files**:

| File | Change |
|------|--------|
| `packages/cli/src/scaffold/repo-scaffold.ts` | Creates `skills/topics/`, `skills/platforms/`, `skills/adapters/` instead of flat `skills/` |
| `packages/cli/src/scaffold/skill-scaffold.ts` | Places skills in category subdirectory (type→topics, platform→platforms, adapter→adapters) |
| `packages/cli/src/commands/publish/index.ts` | Scans category subdirectories instead of flat `skills/*` |
| `packages/cli/src/scaffold/templates/agent-skills/*` | All templates reference category-based paths |
| `packages/skills/` | Added `.cursor/rules/`, `AGENTS.md`, `CLAUDE.md`; renamed `adpters/` → `adapters/` |

### Category Mapping

| Manifest `topichub.category` | Directory | Description |
|------------------------------|-----------|-------------|
| `type` | `skills/topics/` | Topic type skills with lifecycle hooks |
| `platform` | `skills/platforms/` | IM platform integration (webhook, commands, cards) |
| `adapter` | `skills/adapters/` | External system connectors (GitHub, Jira, etc.) |

## Key Design Decisions

Consolidated from all clarification sessions:

1. **Repo-first workflow** — all skill creation happens inside a skill repo
2. **Unified workflow** — public and private skills use identical development flow
3. **`--public` flag** — only super-admins can publish public skills (FR-012a)
4. **Overwrite on publish** — no server-side version history; devs manage via git
5. **Batch publish** — repo is the deployment unit; all skills published together
6. **Bundled AI agent skills** — `.cursor/rules/`, `AGENTS.md`, `CLAUDE.md` in every repo
7. **Category subdirectories** — `skills/topics/`, `skills/platforms/`, `skills/adapters/`
8. **Hot-reload** — SKILL.md re-read from disk on each dispatch in serve mode
9. **Credential storage** — keytar (OS keychain) per (userId, adapterName)

## Complexity Tracking

No constitution violations to justify.
