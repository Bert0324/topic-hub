# Contract: IM → Topic Hub → local executor routing

Absolute paths refer to repo root: `/home/rainson/workspace/topic-hub`.

## Inbound (OpenClaw → `POST /webhooks/openclaw`)

**Required trust**: Request body signed per `OpenClawBridge` / gateway config (HMAC or parsed signature).

**Principal extraction**:

- `platform`: webhook `data.platform` or inferred from `sessionId`
- `platformUserId`: `data.user` (sender)
- `channel` / `sessionId`: used for **reply routing** only after identity is resolved

**Identity resolution** (`WebhookHandler` after binding-required gates):

1. `identity = resolveUserByPlatform(platform, userId)` → `{ topichubUserId, claimToken } | undefined`
2. If undefined → user-readable “not registered” (no dispatch).
3. If defined → `isBoundExecutorSessionLive(topichubUserId, claimToken)`; false → “executor unavailable” (no dispatch).

**Dispatch creation** (`dispatchMeta`):

- `targetUserId` = `topichubUserId`
- `targetExecutorToken` = `identity.claimToken`
- `sourcePlatform` = inbound `platform`
- `sourceChannel` = inbound `channel` (reply peer)

## Outbound (Topic Hub → OpenClaw gateway)

**Claim / complete / fail** (`TopicHub.dispatch.*`):

- `bridge.sendMessage(dispatch.sourcePlatform, dispatch.sourceChannel, text, { sessionKey })` when `sessionKey` available from inbound pipeline (same OpenClaw session as trigger).

**Invariant C1**: No outbound completion for dispatch `D` unless `D.sourcePlatform` and `D.sourceChannel` were set at creation from the **same** webhook envelope that also determined `targetExecutorToken`.

## Executor HTTP API (`Authorization: Bearer <executorToken>`)

**Invariant C2**: `GET/POST …/dispatches*` only return or mutate rows where `targetExecutorToken ===` bearer token (or stricter: claim API matches claimedBy + token).

**Invariant C3**: Claim is atomic; second claim receives 409 — no double execution.

## Threat scenarios (must not regress)

| Scenario | Expected |
|----------|----------|
| User A IM bound to token T1; user B same machine different IM not bound | B cannot trigger A’s executor |
| User re-pairs IM to new `serve` (new token T2) | Old T1 heartbeats rejected; A must see unavailable until T2 paired |
| Forged webhook without signature | Rejected at bridge |
| Dispatch created with wrong `sourceChannel` | Treated as bug; contract tests on meta copy |
