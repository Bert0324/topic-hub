# Quickstart: 016 integration (two ingress routes + one CLI base URL)

> **Implemented**: `TOPICHUB_HTTP_PREFIX` in `packages/server/src/main.ts`; native ingress path constant `NATIVE_INTEGRATION_SEGMENT` (`topic-hub`) in `@topichub/core`. See [contracts/native-gateway.md](./contracts/native-gateway.md).

## Prerequisites

- Node 20+, `pnpm`, MongoDB (e.g. `docker compose up -d mongodb`)
- Built packages: `pnpm --filter @topichub/core build` (and server as needed)

## 1. Configure public base (optional path prefix)

Set the HTTP prefix the reverse proxy exposes (Nest `setGlobalPrefix` — no leading/trailing slashes):

```bash
export TOPICHUB_HTTP_PREFIX=topic-hub   # → routes under /topic-hub (health, webhooks, native gateway, …)
export PORT=3000
```

CLI **must** use the **same** origin + prefix:

```bash
export TOPICHUB_SERVER_URL="http://127.0.0.1:3000/topic-hub"
```

## 2. Two integration URLs

| Surface | Example path (with prefix) | Consumer |
|---------|----------------------------|----------|
| OpenClaw bridge | `POST {base}/webhooks/openclaw` | IM relay / OpenClaw |
| Native Topic Hub | `POST {base}/topic-hub` | CLI / `postNativeGateway` |

`{base}` = scheme + host + optional prefix, **no** trailing slash.

## 3. Smoke checks

```bash
# Liveness (optional): GET /health — infra probes only; CLI/init 使用下方原生网关
curl -sS "${TOPICHUB_SERVER_URL%/}/health"

# Native gateway（CLI `init` / `serve` 使用的接入方式）
curl -sS -X POST "${TOPICHUB_SERVER_URL%/}/topic-hub" \
  -H 'Content-Type: application/json' \
  -d '{"v":1,"op":"health","payload":{}}'
```

## 4. OpenClaw relay

`TOPICHUB_BRIDGE_WEBHOOK_URL` must point to the **full public** bridge URL (including prefix), e.g.:

```bash
export TOPICHUB_BRIDGE_WEBHOOK_URL="http://127.0.0.1:3000/topic-hub/webhooks/openclaw"
```

## 5. Troubleshooting

- **404 on gateway**: Prefix mismatch—ensure `serverUrl` in CLI includes the same path as Nest global prefix.
- **Signature failures**: Bridge `SECRET` and server `OPENCLAW_WEBHOOK_SECRET` (or current equivalent) must match deployment docs.
