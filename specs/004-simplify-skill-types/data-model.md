# Data Model: Simplify Skill Types

**Feature**: 004-simplify-skill-types | **Date**: 2026-04-10

## Overview

This feature modifies one enum and removes one set of interfaces. No new entities are introduced. No database migration is required.

---

## Modified Entities

### SkillCategory (enum)

**File**: `packages/server/src/common/enums.ts`

**Before** (4 values):

| Value | String | Description |
|-------|--------|-------------|
| TYPE | `'type'` | Defines topic types, schemas, lifecycle hooks |
| PLATFORM | `'platform'` | Handles IM transport and chat interactions |
| AUTH | `'auth'` | Authorization checks in pipeline |
| ADAPTER | `'adapter'` | External platform webhook transformation |

**After** (3 values):

| Value | String | Description |
|-------|--------|-------------|
| TYPE | `'type'` | Defines topic types, schemas, lifecycle hooks |
| PLATFORM | `'platform'` | Handles IM transport and chat interactions |
| ADAPTER | `'adapter'` | External platform integration (webhooks, auth, outbound API) |

**Change**: Remove `AUTH = 'auth'`.

---

### AnySkill (type union)

**File**: `packages/server/src/skill/registry/skill-registry.ts`

**Before**: `TypeSkill | PlatformSkill | AuthSkill | AdapterSkill`

**After**: `TypeSkill | PlatformSkill | AdapterSkill`

---

### SkillPipeline.execute() (method signature)

**File**: `packages/server/src/skill/pipeline/skill-pipeline.ts`

**Before**: `execute(tenantId, operation, topicData, actor: string | UserIdentity, extra?)`

**After**: `execute(tenantId, operation, topicData, actor: string, extra?)`

---

## Removed Entities

### AuthSkill (interface) — DELETE

**File**: `packages/server/src/skill/interfaces/auth-skill.ts` — entire file deleted.

| Type | Description | Removed |
|------|-------------|---------|
| `UserIdentity` | User identity for auth checks | Yes |
| `AuthorizeParams` | Input to `authorize()` call | Yes |
| `AuthResult` | Output of `authorize()` call | Yes |
| `SkillCommand` | CLI commands registered by auth skills | Yes |
| `AuthSkillManifest` | Manifest shape for auth skills | Yes |
| `AuthSkill` | Auth skill interface | Yes |

**Note**: `SkillCommand` interface is auth-skill-specific. If custom CLI commands from skills (`getCommands()`) are needed in the future, a new shared interface should be defined in a common location. Currently, `getCommands()` is declared on auth skills only and is not wired in any runtime code.

---

## MongoDB Impact

### skill_registrations collection

- Existing documents with `category: "auth"` remain in the collection unchanged
- The `loadAll()` method upserts based on disk content — no disk skills produce `"auth"` records
- Legacy `"auth"` records will not be loaded into the in-memory `SkillRegistry`
- A deprecation warning is logged at startup if legacy records are detected
- No migration script needed

### No other collections affected

Topics, timeline entries, tenant skill configs, and AI usage records do not reference skill categories directly.
