# Research: 014 Published skill IM routing

## R1 — Where to resolve published skill names

**Decision**: Add a **`PublishedSkillCatalog`** port in `@topichub/core` backed by Mongo `skill_registrations`: treat a name as published when a catalog row exists with that canonical `name` and non-null published content (same criterion as Skill Center “listable” entries). Expose `hasPublishedName(normalizedKey): Promise<boolean>` and optional `refreshCache()`.

**Rationale**: Single source of truth with `skills list`; no duplicate “routing table” collection.

**Alternatives considered**:

- **Duplicate collection** for routing names — rejected (sync drift).
- **Query Mongo on every IM message without cache** — rejected for latency at scale; acceptable only with tight index + proven low volume; default implementation uses **TTL cache (60s)** and explicit invalidation on publish/delete.

## R2 — Precedence when disk and catalog both know a name

**Decision**: **Published catalog wins over disk-only** for the purpose of *proving* “publish is enough for `/name`”; if both exist with same name, behavior is identical for invocation string. If disk lacks the skill but catalog has it, route as skill_invoke (executor must resolve body via API — separate follow-up or existing `skills view`).

**Rationale**: Matches user story “only publish”.

**Alternatives**: Disk wins — would re-break FR-001.

## R3 — Unknown slash token hint shape

**Decision**: Add optional object under `enrichedPayload.event.payload`:

`publishedSkillRouting: { status: 'miss'; token: string }` only for relay path when first token looked like a skill attempt (slash command grammar) and catalog miss.

**Rationale**: Machine-readable for executor/tests; avoids overloading `text`.

**Alternatives**: Prefix user text — rejected (fragile for parsing).

## R4 — IM → identity → executor mapping (multi-platform, no mis-delivery)

**Decision**: Preserve and document the existing chain:

1. Bridge verifies webhook authenticity (existing OpenClaw/secret).
2. `resolveUserByPlatform(platform, platformUserId)` returns **one** `claimToken` row scoped to that IM account.
3. `dispatch.targetExecutorToken` is always that `claimToken`; SSE unclaimed query filters `targetExecutorToken === executorRegistration.executorToken` mapping — verify current code path uses **executor bearer** for listing and **claimToken** on document matches binding from step 2.

**Gap to close in implementation**: Add regression tests that **same userId different platform** yields different bindings; **same platform new register** updates `claimToken` and old executor stops receiving new dispatches after heartbeat mismatch.

**Rationale**: “不能发错消息” is enforced by server-side derivation of routing keys from verified inbound identity, not from message body.

## R5 — `/help` exception

**Decision**: Keep early return in webhook before binding resolution (existing pattern). No published-name lookup for `/help`.

## R6 — skill-repo scope in this feature

**Decision**: Minimum `skill-repo` subcommands that wrap existing publish/list flows; full repo lifecycle can grow in follow-up specs.
