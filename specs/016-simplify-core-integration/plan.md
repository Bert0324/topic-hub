# Implementation Plan: Simplify Core Integration Surfaces

**Branch**: `017-simplify-core-integration` | **Date**: 2026-04-12 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/016-simplify-core-integration/spec.md`  
**Planning note (stakeholder)**: Map multi-platform IM traffic to the correct identity/executor tokens, prevent mis-delivery, and harden local-execution security—see § Identity & IM safety and `research.md`.

## Summary

Consolidate **public HTTP integration** to **exactly two ingress routes** in `packages/server/src/api.controller.ts`: (1) **OpenClaw bridge** webhook (existing `POST …/webhooks/openclaw` pattern, possibly path-tweaked), (2) **native Topic Hub** **single** gateway route through which the **CLI** talks to the server using **one** configured `baseUrl` (no matrix of `/api/v1/...` paths for integration). All prior “native REST surface” behaviors used by the CLI move **behind** that gateway via **internal** dispatch in `@topichub/core` (or thin server delegation). Add **config-driven global path prefix** so deployments work under `https://host/prefix` and the CLI’s base URL matches reality.

Secondary track (from planning input): **tighten invariants** so IM-originated work always resolves `(platform, platformUserId)` → Topic Hub user / executor token before dispatch or reply, and outbound paths cannot cross wires between IM sessions.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (`packages/server`), `@topichub/core` (webhook, identity, dispatch, OpenClaw bridge), Mongoose/Typegoose (existing persistence)  
**Storage**: MongoDB (existing `im_bindings` / identity collections—see `data-model.md`)  
**Testing**: `pnpm` workspace tests (Vitest/Jest as configured per package), plus new integration tests for gateway + webhook + identity resolution  
**Target Platform**: Linux server / WSL2 dev, Docker Compose for Mongo  
**Project Type**: Monorepo — `packages/server` (HTTP), `packages/core` (domain), `packages/cli` (ApiClient + serve)  
**Performance Goals**: Constitution API latency targets (e.g. p50 under 200ms where applicable); gateway must not add serializable hot-path overhead beyond one routing hop  
**Constraints**: Only **two** integration-class HTTP routes in `api.controller.ts`; CLI **one** `baseUrl`; no legacy Topic Hub integration layout required per spec  
**Scale/Scope**: Refactor of HTTP surface + CLI paths; core logic largely relocated, not rewritten

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|--------|
| I. Code quality | **Pass** | Gateway router should be small modules; avoid growing `api.controller.ts` beyond thin handlers. |
| II. Testing | **Pass** | New integration tests for: gateway envelope, global prefix, webhook HMAC + identity binding, dispatch token match. |
| III. UX consistency | **N/A / light** | Primarily API/CLI; still require clear error bodies per existing Nest filter patterns. |
| IV. Performance | **Pass w/ scope** | LCP/TTI/bundle budgets apply to web UIs, not this feature; **API latency** gates (constitution) still apply to the new gateway path. |
| V. Simplicity | **Watch** | Single gateway can become a “god switch”; mitigate with typed op registry in core (see `research.md`). |
| Security & integrity | **Pass** | Validate all gateway inputs; preserve auth on privileged ops; no tokens in logs. |

**Post-design re-check**: Contracts + data model must list auth requirements per `op`; IM identity section must be test-backed.

## Project Structure

### Documentation (this feature)

```text
specs/016-simplify-core-integration/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── native-gateway.md
│   └── im-identity-security.md
└── tasks.md              # from /speckit.tasks (not created here)
```

### Source Code (repository root)

```text
packages/server/src/
├── main.ts                 # optional: global prefix from env
├── app.module.ts           # controller registration after consolidation
└── api.controller.ts       # exactly two integration ingress handlers (+ non-integration routes per spec assumption)

packages/core/src/
├── webhook/               # WebhookHandler, signature verification
├── identity/              # IdentityService — platform user → topichub user / tokens
├── dispatch/              # dispatch claim / executor token enforcement
├── bridge/                # OpenClaw inbound normalization
└── gateway/               # NEW: native integration gateway router (typed ops)

packages/cli/src/
├── api-client/api-client.ts   # all paths → single native gateway path + envelope
├── commands/serve/index.ts    # executor lifecycle via ApiClient / gateway
└── config/                    # serverUrl = sole baseUrl
```

