#!/usr/bin/env bash
set -euo pipefail

docker compose up -d mongodb

export COLLECTION_PREFIX="topic_hub_"
export MONGODB_URI="mongodb://localhost:27017/topichub"
export LOG_FORMAT="pretty"
export PORT="3000"

# Optional: Nest global HTTP prefix (`TOPICHUB_HTTP_PREFIX`). When non-empty, **all** routes
# (including `webhooks/openclaw`) live under `/<prefix>/…`. Bridge webhook URL and CLI
# `serverUrl` must include that same prefix or IM relay gets HTTP 404 (no body).
export TOPICHUB_HTTP_PREFIX="topic-hub"

# ── OpenClaw Bridge ────────────────────────────────────────
if [[ -n "${TOPICHUB_HTTP_PREFIX}" ]]; then
  export TOPICHUB_BRIDGE_WEBHOOK_URL="http://127.0.0.1:${PORT}/${TOPICHUB_HTTP_PREFIX}/webhooks/openclaw"
else
  export TOPICHUB_BRIDGE_WEBHOOK_URL="http://127.0.0.1:${PORT}/webhooks/openclaw"
fi

# Discord
export TOPICHUB_BRIDGE_DISCORD_BOT_TOKEN="MTQ5MjA3ODQ4NDQwMTQyMjM5OQ.GIKUHm.1p0BiwRHMQWYYsJOp7fENuHR9aDcpFR1dZ6fXE"

# Feishu
export TOPICHUB_BRIDGE_FEISHU_APP_ID="cli_a95365b29439dbdb"
export TOPICHUB_BRIDGE_FEISHU_APP_SECRET="aag41c4UxntBWJVHr4QfjcNT1pNEAxEa"
export TOPICHUB_BRIDGE_FEISHU_DOMAIN="feishu"

pnpm --filter @topichub/core run build
pnpm --filter @topichub/server run dev
