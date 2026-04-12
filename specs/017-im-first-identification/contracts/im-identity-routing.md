# Contract: Multi-platform IM → identity → executor routing

## Canonical keys

- **IM account key**: `(platform, platformUserId)` — both from OpenClaw bridge normalization for the inbound event.
- **Identity key**: `Identity._id` as string (`topichubUserId` in bindings).
- **Executor session**: `claimToken` in `user_identity_bindings`, aligned with executor registration / heartbeat model.

## Inbound handling order (normative for webhook)

1. Verify webhook signature / bridge rules (existing).
2. Normalize command text (existing).
3. **Allowlist** (no executor required):
   - `/help` (and variants)
   - `/id create`, `/id me`
   - `/register` flow (DM rules per existing spec)
4. **Identity + executor required** path (existing): resolve `user_identity_binding` for `(platform, platformUserId)`; require live heartbeat for mutating / dispatch-driving commands.

## Mapping rules

| Step | Input | Output | Must not |
|------|--------|--------|----------|
| IM self-signup lookup | `(platform, platformUserId)` | `Identity` via `ImIdentityLink` | Reuse another user’s identity |
| Executor binding lookup | `(platform, platformUserId)` | `topichubUserId`, `claimToken` | Return `claimToken` from a different `platformUserId` |
| Dispatch meta | same inbound | `targetUserId` = resolved identity; `targetExecutorToken` = resolved `claimToken` | Mix inbound A with user B’s tokens |

## Outbound replies

- Replies MUST use inbound `sessionId` / channel routing from the same `OpenClawInboundResult` that produced the command (existing `sendThreadReply` pattern).

## Negative cases (tests)

| Case | Expected |
|------|----------|
| User A’s message body tries to reference user B’s id | Ignore; resolution only from bridge ids |
| `/id create` twice same IM | Second rejected |
| Valid identity but no `/register` | Commands that need executor show existing “link executor” guidance |
| Cross-user dispatch claim | Deny (404/403 per existing policy) |

## Multi-process / credential switch

- Multiple local processes ⇒ distinct executor sessions; IM “switch” is modeled by **re-running `/register`** with a new pairing code after `serve`, updating the binding’s `claimToken` for that `(platform, platformUserId)`.
- Server MUST NOT infer cross-identity merges from IM alone.
