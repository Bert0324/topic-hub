#!/usr/bin/env bash
set -euo pipefail

docker compose up -d mongodb

export MONGODB_URI="mongodb://localhost:27017/topichub"
export LOG_FORMAT="pretty"
export PORT="3000"

# ── Auth / Crypto ──────────────────────────────────────────
# MASTER_SECRET not needed for local dev (uses built-in fallback)
# export MASTER_SECRET=""
# export JWKS_CONFIGS=""

# ── AI Provider ────────────────────────────────────────────
export AI_ENABLED=""
export AI_PROVIDER=""
export AI_API_URL=""
export AI_API_KEY=""
export AI_MODEL=""
AI_TIMEOUT_MS="60000"
AI_RATE_LIMIT_GLOBAL="1000"

# ── Skills ─────────────────────────────────────────────────
# export SKILLS_DIR=""

pnpm --filter @topichub/server run dev
