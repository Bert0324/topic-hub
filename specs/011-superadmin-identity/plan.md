# Implementation Plan: Superadmin Identity Model

**Branch**: `011-superadmin-identity` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-superadmin-identity/spec.md`

## Summary

Remove the multi-tenant model entirely and replace it with a single superadmin + flat identity model. The first `init` creates the superadmin (with a permanent token). The superadmin provisions identities (name + unique ID → token). Each local executor process auto-registers on startup with the identity token and receives an executor token (printed to console). Users bind their IM account to a specific executor token via `register`. All tenant-scoped data and access checks are replaced with global-scope operations identified by identity.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Typegoose 12 + Mongoose 8 (ODM), zod (validation), @modelcontextprotocol/sdk (MCP), gray-matter  
**Storage**: MongoDB 7 (existing collections to modify/remove/add)  
**Testing**: vitest (unit), supertest (integration)  
**Target Platform**: Linux server + local CLI executor  
**Project Type**: Monorepo — `@topichub/core` (library), `@topichub/server` (NestJS API), `@topichub/cli` (admin CLI)  
**Performance Goals**: API p50 < 200ms, p95 < 500ms per constitution  
**Constraints**: Must provide migration path for existing tenant-scoped data  
**Scale/Scope**: Single-instance deployment, ~10–100 identities

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Code Quality First | PASS | Functions remain single-purpose; no magic numbers (token lengths as constants) |
| Testing Standards | PASS | Each new service/entity gets unit tests; register flow gets integration tests |
| Simplicity & Maintainability | PASS | Removing tenants simplifies the model; identity + executor tokens are two clear abstractions |
| Security & Data Integrity | PASS | HMAC on webhooks preserved; tokens are crypto-random; sensitive tokens never logged in full; revocation is immediate |
| Performance Requirements | PASS | No new N+1 queries; token lookups indexed |
| Breaking Changes | ATTENTION | Removing tenants is a breaking change — requires migration script and documented upgrade path (FR-008) |

## Project Structure

### Documentation (this feature)

```text
specs/011-superadmin-identity/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/
├── core/
│   └── src/
│       ├── entities/
│       │   ├── identity.entity.ts          # NEW — replaces Tenant
│       │   ├── executor-registration.entity.ts  # NEW — replaces ExecutorHeartbeat (adds executor token)
│       │   ├── im-binding.entity.ts        # RENAMED from user-identity-binding (simplified, no tenantId)
│       │   ├── topic.entity.ts             # MODIFIED — tenantId removed
│       │   ├── timeline-entry.entity.ts    # MODIFIED — tenantId removed
│       │   ├── task-dispatch.entity.ts     # MODIFIED — tenantId → identityId
│       │   ├── skill-registration.entity.ts # UNCHANGED (global)
│       │   ├── qa-exchange.entity.ts       # MODIFIED — tenantId removed
│       │   ├── ai-usage.entity.ts          # MODIFIED — tenantId → identityId
│       │   ├── tenant.entity.ts            # DELETED
│       │   └── tenant-skill-config.entity.ts # MODIFIED — tenantId removed (global config)
│       ├── identity/
│       │   ├── identity.service.ts         # REWRITTEN — manages identities + executor tokens
│       │   ├── identity-types.ts           # MODIFIED
│       │   └── pairing-code.entity.ts      # DELETED (replaced by direct register flow)
│       ├── services/
│       │   ├── tenant.service.ts           # DELETED
│       │   ├── superadmin.service.ts       # NEW — init, create-identity, token mgmt
│       │   ├── heartbeat.service.ts        # MODIFIED — tenantId removed; works with executor tokens
│       │   ├── topic.service.ts            # MODIFIED — tenantId → global or identityId
│       │   ├── timeline.service.ts         # MODIFIED — tenantId removed
│       │   ├── dispatch.service.ts         # MODIFIED — tenantId → identityId
│       │   ├── search.service.ts           # MODIFIED — tenantId removed
│       │   └── qa.service.ts              # MODIFIED — tenantId removed
│       ├── bridge/
│       │   ├── openclaw-bridge.ts          # MODIFIED — remove tenantMapping, resolve via executor token
│       │   └── openclaw-types.ts           # MODIFIED — remove tenant schemas
│       ├── webhook/
│       │   └── webhook-handler.ts          # MODIFIED — register flow uses executor token directly
│       ├── command/
│       │   └── handlers/                   # MODIFIED — all handlers drop tenantId param
│       ├── config.ts                       # MODIFIED — remove tenant-related config
│       └── topichub.ts                     # MODIFIED — facade drops tenant, adds superadmin ops
│
├── server/
│   └── src/
│       ├── api.controller.ts              # MODIFIED — auth resolves identity/executor, not tenant
│       └── topichub.provider.ts           # MODIFIED — remove tenant config
│
└── cli/
    └── src/
        └── commands/
            ├── init/                      # MODIFIED — init creates superadmin
            ├── identity/                  # NEW — create-identity, list-identities
            ├── serve/                     # MODIFIED — auto-register executor, print token
            └── tenant/                    # DELETED
