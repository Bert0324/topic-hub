# Implementation Plan: AI-Driven Skills

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ai-driven-skills/spec.md`

## Summary

Add an `AiModule` to Topic Hub that provides a provider-agnostic `AiService` injectable by any Skill. The initial provider wraps the Volcengine Ark API (Doubao Seed model) using Node.js built-in `fetch`. Configuration is env-var-driven — the same code handles public and internal-remote deployments. The `AiService` includes circuit breaker protection, per-tenant enablement and rate limiting, usage tracking, and graceful degradation (`null` return, never throws). No existing code paths are modified — AI is purely additive and opt-in at the Skill level. No pre-built Skills are bundled; the `skills/` directory ships empty.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS
**Primary Dependencies**: NestJS 10 (server), Ink 5 + React 18 (CLI), Typegoose + Mongoose (ODM), zod (validation)
**New Dependencies**: None — HTTP calls via Node.js 20 built-in `fetch`. No vendor SDK.
**Storage**: MongoDB 7 (new collection: `ai_usage_records`)
**Testing**: Jest (unit + integration), supertest (API e2e), mongodb-memory-server, mock HTTP for AI provider
**Target Platform**: Linux/macOS server (Docker), CLI on any Node.js 20+
**Project Type**: TypeScript monorepo (pnpm workspaces) — server + CLI
**AI Provider**: Volcengine Ark API — Doubao Seed model (`doubao-seed-2-0-pro-260215`), Responses API format (`/api/v3/responses`), Bearer token auth
**Performance Goals**: `AiService.complete()` returns `null` within 100ms when circuit open or rate limited; AI calls timeout at configurable `AI_TIMEOUT_MS` (default 10s)
**Constraints**: AI must not affect existing non-AI code paths. `null` return pattern — never throw from `AiService`. No bundled Skills. No cross-topic features.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | PASS | `AiProvider` interface uses composition. `AiService` is single-responsibility. Named constants for config. No global state. |
| II. Testing Standards | PASS | Mock HTTP boundary for provider tests. Integration test with circuit breaker + rate limiter. Test-only Skill fixture (not bundled). |
| III. User Experience Consistency | N/A | No end-user UI changes. CLI commands follow existing Ink patterns. |
| IV. Performance Requirements | PASS | `null` return < 100ms for disabled/limited/circuit-open. AI timeout configurable. Non-AI endpoints unaffected. API p50/p95 targets maintained. |
| V. Simplicity & Maintainability | PASS | Single module (`AiModule`), one interface, one implementation. No DSL, no embedding store, no fine-tuning. YAGNI enforced. |
| Security & Data Integrity | PASS | AI API key in env var only. Per-request tenant isolation. Prompt content not logged at default level. Input validated via zod. |

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-driven-skills/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── ai-provider.md   # AI provider interface contract
│   ├── api.md           # Modified REST API endpoints
│   └── cli-commands.md  # New CLI commands
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── server/
│   └── src/
│       ├── ai/                           # NEW — AI module
│       │   ├── ai.module.ts              # NestJS module, exports AiService
│       │   ├── ai.service.ts             # Orchestrator: provider + circuit breaker + rate limit + tenant check
│       │   ├── ai-config.ts              # Env var config schema (zod)
│       │   ├── providers/
│       │   │   ├── ai-provider.interface.ts  # Provider contract
│       │   │   └── ark-provider.ts           # Volcengine Ark implementation
│       │   ├── circuit-breaker.ts         # Circuit breaker logic
│       │   ├── usage/
│       │   │   ├── ai-usage.service.ts    # Per-tenant rate limiting + tracking
│       │   │   └── ai-usage.entity.ts     # Usage record Typegoose entity
│       │   └── __tests__/
│       │       ├── ai.service.spec.ts
│       │       ├── ark-provider.spec.ts
│       │       ├── circuit-breaker.spec.ts
│       │       └── ai-usage.service.spec.ts
│       ├── skill/                         # MODIFIED — expose AiService to Skills
│       │   ├── registry/
│       │   │   └── skill-registry.ts      # MODIFIED: pass AiService to Skills during init
│       │   └── skill.module.ts            # MODIFIED: imports AiModule
│       ├── health.controller.ts           # MODIFIED: add AI status to /health
│       └── app.module.ts                  # MODIFIED: imports AiModule
├── cli/
│   └── src/
│       └── commands/
│           └── ai/                        # NEW — AI admin commands
│               ├── status.ts              # topichub-admin ai status
│               ├── enable.ts              # topichub-admin ai enable
│               ├── disable.ts             # topichub-admin ai disable
│               └── usage.ts              # topichub-admin ai usage
```

**Structure Decision**: Single new module `ai/` under `packages/server/src/`, consistent with existing peer modules (`skill/`, `command/`, `ingestion/`). The `AiModule` exports `AiService` which `SkillModule` imports — making it available to all Skills via the registry. CLI gains a new `ai/` command group under the existing command structure. No bundled Skills — `packages/skills/` stays empty.

## Constitution Re-Check (Post-Design)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | PASS | `AiProvider` interface justified by 2+ use cases (Ark now, OpenAI/Ollama later). Circuit breaker is a named utility. |
| II. Testing Standards | PASS | Provider mocked at HTTP level. Circuit breaker tested with deterministic failure sequences. Rate limiter tested with time mocking. Test-only Skill fixture for integration. |
| V. Simplicity & Maintainability | PASS | ~8 new files in server, ~4 in CLI. No existing files structurally changed. Minimal surface area. |
| Security & Data Integrity | PASS | API key env-only. Tenant ID required on every `complete()` call. No cross-tenant data in provider layer. Prompt content excluded from default logs. |
