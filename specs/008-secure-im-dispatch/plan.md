# Implementation Plan: Secure IM Dispatch

**Branch**: `008-secure-im-dispatch` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-secure-im-dispatch/spec.md`

## Summary

Add user-scoped execution security to the IM→local CLI dispatch pipeline. Users bind their IM identities to their local CLI via a pairing code flow, ensuring that IM commands are routed exclusively to the correct user's local executor. The system enforces single-executor-per-user, detects missing executors (heartbeat-based), supports parallel agent subprocess execution, and relays interactive Q&A between local agents and IM. Communication is strictly outbound (local→remote) to work behind NAT.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: Mongoose 8 + Typegoose 12 (ODM), zod (validation), NestJS 10 (server), eventsource (SSE client in CLI), @inquirer/prompts (CLI interaction), @modelcontextprotocol/sdk (MCP)  
**Storage**: MongoDB 7 (existing collections: `task_dispatches`; new collections: `user_identity_bindings`, `pairing_codes`, `executor_heartbeats`, `qa_exchanges`)  
**Testing**: Jest + ts-jest + mongodb-memory-server  
**Target Platform**: Node.js server (NestJS) + CLI (`topichub-admin`)  
**Project Type**: Monorepo — `@topichub/core` (library), `@topichub/server` (API), `@topichub/cli` (local executor)  
**Performance Goals**: Heartbeat interval 30s, dispatch pickup within 10s (SSE), Q&A relay within 5s  
**Constraints**: One-way communication (local→remote only), single active executor per user, pairing codes expire after 10 minutes  
**Scale/Scope**: Small — tens of users, each with one executor, handful of concurrent dispatches

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | PASS | Named constants for all timeouts (HEARTBEAT_INTERVAL, PAIRING_CODE_TTL, etc.). Clean module boundaries: identity → core, heartbeat → core, Q&A → core, CLI commands → cli. |
| II. Testing Standards | PASS | Unit tests for identity binding, dispatch scoping, heartbeat tracking, pairing code lifecycle. Integration tests for full pairing flow and user-scoped dispatch. mongodb-memory-server for DB tests. |
| III. UX Consistency | PASS | CLI error messages are clear and actionable ("An executor is already active for your account."). IM messages provide instructions ("/answer" prefix, registration prompts). |
| IV. Performance | PASS | API endpoints within p50 < 200ms target. Heartbeats and SSE are lightweight. No heavy computation on server side. |
| V. Simplicity | PASS | Start simple: MongoDB-backed identity bindings and heartbeats. No complex distributed locking — single-executor enforced via heartbeat timestamps. In-memory dedup from 007 bridge reused. |
| Security & Data Integrity | PASS | Pairing codes are single-use, time-limited, delivered privately. Claim tokens validated on every dispatch poll. User input (commands, answers) sanitized via zod schemas. |

No violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/008-secure-im-dispatch/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── identity-binding-api.md
│   ├── heartbeat-api.md
│   ├── qa-exchange-api.md
│   └── cli-commands.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── identity/
│   ├── identity.service.ts          # UserIdentityBinding CRUD + pairing code lifecycle
│   ├── identity-types.ts            # Zod schemas + TypeScript types
│   └── pairing-code.entity.ts       # Typegoose entity
├── entities/
│   ├── user-identity-binding.entity.ts  # Typegoose entity (new collection)
│   ├── executor-heartbeat.entity.ts     # Typegoose entity (new collection)
│   ├── qa-exchange.entity.ts            # Typegoose entity (new collection)
│   └── task-dispatch.entity.ts          # Existing — add targetUserId field
├── services/
│   ├── dispatch.service.ts              # Existing — add user-scoped filtering
│   ├── heartbeat.service.ts             # New — heartbeat tracking + availability check
│   └── qa.service.ts                    # New — Q&A exchange lifecycle
├── bridge/
│   └── openclaw-bridge.ts               # Existing — add /answer prefix handling
├── webhook/
│   └── webhook-handler.ts               # Existing — add identity resolution + user-scoped dispatch
└── topichub.ts                          # Existing — expose identity + heartbeat + QA operations

packages/server/src/
├── api.controller.ts                    # Existing — add identity, heartbeat, QA endpoints
└── topichub.provider.ts                 # Existing — wire new services

packages/cli/src/
├── commands/
│   ├── link/
│   │   └── index.ts                     # New — `topichub-admin link <code>` command
│   ├── unlink/
│   │   └── index.ts                     # New — `topichub-admin unlink` command
│   └── serve/
│       ├── index.ts                     # Existing — add single-executor check, --force flag, heartbeat, concurrency
│       ├── event-consumer.ts            # Existing — add user-scoped filtering
│       ├── task-processor.ts            # Existing — add parallel execution pool, Q&A relay
│       └── qa-relay.ts                  # New — Q&A exchange relay to/from server
└── config/
    └── config.schema.ts                 # Existing — add maxConcurrentAgents field

tests/
├── packages/core/test/
│   ├── identity.service.test.ts
│   ├── heartbeat.service.test.ts
│   ├── qa.service.test.ts
│   └── dispatch-scoping.test.ts
└── packages/cli/test/
    ├── link-command.test.ts
    └── serve-executor-check.test.ts
```

**Structure Decision**: Follows existing monorepo layout. New modules (`identity/`, `qa-relay.ts`) are placed alongside existing patterns. No new packages — all changes land in `core`, `server`, and `cli`.

## Complexity Tracking

No constitution violations to justify.
