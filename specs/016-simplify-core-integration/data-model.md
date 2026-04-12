# Data Model Notes: 016 Simplify Core Integration

This feature is primarily an **HTTP surface + routing** refactor. Persistent entities stay aligned with existing Topic Hub models; below is the **logical** view relevant to gateway + IM safety.

## Existing entities (unchanged schema intent)

| Entity / collection | Role |
|---------------------|------|
| **IM identity binding** | Maps `(platform, platformUserId)` → Topic Hub user / executor identity material used by `IdentityService.resolveUserByPlatform`. |
| **Pairing code** | Short-lived secret presented out-of-band; `claimPairingCode` creates/updates binding. |
| **Task dispatch** | Carries work to executor; must include **target executor token** / user scope checked on claim. |
| **Executor heartbeat** | Liveness for “session live” gating in webhook handler. |

## New / logical artifacts (code-level, not necessarily new collections)

| Artifact | Description |
|----------|-------------|
| **Gateway envelope** | JSON `{ v, op, payload, idempotencyKey? }` validated per request. |
| **Op registry entry** | `{ op, zodPayload, handler(services, ctx) }` where `ctx` carries authenticated principal when required. |
| **Integration surface config** | Runtime flags: which surface enabled, public base URL for doc generation (may remain env-only). |

## Validation rules

- Every `op` that mutates data or triggers executor work **requires** authenticated context (superadmin token, executor token, or public-only allowlist documented in contracts).
- `op` names are stable public API; breaking changes require version bump in envelope `v`.

## State transitions

- Pairing: `unbound` → `bound` on successful `claimPairingCode` (existing).
- Gateway requests are **stateless** per call except through invoked services.
