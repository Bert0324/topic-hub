# Contract: Skill Center API

## Overview

Endpoints for the Skill Center — publishing, browsing, searching, liking, and pulling skills.

## Authentication

- **Publish/Like/Usage**: Requires `Authorization: Bearer <identityToken>` or `Bearer <executorToken>` (resolved to identity via `ExecutorRegistration`)
- **Browse/Search/Pull**: Public (no auth required) — published skills are visible to all
- **Admin dashboard**: Requires `Authorization: Bearer <superadminToken>`

---

## Endpoints

### POST /api/v1/skills/publish

Publish a single skill to the Skill Center.

**Auth**: Bearer identity token or executor token

**Request body**:
```json
{
  "name": "my-skill",
  "description": "A brief description of what this skill does",
  "version": "1.0.0",
  "skillMdRaw": "# My Skill\n\nInstructions for the agent...",
  "metadata": {}
}
```

**Validation**:
- `name`: required, `^[a-z][a-z0-9-]{1,62}[a-z0-9]$`
- `description`: required, 1–500 characters
- `version`: optional, semver format
- `skillMdRaw`: required, non-empty
- `metadata`: optional object

**Behavior**:
- Resolves `identityId` from token
- Upserts `SkillRegistration` matching `(name, authorIdentityId)`
- Sets `published: true`, `publishedAt: now`

**Response 200**:
```json
{
  "id": "ObjectId",
  "name": "my-skill",
  "authorIdentityId": "id_xxx",
  "version": "1.0.0",
  "published": true,
  "publishedAt": "2026-04-11T..."
}
```

**Response 401**: Invalid or missing token
**Response 409**: Skill name conflict (different author owns this name — only if name uniqueness is global; per spec it's per-author, so this shouldn't occur)

---

### GET /api/v1/skills

List published skills (Skill Center browsing).

**Auth**: None required (public endpoint)

**Query params**:
- `q` (string, optional): Full-text search on name + description
- `author` (string, optional): Filter by author identity ID
- `sort` (string, optional): `popular` (default, by likeCount desc), `recent` (by publishedAt desc), `usage` (by usageCount desc)
- `page` (number, optional, default 1)
- `limit` (number, optional, default 20, max 100)

**Response 200**:
```json
{
  "skills": [
    {
      "id": "ObjectId",
      "name": "my-skill",
      "description": "...",
      "version": "1.0.0",
      "authorIdentityId": "id_xxx",
      "authorDisplayName": "Alice",
      "likeCount": 42,
      "usageCount": 150,
      "publishedAt": "2026-04-11T..."
    }
  ],
  "total": 87,
  "page": 1,
  "limit": 20
}
```

---

### GET /api/v1/skills/:name

Get a single published skill's metadata.

**Auth**: None required

**Params**: `name` — skill name (URL-encoded if needed)

**Query params**:
- `author` (string, optional): disambiguate if multiple authors have same name

**Response 200**:
```json
{
  "id": "ObjectId",
  "name": "my-skill",
  "description": "...",
  "version": "1.0.0",
  "skillMdRaw": "# My Skill\n...",
  "authorIdentityId": "id_xxx",
  "authorDisplayName": "Alice",
  "likeCount": 42,
  "usageCount": 150,
  "publishedAt": "2026-04-11T...",
  "metadata": {}
}
```

**Response 404**: Skill not found or not published

---

### GET /api/v1/skills/:name/content

Pull skill content for local execution.

**Auth**: Bearer identity token or executor token (to track usage)

**Response 200**:
```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "skillMdRaw": "# My Skill\n...",
  "metadata": {}
}
```

**Headers**: `ETag` for version-based caching; client sends `If-None-Match` on subsequent requests
**Response 304**: Not modified (client has latest version)
**Response 404**: Skill not found

---

### POST /api/v1/skills/:name/like

Like a skill (toggle — idempotent).

**Auth**: Bearer identity token or executor token

**Behavior**:
- Resolves `identityId` from token
- If `SkillLike(skillId, identityId)` exists → remove it, decrement `likeCount` (unlike)
- If not → create it, increment `likeCount` (like)

**Response 200**:
```json
{
  "liked": true,
  "likeCount": 43
}
```

---

### GET /api/v1/skills/:name/liked

Check if the current identity has liked a skill.

**Auth**: Bearer identity token or executor token

**Response 200**:
```json
{
  "liked": true
}
```

---

### POST /api/v1/skills/:name/usage

Record a skill usage (called by executor after execution).

**Auth**: Bearer executor token

**Behavior**:
- Creates `SkillUsage` record
- Increments `SkillRegistration.usageCount`

**Response 200**:
```json
{
  "usageCount": 151
}
```

---

### DELETE /api/v1/skills/:name

Unpublish a skill (author only).

**Auth**: Bearer identity token

**Behavior**:
- Verifies caller's `identityId` matches `authorIdentityId`
- Sets `published: false` (soft delete — skill data retained)

**Response 200**: `{ "unpublished": true }`
**Response 403**: Not the author
**Response 404**: Skill not found

---

### GET /api/v1/admin/dashboard

Superadmin system dashboard data.

**Auth**: Bearer superadmin token

**Response 200**:
```json
{
  "connectedImPlatforms": [
    { "platform": "lark", "activeBindings": 12 },
    { "platform": "slack", "activeBindings": 5 }
  ],
  "registeredUsers": 47,
  "activeExecutors": 23,
  "totalPublishedSkills": 87,
  "totalSkillUsages": 1250,
  "totalLikes": 430
}
```
