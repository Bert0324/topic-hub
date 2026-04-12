# REST API Contracts

**Branch**: `001-topic-hub-app` | **Date**: 2026-04-09

## Base URL

`http://<host>:<port>/api/v1`

## Authentication

| Surface | Mechanism |
|--------|-----------|
| **Event ingestion** | API key via `X-API-Key` header — **tenant-scoped** (identifies exactly one tenant). |
| **Admin API (Platform Admin)** | Platform admin token via `Authorization: Bearer <token>`. |
| **Admin API (Tenant Admin)** | Tenant admin token via `Authorization: Bearer <token>`. |
| **User API** | **ID Token (JWT)** from OAuth2 PKCE via `Authorization: Bearer <id-token>`. The server verifies the JWT signature against the IM platform’s **JWKS** endpoint. The server **never** stores this token. |
| **Webhooks** | **Platform-specific signature verification** (and related headers), validated inside the relevant Platform Skill (or adapter as configured). |
| Adapter webhooks | Optional HMAC or source-system headers as configured per Adapter Skill |

**Error convention** (unless noted): JSON body `{ "error": { "code": string, "message": string, "details?: unknown } }`.

Common **HTTP status codes**:

| Code | Meaning |
|------|---------|
| `400` | Validation / malformed request |
| `401` | Missing or invalid credentials |
| `403` | Authenticated but not allowed |
| `404` | Resource not found or not visible in tenant scope |
| `409` | Conflict (state, duplicate, closed topic mutation) |
| `422` | Semantic validation failed (e.g. skill schema) |
| `429` | Rate limited |
| `500` | Server error |

---

## POST /ingestion/events

Tenant-scoped event ingestion. Tenant is derived from the API key.

**Headers**: `X-API-Key`, `Content-Type: application/json`

**Request**:
```json
{
  "type": "deploy",
  "title": "v2.3 Release to Production",
  "sourceUrl": "https://ci.example.com/pipelines/123",
  "status": "open",
  "metadata": {
    "approver": "alice",
    "version": "2.3.0"
  },
  "tags": ["production"],
  "assignees": ["alice"]
}
```

**Response `201 Created`** (new topic):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "ten_01",
  "type": "deploy",
  "title": "v2.3 Release to Production",
  "status": "open",
  "createdAt": "2026-04-09T10:30:00.000Z",
  "groups": [
    { "platform": "feishu", "groupId": "oc_xxx", "groupUrl": "https://example.com/group/oc_xxx" }
  ]
}
```

**Response `200 OK`** (update via `sourceUrl` / dedup key):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "updated": true,
  "status": "in_progress",
  "timelineEntry": { "actionType": "status_changed", "timestamp": "2026-04-09T11:00:00.000Z" }
}
```

**Errors**: `400` (unknown type, schema), `401` (bad key), `409` (upsert race), `422` (metadata vs TypeSkill schema).

---

## POST /commands/execute

Internal endpoint used by Platform Skills after parsing IM commands. Requires a service or platform-scoped credential (implementation-defined; typically Bearer or internal API key).

**Request**:
```json
{
  "tenantId": "ten_01",
  "action": "create",
  "type": "deploy",
  "args": {
    "title": "Hotfix auth",
    "sourceUrl": "https://ci.example.com/999"
  },
  "context": {
    "platform": "feishu",
    "groupId": "oc_xxx",
    "userId": "ou_abc",
    "isTopicGroup": false
  }
}
```

**Response `200 OK`**:
```json
{
  "success": true,
  "topic": { "id": "...", "tenantId": "ten_01", "type": "deploy", "status": "open" },
  "message": "Topic created",
  "groups": [{ "platform": "feishu", "groupUrl": "https://..." }]
}
```

**Errors**: `400`, `403` (AuthSkill denied), `404`, `409`.

---

## GET /topics/search

Tenant-scoped search. Tenant from `Authorization: Bearer` context (**platform admin**, **tenant admin**, or **user ID token** after JWKS verification) or from internal caller's explicit `tenantId` in body/query where applicable for service calls — **contract**: responses MUST NOT leak cross-tenant data.

**Query**: `type`, `status`, `tag` (repeatable), `q`, `from`, `to` (ISO 8601), `page` (default 1), `pageSize` (default 20, max 100).

