# Data model: IM-first identification (017)

## Existing entities (reference)

### `Identity` (`identities`)

| Field | Description |
|--------|-------------|
| `_id` | Mongo id; used as `topichubUserId` string in bindings |
| `uniqueId` | Unique string; **superadmin path**: human-chosen; **`/id create` path**: system-generated opaque id |
| `displayName` | Human-readable name; **`/id create`**: from IM profile name at creation |
| `token` | Identity token (bearer for admin/native ops + CLI login material) |
| `isSuperAdmin` | Elevated role |
| `status` | e.g. active / revoked |

**Rules**: `uniqueId` and `token` remain unique across the collection.

### `UserIdentityBinding` (`user_identity_bindings`)

| Field | Description |
|--------|-------------|
| `platform` | IM platform key (normalized) |
| `platformUserId` | Stable user id from provider |
| `topichubUserId` | Identity `_id` string |
| `claimToken` | Executor session claim material from pairing |
| `active` | Soft-disable |

**Rules**: Unique `(platform, platformUserId)` for active bindings; pairing updates `claimToken` when user re-registers.

## New entity: `ImIdentityLink` (proposed name)

**Purpose**: Record that a given IM account completed **`/id create`** and owns a specific **Identity**, independent of whether executor pairing has happened.

| Field | Type | Rules |
|--------|------|--------|
| `platform` | string | Required; normalized same as webhook |
| `platformUserId` | string | Required |
| `identityId` | string | Required; references `Identity._id` |
| `createdAt` | date | Audit |

**Indexes**:

- **Unique** compound index on `(platform, platformUserId)` — enforces one self-serve registration per IM account.
- Index on `identityId` for reverse lookup (optional).

## Lifecycle

1. **`/id create`**: In one logical transaction: assert no `ImIdentityLink` for `(platform, platformUserId)`; create `Identity` with generated `uniqueId`, IM `displayName`, new `token`; insert `ImIdentityLink`. Return token + ids to user in IM.
2. **Superadmin `createIdentity`**: Unchanged — creates `Identity` without `ImIdentityLink` unless later linking feature exists.
3. **`/register` (existing)**: After user runs `serve`, pairing still creates/updates `user_identity_bindings` with `topichubUserId` = identity id and `claimToken` from executor — **must** use the **same** `Identity` the user expects (operational guidance: user configures CLI with token from `/id create` or superadmin).
4. **Duplicate `/id create`**: Insert or pre-check hits unique constraint → user-visible error.

## Optional follow-up (not required by v1 spec)

- Sync `displayName` when IM profile name changes — deferred (see spec edge cases).
