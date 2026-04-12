#!/usr/bin/env bash
set -euo pipefail

docker compose up -d mongodb

export COLLECTION_PREFIX="topic_hub_"
export MONGODB_URI="mongodb://localhost:27017/topichub"
export LOG_FORMAT="pretty"
export PORT="3000"

# ── OpenClaw Bridge ────────────────────────────────────────
# Webhook path matches Nest routes at server root (no Nest `setGlobalPrefix`).
export TOPICHUB_BRIDGE_WEBHOOK_URL="http://127.0.0.1:${PORT}/webhooks/openclaw"

# Discord
# export TOPICHUB_BRIDGE_DISCORD_BOT_TOKEN="MTQ5MjA3ODQ4NDQwMTQyMjM5OQ.GIKUHm.1p0BiwRHMQWYYsJOp7fENuHR9aDcpFR1dZ6fXE"

# Feishu
export TOPICHUB_BRIDGE_FEISHU_APP_ID=""
export TOPICHUB_BRIDGE_FEISHU_APP_SECRET=""
export TOPICHUB_BRIDGE_FEISHU_DOMAIN="feishu"

pnpm --filter @topichub/core run build
pnpm --filter @topichub/server run dev
