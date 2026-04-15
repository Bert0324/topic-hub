# Research: IM-first identification & safe routing

## Decision: Separate **IM → Identity** link from **IM → Executor** binding

**Rationale**: Today `user_identity_bindings` ties `(platform, platformUserId)` to `topichubUserId` + `claimToken` from **executor pairing**. `/id create` must bind an IM account to an **Identity** before the user may have run `serve`. Keeping a dedicated **IM self-signup link** (or clearly named equivalent) avoids overloading `claimToken` with sentinel values and keeps executor invariants testable.

**Alternatives considered**:

- **Only** extend `Identity` with `imPlatform` / `imPlatformUserId` — weak for multiple IMs per identity later; also mixes concerns with superadmin-created identities that have no IM.
- **Reuse `user_identity_bindings` without executor** — would require nullable `claimToken` and a large behavior split in every query; higher regression risk.

## Decision: `/id` handled as early allowlist in `WebhookHandler`

**Rationale**: Matches `/help` and `/register` patterns already in `webhook-handler.ts`: predictable ordering, no accidental routing through executor-only paths.

**Alternatives considered**:

- **CommandRouter** only — would still hit “unregistered” wall before registration without reordering; more invasive.

## Decision: `Identity.uniqueId` = opaque generated string (not IM user id)

**Rationale**: Spec requires system-generated unique id; IM `userId` may be numeric or opaque and can collide across platforms if misused as `uniqueId`.

**Alternatives considered**:

- Use `platform:userId` as `uniqueId` — breaks uniqueness clarity and couples display/admin lists to provider ids.

## Decision: Duplicate `/id create` → conflict with stable message

**Rationale**: Meets FR-004 / SC-002; use unique index on `(platform, platformUserId)` at link layer and catch duplicate insert.

## Decision: Local execution safety unchanged at dispatch boundary

**Rationale**: Existing invariant: executor claims require bearer matching the bound executor for the same `topichubUserId` as dispatch owner (see 016 contract). IM self-signup only adds **who the Identity is**; it does not relax token checks.

**Alternatives considered**:

- IM-only execution without executor — out of scope for this feature and would violate local security model.

## Decision: Constitution note on token-in-IM

**Rationale**: Constitution forbids exposing secrets in generic “client” surfaces; product explicitly chooses IM as the delivery channel for identity token for `/id` flows. Document as **CONSTITUTION-EXCEPTION** at the handler site (per governance) with pointer to spec + operator quickstart warnings.
