# Research: Superadmin Identity Model

**Feature**: 011-superadmin-identity  
**Date**: 2026-04-11

## R1: Tenant Removal Scope

**Decision**: Remove the `Tenant` entity and all `tenantId` fields from every collection. Replace with a single `Identity` entity for user attribution and a `Superadmin` record for system management.

**Rationale**: The current codebase has `tenantId` on every document (topics, timeline entries, task dispatches, QA exchanges, AI usage, heartbeats, identity bindings, skill configs). All service methods accept `tenantId` as the first parameter. The tenant concept exists primarily for data isolation, but the system is single-instance — there is never more than one meaningful tenant. Removing it simplifies every query, every service signature, and every API route.

**Alternatives considered**:
- *Soft-deprecate*: Keep `tenantId` but default to a single value. Rejected — adds dead code and confusion.
- *Keep tenant for future multi-tenancy*: Rejected per spec — YAGNI principle (constitution V).

## R2: Token Architecture (Three-Tier)

**Decision**: Three token types — superadmin token, identity token, executor token — each serving a distinct purpose.

**Rationale**:
- **Superadmin token**: Long-lived, created at init, used only for privileged operations (create identity, revoke tokens). Never used for IM binding or task execution.
- **Identity token**: Issued per user by superadmin. Used only by the CLI executor on startup to authenticate and obtain an executor token. Not used directly in IM or API requests after initial registration.
- **Executor token**: Issued per executor process. Used for IM binding (`register`), SSE task streaming, task claim/complete. Independently revocable.

**Alternatives considered**:
- *Two-tier (identity token + executor token only, no superadmin distinction)*: Rejected — superadmin needs higher privilege separation for identity management.
- *Single token per identity (shared across executors)*: Rejected per clarification Q1 — user needs independent executor tokens for per-process revocation and audit.

## R3: IM Binding Model (Replacing Pairing Codes)

**Decision**: Replace the pairing code flow with direct executor-token-based registration. The `/topichub register <executor-token>` command on IM directly binds `(platform, platformUserId) → executorToken`.

**Rationale**: The current pairing code flow has 4 steps: (1) IM user runs `/topichub register`, (2) server generates a pairing code, (3) user enters code in CLI `topichub-admin link <code>`, (4) server creates binding. The new flow has 2 steps: (1) user copies executor token from CLI console, (2) runs `/topichub register <token>` on IM. Simpler, faster, fewer entities.

**Alternatives considered**:
- *Keep pairing codes alongside*: Rejected — adds complexity for no benefit. The executor token is already a secret the user possesses.
- *QR code scanning*: Rejected — not practical for CLI-based workflows.

**Security note**: The executor token serves as both the authentication credential and the binding key. Leaking an executor token allows someone to bind their IM to that executor. Mitigation: tokens are crypto-random (32 bytes), displayed only once on startup, and revocable by superadmin.

## R4: Data Migration Strategy

**Decision**: Provide a one-time migration script that:
1. Reads all existing tenant-scoped data
2. Strips `tenantId` from documents (or maps to identity if applicable)
3. Converts the first (super-admin) tenant into the new `Superadmin` record
4. Removes the `tenants` collection

**Rationale**: Existing deployments have data keyed by `tenantId`. Since the system is single-instance with typically one tenant, migration is straightforward — just remove the field. If multiple tenants exist, the migration prompts for which tenant's data to keep (or merges all).

**Alternatives considered**:
- *No migration (fresh start only)*: Rejected — existing users would lose data.
- *Lazy migration (convert on read)*: Rejected — adds permanent runtime overhead; better to do it once.

## R5: OpenClaw Bridge Without Tenant Mapping

**Decision**: Remove `tenantMapping` and `defaultTenantId` from bridge config. The bridge no longer resolves tenants. Instead, the webhook handler resolves identity directly from the IM binding (`platform + platformUserId → executorToken → identityId`).

**Rationale**: The current `tenantMapping` maps `channelId → { tenantId, platform }`. With tenants gone, this is unnecessary. The platform can be inferred from the OpenClaw session ID or the webhook payload's `platform` field (already partially implemented). The identity comes from the IM binding lookup, which is already the primary path in `webhook-handler.ts`.

**Alternatives considered**:
- *Keep channel→platform mapping without tenantId*: Considered — may still be useful if platform detection from sessionId is unreliable. Decision: keep `platformMapping` as optional `Record<channelId, platform>` for explicit channel-to-platform overrides, but remove the tenant part.

## R6: Executor Registration (Replacing Heartbeat)

**Decision**: Merge the current `ExecutorHeartbeat` concept with the new executor token model. When an executor starts, it registers with its identity token and receives an executor token. The heartbeat mechanism continues to use the executor token as the identifier instead of `(tenantId, topichubUserId)`.

**Rationale**: The current `executor_heartbeats` collection uses `(tenantId, topichubUserId)` as the unique key, which means only one executor per identity per tenant. The new model needs multiple executors per identity, keyed by executor token.

**Alternatives considered**:
- *Keep heartbeats separate from executor registration*: Rejected — the heartbeat IS the executor's proof of liveness. Combining them is simpler.

## R7: Auth Resolution (API Layer)

**Decision**: Replace the current `auth.resolveFromHeaders` (which decrypts API keys to find a tenant) with a new auth flow:
- `Authorization: Bearer <token>` → look up token in `identities` collection (for superadmin ops) OR `executor_registrations` collection (for task ops)
- Remove `X-Api-Key` header support entirely

**Rationale**: The current API key flow decrypts every stored key to find a match (O(n) scan). The new model uses direct token lookups (indexed, O(1)). Simpler and faster.

**Alternatives considered**:
- *Keep encrypted API keys with index*: Rejected — identity tokens and executor tokens don't need encryption at rest if the database is trusted (per existing threat model). They are random 32-byte hex strings, functionally equivalent to API keys but simpler.
