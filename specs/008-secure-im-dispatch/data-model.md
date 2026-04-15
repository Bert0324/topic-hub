# Data Model: Secure IM Dispatch

**Date**: 2026-04-10 | **Feature**: 008-secure-im-dispatch

## New Collections

### user_identity_bindings

Persistent mapping between IM platform user identifiers and Topic Hub user identity.

| Field | Type | Required | Index | Description |
|-------|------|----------|-------|-------------|
| `_id` | ObjectId | auto | PK | |
| `tenantId` | string | yes | yes | Tenant this binding belongs to |
| `topichubUserId` | string | yes | unique compound with tenantId | Internal Topic Hub user ID (generated on first link) |
| `platform` | string | yes | compound | IM platform name (`lark`, `slack`, `telegram`) |
| `platformUserId` | string | yes | compound | Platform-specific user ID (`ou_xxx`, `U0XXX`, etc.) |
| `claimToken` | string | yes | | The CLI claim token this user's executor uses |
| `active` | boolean | yes | | Whether this binding is active |
| `createdAt` | Date | auto | | |
| `updatedAt` | Date | auto | | |

**Indexes**:
- `{ tenantId: 1, platform: 1, platformUserId: 1 }` — unique compound (one binding per platform identity per tenant)
- `{ tenantId: 1, topichubUserId: 1 }` — find all bindings for a user
- `{ claimToken: 1 }` — resolve user by claim token

**Validation**:
- `platform` must be non-empty
- `platformUserId` must be non-empty
- `topichubUserId` is generated as `usr_<random>` on first pairing, reused for subsequent platform bindings

### pairing_codes

Temporary tokens for identity registration.

| Field | Type | Required | Index | Description |
|-------|------|----------|-------|-------------|
| `_id` | ObjectId | auto | PK | |
| `tenantId` | string | yes | | Tenant context |
| `code` | string | yes | unique | 6-character alphanumeric code |
| `platform` | string | yes | | Requesting IM platform |
| `platformUserId` | string | yes | | Requesting IM user ID |
| `channel` | string | yes | | IM channel where request was made (for reply routing) |
| `claimed` | boolean | yes | | Whether the code has been used |
| `claimedByUserId` | string | | | Topic Hub user ID that claimed it |
| `expiresAt` | Date | yes | TTL | Auto-delete after expiry |
| `createdAt` | Date | auto | | |

**Indexes**:
- `{ code: 1 }` — unique, lookup by code
- `{ expiresAt: 1 }` — TTL index (MongoDB auto-deletes expired documents)

**Validation**:
- `code` is 6 chars, uppercase alphanumeric, no ambiguous characters (0/O, 1/I/L)
- `expiresAt` defaults to `now() + 10 minutes`

### executor_heartbeats

Tracks local CLI availability per user.

| Field | Type | Required | Index | Description |
|-------|------|----------|-------|-------------|
| `_id` | ObjectId | auto | PK | |
| `tenantId` | string | yes | | Tenant context |
| `topichubUserId` | string | yes | unique compound with tenantId | One heartbeat per user per tenant |
| `claimToken` | string | yes | | CLI claim token |
| `lastSeenAt` | Date | yes | | Last heartbeat timestamp |
| `executorMeta` | object | | | Agent type, concurrency capacity, hostname, PID |
| `createdAt` | Date | auto | | |
| `updatedAt` | Date | auto | | |

**Indexes**:
- `{ tenantId: 1, topichubUserId: 1 }` — unique compound (single executor per user)

**Validation**:
- A heartbeat is considered "active" if `lastSeenAt > now() - 60 seconds`

### qa_exchanges

Question-answer pairs linked to dispatches for IM relay.

| Field | Type | Required | Index | Description |
|-------|------|----------|-------|-------------|
| `_id` | ObjectId | auto | PK | |
| `tenantId` | string | yes | | Tenant context |
| `dispatchId` | ObjectId | yes | yes | Parent dispatch |
| `topichubUserId` | string | yes | yes | Target user for routing |
| `questionText` | string | yes | | The question from the agent |
| `questionContext` | object | | | Skill name, topic title — for IM display |
| `answerText` | string | | | User's answer |
| `status` | string | yes | yes | `pending`, `answered`, `timed_out` |
| `sourceChannel` | string | yes | | IM channel to send the question to |
| `sourcePlatform` | string | yes | | IM platform |
| `questionedAt` | Date | yes | | When the question was created |
| `answeredAt` | Date | | | When the answer was received |
| `reminderSentAt` | Date | | | When reminder was sent (for timeout tracking) |
| `createdAt` | Date | auto | | |

**Indexes**:
- `{ dispatchId: 1, status: 1 }` — find pending questions for a dispatch
- `{ topichubUserId: 1, status: 1 }` — find pending questions for a user (for `/answer` routing)

**State transitions**:
```
pending → answered (user replies with /answer)
pending → timed_out (no response after configurable timeout)
```

## Modified Collections

### task_dispatches (existing)

| Field | Change | Description |
|-------|--------|-------------|
| `targetUserId` | **NEW** (optional string) | Topic Hub user ID. When set, only that user's CLI can see/claim this dispatch. When null, any CLI in the tenant can claim (existing behavior). |
| `sourceChannel` | **NEW** (optional string) | IM channel where the command was sent (for reply routing) |
| `sourcePlatform` | **NEW** (optional string) | IM platform of origin |
| `status` | **MODIFIED** (add `SUSPENDED` value) | New status for Q&A timeout |

**New index**: `{ tenantId: 1, targetUserId: 1, status: 1, createdAt: 1 }`

**Updated DispatchStatus enum**:
```
UNCLAIMED → CLAIMED → COMPLETED
                    → FAILED
                    → SUSPENDED (new — Q&A timeout)
```

## Relationships

```
User Identity Binding
  └── topichubUserId → Executor Heartbeat (1:1 per tenant)
  └── topichubUserId → Task Dispatch.targetUserId (1:many)

Pairing Code
  └── claimed → creates/updates User Identity Binding

Task Dispatch
  └── Q&A Exchange (1:many, via dispatchId)

IM Command Flow:
  OpenClaw webhook → resolve platformUserId → lookup User Identity Binding
    → topichubUserId → create Task Dispatch with targetUserId
    → check Executor Heartbeat for availability notification
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| HEARTBEAT_INTERVAL_MS | 30,000 | CLI heartbeat send interval |
| HEARTBEAT_STALE_THRESHOLD_MS | 60,000 | Server considers executor offline |
| PAIRING_CODE_TTL_MS | 600,000 | 10 minutes |
| PAIRING_CODE_LENGTH | 6 | Characters |
| DISPATCH_UNCLAIMED_REMINDER_MS | 120,000 | 2 minutes before follow-up IM |
| QA_REMINDER_MS | 300,000 | 5 minutes before Q&A reminder |
| QA_TIMEOUT_MS | 600,000 | 10 minutes before Q&A suspend |
| DEFAULT_MAX_CONCURRENT_AGENTS | 1 | Default parallel agent limit |
