# Contract: Dispatch Authentication API

## Overview

Changes to existing dispatch endpoints to add executor-token authentication and support `targetExecutorToken` routing. This is the critical security fix ensuring IM messages cannot be misrouted.

## Changes to Existing Endpoints

### POST /api/v1/dispatches/:id/claim (MODIFY)

**Before**: No authentication; body `{ claimedBy: string }`
**After**: Requires `Authorization: Bearer <executorToken>`

**New behavior**:
1. Resolve `ExecutorRegistration` from bearer token → get `identityId`, `executorToken`
2. Load dispatch by `id`
3. **Authorization check**:
   - If `dispatch.targetExecutorToken` is set: `executorToken === dispatch.targetExecutorToken` (must match exactly)
   - Else if `dispatch.targetIdentityId` is set: `executor.identityId === dispatch.targetIdentityId` (any executor of that identity)
   - Else: any authenticated executor can claim (backward compat for non-IM dispatches)
4. Atomic update: `status: 'claimed'`, `claimedBy: executorToken`

**Request**:
```
POST /api/v1/dispatches/:id/claim
Authorization: Bearer <executorToken>
Content-Type: application/json

{ "claimedBy": "cli:<hostname>:<pid>" }
```

**Response 200**: Dispatch object
**Response 401**: Missing or invalid executor token
**Response 403**: Executor token does not match dispatch target
**Response 409**: Already claimed

---

### POST /api/v1/dispatches/:id/complete (MODIFY)

**Before**: No authentication
**After**: Requires `Authorization: Bearer <executorToken>`; must match `claimedBy` executor

**Additional behavior**: If dispatch has `skillName` referencing a published skill, increment `SkillRegistration.usageCount` and create `SkillUsage` record.

**Request**:
```
POST /api/v1/dispatches/:id/complete
Authorization: Bearer <executorToken>
Content-Type: application/json

{
  "result": {
    "text": "...",
    "executorType": "claude-code",
    "tokenUsage": 1500,
    "durationMs": 45000
  }
}
```

**Response 200**: Updated dispatch
**Response 401**: Missing or invalid token
**Response 403**: Not the claiming executor

---

### POST /api/v1/dispatches/:id/fail (MODIFY)

**Before**: No authentication
**After**: Requires `Authorization: Bearer <executorToken>`; must match `claimedBy` executor

**Request**:
```
POST /api/v1/dispatches/:id/fail
Authorization: Bearer <executorToken>
Content-Type: application/json

{
  "error": "execution failed: ...",
  "retryable": true
}
```

---

### POST /api/v1/dispatches/:id/question (MODIFY)

**Before**: No authentication
**After**: Requires `Authorization: Bearer <executorToken>`

---

### GET /api/v1/dispatches (MODIFY)

**Before**: Tenant API key auth
**After**: Supports both tenant API key (backward compat) and executor token auth

**New query behavior with executor token**:
- Filters dispatches where `targetExecutorToken === callerExecutorToken` OR (`targetIdentityId === callerIdentityId` AND `targetExecutorToken` is null)
- This ensures an executor only sees dispatches meant for it or for its identity (when no specific executor is targeted)

---

### GET /api/v1/dispatches/stream (SSE) (MODIFY)

**Before**: Query param `executorToken` used for filtering but `TaskDispatch` has no `targetExecutorToken` field — effectively broken
**After**: Filter SSE events by matching `dispatch.targetExecutorToken === executorToken` from query param (or identity fallback)

**Auth**: Bearer executor token in header (existing) or query param (existing)

## New Fields on TaskDispatch

| Field | Type | Set by | Purpose |
|-------|------|--------|---------|
| `targetExecutorToken` | `string \| null` | Dispatch creation (from ImBinding) | Route to specific executor |
| `targetIdentityId` | `string \| null` | Dispatch creation (from ImBinding) | Fallback: route to any executor of this identity |

## Backward Compatibility

- Dispatches created without IM context (API ingestion, CLI commands) continue to have `targetExecutorToken: null` and `targetIdentityId: null` — any authenticated executor can claim them (same as current behavior, but now requiring auth)
- Existing dispatches in the database with `targetUserId` are still readable; new code writes `targetIdentityId` instead
- The `tenantId` field remains on dispatches for backward compat with tenant-scoped queries; new flows do not depend on it for routing
