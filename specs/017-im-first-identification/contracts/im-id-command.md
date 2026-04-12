# Contract: IM `/id` commands

## Surface

- **Prefix**: `/id` (after existing IM message normalization — same rules as `/help`).
- **Subcommands**:
  - **`/id create`** — first-time self-serve registration.
  - **`/id me`** — read back stored identity fields for the caller’s IM account.

## `/id create`

**Preconditions**:

- Caller is authenticated IM user (existing webhook / bridge trust model).
- No existing `ImIdentityLink` for `(platform, platformUserId)`.

**Effects**:

1. Create `Identity` with:
   - `displayName` = IM display name from inbound metadata (fallback rule if missing: use platform user id string — document in implementation).
   - `uniqueId` = generated opaque string (prefix + random / UUID — implementation choice).
   - `token` = new identity token.
   - `isSuperAdmin` = false.
2. Insert `ImIdentityLink` row.

**Response (IM)**:

- Include **token**, **name** (`displayName`), **id** (`uniqueId` or Mongo id — pick one canonical field and document; spec lists token, name, id).
- Message MUST be suitable for DM; if invoked from a **group**, either reject or respond without @-mentioning others (prefer **DM-only** for token-bearing responses — **implementation decision** to document in quickstart).

**Errors**:

- Already registered: clear text, no token leak in error (no need to echo old token).

## `/id me`

**Preconditions**:

- `ImIdentityLink` exists for `(platform, platformUserId)`.

**Response**:

- **token**, **name**, **id** from linked `Identity`.

**Errors**:

- Not registered: instruct user to run `/id create` (or superadmin path).

## Logging

- **MUST NOT** log identity tokens, `/id me` bodies, or pairing codes.

## Constitution

- Token-in-channel is an explicit **product + CONSTITUTION-EXCEPTION** (see `plan.md` Complexity Tracking).
