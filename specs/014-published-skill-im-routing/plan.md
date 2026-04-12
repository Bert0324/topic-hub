# Implementation Plan: Published skill IM routing & IM→executor safety

**Branch**: `014-published-skill-im-routing` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification + planning note: map multi-platform IM to the correct identity/executor token so dispatches never cross wires; local execution remains trustworthy.

## Summary

1. **Published `/skill` routing**: Extend IM slash routing so the first token can match **Skill Center published** names (Mongo-backed catalog) without copying skill trees onto the API host disk. Precedence: built-in commands → published name → disk-registered name (if both exist, document order) → relay with “no published skill matched” hint.

2. **Unknown token path**: When a slash line is not built-in and not in the published set, still **relay** to the bound executor and add a **structured** flag in the dispatch payload so the local agent sees that no remote catalog name matched (FR-004 / SC-005).

3. **IM → identity → executor safety**: Keep and harden the invariant chain already present in the webhook: **verified inbound** `(platform, platformUserId)` → `resolveUserByPlatform` → `claimToken` → `dispatch.targetExecutorToken`; executor APIs list/claim only rows matching their **executor registration token** + **claim** filter. Planning adds explicit tests and docs for **multi-binding** (one serve session, many IM contexts) and **credential switch** (re-`/register` rotates `claimToken`).

4. **CLI surface**: Expose skill-repo workflows per FR-008 (concrete verbs in tasks phase).

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Mongoose 8 / Typegoose 12, existing `@topichub/core` command router & webhook pipeline  
**Storage**: MongoDB — existing `skill_registrations`, `user_identity_bindings`, `task_dispatches`, `executor_heartbeats`  
**Testing**: Jest in `packages/core` (unit + integration-style tests for router/dispatch payload)  
**Target Platform**: Linux server (API) + local CLI executor (`serve`)  
**Project Type**: Monorepo — `packages/core` (routing, services), `packages/server` (HTTP), `packages/cli` (executor, `skill-repo`)  
**Performance Goals**: Published-name lookup must stay **sub‑100ms p95** per IM message at nominal catalog sizes (≤10k public names); use bounded cache (see research).  
**Constraints**: No legacy `/topichub` compatibility (FR-009); `/help` unbound path unchanged (FR-007).  
**Scale/Scope**: Single-tenant dev first; catalog query indexed on skill `name` (already unique index).

## Constitution Check

| Gate | Status | Notes |
|------|--------|--------|
| I. Code quality | Pass | Use named constants for cache TTL, hint field names; thin router facades |
| II. Tests | Pass | New tests for routing precedence, relay hint payload, dispatch filtering |
| III. UX | Pass | User-facing hint text must be actionable, not raw errors |
| IV. Performance | Pass | Cache / indexed query; document p95 budget in research |
| V. Simplicity | Pass | Prefer extending `matchSkillCommandToken` over parallel routing systems |
| Security | Pass | No trust of client-supplied executor id; binding + heartbeat gates preserved |

**Re-check after Phase 1**: Contracts and data-model align with constitution (no tokens in logs).

## Project Structure

### Documentation (this feature)

```text
specs/014-published-skill-im-routing/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
└── contracts/           # Phase 1
    ├── im-dispatch-payload.md
    └── published-skill-routing.md
```

### Source code (expected touchpoints)

```text
packages/core/src/
├── command/command-router.ts          # Inject composite matchSkillCommandToken
├── skill/registry/skill-registry.ts   # Optional: split “disk names” vs catalog port
├── services/skill-center.service.ts   # Published name queries + cache invalidation hooks
├── webhook/webhook-handler.ts         # /help path unchanged; ensure dispatchMeta integrity
├── skill/pipeline/skill-pipeline.ts   # Relay payload enrichment for hint
├── command/handlers/relay.handler.ts  # Pass hint fields into execute()
└── topichub.ts                          # Wire new PublishedSkillCatalog port into router

packages/cli/src/
├── commands/serve/task-processor.ts   # Read hint from payload; prepend to prompt if present
└── commands/skill-repo/               # FR-008 surface (scaffold or extend existing)
```

**Structure Decision**: All routing and dispatch shape changes live in **core**; **CLI** only consumes enriched payload and implements `skill-repo` UX.

## Complexity Tracking

No constitution violations requiring justification.

## Phase 0 — Research

See [research.md](./research.md) (generated below).

## Phase 1 — Design & Contracts

See [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).

## Phase 2 — Implementation Outline (for `/speckit.tasks`)

1. **Published name provider**: Implement `PublishedSkillCatalog` (interface in core) with Mongo query `skill_registrations` where published catalog entry exists + TTL in-memory set (case-insensitive keys). Invalidate on publish/delete paths (SkillCenterService hooks).

2. **Composite token matcher**: `matchSkillCommandToken(token)` returns: built-in already excluded by router order; then **exact** published name (canonical casing from DB); then existing disk `SkillRegistry` match.

3. **Relay hint**: When router returns `relay` and line was slash-shaped but token not published, set `event.payload.publishedSkillRouting` (see contract) before `skillPipeline.execute`.

4. **Executor prompt**: Task processor merges hint into system/user prompt boundary per CLI convention.

5. **Security tests**: Table-driven tests proving dispatches with `targetExecutorToken` A are not visible to executor token B; prove re-binding revokes old token within heartbeat window.

6. **`skill-repo` CLI**: Minimal first slice (e.g. `list`, `path`) delegating to existing APIs where possible.

## Post-Design Constitution Re-check

Contracts avoid logging tokens; performance budget documented; tests mandated for routing and security tables — **Pass**.
