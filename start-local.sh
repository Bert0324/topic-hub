#!/usr/bin/env bash
set -euo pipefail

# IM 等变量在下方显式 export，仓库内保持空字符串即可通过推送保护。
# 本地运行：直接改本文件填入密钥（勿 commit），或创建 `.env.local`（gitignored）覆盖下面各 export。
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

export MONGODB_URI='mongodb://localhost:27017/topichub'

export TOPICHUB_BRIDGE_FEISHU_APP_ID="cli_a95365b29439dbdb"
export TOPICHUB_BRIDGE_FEISHU_APP_SECRET="aag41c4UxntBWJVHr4QfjcNT1pNEAxEa"
export TOPICHUB_BRIDGE_FEISHU_DOMAIN="feishu"


if [[ -f "$REPO_ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env.local"
  set +a
fi

# Need at least one configured IM channel (same rules as Nest `TopicHubService`).
has_discord=''
[[ -n "${TOPICHUB_BRIDGE_DISCORD_BOT_TOKEN:-}" ]] && has_discord=1
has_feishu=''
[[ -n "${TOPICHUB_BRIDGE_FEISHU_APP_ID:-}" && -n "${TOPICHUB_BRIDGE_FEISHU_APP_SECRET:-}" ]] && has_feishu=1
has_telegram=''
[[ -n "${TOPICHUB_BRIDGE_TELEGRAM_BOT_TOKEN:-}" ]] && has_telegram=1
has_slack=''
[[ -n "${TOPICHUB_BRIDGE_SLACK_BOT_TOKEN:-}" && -n "${TOPICHUB_BRIDGE_SLACK_APP_TOKEN:-}" ]] && has_slack=1
has_weixin=''
[[ "${TOPICHUB_BRIDGE_WEIXIN_ENABLED:-}" == "true" ]] && has_weixin=1

if [[ -z "$has_discord" && -z "$has_feishu" && -z "$has_telegram" && -z "$has_slack" && -z "$has_weixin" ]]; then
  echo "Missing IM bridge credentials: 在上方 export 中填写至少一种渠道，或写入 .env.local 后重试（勿提交密钥）。" >&2
  exit 1
fi

docker compose up -d mongodb
export COLLECTION_PREFIX=topic_hub_ LOG_FORMAT=pretty

pnpm bridge:ensure-extensions
pnpm bridge:build-vendor
node packages/core/scripts/sync-bridge-vendor.mjs --bridge
pnpm --filter @topichub/core run build

# Multi-instance: two API processes share Mongo; only one runs the embedded OpenClaw gateway.
# Followers need TOPICHUB_PUBLIC_GATEWAY_BASE_URL pointing at the leader (default :3000).
if [[ "${TOPICHUB_MULTI_INSTANCE:-}" == "1" ]]; then
  export TOPICHUB_PUBLIC_GATEWAY_BASE_URL="${TOPICHUB_PUBLIC_GATEWAY_BASE_URL:-http://127.0.0.1:3000}"
  export COLLECTION_PREFIX=topic_hub_
  export LOG_FORMAT=pretty
  for port in 3000 3001; do
    if command -v fuser >/dev/null 2>&1; then
      fuser -k "${port}/tcp" 2>/dev/null || true
    fi
  done
  sleep 1
  pnpm --filter @topichub/server run build
  cleanup_servers() {
    [[ -n "${p0:-}" ]] && kill "$p0" 2>/dev/null || true
    [[ -n "${p1:-}" ]] && kill "$p1" 2>/dev/null || true
  }
  trap cleanup_servers EXIT
  (cd "$REPO_ROOT" && PORT=3000 LOG_FORMAT=pretty node packages/server/dist/main.js) &
  p0=$!
  (cd "$REPO_ROOT" && PORT=3001 LOG_FORMAT=pretty node packages/server/dist/main.js) &
  p1=$!
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:3000/health/embedded-bridge" >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:3001/health/embedded-bridge" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  h0=$(curl -fsS "http://127.0.0.1:3000/health/embedded-bridge")
  h1=$(curl -fsS "http://127.0.0.1:3001/health/embedded-bridge")
  echo "health/embedded-bridge :3000 -> $h0"
  echo "health/embedded-bridge :3001 -> $h1"
  echo "$h0$h1" | grep -q '"role":"leader"' || { echo "expected one leader in health responses" >&2; exit 1; }
  echo "$h0$h1" | grep -q '"role":"follower"' || { echo "expected one follower in health responses" >&2; exit 1; }
  trap - EXIT
  cleanup_servers
  wait "$p0" 2>/dev/null || true
  wait "$p1" 2>/dev/null || true
  echo "TOPICHUB_MULTI_INSTANCE=1 verification OK."
  exit 0
fi

export COLLECTION_PREFIX=topic_hub_ LOG_FORMAT=pretty PORT=3000
pnpm --filter @topichub/server run dev
