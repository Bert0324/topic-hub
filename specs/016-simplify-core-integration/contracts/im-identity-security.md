# Contract: IM → identity → executor safety

## Goals

1. **Correct recipient**: IM-originated commands and replies map to **at most one** Topic Hub user identity via `(platform, platformUserId)`.
2. **No cross-leakage**: Replies and dispatch notifications never target a channel/session belonging to another binding.
3. **Local execution safety**: Executor work is accepted only when **token + heartbeat + binding** invariants hold.

## Inbound (OpenClaw bridge ingress)

1. **Signature**: Reject unsigned or invalid `X-TopicHub-Signature` / OpenClaw signing scheme before parsing user-visible content.
2. **Platform resolution**: `platform` MUST be non-empty after `inferPlatformFromSessionKey` + payload hints; otherwise **drop** with warn (no generic fallback to wrong platform).
3. **Identity gate**: For commands that mutate state or touch executor dispatch, `resolveUserByPlatform(platform, userId)` MUST succeed except for **allowlisted** commands (documented list, e.g. `/help`, pairing flow).
4. **Reply affinity**: Outbound `sendThreadReply` MUST use inbound `sessionId` / channel metadata from `OpenClawInboundResult`—no client-supplied redirect fields.

## Pairing (1 executor : many IM)

1. Pairing code is **single-use** and **short-lived** (existing rules); never log code values.
2. `claimPairingCode(platform, platformUserId, code)` MUST be atomic; concurrent claims from two IM accounts → one wins, other gets clear error.
3. Re-binding / switching “credentials” is modeled as **new claim** or **explicit deactivate** (`deactivateBinding`) before re-pair—document UX in CLI/IM help.

## Dispatch / claim

1. Fetch or claim by dispatch id requires bearer matching **executor bound** to the same `topichubUserId` that owns the dispatch.
2. Cross-user dispatch access returns **404** or **403** (pick one policy; prefer **404** to avoid id oracle).

## Multi-process executors

Multiple local processes ⇒ distinct executor tokens (or distinct Topic Hub users). Server MUST NOT merge dispatches across users without explicit pairing evidence.

## Test matrix (acceptance)

| Case | Expect |
|------|--------|
| Unregistered IM user runs `/topic` | Helpful message; **no** dispatch |
| Wrong HMAC | 401/403, no side effects |
| Valid user A tries claim on dispatch for user B | Deny |
| Replay same pairing code | Second claim fails |
| `/help` unregistered | Allowed response (fixed content) |
