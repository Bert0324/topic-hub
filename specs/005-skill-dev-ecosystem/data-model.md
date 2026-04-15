# Data Model: Skill Development Ecosystem

**Feature**: 005-skill-dev-ecosystem | **Date**: 2026-04-10

## Entity Changes

### Modified: `SkillRegistration` (collection: `skill_registrations`)

Existing entity extended with tenant scoping for private skills.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique skill name (unique within tenant scope or global scope) |
| `category` | SkillCategory | yes | `type` \| `platform` \| `adapter` |
| `version` | string | no | Skill version from manifest |
| `modulePath` | string | no | Local file path (for server-loaded skills only; null for published skills) |
| `metadata` | object | no | Category-specific metadata (platform name, sourceSystem, topicType, etc.) |
| `skillMd` | SkillMdData | no | Parsed SKILL.md content (frontmatter + body) |
| **`tenantId`** | string \| null | no | **NEW** — Tenant that owns this skill; `null` for public/global skills |
| **`isPrivate`** | boolean | yes | **NEW** — `true` for tenant-scoped private skills; `false` for public |
| **`publishedContent`** | PublishedSkillContent \| null | no | **NEW** — Uploaded skill content for published (non-disk) skills |
| `createdAt` | Date | auto | Timestamp |
| `updatedAt` | Date | auto | Timestamp |

**New uniqueness constraint**: Compound unique index on `(name, tenantId)` — a skill name must be unique within its scope (global or per-tenant). This replaces the current simple unique index on `name`.

**New nested type `PublishedSkillContent`**:

| Field | Type | Description |
|-------|------|-------------|
| `manifest` | object | The full skill manifest (package.json content) |
| `skillMdRaw` | string | Raw SKILL.md content |
| `entryPoint` | string | Compiled entry point source |
| `files` | Record<string, string> | Additional source files keyed by relative path |

### Modified: `TenantSkillConfig` (collection: `tenant_skill_configs`)

No schema changes. Existing behavior: per-tenant enable/disable of skills. Private skills are auto-enabled for their owning tenant on publish.

### Existing (unchanged): `TaskDispatch` (collection: `task_dispatches`)

No schema changes. Dispatches already carry `tenantId` and `skillName`. Private skills are dispatched the same way as public skills.

### Existing (unchanged): `Topic`, `TimelineEntry`

No changes needed. Topics reference skills by name; the skill resolution layer handles tenant scoping.

### New Type: `AdapterCredential` (CLI-side, not MongoDB)

Stored locally in the user's OS keychain (keytar) or encrypted file.

| Field | Type | Description |
|-------|------|-------------|
| `adapterName` | string | Name of the adapter skill |
| `userId` | string | User identifier (from CLI auth) |
| `tokenType` | string | `oauth2` \| `api_key` \| `bearer` |
| `accessToken` | string | The credential value |
| `refreshToken` | string \| null | OAuth2 refresh token if applicable |
| `expiresAt` | number \| null | Token expiry timestamp (ms since epoch) |

## Relationships

```text
Tenant (1) ──── (*) SkillRegistration [via tenantId; null = public]
Tenant (1) ──── (*) TenantSkillConfig [via tenantId]
SkillRegistration (1) ──── (0..1) PublishedSkillContent [embedded]
SkillRegistration (1) ──── (*) TaskDispatch [via skillName]
Topic (1) ──── (*) TaskDispatch [via topicId]
User (1) ──── (*) AdapterCredential [via userId, CLI-local]
```

## State Transitions

### Skill Lifecycle

```text
                   ┌──────────────────────────────────────────────────────┐
                   │                                                      │
[Scaffolded] ──→ [In Development] ──→ [Published] ──→ [Published (Updated)]
                   │                      ↑                   │
                   │                      └───────────────────┘
                   │                         (overwrite on re-publish)
                   └──→ [Abandoned] (user deletes repo)
```

- **Scaffolded**: CLI Q&A complete; files generated locally
- **In Development**: Developer is writing code with AI agent
- **Published**: `cli publish` uploads to server; skill is registered and active
- **Published (Updated)**: Re-publish overwrites; same state, new content
- **Abandoned**: No server-side state; repo simply not published

Note: These states are conceptual. The server only tracks "registered" (published) skills. Local states are implicit based on the repo's git history.

### Adapter Credential Lifecycle

```text
[None] ──→ [Auth Required] ──→ [Auth In Progress] ──→ [Stored]
                                                          │
                                                     [Expired] ──→ [Refreshed] ──→ [Stored]
                                                          │
                                                     [Refresh Failed] ──→ [Auth Required]
```

## Indexes

### New indexes on `skill_registrations`

| Index | Fields | Type | Purpose |
|-------|--------|------|---------|
| `name_tenant_unique` | `{ name: 1, tenantId: 1 }` | unique | Enforce name uniqueness within scope |
| `tenant_private` | `{ tenantId: 1, isPrivate: 1 }` | regular | Fast lookup of tenant's private skills |

### Existing indexes (unchanged)

All existing indexes on `task_dispatches`, `topics`, `timeline_entries` remain as-is.

## Validation Rules

| Entity | Rule |
|--------|------|
| SkillRegistration.name | Must match `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` (lowercase, hyphens, 3–64 chars) |
| SkillRegistration.category | Must be one of `type`, `platform`, `adapter` |
| SkillRegistration.tenantId | If `isPrivate = true`, `tenantId` must be non-null |
| PublishedSkillContent.manifest | Must contain `name` and valid `category` |
| PublishedSkillContent.skillMdRaw | Must be valid gray-matter parseable content |
| AdapterCredential.accessToken | Never logged; never included in API responses |
