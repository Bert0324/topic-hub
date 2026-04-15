#!/usr/bin/env bash
# Manual smoke: two experience_server (or two topic-hub server) processes against the **same**
# Mongo URI as production/BOE — verifies embedded bridge lease (leader + follower) and local
# webhook handling. Feishu only needs to point at **one** public URL (ngrok / dev host).
#
# Prerequisites
#   - Same TOPICHUB_MONGO_URI (and TOPICHUB_COLLECTION_PREFIX if you use ByteDoc prefix) on both.
#   - TOPICHUB_BRIDGE_FEISHU_* + TOPICHUB_EMBED_BRIDGE=1 (non-PPE) as in your BOE runbook.
#   - Optional: TOPICHUB_PUBLIC_GATEWAY_BASE_URL=https://<host> so followers enqueue outbound
#     sends to the lease leader (required for IM replies when the follower receives HTTP).
#
# Terminal A (port 3000)
#   cd /path/to/experience_server
#   export TOPICHUB_MONGO_URI='mongodb://...'
#   export TOPICHUB_COLLECTION_PREFIX='byted_topic_hub_'   # if applicable
#   export TOPICHUB_BRIDGE_FEISHU_APP_ID='...'
#   export TOPICHUB_BRIDGE_FEISHU_APP_SECRET='...'
#   export TOPICHUB_BRIDGE_FEISHU_DOMAIN='feishu'
#   export PORT=3000
#   pnpm dev
#
# Terminal B (port 3001) — **same** TOPICHUB_MONGO_URI / prefix / Feishu creds
#   export PORT=3001
#   pnpm dev
#
# Expect in logs (either process):
#   - "Acquired embedded OpenClaw bridge lease" OR "Renewed ..." on **one** PID
#   - "Using shared embedded OpenClaw bridge (follower" on the **other** PID
#   - Same TOPICHUB / OpenClaw startup without "deferred embedded bridge failed"
#
# Signed webhook probe (simulates relay → GuluX re-stringify). Adjust router prefix if not /api/experience.
# Replace SECRET with the lease doc's webhookSecret only for local debugging (do not log in prod).
#
#   BODY='{"event":"message.received","timestamp":"2026-04-15T12:00:00.000Z","data":{"channel":"user:x","user":"x","message":"/help","sessionId":"sk","platform":"feishu","isDm":true}}'
#   SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"
#   curl -sS -X POST "http://127.0.0.1:3000/api/experience/topic-hub/webhooks/openclaw" \
#     -H "Content-Type: application/json" -H "X-TopicHub-Signature: $SIG" \
#     -d "$BODY" | head -c 200 && echo
#
# Feishu (real)
#   - Point event subscription / bot webhook to the **one** URL that reaches your dev host (ngrok → :3000).
#   - In DM: `/help`, `/id me`, `@Bot /agent list` (with serve + pairing as usual).
#
# Automated suite (no Feishu, in-memory Mongo by default; optional BOE URI):
#   cd "$(dirname "$0")/../packages/core"
#   npm test -- --testPathPattern='integration/multi-instance-im-relay|openclaw-relay-webhook-hmac|embedded-bridge-leader|im-claim-message|webhook-id-command'
#   TOPICHUB_INTEGRATION_MONGO_URI='mongodb://...' npm test -- test/integration/multi-instance-im-relay.integration.test.ts

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/core"
echo "== Core automated smoke (multi-instance + relay HMAC + IM dispatch) =="
npm test -- --testPathPattern='integration/multi-instance-im-relay|openclaw-relay-webhook-hmac|embedded-bridge-leader|im-claim-message|webhook-id-command|im-agent-control-dispatch|skill-pipeline-im-agent'
