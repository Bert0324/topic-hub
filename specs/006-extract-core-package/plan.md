# Implementation Plan: Extract @topichub/core

**Branch**: `006-extract-core-package` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-extract-core-package/spec.md`

## Summary

Extract a framework-agnostic `@topichub/core` npm package from the existing `packages/server` NestJS application, then refactor the server into a thin NestJS integration layer ("demo") that imports `@topichub/core`. The core package exposes a `TopicHub` facade class with `create(config)` factory, providing `ingest`, `commands`, `topics`, `auth`, `webhook`, and `messaging` APIs. This enables embedding TopicHub in external projects (e.g., experience_server with Gulux) without requiring NestJS. Additionally, update the CLI init flow to support arbitrary base URLs for connection verification.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: Mongoose 8 + Typegoose 12 (ODM), zod (validation), gray-matter (YAML frontmatter parsing), jsonwebtoken + jwks-rsa (auth)  
**Storage**: MongoDB 7  
**Testing**: Jest 29 (unit + integration), mongodb-memory-server (in-memory MongoDB for tests), supertest (HTTP)  
**Target Platform**: Node.js 20 LTS (server library + CLI)  
**Project Type**: Library (core) + web-service (demo server) + CLI  
**Performance Goals**: API p50 <200ms, p95 <500ms, p99 <1000ms (constitution requirement)  
**Constraints**: Zero `@nestjs/*` imports in core package; must accept external Mongoose connection; framework-agnostic  
**Scale/Scope**: Existing monorepo with ~80 source files in server, 55 in CLI; core extraction moves ~60 files to new package

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Constitution Rule | Status | Notes |
|------|------------------|--------|-------|
| Code Quality | I. Composition over inheritance; small modules | **PASS** | Core extraction improves modularity by decoupling business logic from framework wiring |
| Testing | II. Every feature includes tests; red-green-refactor | **PASS** | Existing tests will be migrated; new facade tests required. SC-002 mandates zero regressions |
| UX Consistency | III. All UI components follow design system | **N/A** | No UI components in this feature — server-side library extraction |
| Performance | IV. API p50 <200ms, p95 <500ms | **PASS** | No performance-affecting changes; same code paths, different packaging |
| Simplicity | V. YAGNI; every abstraction needs 2 use cases | **PASS** | TopicHub facade has 2 concrete use cases: demo server + experience_server. Port interfaces have 2 implementations (core default + NestJS wrappers) |
| Security | Data integrity, input validation at boundaries | **PASS** | Webhook signature verification stays in PlatformSkill per clarification; auth flow unchanged |
| Workflow | PRs, CI, conventional commits | **PASS** | Standard workflow; breaking change migration plan documented here |

**Gate Result**: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/006-extract-core-package/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── topichub-facade.ts
│   └── topichub-config.ts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── core/                          # NEW — @topichub/core (framework-agnostic)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Public API: TopicHub, TopicHubConfig, types
│       ├── topichub.ts            # TopicHub facade class
│       ├── config.ts              # TopicHubConfig schema (zod)
│       ├── common/
│       │   ├── enums.ts           # TopicStatus, SkillCategory, etc.
│       │   └── logger.ts          # Logger interface (port)
│       ├── entities/              # Typegoose entity definitions
│       │   ├── topic.entity.ts
│       │   ├── timeline-entry.entity.ts
│       │   ├── skill-registration.entity.ts
│       │   ├── tenant-skill-config.entity.ts
│       │   ├── task-dispatch.entity.ts
│       │   ├── tenant.entity.ts
│       │   └── ai-usage.entity.ts
│       ├── services/              # Domain services (Mongoose-based, no NestJS decorators)
│       │   ├── topic.service.ts
│       │   ├── timeline.service.ts
│       │   ├── tenant.service.ts
│       │   ├── search.service.ts
│       │   ├── dispatch.service.ts
│       │   └── crypto.service.ts
│       ├── ai/                    # AI subsystem
│       │   ├── ai.service.ts
│       │   ├── ai-config.ts
│       │   ├── ai-provider.interface.ts
│       │   ├── ark-provider.ts
│       │   ├── circuit-breaker.ts
│       │   └── ai-usage.service.ts
│       ├── skill/                 # Skill subsystem
│       │   ├── interfaces/        # Portable skill contracts
│       │   │   ├── index.ts
│       │   │   ├── type-skill.ts
│       │   │   ├── platform-skill.ts
│       │   │   ├── adapter-skill.ts
│       │   │   ├── skill-context.ts  # Uses AiCompletionPort, not AiService
│       │   │   ├── skill-manifest.ts
│       │   │   ├── skill-md.ts
│       │   │   └── setup-context.ts
│       │   ├── registry/
│       │   │   ├── skill-registry.ts
│       │   │   ├── skill-loader.ts
│       │   │   └── skill-md-parser.ts
│       │   ├── config/
│       │   │   └── skill-config.service.ts
│       │   └── pipeline/
│       │       ├── skill-pipeline.ts
│       │       └── skill-ai-runtime.ts
│       ├── command/               # Command parsing & routing
│       │   ├── command-parser.ts
│       │   ├── command-router.ts
│       │   └── handlers/         # All command handlers
│       ├── ingestion/            # Event ingestion
│       │   ├── ingestion.service.ts
│       │   └── event-payload.ts
│       └── webhook/              # Webhook dispatcher
│           └── webhook-handler.ts
│
├── server/                        # REFACTORED — @topichub/server (NestJS demo/reference)
│   ├── package.json              # Depends on @topichub/core
│   ├── tsconfig.json
│   └── src/
│       ├── main.ts
│       ├── app.module.ts         # Wires TopicHub into NestJS DI
│       ├── topichub.provider.ts  # Creates TopicHub instance, registers as NestJS provider
│       ├── controllers/          # Thin controllers delegating to hub.*
│       │   ├── health.controller.ts
│       │   ├── ingestion.controller.ts
│       │   ├── command.controller.ts
│       │   ├── webhook.controller.ts
│       │   ├── topic-detail.controller.ts
│       │   ├── search.controller.ts
│       │   ├── admin.controller.ts
│       │   ├── auth.controller.ts
│       │   └── dispatch.controller.ts
│       ├── guards/
│       │   ├── tenant.guard.ts
│       │   └── jwt-auth.guard.ts
│       └── database/
│           └── database.module.ts # MongooseModule.forRootAsync (env config)
│
├── cli/                          # MINOR CHANGES — base URL support
│   └── src/
│       └── commands/init/steps/
│           └── server-url.ts     # Updated: support arbitrary base URL paths
│
└── skills/                       # UNCHANGED
```

**Structure Decision**: Monorepo with 4 workspace packages (core, server, cli, skills). The `core` package contains all domain logic with zero NestJS dependencies. The `server` package becomes a thin NestJS shell that creates a `TopicHub` instance and delegates all operations through it. This is the standard "ports & adapters" / "hexagonal architecture" approach.

## Complexity Tracking

No constitution violations requiring justification. The 4-package monorepo is justified: `core` (library), `server` (reference deployment), `cli` (developer tool), and `skills` (user-authored content) are all distinct use cases with independent consumers.
