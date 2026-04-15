# Data model: 015 IM ↔ executor routing

Entities already involved (extend behavior / validation only unless noted).

## ImBinding (`im_bindings`)

| Field | Role |
|-------|------|
| `platform` | IM plugin id (`feishu`, `discord`, …) from inbound normalization |
| `platformUserId` | Stable sender id from OpenClaw payload (`user` / metadata) |
| `topichubUserId` | Topic Hub logical user (pairing target) |
| `claimToken` | **Executor session credential**; must match `ExecutorHeartbeat.claimToken` for live gate |
| `active` | Soft-unbind |

**Constraints**: Unique **`(platform, platformUserId)`**; one active binding per IM principal.

**Relationships**: Many bindings may share one `topichubUserId` + same `claimToken` only if product explicitly allows multiple IM identities to one executor (spec: 1 executor : many IM — same token after each pairs to same serve session).

## PairingCode (`pairing_codes`)

| Field | Role |
|-------|------|
| `code` | Short-lived secret shown in `serve` |
| `topichubUserId` | Identity receiving the bind |
| `executorClaimToken` | Ties code to **one** serve registration |
| `claimed`, `expiresAt` | Abuse / replay control |

## ExecutorHeartbeat (`executor_heartbeats`)

| Field | Role |
|-------|------|
| `topichubUserId` | Index |
| `claimToken` | **Must equal** `ImBinding.claimToken` for `isBoundExecutorSessionLive` |
| `lastSeenAt` | Freshness |

## TaskDispatch (`task_dispatches`)

| Field | Role |
|-------|------|
| `targetUserId` | Routes reminders / ownership |
| `targetExecutorToken` | **Authorization scope** for claim/complete |
| `sourcePlatform`, `sourceChannel` | IM reply targets |
| `enrichedPayload` | Includes `event.payload` (`text`, `agentSlot`, `topichubAgentOp`, …) |

**State**: `UNCLAIMED` → `CLAIMED` → `COMPLETED` | `FAILED` (simplified).

## Local agent roster (CLI filesystem)

| Store | Role |
|-------|------|
| `~/.config/topic-hub/agent-roster/<hash>.json` | Ordered slots **`#N`**; not trusted for auth — **only** executor with valid token can read/write via local process |

**Note**: Roster is **not** a security boundary; binding + executor token is.