```

**Structure Decision**: Existing monorepo structure (core/server/cli) is preserved. Changes are in-place refactoring — no new packages needed.

## Complexity Tracking

> No constitution violations requiring justification. Removing tenants reduces complexity.

## Architecture: IM-to-Executor Message Routing (Security Focus)

This section details the critical flow the user highlighted: how IM messages map to the correct identity/executor without misrouting, with technical security guarantees.

### Token Hierarchy

```
Superadmin Token (1, created at init)
└── Identity Token (N, created by superadmin via CLI)
    └── Executor Token (M, auto-issued when executor starts)
        └── IM Binding (1:1 per IM platform user, bound via `register`)
```

### Flow: IM Message → Local Executor

```
1. IM Platform (e.g., Feishu/Discord) receives user message
2. OpenClaw relay forwards to TopicHub webhook (HMAC-signed)
3. WebhookHandler verifies HMAC ✓
4. WebhookHandler extracts (platform, platformUserId) from webhook payload
5. ImBindingService.resolve(platform, platformUserId)
   → returns { executorToken, identityId } or null
6. If null → reply "run /topichub register <executor-token>"
7. If found → validate executor token is not revoked
   → HeartbeatService checks executor is alive
8. Build CommandContext with { identityId, executorToken, sourceChannel }
9. Route command → dispatch task with targetExecutorToken
10. SSE stream filters tasks by executorToken → correct executor picks up
```

### Security Guarantees

| Threat | Mitigation |
|--------|-----------|
| Webhook forgery | HMAC-SHA256 verification on every inbound webhook (existing, preserved) |
| IM user impersonation | IM binding is per (platform, platformUserId) — the IM platform authenticates the user; TopicHub trusts the platform's user ID |
| Executor token theft | Tokens are crypto-random (32 bytes hex); revocable by superadmin; revocation is immediate (checked on every request) |
| Message misrouting | IM binding → executor token is a strict 1:1 lookup; no fallback or guessing; unbound users get a clear error |
| Stale binding after revocation | On every command, the resolved executor token is validated against the `revoked` flag; revoked → reject + instruct re-register |
| Concurrent executor collision | Each executor gets its own token; IM user explicitly chooses which executor via `register`; no implicit routing |

### Register Flow (New — Replaces Pairing Code)

The old flow: IM → `/topichub register` → pairing code → CLI `topichub-admin link <code>`.

The new flow (simplified):
1. User starts executor: `topichub-admin serve --token <identity-token>`
2. Executor presents identity token to server → server issues executor token
3. Executor prints: `Executor token: eth_abc123...def (use this with /topichub register on IM)`
4. User goes to IM: `/topichub register eth_abc123...def`
5. Server validates executor token → creates/updates `im_bindings` record: `(platform, platformUserId) → executorToken`
6. All subsequent IM commands from that user on that platform → routed to that executor

This removes the pairing code indirection. The executor token IS the credential used for binding.
