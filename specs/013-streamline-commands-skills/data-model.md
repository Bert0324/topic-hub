# Data Model: Streamline Commands & Skills

**Feature**: 013-streamline-commands-skills  
**Date**: 2026-04-11

## Entity Changes

### 1. `pairing_codes` (Modified)

Current schema generates codes from the IM side (platform + platformUserId at creation). Spec 013 reverses this: the executor generates the code.

**Updated fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | yes | 6-char alphanumeric, unique index, TTL-indexed via `expiresAt` |
| `topichubUserId` | string | yes | **NEW** — identity of the executor that generated this code |
| `executorClaimToken` | string | yes | **NEW** — executor token that generated the code (for binding resolution) |
| `platform` | string | no | **NOW OPTIONAL** — filled when IM user claims with `/register` |
| `platformUserId` | string | no | **NOW OPTIONAL** — filled when IM user claims with `/register` |
| `channel` | string | no | **NOW OPTIONAL** — filled when IM user claims with `/register` |
| `claimed` | boolean | yes | false on creation, true when IM user registers |
| `claimedByUserId` | string | no | filled on claim |
| `expiresAt` | Date | yes | creation time + 10 minutes (PAIRING_CODE_TTL_MS) |
| `createdAt` | Date | yes | auto |

**Index changes**: Keep unique index on `code`. TTL index on `expiresAt` remains. Remove requirement for `platform`+`platformUserId` at insert.

**State transitions**: `unclaimed` → `claimed` (atomic findOneAndUpdate).

### 2. `user_identity_bindings` (Unchanged schema, updated semantics)

Current schema is already correct for 1:N (executor→IM accounts). The unique index on `(platform, platformUserId)` ensures each IM account maps to exactly one binding.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topichubUserId` | string | yes | The identity (and by extension, executor) this IM account is bound to |
| `platform` | string | yes | IM platform identifier |
| `platformUserId` | string | yes | User ID on that platform |
| `claimToken` | string | yes | Token used when claiming (executor's claim token) |
| `active` | boolean | yes | Whether binding is currently active |
| `createdAt` | Date | yes | auto |
| `updatedAt` | Date | yes | auto |

**Semantic change**: `claimToken` now stores the **executor's token** (not a CLI user token from the old `link` flow). This is set when `/register <code>` claims the pairing code.

**FR-026 enforcement**: Upsert on `(platform, platformUserId)` — if binding exists, replace `topichubUserId` and `claimToken` with new executor's values.

### 3. `executor_heartbeats` (Unchanged)

No schema changes needed. The `topichubUserId`, `claimToken`, `executorMeta`, and `lastSeenAt` fields support the existing registration and heartbeat flow.

### 4. `skill_registrations` (Simplified — per spec 012)

Per spec 012 (Unified Skill Center), the `category` field is deprecated. Spec 013 removes skill lifecycle commands, so the `enabled` concept in `tenant_skill_configs` becomes irrelevant.

**Fields to deprecate/ignore**: `category` (treat all as unified type), `enabled` (all published = available).

### 5. `tenant_skill_configs` (Deprecated)

This collection was tenant-scoped skill configuration with `enabled` flags. With tenants removed (spec 011) and skill lifecycle simplified (spec 013), this collection is no longer needed. Existing records should be ignored; the collection can be dropped in migration.

## Relationship Diagram

```
Identity (1) ──creates──▶ Executor (N)
                              │
                    generates │
                              ▼
                        Pairing Code
                              │
                       claims │  (IM user sends /register <code>)
                              ▼
                    User Identity Binding
                      (platform, platformUserId) ──▶ topichubUserId
                              │
                     1:1 per  │  IM account
                     N:1 per  │  executor
                              ▼
                      IM Account dispatches
                      commands to bound executor
```

## Migration Notes

1. **Pairing codes**: Existing unclaimed codes can be dropped (TTL will expire them naturally). No data migration needed.
2. **User identity bindings**: Existing bindings remain valid — they already have `topichubUserId` and `claimToken`. The semantic change (claimToken = executor token) applies to new bindings only.
3. **Skill registrations**: Ignore `category` field on read. No destructive migration needed.
4. **Tenant skill configs**: Stop querying this collection. Can be dropped after confirming no dependencies.
