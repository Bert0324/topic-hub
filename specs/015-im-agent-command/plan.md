# Implementation Plan: IM multi-agent slots, `/agent`, and executor routing security

**Branch**: `015-im-agent-command` | **Date**: 2026-04-12 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification `specs/015-im-agent-command/spec.md` + user focus: *map each platform’s IM messages to the correct identity/executor token; never deliver completions to the wrong chat; keep local execution technically safe when users run multiple local processes and switch IM credentials.*

## Summary

Deliver **explicit local agent slots** (`/agent list|create|delete`, optional **`#N`** on relay/skill paths) with **no implicit per-task roster growth** (FR-003/014). Harden and **document** the existing **IM principal → `ImBinding` → `claimToken` → `TaskDispatch.targetExecutorToken`** chain plus **heartbeat token match** and **reply routing** via inbound `sessionKey`/`channel`, so multi-platform and multi-account scenarios cannot silently cross wires (FR-010, SC-005). Much of the command/agent path is already implemented on this branch; remaining work is **spec alignment**, **FR-014 UX surfacing** for ≥2 agents, **tests**, and **contract documentation** already captured under `contracts/`.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Mongoose 8 / Typegoose 12, `@topichub/core` command router + webhook + dispatch pipeline, Ink/React CLI for `serve`  
**Storage**: MongoDB 7 — `im_bindings`, `pairing_codes`, `executor_heartbeats`, `task_dispatches`; local JSON roster under `~/.config/topic-hub/agent-roster/`  
**Testing**: Jest in `packages/core`, `packages/cli`  
**Target Platform**: Linux server (API) + developer workstation (`serve` + OpenClaw gateway)  
**Project Type**: Monorepo (`packages/core`, `packages/server`, `packages/cli`)  
**Performance Goals**: No new hard latency SLO; dispatch create/claim remain **p95 < 500ms** at moderate load (constitution-aligned where applicable)  
**Constraints**: Signed OpenClaw webhooks; executor APIs require Bearer **executor token**; never log raw tokens  
**Scale/Scope**: Typical team size; bounded agent slots (≤32 per spec/constants)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I Code quality | **Pass** | Changes limited to typed modules; use existing constants for payload keys |
| II Testing | **Pass** | Add/extend tests for identity routing, heartbeat gate, optional FR-014 copy (integration or unit per layer) |
| III UX consistency | **Pass** | IM strings externalizable; multi-slot copy must disambiguate agent `#N` vs queue `#N` (spec Out of Scope reminder) |
| IV Web performance | **N/A** | Server endpoints already exist; no new LCP-critical UI |
| V Simplicity | **Pass** | Prefer documenting invariants over new abstractions unless second use case appears |

**Gate result**: **PASS** — no constitution exceptions required.

## Project Structure

### Documentation (this feature)

```text
specs/015-im-agent-command/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── im-executor-routing.md
├── spec.md
└── tasks.md             # From /speckit.tasks (not produced by this command)
```

### Source code (repository root)

```text
packages/core/src/
├── webhook/webhook-handler.ts       # IM principal, heartbeat gate, dispatchMeta, sendThreadReply
├── identity/identity.service.ts     # resolveUserByPlatform, claimPairingCode
├── services/heartbeat.service.ts    # isBoundExecutorSessionLive
├── services/dispatch.service.ts     # create/claim/complete + token filters
├── topichub.ts                      # dispatch.claim/complete → bridge + pickImNotifyBody
├── bridge/openclaw-bridge.ts        # inbound normalize, outbound sendMessage + sessionKey
├── command/handlers/agent.handler.ts
├── im/                              # agent-slot constants, list format, control-dispatch parse
└── skill/pipeline/skill-pipeline.ts # enrichedPayload + dispatch create

packages/server/src/
└── api.controller.ts                # /webhooks/openclaw, /api/v1/dispatches/*, executor register

packages/cli/src/commands/serve/
├── index.ts                         # SSE queue, IM agent control bypass
├── task-processor.ts                # claim, agent op fast path, spawn executor
└── agent-roster.ts                  # local #N roster file
```

**Structure Decision**: Implement and verify in **`@topichub/core`** + **`@topichub/cli`** + **`@topichub/server`** only; no new top-level app.

## Complexity Tracking

No violations — table empty.

## Phase 0 — Research

**Output**: [research.md](./research.md)  
All “NEEDS CLARIFICATION” items from an earlier template draft were resolved against the current codebase; decisions captured as R-1…R-5.

## Phase 1 — Design & contracts

**Output**:

- [data-model.md](./data-model.md) — entities and fields for routing/security
- [contracts/im-executor-routing.md](./contracts/im-executor-routing.md) — invariants C1–C3 + threat table
- [quickstart.md](./quickstart.md) — manual verification steps

**Agent context**: run `.specify/scripts/bash/update-agent-context.sh cursor-agent` after this plan is saved.

## Phase 2 — Implementation outline (for `/speckit.tasks`)

High-level backlog (not yet broken into `tasks.md` rows):

1. **FR-014 / UX**: When local roster has **≥2** agents, ensure claim and/or **Task completed** path surfaces **agent #1** (or selected `#N`) in user-visible text; single-agent case remains quiet.
2. **Security audit tests**: Add tests proving `resolveUserByPlatform` + `isBoundExecutorSessionLive` gating; dispatch `targetExecutorToken` mismatch cannot claim (existing behavior, explicit test).
3. **Reply routing audit**: Assert `sendMessage` receives `sessionKey` from inbound `OpenClawInboundResult` wherever thread reply is required (webhook handler paths).
4. **Docs sync**: Link `contracts/im-executor-routing.md` from feature README or `.cursor/rules` only if product owners want (optional).
5. **Multi-platform**: Table-driven tests for `platform` + `platformUserId` uniqueness (Feishu/Discord-style ids) — no code change if already correct.

## Constitution Check (post–Phase 1)

Re-evaluated: design stays within existing security model; **PASS**.

---

## Extension Hooks note

Optional `speckit.git.commit` hooks may run before/after plan per `.specify/extensions.yml` — not executed by this agent.
