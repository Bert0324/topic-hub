# Data model notes: 014 Published skill IM routing

## Existing collections (reuse)

### `skill_registrations`

- **Use for routing**: `name` (unique index), presence of published catalog payload (`publishedContent` / published flag per current schema).
- **Reads**: Case-insensitive match on normalized token → resolve to canonical `name` string stored in DB.

### `user_identity_bindings`

- **Key**: `(platform, platformUserId)` unique per IM account.
- **Fields used**: `topichubUserId`, `claimToken`, `active`.
- **Semantics**: One IM user on one platform maps to **one** active `claimToken` at a time. Re-`/register` updates token to new serve session.

### `task_dispatches`

- **Routing fields**: `targetUserId`, `targetExecutorToken` (claim token from binding), `sourcePlatform`, `sourceChannel`.
- **Payload**: `enrichedPayload` JSON — extended with `publishedSkillRouting` for relay-miss (see contract).

### `executor_heartbeats` (or equivalent live session table)

- **Use**: `isBoundExecutorSessionLive(topichubUserId, claimToken)` — ensures stale executor after credential switch does not receive new work.

## Derived / in-memory

### Published skill name cache

- **Type**: In-process set or map: `lower(name) → canonicalName`.
- **TTL**: Configurable constant (default 60s) + manual invalidation on publish/delete.
- **Not persisted**: Rebuildable from Mongo.

## Relationships (logical)

```text
IM (platform, userId) ──1──► user_identity_binding ──► claimToken
                                              │
                                              ▼
                                    task_dispatch.targetExecutorToken
                                              │
                                              ▼
                           executor session (serve) holding matching registration
```

Multiple group channels can share one user binding; **one serve session** can serve **many** bindings only if product explicitly allows same claimToken across groups — today one binding row per (platform, platformUserId); groups route via topic + same user’s binding for dispatch meta.

## Validation rules

- Published name tokens must satisfy existing skill name pattern (lowercase, hyphens, length) before catalog lookup.
- Never write `claimToken` or executor secrets into `enrichedPayload` fields intended for group-visible logs.