**Response `200 OK`**:
```json
{
  "results": [
    {
      "id": "tp_123",
      "tenantId": "ten_01",
      "type": "alert",
      "title": "High CPU prod-web-03",
      "status": "open",
      "createdAt": "2026-04-09T08:15:00.000Z",
      "tags": ["production"],
      "groups": [{ "platform": "feishu", "groupUrl": "https://..." }]
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

**Errors**: `401`, `403`.

---

## GET /topics/:id

Full topic detail for the authenticated tenant.

**Response `200 OK`**: Topic object including metadata, assignees, tags, signals, groups, summary fields.

**Errors**: `404` if id unknown or not in tenant.

---

## GET /topics/:id/timeline

Paginated timeline for a topic.

**Query**: `page`, `pageSize`.

**Response `200 OK`**:
```json
{
  "entries": [
    {
      "id": "tl_1",
      "timestamp": "2026-04-09T10:30:00.000Z",
      "actor": "alice",
      "actionType": "created",
      "payload": {}
    }
  ],
  "total": 15,
  "page": 1,
  "pageSize": 50
}
```

---

## POST /webhooks/:platform

Public webhook URL for an IM platform (`:platform` e.g. `feishu`). Server routes the raw request to the matching **Platform Skill** (and may use `resolvetenantId` on the payload). Tenant is resolved from payload/signature context.

**Response**: Implementation-defined (often `200` with empty body or platform-required JSON).

**Errors**: `401` / `403` on signature failure; `404` if no skill for `:platform`.

Adapter systems MAY use the same path pattern with a dedicated `:platform` or a separate route prefix per deployment; if sharing, `:platform` MUST disambiguate Adapter vs Platform handlers.

---

## Admin — global skills (Platform Admin)

### GET /admin/skills

Lists globally installed Skills (packages registered on the server).

**Response `200 OK`**:
```json
{
  "skills": [
    {
      "name": "deploy-type",
      "category": "type",
      "version": "1.0.0",
      "metadata": { "topicType": "deploy" },
      "installedAt": "2026-04-09T09:00:00.000Z"
    }
  ]
}
```

### POST /admin/skills

Install a Skill from a package descriptor. **Platform Admin only.**

**Request**:
```json
{ "package": "@acme/topichub-deploy-type", "version": "1.0.0" }
```

**Response `201 Created`**: `{ "name": "deploy-type", "version": "1.0.0", "category": "type" }`

**Errors**: `400`, `401`, `403`, `422` (invalid manifest).

### DELETE /admin/skills/:name

Uninstall. **Platform Admin only.** May fail if tenants still depend on the skill (implementation-defined).

**Errors**: `404`, `409`.

---

## Admin — tenants (Platform Admin)

### GET /admin/tenants

**Response `200 OK`**:
```json
{
  "tenants": [
    { "id": "ten_01", "name": "Acme Corp", "disabled": false, "createdAt": "2026-04-01T00:00:00.000Z" }
  ]
}
```

### POST /admin/tenants

**Request**:
```json
{ "name": "Acme Corp" }
```

**Response `201 Created`**:
```json
{
  "tenantId": "ten_01",
  "apiKey": "th_live_xxxxxxxx",
  "adminToken": "th_admin_xxxxxxxx"
}
```

### PATCH /admin/tenants/:id

**Request** (example): `{ "name": "Acme Ltd", "disabled": false }`

**Response `200 OK`**: Updated tenant summary.

### POST /admin/tenants/:id/token/regenerate

Issues a new tenant admin token; old token invalid after grace period (implementation-defined).

**Response `200 OK`**: `{ "adminToken": "th_admin_yyyyyyyy" }`

---

## Admin — tenant skills

### GET /admin/tenants/:tid/skills

Lists Skill configuration and enabled state for tenant `:tid`.

**Response `200 OK`**:
```json
{
  "skills": [
    {
      "name": "feishu",
      "category": "platform",
      "enabled": true,
      "configMasked": { "appId": "cli_xxx", "appSecret": "***" }
    }
  ]
}
```

### PATCH /admin/tenants/:tid/skills/:name

Enable, disable, or update config for skill `:name` on tenant `:tid`. **Tenant Admin** (Bearer for `:tid`) or **Platform Admin**.

**Request**:
```json
{
  "enabled": true,
  "config": { "appId": "cli_xxx", "appSecret": "secret" }
}
```

**Response `200 OK`**: `{ "name": "feishu", "enabled": true }`

**Errors**: `404` (unknown skill or tenant), `403`.

---

## Admin — stats

### GET /admin/stats

Platform-wide statistics. **Platform Admin only.**

**Response `200 OK`**:
```json
{
  "tenants": { "total": 12, "active": 11 },
  "topics": { "total": 5000, "byStatus": { "open": 120, "closed": 4500 } },
  "skills": { "installed": 8 }
}
```

### GET /admin/tenants/:tid/stats

Tenant-scoped stats. **Tenant Admin** for `:tid` or **Platform Admin**.

**Response `200 OK`**:
```json
{
  "tenantId": "ten_01",
  "topics": { "total": 340, "byType": { "deploy": 100, "bug": 240 } },
  "activity24h": { "events": 89, "commands": 12 }
}
```

---

## GET /health

No auth required (or minimal — deployment choice).

**Response `200 OK`**:
```json
{ "status": "ok", "db": "connected", "version": "1.0.0" }
```

**Response `503 Service Unavailable`** (degraded):
```json
{ "status": "degraded", "db": "disconnected" }
```

---

## Auth — JWT / JWKS (no server-side user token storage)

User authentication is **OAuth2 PKCE with the IM platform**, performed entirely by the **CLI** (browser + local callback). The Topic Hub server **does not** host a login redirect, exchange auth codes for user tokens, or persist user ID tokens or refresh tokens.

### GET /auth/jwks-config

Returns the **JWKS endpoint URLs** for supported IM platforms so clients (e.g. CLI) know where to fetch public keys when verifying JWTs locally, and so the server can align verification configuration.

**Response `200 OK`** (example shape):
```json
{
  "platforms": [
    { "platform": "feishu", "jwksUri": "https://open.feishu.cn/open-apis/authen/v1/jwks" }
  ]
}
```

**Errors**: `500` if configuration unavailable.

### POST /auth/verify

Accepts an **ID token (JWT)** in the request body, verifies signature and standard claims using the appropriate platform **JWKS**, and returns **user identity** plus **`tenantId`**. Used **internally** by the server when processing user-scoped requests (e.g. CLI calls with `Authorization: Bearer <id-token>`), after or alongside gateway validation — **tokens are verified, not stored**.

**Request**:
```json
{
  "idToken": "eyJhbGciOi..."
}
```

**Response `200 OK`**:
```json
{
  "user": {
    "id": "ou_abc",
    "platform": "feishu",
    "displayName": "Alice",
    "email": "alice@acme.com",
    "verified": true
  },
  "tenantId": "ten_01"
}
```

**Errors**: `400` (missing or malformed token), `401` (invalid signature, expired, or wrong audience/issuer).
