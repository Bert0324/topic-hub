# Data Model: Extract @topichub/core

**Branch**: `006-extract-core-package` | **Date**: 2026-04-10

## Overview

No data model changes — this is a code architecture refactoring. All existing MongoDB collections and their schemas remain identical. This document catalogs the entities that move into `@topichub/core` and the configuration entities introduced by the facade.

## Existing Entities (moved to @topichub/core)

### Topic
**Collection**: `topics`

| Field | Type | Constraints |
|-------|------|-------------|
| tenantId | string | Required, indexed |
| type | string | Required (maps to a registered TypeSkill) |
| title | string | Required |
| status | TopicStatus enum | Required, default: `open` |
| sourceUrl | string | Optional, unique per tenant |
| metadata | Record<string, unknown> | Optional, validated by TypeSkill |
| tags | string[] | Default: [] |
| assignees | string[] | Default: [] |
| createdBy | string | Required |
| platform | string | Optional (IM platform origin) |
| groupId | string | Optional (IM group ID) |

**Indexes**: `{ tenantId, status }`, `{ tenantId, sourceUrl }` (unique sparse), text index on `title`.

**State transitions** (VALID_TRANSITIONS):
- `open` → `in_progress`, `resolved`, `closed`
- `in_progress` → `resolved`, `closed`, `open`
- `resolved` → `closed`, `open`
- `closed` → `open` (reopen)

### TimelineEntry
**Collection**: `timeline_entries`

| Field | Type | Constraints |
|-------|------|-------------|
| tenantId | string | Required, indexed |
| topicId | ObjectId | Required, indexed |
| actor | string | Required |
| action | TimelineActionType enum | Required |
| detail | Record<string, unknown> | Optional |

### SkillRegistration
**Collection**: `skill_registrations`

| Field | Type | Constraints |
|-------|------|-------------|
| name | string | Required, unique |
| category | SkillCategory enum | Required |
| version | string | Required |
| description | string | Optional |
| filePath | string | Required |
| metadata | Record<string, unknown> | Optional |

### TenantSkillConfig
**Collection**: `tenant_skill_configs`

| Field | Type | Constraints |
|-------|------|-------------|
| tenantId | string | Required |
| skillName | string | Required |
| enabled | boolean | Default: true |
| config | Record<string, unknown> | Optional |
| aiEnabled | boolean | Default: false |
| aiPrompt | string | Optional |

**Indexes**: `{ tenantId, skillName }` (unique compound).

### TaskDispatch
**Collection**: `task_dispatches`

| Field | Type | Constraints |
|-------|------|-------------|
| tenantId | string | Required |
| topicId | string | Required |
| skillName | string | Required |
| event | DispatchEventType enum | Required |
| status | DispatchStatus enum | Required, default: `unclaimed` |
| payload | object | Required |
| claimedBy | string | Optional |
| claimedAt | Date | Optional |
| result | Record<string, unknown> | Optional |
| error | string | Optional |
| retryCount | number | Default: 0 |

**TTL Index**: `{ createdAt: 1 }` with expiry (configurable).

### Tenant
**Collection**: `tenants`

| Field | Type | Constraints |
|-------|------|-------------|
| name | string | Required |
| slug | string | Required, unique |
| encryptedApiKey | string | Required |
| iv | string | Required |
| keyHash | string | Required |

### AiUsageRecord
**Collection**: `ai_usage_records`

| Field | Type | Constraints |
|-------|------|-------------|
| tenantId | string | Required |
| skillName | string | Required |
| model | string | Required |
| inputTokens | number | Required |
| outputTokens | number | Required |
| durationMs | number | Required |

## New Entities (introduced by this feature)

### TopicHubConfig (runtime, not persisted)

Configuration object validated by zod at `TopicHub.create()` time.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| mongoConnection | mongoose.Connection | One of mongoConnection/mongoUri | — |
| mongoUri | string | One of mongoConnection/mongoUri | — |
| skillsDir | string | Yes | — |
| ai | AiProviderConfig | No | null (AI disabled) |
| ai.provider | 'ark' \| string | Yes (if ai) | — |
| ai.apiKey | string | Yes (if ai) | — |
| ai.model | string | No | provider default |
| logger | LoggerFactory | No | console-based |
| encryption | EncryptionConfig | No | auto-generated |
| encryption.masterKey | string | Yes (if encryption) | — |

### AiCompletionPort (interface, not persisted)

Narrow interface replacing the direct `AiService` type import in `SkillContext`.

```typescript
interface AiCompletionPort {
  complete(prompt: string, options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }>;
}
```

## Relationships (unchanged)

```
Tenant 1──∞ Topic
Topic 1──∞ TimelineEntry
Topic 1──∞ TaskDispatch
Tenant 1──∞ TenantSkillConfig
TenantSkillConfig ∞──1 SkillRegistration (by skillName)
SkillRegistration 1──∞ AiUsageRecord (by skillName)
```
