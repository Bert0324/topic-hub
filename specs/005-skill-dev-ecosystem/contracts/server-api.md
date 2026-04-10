# Server API Contracts

**Feature**: 005-skill-dev-ecosystem | **Date**: 2026-04-10

## New Endpoints

### `POST /admin/skills/publish`

Batch publish all skills from a skill repo.

**Auth**: Admin token (Bearer)

**Request body** (JSON):
```json
{
  "tenantId": "string",
  "isPublic": false,
  "skills": [
    {
      "name": "string",
      "category": "type | platform | adapter",
      "version": "string",
      "metadata": {},
      "skillMdRaw": "string (SKILL.md content)",
      "entryPoint": "string (compiled source)",
      "files": { "relative/path.ts": "string (source)" },
      "manifest": {}
    }
  ]
}
```

**Validation** (zod):
- `tenantId`: required, non-empty string
- `isPublic`: optional boolean, default `false`
- `skills`: non-empty array, max 50 items
- Each skill: `name` matches `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/`, valid `category`, `manifest` is object

**Response** (200):
```json
{
  "published": [
    { "name": "string", "status": "created | updated" }
  ],
  "errors": [
    { "name": "string", "error": "string" }
  ]
}
```

**Behavior**:
- If `isPublic: false` (default): upserts `SkillRegistration` for each skill with `isPrivate: true`, `tenantId` from request
- If `isPublic: true`: validates requester is super-admin; upserts with `isPrivate: false`, `tenantId: null`
- Stores `publishedContent` embedded document with skill data
- If a skill with the same `(name, tenantId)` exists, overwrites it (`status: "updated"`)
- If a skill is new, creates it (`status: "created"`)
- Auto-enables published skills in `TenantSkillConfig` for the owning tenant (private) or all tenants (public)
- Returns partial success: some skills may fail validation while others succeed

**Error responses**:
- 401: Not authenticated
- 403: Tenant mismatch, or `isPublic: true` from non-super-admin
- 422: All skills failed validation

---

### `POST /admin/groups`

Create an IM group via platform skill.

**Auth**: Admin token (Bearer)

**Request body**:
```json
{
  "name": "string",
  "platform": "string",
  "memberIds": ["string"],
  "topicType": "string (optional)"
}
```

**Response** (201):
```json
{
  "groupId": "string",
  "platform": "string",
  "name": "string",
  "inviteLink": "string | null"
}
```

**Behavior**:
- Resolves platform skill by `platform` name
- Calls `platformSkill.createGroup(params)`
- Returns group creation result

**Error responses**:
- 404: Platform skill not found for given platform name
- 502: Platform API error (external service failure)

## Modified Endpoints

### `GET /admin/skills` (enhanced)

**New query parameters**:
- `scope`: `all` (default) | `public` | `private`
- `tenantId`: filter by owning tenant (for private skills)

**Behavior change**: Response includes `isPrivate` and `tenantId` fields. Private skills from other tenants are excluded unless the requester has super-admin permissions.

### `POST /admin/skills` (enhanced)

**New optional fields in request**:
- `tenantId`: string | null — if provided, creates a tenant-scoped private skill
- `isPrivate`: boolean — defaults to `false`

Existing behavior (disk-based install) remains unchanged when these fields are omitted.

## Unchanged Endpoints

All dispatch endpoints (`GET/POST /api/v1/dispatches/*`), webhook endpoints (`POST /webhooks/*`), ingestion endpoints, and topic endpoints remain unchanged. Private skills are resolved transparently through the skill registry's tenant-scoped lookup.
