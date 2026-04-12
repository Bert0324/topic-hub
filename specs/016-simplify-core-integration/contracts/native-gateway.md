# Contract: Native Topic Hub integration gateway (single HTTP ingress)

## Purpose

One **POST** route on the server at path segment **`topic-hub`** (export `NATIVE_INTEGRATION_SEGMENT` in `@topichub/core`) multiplexes native CLI integration traffic. With optional env `TOPICHUB_HTTP_PREFIX`, the full path is `POST /{prefix}/topic-hub`. Details: [quickstart.md](../quickstart.md).

The CLI uses **one** `serverUrl` / `baseUrl` and calls `postNativeGateway` in `packages/cli/src/api-client/native-gateway.ts`.

## Request envelope

`Content-Type: application/json`

```json
{
  "v": 1,
  "op": "executors.register",
  "idempotencyKey": "optional-string",
  "payload": { }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `v` | yes | Protocol version; server rejects unknown major. |
| `op` | yes | Operation id (stable). |
| `idempotencyKey` | no | Client-generated key for safe retries where supported. |
| `payload` | yes | Op-specific object; may be `{}`. |

## Response envelope

Success:

```json
{
  "ok": true,
  "v": 1,
  "op": "executors.register",
  "data": { }
}
```

Failure:

```json
{
  "ok": false,
  "v": 1,
  "op": "executors.register",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "human readable"
  }
}
```

HTTP status: use **400** validation, **401/403** auth, **404** unknown `op` (or 400 with structured code—pick one and document), **500** unexpected.

## Authentication

- **Executor-scoped ops**: `Authorization: Bearer <executorToken>` (or existing header convention used today).
- **Superadmin ops**: `Authorization: Bearer <superadminToken>`.
- **Public / none**: only ops explicitly listed in allowlist (implementation mirrors current “no auth on webhook” vs “auth on admin” split—**native gateway has no unauthenticated sensitive ops** except if spec explicitly adds one).

## Initial `op` inventory (minimum parity)

> Exact list is owned by implementation tasks; starting set derived from current CLI `serve` + `ApiClient` usage.

| `op` | Auth | Notes |
|------|------|--------|
| `executors.register` | none or bootstrap | Match current register semantics |
| `executors.pairing_code` | executor | |
| `executors.heartbeat` | executor | |
| `executors.deregister` | executor | |
| `health` | none | Optional if health stays separate GET; if folded, document |

Additional ops for dispatches, topics, admin, etc., follow as `/api/v1/*` routes are retired.

## Versioning

- Bump `v` when removing ops or changing payload shapes incompatibly.
- Server may accept multiple `v` values during short migration windows (spec: no legacy—prefer single `v`).
