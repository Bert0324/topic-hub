#!/usr/bin/env bash
set -euo pipefail

# Local-only secrets: create `.env.local` (gitignored — see `.gitignore`) from `.env.example`,
# then set bridge vars there. Never commit tokens; GitHub push protection will block the push.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

if [[ -f "$REPO_ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env.local"
  set +a
fi

export MONGODB_URI="${MONGODB_URI:-mongodb://localhost:27017/topichub}"

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
  echo "Missing IM bridge credentials. Copy start-local.env.example to .env.local, set at least one channel, then retry." >&2
  exit 1
fi

docker compose up -d mongodb
export COLLECTION_PREFIX=topic_hub_ LOG_FORMAT=pretty PORT=3000

pnpm bridge:ensure-extensions
pnpm bridge:build-vendor
node packages/core/scripts/sync-bridge-vendor.mjs --bridge
pnpm --filter @topichub/core run build
pnpm --filter @topichub/server run dev
