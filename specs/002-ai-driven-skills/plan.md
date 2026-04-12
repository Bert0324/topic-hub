# Implementation Plan: AI-Driven Skills

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-ai-driven-skills/spec.md`

## Summary

Extend the existing Skill system to support natural-language AI instructions via `SKILL.md` files. When a Skill has a `SKILL.md`, the runtime automatically injects its content as the system prompt into `AiService.complete()` on lifecycle events, passing the full topic snapshot + event context as the user prompt. AI responses are appended to the topic timeline and stored in topic metadata. The underlying AI infrastructure (AiService, ArkProvider, circuit breaker, per-tenant enablement, rate limiting, usage tracking) is already built — this plan focuses on the SKILL.md loading/parsing layer, the prompt assembly runtime, pipeline integration, and timeline output.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10, Typegoose + Mongoose 8, zod, gray-matter (new — YAML frontmatter parsing)  
**Storage**: MongoDB 7 (existing collections: `topics`, `timeline_entries`, `skill_registrations`, `tenant_skill_configs`, `ai_usage_records`)  
**Testing**: Jest + mongodb-memory-server + supertest (configs exist; no tests written yet)  
**Target Platform**: Linux server (Docker), CLI via Node  
**Project Type**: Monorepo (pnpm + Turbo): `@topichub/server` (NestJS API) + `@topichub/cli` (Ink/Node CLI)  
**Performance Goals**: AI calls complete within configured timeout (default 10s); non-AI API endpoints p95 < 500ms  
**Constraints**: AI calls must never block the core Skill pipeline; `AiService.complete()` returns `null` within 100ms when circuit open / disabled / rate-limited  
**Scale/Scope**: Single tenant can make up to 100 AI requests/hour (configurable); SKILL.md files are loaded at server startup and cached in memory

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | ✅ Pass | New code follows existing patterns (NestJS modules, Typegoose models, zod validation). No magic numbers — constants in config. |
| II. Testing Standards | ✅ Pass | Plan includes unit tests for SKILL.md parser, integration tests for pipeline AI execution, and contract tests for Ark API. Test pyramid: unit ≥80% → integration → e2e. |
| III. User Experience Consistency | ✅ Pass | CLI commands (`ai status`, `ai enable`, `ai usage`) follow existing CLI patterns. No UI changes. |
| IV. Performance Requirements | ✅ Pass | AI calls are async, non-blocking. SKILL.md parsed once at startup and cached. No N+1 queries. |
| V. Simplicity & Maintainability | ✅ Pass | NL-driven SKILL.md is simpler than code-based hooks for AI behavior. One new utility (SKILL.md parser) + one new runtime service. No unnecessary abstractions. |
| Security & Data Integrity | ✅ Pass | Tenant data isolation enforced — each AI request scoped to single tenant. Prompt content not logged at default level. API keys from env vars only. |
| Development Workflow | ✅ Pass | Feature branch, PR-based workflow. Conventional commits. |

No violations. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-driven-skills/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ai-service-request.ts
│   └── skill-md-schema.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/server/src/
├── ai/                              # EXISTING — AI infrastructure
│   ├── ai.module.ts                 # Already built
│   ├── ai.service.ts                # Already built (complete(), circuit breaker, tenant gate)
│   ├── ai-config.ts                 # Already built (env var parsing)
│   ├── ai-admin.controller.ts       # Already built (admin API)
│   ├── circuit-breaker.ts           # Already built
│   ├── providers/
│   │   ├── ai-provider.interface.ts # Already built
│   │   └── ark-provider.ts          # Already built (Volcengine Ark)
│   ├── usage/
│   │   ├── ai-usage.entity.ts       # Already built
│   │   └── ai-usage.service.ts      # Already built
│   └── __tests__/
│       └── fixtures/
│           └── test-ai-skill.ts     # MODIFY — convert to SKILL.md-based fixture
│
├── skill/
│   ├── skill.module.ts              # MODIFY — add SkillAiRuntime provider
│   ├── registry/
│   │   ├── skill-loader.ts          # MODIFY — detect and read SKILL.md files
│   │   ├── skill-registry.ts        # MODIFY — cache parsed SKILL.md content
│   │   └── skill-md-parser.ts       # NEW — parse YAML frontmatter + event sections
│   ├── pipeline/
│   │   ├── skill-pipeline.ts        # MODIFY — add runSkillAi step
│   │   └── skill-ai-runtime.ts      # NEW — prompt assembly + AI invocation + output handling
│   ├── interfaces/
│   │   ├── skill-context.ts         # Already built
│   │   ├── type-skill.ts            # Already built (no changes needed)
│   │   └── skill-md.ts              # NEW — parsed SKILL.md type definitions
│   ├── entities/
│   │   ├── skill-registration.entity.ts  # MODIFY — add skillMdContent field
│   │   └── tenant-skill-config.entity.ts # Already built
│   └── config/
│       └── skill-config.service.ts  # Already built
│
├── core/
│   ├── entities/
│   │   ├── topic.entity.ts          # Already built (no changes — metadata is Mixed)
│   │   └── timeline-entry.entity.ts # Already built (no changes — payload is Mixed)
│   ├── services/
│   │   └── timeline.service.ts      # USE — append AI_RESPONSE entries
│   └── ...
│
├── common/
│   └── enums.ts                     # MODIFY — add AI_RESPONSE to TimelineActionType
│
└── health.controller.ts             # Already built

packages/server/src/
└── test/                            # NEW — test directory
    ├── unit/
    │   ├── skill-md-parser.spec.ts
    │   └── skill-ai-runtime.spec.ts
    └── integration/
        └── skill-ai-pipeline.spec.ts

skills/                              # Runtime directory (Docker-mounted, not in repo)
└── example-alert/                   # Example SKILL.md-based skill (documentation only)
    ├── package.json
    ├── SKILL.md
    └── index.js
```

**Structure Decision**: Extends existing monorepo structure. New code concentrated in `skill/registry/` (SKILL.md parser) and `skill/pipeline/` (AI runtime). No new packages or modules — `SkillAiRuntime` is a provider within `SkillModule`, using the already-imported `AiModule`.
