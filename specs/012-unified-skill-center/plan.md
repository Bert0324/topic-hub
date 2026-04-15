# Implementation Plan: Unified Skill Center

**Branch**: `012-unified-skill-center` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-unified-skill-center/spec.md`

## Summary

Eliminate all skill categories (topic/platform/adapter), replacing them with a single unified skill type defined by SKILL.md — executed locally like Cursor superpowers. Introduce a Skill Center (server registry + local web UI) for publishing, discovering, liking, and using community skills. Secure the IM-to-local execution chain by wiring `ImBinding` into dispatch routing, authenticating dispatch claims with executor tokens, and supporting multiple concurrent executors per identity. Remove tenant-scoped skill infrastructure and the bundled `writing-topic-hub` template. Retain `skill-repo` as local organization only; publishing operates per-skill.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Typegoose + Mongoose 8 (ODM), zod (validation), gray-matter (SKILL.md parsing), @modelcontextprotocol/sdk (MCP), eventsource (SSE client), @inquirer/prompts (CLI)  
**Storage**: MongoDB 7 (existing collections undergo schema migration)  
**Testing**: Jest + ts-jest (unit/integration), supertest (HTTP)  
**Target Platform**: Linux server (MongoDB + NestJS), local CLI (Node.js)  
**Project Type**: Monorepo — `packages/core` (domain), `packages/server` (HTTP), `packages/cli` (CLI + local web UI)  
**Performance Goals**: API p95 < 500ms, Skill Center UI load < 3s, publish < 10s  
**Constraints**: No breaking change to IM webhook signature; migration must preserve existing dispatches  
**Scale/Scope**: ~500 published skills, ~50 concurrent users, ~10 IM platform bindings

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Code quality (lint, type-check, zero warnings) | PASS | All changes must pass `npm run lint` and `tsc --noEmit` |
| Testing standards (unit ≥80%, integration for critical paths) | PASS | Auth on dispatch, IM binding, skill publish are critical paths requiring integration tests |
| Security (input validation, auth on every protected endpoint) | PASS with fix | **Current gap**: dispatch claim/complete/fail are unauthenticated. This plan **fixes** that by requiring executor token auth. |
| Performance (API p50 < 200ms, p95 < 500ms) | PASS | No new heavy operations; skill pull is a single document fetch |
| Simplicity (YAGNI, justify abstractions) | PASS | Removing 3 categories → 1 type is a simplification. Skill Center UI is minimal (no SPA framework). |
| Accessibility (WCAG 2.1 AA) | PASS | Skill Center web UI must meet WCAG; semantic HTML, keyboard nav, screen reader |
| Dependencies audited | PASS | No new heavy deps; local web server uses built-in `http` module or existing NestJS static serve |

## Project Structure

### Documentation (this feature)

```text
specs/012-unified-skill-center/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── skill-center-api.md
│   ├── dispatch-auth-api.md
│   └── im-commands-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── core/src/
│   ├── entities/
│   │   ├── skill-registration.entity.ts  # MODIFY: remove category, add likes/usageCount
│   │   ├── task-dispatch.entity.ts       # MODIFY: add targetExecutorToken, remove tenantId dependency
│   │   ├── im-binding.entity.ts          # MODIFY: activate and wire into services
│   │   ├── executor-registration.entity.ts # MODIFY: unify with heartbeat
│   │   ├── skill-like.entity.ts          # NEW: per-identity per-skill like records
│   │   └── skill-usage.entity.ts         # NEW: per-invocation usage tracking
│   ├── services/
│   │   ├── skill-center.service.ts       # NEW: publish, list, search, like, pull
│   │   ├── dispatch.service.ts           # MODIFY: auth on claim, executor-token routing
│   │   └── identity.service.ts           # MODIFY: wire ImBinding for IM→executor resolution
│   ├── bridge/
│   │   └── openclaw-bridge.ts            # MODIFY: identity-based routing (remove tenantId)
│   └── webhook/
│       └── webhook-handler.ts            # MODIFY: /use command, ImBinding lookup for executor routing
├── server/src/
│   ├── api.controller.ts                 # MODIFY: new Skill Center endpoints, auth on dispatch
│   ├── skill-center.controller.ts        # NEW: Skill Center API routes
│   └── skill-center-ui/                  # NEW: static HTML/CSS/JS for Skill Center web UI
└── cli/src/
    ├── commands/
    │   ├── publish/index.ts              # MODIFY: individual skill publish (not batch)
    │   ├── skill-center/index.ts         # NEW: open Skill Center web UI
    │   ├── serve/index.ts                # MODIFY: executor token on claim, multi-executor
    │   └── skill-repo/index.ts           # MODIFY: remove category dirs from scaffold
    └── scaffold/
        └── repo-scaffold.ts              # MODIFY: remove writing-topic-hub, remove category dirs
```

**Structure Decision**: Monorepo with core/server/cli packages (existing). New code goes into existing packages. Skill Center UI is static files served by the NestJS server (no new package).

## Complexity Tracking

No constitution violations requiring justification. This plan reduces complexity (3 skill categories → 1, 2 executor systems → 1).
