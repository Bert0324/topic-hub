#!/usr/bin/env bash
set -euo pipefail

docker compose up -d mongodb

export COLLECTION_PREFIX="topic_hub_"
export MONGODB_URI="mongodb://localhost:27017/topichub"
export LOG_FORMAT="pretty"
export PORT="3000"

# ── OpenClaw Bridge (Discord) ──────────────────────────────
# Replace with your actual Discord channel ID before running.
DISCORD_CHANNEL_ID="1492073611782258771"
export TOPICHUB_BRIDGE_WEBHOOK_URL="http://127.0.0.1:${PORT}/webhooks/openclaw"
export TOPICHUB_BRIDGE_DISCORD_BOT_TOKEN="MTQ5MjA3ODQ4NDQwMTQyMjM5OQ.GIKUHm.1p0BiwRHMQWYYsJOp7fENuHR9aDcpFR1dZ6fXE"
export TOPICHUB_BRIDGE_PLATFORM_MAPPING="{\"${DISCORD_CHANNEL_ID}\":{\"platform\":\"discord\"}}"

# Optional: Discord server (guild) ID — OpenClaw agent only replies when @mentioned; topichub-relay still forwards all messages.
# export TOPICHUB_BRIDGE_DISCORD_GUILD_ID=""

# ── Auth / Crypto ──────────────────────────────────────────
# MASTER_SECRET not needed for local dev (uses built-in fallback)
# export MASTER_SECRET=""
# export JWKS_CONFIGS=""

# ── AI Provider ────────────────────────────────────────────
# export AI_ENABLED=""
# export AI_PROVIDER=""
# export AI_API_URL=""
# export AI_API_KEY=""
# export AI_MODEL=""
AI_TIMEOUT_MS="60000"
AI_RATE_LIMIT_GLOBAL="1000"

AI_ENABLED=true
AI_PROVIDER=ark
AI_API_URL="https://ark.cn-beijing.volces.com/api/v3"
AI_API_KEY="f839097b-28f6-43f4-84ac-d2ad2d14670c"
AI_MODEL="doubao-seed-2-0-pro-260215"

# ── Skills ─────────────────────────────────────────────────
# export SKILLS_DIR=""

pnpm --filter @topichub/core run build
pnpm --filter @topichub/server run dev
