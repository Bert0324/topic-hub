# Contract: Identity Binding API

**Date**: 2026-04-10 | **Feature**: 008-secure-im-dispatch

## Register (IM → Server)

Handled by the OpenClaw webhook handler when a `/topichub register` command is received.

**Trigger**: User sends `/topichub register` in IM.

**Server behavior**:
1. Extract `platform` and `platformUserId` from the OpenClaw webhook payload.
2. Generate a 6-character pairing code.
3. Store in `pairing_codes` collection with 10-minute TTL.
4. Reply to the user via OpenClaw (ephemeral/DM if supported):

```
Your pairing code: **ABC123**
Enter this in your terminal: topichub-admin link ABC123
Code expires in 10 minutes.
```

No new REST endpoint — this is handled inline in the webhook command router.

## Link (CLI → Server)

```
POST /api/v1/identity/link
Content-Type: application/json
Authorization: Bearer <admin-token>
```

### Request

```json
{
  "code": "ABC123"
}
```

### Processing

1. Look up `code` in `pairing_codes` — reject if not found, expired, or already claimed.
2. Extract `platform` + `platformUserId` from the pairing code record.
3. Determine `topichubUserId`:
   - If caller already has a binding (by `claimToken`), reuse that `topichubUserId`.
   - Otherwise, generate a new one: `usr_<crypto.randomBytes(8).toString('hex')>`.
4. Upsert into `user_identity_bindings`: `{ tenantId, topichubUserId, platform, platformUserId, claimToken, active: true }`.
5. Mark pairing code as claimed.
6. Send confirmation to IM via OpenClaw.

### Response (Success)

```json
HTTP 200
{
  "status": "linked",
  "topichubUserId": "usr_a1b2c3d4e5f6",
  "platform": "lark",
  "platformUserId": "ou_xxxxx"
}
```

### Response (Error)

```json
HTTP 400
{ "error": "Invalid or expired pairing code" }

HTTP 409
{ "error": "This IM identity is already linked to another account" }
```

## Unlink (CLI → Server)

```
POST /api/v1/identity/unlink
Content-Type: application/json
Authorization: Bearer <admin-token>
```

### Request

```json
{
  "platform": "lark",
  "platformUserId": "ou_xxxxx"
}
```

If `platform` and `platformUserId` are omitted, unlinks ALL bindings for the caller's `claimToken`.

### Response

```json
HTTP 200
{
  "status": "unlinked",
  "cancelledDispatches": 2
}
```

## Unregister (IM → Server)

Handled by the webhook command router when `/topichub unregister` is received.

**Server behavior**:
1. Look up binding by `platform` + `platformUserId`.
2. Set `active: false`.
3. Cancel pending dispatches for that user.
4. Reply in IM: "Your identity has been unlinked. Use `/topichub register` to re-link."
