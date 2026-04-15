# Contract: Heartbeat & Executor API

**Date**: 2026-04-10 | **Feature**: 008-secure-im-dispatch

## Register Executor (on serve start)

```
POST /api/v1/executors/register
Content-Type: application/json
Authorization: Bearer <admin-token>
```

### Request

```json
{
  "force": false,
  "executorMeta": {
    "agentType": "claude-code",
    "maxConcurrentAgents": 2,
    "hostname": "macbook-pro.local",
    "pid": 12345
  }
}
```

### Processing

1. Resolve `topichubUserId` from the caller's `claimToken` via `user_identity_bindings`.
2. Check `executor_heartbeats` for an existing active heartbeat (lastSeenAt within 60s):
   - If active and `force: false` → return 409.
   - If active and `force: true` → overwrite the heartbeat.
   - If stale or not found → create new heartbeat.
3. Upsert heartbeat: `{ tenantId, topichubUserId, claimToken, lastSeenAt: now(), executorMeta }`.

### Response (Success)

```json
HTTP 200
{
  "status": "registered",
  "topichubUserId": "usr_a1b2c3d4e5f6"
}
```

### Response (Conflict)

```json
HTTP 409
{
  "error": "An executor is already active for your account",
  "activeExecutor": {
    "hostname": "desktop.local",
    "lastSeenAt": "2026-04-10T10:30:00Z"
  }
}
```

## Heartbeat (periodic)

```
POST /api/v1/executors/heartbeat
Content-Type: application/json
Authorization: Bearer <admin-token>
```

### Request

```json
{}
```

### Processing

1. Resolve `topichubUserId` from `claimToken`.
2. Update `executor_heartbeats.lastSeenAt = now()` for that user.
3. Return count of pending dispatches (optimization: CLI can adjust polling frequency).

### Response

```json
HTTP 200
{
  "status": "ok",
  "pendingDispatches": 3
}
```

## Deregister (on serve shutdown)

```
POST /api/v1/executors/deregister
Content-Type: application/json
Authorization: Bearer <admin-token>
```

### Processing

1. Delete the heartbeat record for the caller's `topichubUserId`.

### Response

```json
HTTP 200
{ "status": "deregistered" }
```

## User-Scoped Dispatch Polling (modified existing)

```
GET /api/v1/dispatches?status=unclaimed&limit=50
Authorization: Bearer <admin-token>
```

### Modified behavior

The server resolves `topichubUserId` from the caller's `claimToken`. If the dispatch has a `targetUserId`:
- Only return it if `targetUserId` matches the caller's `topichubUserId`.
- Otherwise, exclude it from results.

Dispatches without `targetUserId` (non-IM, e.g. webhook-created) remain tenant-scoped (any CLI can claim).

The SSE stream (`/api/v1/dispatches/stream`) applies the same user-scoped filter.
