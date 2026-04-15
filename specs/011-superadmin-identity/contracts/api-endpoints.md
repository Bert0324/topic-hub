# API Contracts: Superadmin Identity Model

**Feature**: 011-superadmin-identity  
**Date**: 2026-04-11

## Authentication

All authenticated endpoints accept `Authorization: Bearer <token>` header.

Token types and their scopes:
- **Superadmin token**: Admin endpoints (identity CRUD, token management)
- **Identity token**: Executor registration only (used once on startup)
- **Executor token**: Task operations (dispatch stream, claim, complete, fail), heartbeat

## New Endpoints

### POST /api/v1/init

Bootstrap the system. Creates the superadmin identity. Fails if already initialized.

**Auth**: None (only works on fresh system)

**Request**: Empty body

**Response 200**:
```json
{
  "superadminToken": "a1b2c3...64chars",
  "uniqueId": "superadmin",
  "displayName": "Super Admin",
  "message": "System initialized. Store this token securely — it cannot be retrieved again."
}
```

**Response 409**: `{ "error": "System already initialized" }`

---

### POST /api/v1/admin/identities

Create a new user identity. Superadmin only.

**Auth**: Bearer `<superadmin-token>`

**Request**:
```json
{
  "uniqueId": "alice",
  "displayName": "Alice Chen"
}
```

**Response 201**:
```json
{
  "id": "ObjectId",
  "uniqueId": "alice",
  "displayName": "Alice Chen",
  "token": "d4e5f6...64chars",
  "message": "Identity created. Distribute this token to the user securely."
}
```

**Response 409**: `{ "error": "Identity with uniqueId 'alice' already exists" }`  
**Response 401**: `{ "error": "Invalid or missing superadmin token" }`

---

### GET /api/v1/admin/identities

List all identities. Superadmin only.

**Auth**: Bearer `<superadmin-token>`

**Response 200**:
```json
{
  "identities": [
    {
      "id": "ObjectId",
      "uniqueId": "superadmin",
      "displayName": "Super Admin",
      "isSuperAdmin": true,
      "status": "active",
      "executorCount": 2,
      "createdAt": "2026-04-11T..."
    },
    {
      "id": "ObjectId",
      "uniqueId": "alice",
      "displayName": "Alice Chen",
      "isSuperAdmin": false,
      "status": "active",
      "executorCount": 1,
      "createdAt": "2026-04-11T..."
    }
  ]
}
```

---

### POST /api/v1/admin/identities/:id/revoke

Revoke an identity and all its executor tokens. Superadmin only. Cannot revoke superadmin.

**Auth**: Bearer `<superadmin-token>`

**Response 200**: `{ "message": "Identity revoked", "executorsRevoked": 3 }`  
**Response 403**: `{ "error": "Cannot revoke superadmin identity" }`

---

### POST /api/v1/admin/identities/:id/regenerate-token

Regenerate the identity token. Revokes all existing executor tokens (since they were derived from the old identity token). Superadmin only.

**Auth**: Bearer `<superadmin-token>`

**Response 200**:
```json
{
  "token": "new64chartoken...",
  "executorsRevoked": 2,
  "message": "Token regenerated. All executor tokens for this identity have been revoked."
}
```

---

### POST /api/v1/admin/executors/:executorToken/revoke

Revoke a single executor token. Superadmin only.

**Auth**: Bearer `<superadmin-token>`

**Response 200**: `{ "message": "Executor token revoked" }`  
**Response 404**: `{ "error": "Executor token not found" }`

---

### GET /api/v1/admin/executors

List all active executor registrations. Superadmin only.

**Auth**: Bearer `<superadmin-token>`

**Response 200**:
```json
{
  "executors": [
    {
      "executorToken": "eth_...first8chars...",
      "identityId": "ObjectId",
      "identityUniqueId": "alice",
      "status": "active",
      "lastSeenAt": "2026-04-11T...",
      "executorMeta": { "hostname": "alice-laptop", "pid": 12345 }
    }
  ]
}
```

---

### POST /api/v1/executors/register

Register a new executor process. Called by CLI on startup.

**Auth**: Bearer `<identity-token>`

**Request**:
```json
{
  "executorMeta": {
    "hostname": "my-laptop",
    "pid": 12345,
    "agentType": "local",
    "maxConcurrentAgents": 1
  }
}
```

**Response 200**:
```json
{
  "executorToken": "eth_a1b2c3...64chars",
  "identityId": "ObjectId",
  "identityUniqueId": "alice"
}
```

**Response 401**: `{ "error": "Invalid or revoked identity token" }`

---

### POST /api/v1/executors/heartbeat

Heartbeat from a running executor.

**Auth**: Bearer `<executor-token>`

**Response 200**:
```json
{
  "pendingDispatches": 3
}
```

---

## Modified Endpoints

### GET /api/v1/dispatches/stream (SSE)

**Before**: Filtered by `tenantId` (from API key) and optional `targetUserId`.  
**After**: Filtered by `executorToken` (from Bearer token). Only dispatches targeting this executor token are streamed.

**Auth**: Bearer `<executor-token>`

---

### POST /api/v1/dispatches/:id/claim

**Before**: Required `tenantId` from auth; optional `targetUserId`.  
**After**: Auth by executor token; claim validates task's `targetExecutorToken` matches.

**Auth**: Bearer `<executor-token>`

---

### All /api/v1/topics/* endpoints

**Before**: Required `tenantId` from auth (API key → tenant lookup).  
**After**: Auth by executor token or superadmin token; no tenant scoping.

---

## Webhook Contract (OpenClaw Inbound — unchanged structure)

The webhook payload structure is unchanged. What changes is the internal processing:

**Before**: `channel → tenantMapping → tenantId → resolveUserByPlatform(tenantId, platform, userId)`  
**After**: `platform + userId → imBinding → executorToken → identityId`

No tenant resolution needed. Platform is derived from webhook payload `data.platform` field or session ID.

## IM Commands

### /topichub register \<executor-token\>

Binds the IM user to a specific executor process.

**Before**: Generated a pairing code, required CLI-side `topichub-admin link <code>`.  
**After**: Directly validates executor token and creates IM binding.

**Success reply**: "Registered! Your IM commands will be routed to executor `eth_...first8...` (alice@my-laptop)."  
**Error replies**:
- Invalid token: "Invalid executor token. Check the token printed when you started `topichub-admin serve`."
- Revoked token: "This executor token has been revoked. Start a new executor or contact your admin."

### /topichub unregister

Removes the IM binding for the current user.

**Success reply**: "Unregistered. Use `/topichub register <token>` to link again."
