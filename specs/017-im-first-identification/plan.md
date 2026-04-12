# Implementation Plan: IM-First Identification (`/id`)

**Branch**: `019-im-first-identification` | **Date**: 2026-04-12 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/017-im-first-identification/spec.md`  
**Planning focus**: Map multi-platform IM traffic to the correct **identity** and **executor** material, prevent mis-delivered replies or dispatches, and preserve **local execution safety** when IM triggers work on user machines.

## Summary

Deliver **IM self-serve onboarding** via **`/id create`** and **`/id me`** while **keeping superadmin identity creation**. Persist a **durable link** from each **IM account** `(platform, platformUserId)` to exactly one **Identity** record (system-generated `uniqueId`, IM-sourced `displayName`, identity `token`). Enforce **at most one** successful `/id create` per IM account.

Separately, preserve today’s **executor pairing** (`/register`): most IM commands that drive local execution still require an **active executor session** bound to the same identity; the plan makes the **identity gate** and **executor gate** explicit so routing never mixes users or tokens across inbound threads.

**Cross-cutting safety** (aligned with `specs/016-simplify-core-integration/contracts/im-identity-security.md`):

1. **Inbound affinity**: Every OpenClaw-normalized inbound carries `platform`, `userId` (platform user id), `channel`, `sessionId`; identity and executor resolution MUST derive only from these server-trusted fields—never from client-chosen redirect parameters.
2. **Reply affinity**: Outbound replies MUST use the same `sessionId` / channel metadata as the triggering inbound event.
3. **No cross-user dispatch**: `dispatchMeta.targetUserId` and `targetExecutorToken` MUST come from `resolveUserByPlatform` (or successor) for the **same** `(platform, userId)` as the inbound message; claim APIs MUST deny cross-user access (prefer 404).

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: `@topichub/core` (OpenClaw bridge, `WebhookHandler`, `IdentityService`, `SuperadminService`), NestJS 10 (`packages/server`), Mongoose / Typegoose  
**Storage**: MongoDB — existing `identities`, `user_identity_bindings`, `executor_registrations` (or equivalent); **new** durable `(platform, platformUserId) → identityId` link for IM self-signup (see `data-model.md`)  
**Testing**: `pnpm` workspace tests (Vitest as configured); integration tests for `/id` flows, duplicate create, identity resolution, and negative cross-user cases  
**Target Platform**: Linux server / WSL2 dev  
**Project Type**: Monorepo — `packages/core` (domain + webhook), `packages/server` (HTTP edge)  
**Performance Goals**: Constitution API latency targets on paths touched by webhook/gateway  
**Constraints**: IM command parsing MUST stay early-ordered like `/help` and `/register`; no tokens or pairing codes in logs  
**Scale/Scope**: One feature slice on top of existing IM + identity stack; no cross-platform automatic merge of identities (per spec)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|--------|
| I. Code quality | **Pass** | Keep `/id` handling in small, testable units next to existing early returns in `WebhookHandler`. |
| II. Testing | **Pass** | Add tests for duplicate `/id create`, `/id me` content, and identity/executor resolution invariants. |
| III. UX consistency | **Pass** | Clear DM vs group rules if needed; user-friendly errors for duplicate create. |
| IV. Performance | **N/A / light** | IM webhook path; avoid extra round-trips per message. |
| V. Simplicity | **Watch** | Prefer one new link collection/table over scattering optional fields across many entities unless a single-document model is clearly simpler. |
| Security — no tokens in logs | **Pass** | Continue structured logging without bearer tokens or `/id me` payloads. |
| Security — sensitive in client | **Exception** | Spec **requires** showing identity `token` in IM for `/id me` and on first `/id create` response—see **Complexity Tracking**. |

**Post-design re-check**: Contracts list allowlisted commands and ordering; data model shows unique constraints; quickstart warns operators about token-in-channel risk.

## Project Structure

### Documentation (this feature)

```text
specs/017-im-first-identification/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── im-id-command.md
│   └── im-identity-routing.md
└── tasks.md              # from /speckit.tasks (not created here)
```

### Source Code (repository root)

```text
packages/core/src/
├── webhook/webhook-handler.ts     # early handlers: /id create, /id me (before generic identity gate)
├── identity/identity.service.ts   # optional: resolve IM link → identity; merge with binding resolution
├── services/superadmin.service.ts # unchanged contract for superadmin createIdentity
├── entities/identity.entity.ts    # possibly unchanged fields; new entity for IM↔identity link
└── bridge/openclaw-bridge.ts      # unchanged trust boundary for platform/userId extraction

packages/core/test/
└── (new) im-id-command.*.test.ts

packages/server/src/
└── (no new public routes required if all behavior is IM → existing webhook)
```

**Structure Decision**: Core webhook path owns `/id` semantics; persistence extends Mongo models in `packages/core`.

## Identity & IM routing (implementation-facing)

**Problem**: Multiple IM platforms and accounts hit one Hub; each inbound must map to the correct **Identity** and, when local work is involved, the correct **executor claim token**. Mis-binding sends replies or dispatches to the wrong person.

**Resolution pipeline** (conceptual):

1. **Normalize command** (existing): strip labels, normalize slash commands.  
2. **Allowlist before binding** (extend): `/help`, `/id create`, `/id me`, `/register` (and existing special cases) run **before** the generic “must have executor binding” gate where appropriate.  
3. **Identity from IM (new)**: After `/id create`, store **IM account → Identity** link. `/id me` reads from that link + `Identity` document.  
4. **Executor from pairing (existing)**: `user_identity_bindings` continues to supply `topichubUserId` + `claimToken` for dispatch; `/id create` does **not** replace `/register` for executor-backed commands unless a later spec merges those flows.  
5. **Unified lookup (design task)**: Implement or extend a single internal helper, e.g. `resolveImActor(platform, userId)` → `{ identityId, claimToken? }`, used by webhook so every command gets a consistent view.  
6. **Multi local process**: Multiple `topichub-admin serve` processes ⇒ multiple executor registrations / claim tokens; at most **one active binding per `(platform, platformUserId)`**; switching executor implies **re-pair** (`/register` with new code) which updates the binding row—no implicit merge across identities.

## Implementation phases (for `/speckit.tasks`)

1. **Data model**: Add **IM → Identity** link entity + unique index on `(platform, platformUserId)`; define id generation for `Identity.uniqueId` (e.g. opaque slug / `im_` prefix + random).  
2. **SuperadminService / TopicHub API**: Add internal method **IM self-signup create** (transaction: create `Identity`, insert link, reject duplicate IM key) OR dedicated small service used only from webhook.  
3. **WebhookHandler**: Parse `/id create` and `/id me`; call service; format replies; **never** log full tokens.  
4. **Help text**: Extend `help.handler` (or OpenClaw help body) with `/id` documentation.  
5. **Security tests**: Duplicate create; `/id me` for unknown IM user; ensure other commands still require binding + heartbeat when spec expects executor.  
6. **Docs**: `quickstart.md` for operators (DM vs group, token handling).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Identity **token** echoed in IM (`/id create`, `/id me`) | **Product spec** mandates returning token in-channel for self-serve onboarding and self-service read-back | Magic links or web-only token reveal add new surfaces and do not match clarified spec |