**Structure Decision**: Implementation centers on **`@topichub/core`** for protocol and security, **`packages/server`** as thin HTTP edge (two routes), **`packages/cli`** consuming **one** base URL.

## Identity & IM safety (cross-cutting)

**Problem**: Multiple IM platforms and accounts can reach the same Topic Hub deployment; local executors hold sensitive capabilities. Mis-binding causes wrong user getting dispatches or replies going to the wrong channel.

**Current anchors** (baseline code):

- Inbound: `OpenClawBridge.handleInboundWebhook` derives `platform`, `channel`, `userId`, `sessionId`, `isDm` from signed payload + session key heuristics (`packages/core/src/bridge/openclaw-bridge.ts`).
- Binding: `WebhookIdentityOps.resolveUserByPlatform(platform, platformUserId)` before most commands (`packages/core/src/webhook/webhook-handler.ts`).
- Pairing: `claimPairingCode` links IM identity to Topic Hub user / executor material.

**Plan invariants** (to implement / preserve / test):

1. **No silent cross-user dispatch**: Any path that enqueues or claims executor work MUST resolve identity first (existing pattern), except **explicit allowlist** (e.g. `/help`, public skill list if spec’d)—document in `contracts/im-identity-security.md`.
2. **Stable key**: Use `(platform, platformUserId)` as the canonical lookup key for bindings; normalize casing/trim at boundary.
3. **Outbound reply affinity**: Replies MUST carry the same delivery keys as inbound (`sessionId`, channel target) from `OpenClawInboundResult`—already centralized via bridge `sendThreadReply`; gateway must not invent alternate targets.
4. **Executor token binding**: Claims / SSE / dispatch fetch must verify bearer matches **bound** executor token for resolved `topichubUserId` (extend tests if gaps).
5. **Multi-local-process**: Multiple executors ⇒ multiple tokens; IM “credential switch” is modeled as **re-binding** or **multiple platform identities** mapped to distinct Topic Hub users—document limits and UX in contracts (no automatic merge without pairing).
6. **Observability**: Log correlation ids + platform + non-PII channel id; **never** log pairing codes, bearer tokens, or raw IM tokens.

## Implementation phases (for `/speckit.tasks`)

1. **Configuration**: Env vars `TOPICHUB_PUBLIC_BASE_PATH` (or similar) + documented `serverUrl` for CLI; Nest `setGlobalPrefix` when set; ensure OpenClaw relay webhook URL generation uses public base.
2. **Core native gateway**: Introduce typed `op` dispatch table (Zod schemas per op) invoking existing services (topics, dispatches, executors, admin where applicable).
3. **Server HTTP**: Collapse CLI-facing routes into **one** `@Post(...)` native handler in `api.controller.ts`; keep `WebhookController` in same file or merge under one `@Controller()`—still **two** distinct route paths total for integration surfaces.
4. **CLI**: Route `ApiClient` (and `serve` raw `fetch` calls) through `${baseUrl}${NATIVE_GATEWAY_PATH}` only.
5. **Security pass**: Add/extend tests for identity resolution, signature failure, wrong token claim, cross-platform collision; update `contracts/im-identity-security.md` with negative cases.
6. **Cleanup**: Remove or hide from docs any `/api/v1/*` paths that were **integration** surfaces; optional keep internal-only routes behind feature flag only if needed for migration (spec says no legacy compat required—prefer delete).
7. **Docs**: `quickstart.md` + root README snippet for reverse-proxy prefix.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Central gateway `switch`/registry | One HTTP route forces multiplexing | Per-route REST cannot satisfy “single native ingress” contract |
