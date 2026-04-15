# Pairing Flow Contract

**Feature**: 013-streamline-commands-skills

## Sequence: Executor → IM Binding

```
User (CLI)                  Server                     User (IM)
    │                          │                           │
    │ topichub-admin serve     │                           │
    │──identity token─────────▶│                           │
    │                          │ register executor         │
    │◀──executor token─────────│                           │
    │                          │                           │
    │──POST /executors/        │                           │
    │  pairing-code────────────▶│ create pairing_codes     │
    │                          │ {code, topichubUserId,    │
    │◀──{code: "ABC123"}───────│  executorClaimToken}      │
    │                          │                           │
    │ display: "ABC123"        │                           │
    │                          │                           │
    │                          │    @bot /register ABC123  │
    │                          │◀──────────────────────────│
    │                          │                           │
    │                          │ validate code             │
    │                          │ lookup topichubUserId     │
    │                          │ upsert binding:           │
    │                          │   (platform, userId) →    │
    │                          │   topichubUserId          │
    │                          │                           │
    │                          │──"Registered! Commands "──▶
    │                          │  "will go to your executor"
    │                          │                           │
    │                          │    @bot /create bug       │
    │                          │◀──────────────────────────│
    │                          │                           │
    │                          │ resolve binding           │
    │                          │ dispatch to executor      │
    │◀──SSE dispatch───────────│                           │
    │                          │                           │
    │ execute task locally     │                           │
    │──result──────────────────▶│                           │
    │                          │──reply─────────────────────▶
```

## Security Properties

1. **HMAC verification**: OpenClaw webhook payloads are HMAC-signed; the bridge verifies before processing.
2. **Code expiry**: Pairing codes expire after 10 minutes (TTL index on `expiresAt`).
3. **One-time use**: Codes are atomically claimed (`findOneAndUpdate` where `claimed: false`).
4. **Binding uniqueness**: Each IM account `(platform, platformUserId)` has at most one active binding (unique index).
5. **Binding replacement**: `/register` with a new code replaces the existing binding (FR-026).
6. **Executor authentication**: SSE dispatch channel requires valid executor token.
7. **No cross-identity leakage**: Binding lookup is exact-match on `(platform, platformUserId)`.

## Cardinality

```
Identity (1) ──has──▶ Executor (N)     (one user, many executors)
Executor (1) ──bound──▶ IM Account (N) (one executor, many IM accounts)
IM Account (1) ──bound──▶ Executor (1) (each IM account → exactly one executor)
```
