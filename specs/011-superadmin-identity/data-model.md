# Data Model: Superadmin Identity Model

**Feature**: 011-superadmin-identity  
**Date**: 2026-04-11

## New Entities

### Identity

Replaces `Tenant`. Represents either the superadmin or a regular user.

**Collection**: `identities`

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | auto | PK | |
| `uniqueId` | string | yes | unique | User-provided unique identifier (e.g., "alice", "bob-dev") |
| `displayName` | string | yes | | Human-readable name |
| `token` | string | yes | unique | Crypto-random 64-char hex. Used by CLI executor to authenticate on startup |
| `isSuperAdmin` | boolean | yes | | `true` for the first identity created during init |
| `status` | string | yes | | `active` / `revoked` |
| `createdAt` | Date | auto | | |
| `updatedAt` | Date | auto | | |

**Validation**:
- `uniqueId`: 1–64 chars, alphanumeric + hyphens + underscores only (`/^[a-z0-9_-]+$/`)
- `displayName`: 1–128 chars
- `token`: 64-char hex string (32 bytes random)
- Exactly one identity with `isSuperAdmin: true` must exist after init

**State transitions**: `active` → `revoked` (superadmin action). Superadmin identity cannot be revoked.

### ExecutorRegistration

Replaces `ExecutorHeartbeat`. Represents a running executor process bound to an identity.

**Collection**: `executor_registrations`

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | auto | PK | |
| `identityId` | string | yes | yes | References `Identity._id` |
| `executorToken` | string | yes | unique | Crypto-random 64-char hex. Issued on executor startup |
| `status` | string | yes | yes | `active` / `revoked` |
| `lastSeenAt` | Date | yes | | Updated by heartbeat |
| `executorMeta` | object | no | | `{ hostname, pid, agentType, maxConcurrentAgents }` |
| `createdAt` | Date | auto | | |
| `updatedAt` | Date | auto | | |

**Validation**:
- `executorToken`: 64-char hex string (32 bytes random)
- Multiple active registrations per identity are allowed

**State transitions**: `active` → `revoked` (superadmin action or executor shutdown)

### ImBinding

Replaces `UserIdentityBinding`. Maps an IM platform user to a specific executor.

**Collection**: `im_bindings`

| Field | Type | Required | Index | Notes |
|-------|------|----------|-------|-------|
| `_id` | ObjectId | auto | PK | |
| `platform` | string | yes | compound unique with `platformUserId` | e.g., "feishu", "discord", "telegram", "slack" |
| `platformUserId` | string | yes | compound unique with `platform` | IM platform's user identifier |
| `executorToken` | string | yes | yes | References `ExecutorRegistration.executorToken` |
| `identityId` | string | yes | yes | Denormalized from executor registration for fast lookup |
| `active` | boolean | yes | | `true` = binding in effect |
| `createdAt` | Date | auto | | |
| `updatedAt` | Date | auto | | |

**Indexes**:
- `{ platform: 1, platformUserId: 1 }` — unique (one binding per IM user)
- `{ executorToken: 1 }`
- `{ identityId: 1 }`

**Validation**:
- Each `(platform, platformUserId)` pair maps to at most one executor token
- Re-registration overwrites the existing binding (upsert)

## Modified Entities

### Topic

**Collection**: `topics`

| Change | Before | After |
|--------|--------|-------|
| Remove `tenantId` | `tenantId: string` (required, indexed) | Field removed |

All queries that filtered by `tenantId` become global. Topics are now system-wide.

### TimelineEntry

**Collection**: `timeline_entries`

| Change | Before | After |
|--------|--------|-------|
| Remove `tenantId` | `tenantId: string` (required, indexed) | Field removed |

### TaskDispatch

**Collection**: `task_dispatches`

| Change | Before | After |
|--------|--------|-------|
| Remove `tenantId` | `tenantId: string` (required, indexed) | Field removed |
| Replace `targetUserId` | `targetUserId?: string` | `targetExecutorToken?: string` — routes to specific executor |
| Add `identityId` | N/A | `identityId: string` — who triggered the task |

### QaExchange

**Collection**: `qa_exchanges`

| Change | Before | After |
|--------|--------|-------|
| Remove `tenantId` | `tenantId: string` | Field removed |
| Replace `topichubUserId` | `topichubUserId: string` | `identityId: string` |

### AiUsageRecord

**Collection**: `ai_usage_records`

| Change | Before | After |
|--------|--------|-------|
| Remove `tenantId` | `tenantId: string` | Field removed |
| Add `identityId` | N/A | `identityId?: string` — who triggered the AI call |

### TenantSkillConfig

Renamed to **SkillConfig**.

**Collection**: `skill_configs` (renamed from `tenant_skill_configs`)

| Change | Before | After |
|--------|--------|-------|
| Remove `tenantId` | `tenantId: string` (indexed) | Field removed |
| Collection name | `tenant_skill_configs` | `skill_configs` |

Skill configs become global — a skill is either enabled for the system or not.

### SkillRegistration

**Collection**: `skill_registrations`

No changes. Already global (not tenant-scoped).

## Deleted Entities

| Entity | Collection | Reason |
|--------|-----------|--------|
| `Tenant` | `tenants` | Replaced by `Identity` with `isSuperAdmin` flag |
| `PairingCode` | `pairing_codes` | Replaced by direct executor-token-based registration |
| `UserIdentityBinding` | `user_identity_bindings` | Replaced by `ImBinding` |
| `ExecutorHeartbeat` | `executor_heartbeats` | Replaced by `ExecutorRegistration` |

## Entity Relationship Diagram

```
Identity (1) ──── creates ────> (N) ExecutorRegistration
    │                                    │
    │ isSuperAdmin: true                 │ executorToken
    │ (exactly one)                      │
    │                                    ▼
    │                            ImBinding (0..1 per platform user)
    │                                    │
    │                                    │ platform + platformUserId
    │                                    ▼
    │                            IM Platform User
    │
    ├────> Topic (global, no owner)
    ├────> TaskDispatch (identityId + targetExecutorToken)
    ├────> TimelineEntry (global)
    ├────> QaExchange (identityId)
    └────> AiUsageRecord (identityId)
```

## Migration Script Requirements

1. **Identity migration**: Convert the super-admin `Tenant` to an `Identity` with `isSuperAdmin: true`. If multiple tenants exist, create one `Identity` per tenant (all non-superadmin).
2. **Token migration**: The existing tenant `apiKey` (decrypted) becomes the identity `token`. The `adminToken` is discarded (new superadmin token generated).
3. **Data flattening**: Remove `tenantId` field from all documents in `topics`, `timeline_entries`, `task_dispatches`, `qa_exchanges`, `ai_usage_records`.
4. **Collection renames**: `tenant_skill_configs` → `skill_configs` (strip `tenantId`); `user_identity_bindings` → `im_bindings` (restructure); `executor_heartbeats` → `executor_registrations` (restructure).
5. **Collection drops**: `tenants`, `pairing_codes` (after data extracted).
6. **Index rebuilds**: New unique indexes on `identities.uniqueId`, `identities.token`, `executor_registrations.executorToken`, `im_bindings(platform, platformUserId)`.
