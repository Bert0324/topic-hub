# Data Model: Unified Skill Center

## Entity Changes

### SkillRegistration (MODIFY — collection: `skill_registrations`)

**Fields removed**:
- `category` (`SkillCategory`) — no longer needed; single unified type
- `tenantId` (`string | null`) — replaced by identity-based ownership
- `isPrivate` (`boolean`) — replaced by `published` flag (inverse semantics: private = not published)
- `modulePath` (`string`) — no server-side execution; skills are SKILL.md only

**Fields added**:
- `authorIdentityId` (`string`, indexed) — references `Identity._id`; the user who published this skill
- `published` (`boolean`, default `false`) — whether the skill is visible in the Skill Center
- `description` (`string`) — human-readable description for Skill Center listing
- `likeCount` (`number`, default `0`) — denormalized count of likes for fast listing
- `usageCount` (`number`, default `0`) — denormalized count of invocations for fast listing
- `version` (`string`, default `'0.0.0'`) — semantic version string
- `publishedAt` (`Date | null`) — timestamp of last publish

**Fields retained** (with modifications):
- `name` (`string`) — skill name; uniqueness now scoped by `(name, authorIdentityId)` instead of `(name, tenantId)`
- `skillMd` (`string`) — raw SKILL.md content
- `metadata` (`object`) — arbitrary metadata from manifest
- `publishedContent` (`PublishedSkillContent`) — manifest, skillMdRaw, entryPoint, files

**Index changes**:
- DROP unique `(name, tenantId)` → ADD unique `(name, authorIdentityId)`
- DROP `(tenantId, isPrivate)` → ADD `(published, likeCount)` for Skill Center sorting
- ADD `(authorIdentityId)` for "my skills" queries
- ADD text index on `(name, description)` for search

**Migration**: Existing records get `authorIdentityId` set to the identity linked to the tenant's admin token (or superadmin). `published` = `!isPrivate`. `category` field ignored on read.

---

### SkillLike (NEW — collection: `skill_likes`)

| Field | Type | Notes |
|-------|------|-------|
| `skillId` | `ObjectId` | References `SkillRegistration._id` |
| `identityId` | `string` | References `Identity._id`; the user who liked |
| `createdAt` | `Date` | When the like was recorded |

**Indexes**:
- Unique `(skillId, identityId)` — one like per identity per skill
- `(skillId)` — for counting likes per skill

---

### SkillUsage (NEW — collection: `skill_usages`)

| Field | Type | Notes |
|-------|------|-------|
| `skillId` | `ObjectId` | References `SkillRegistration._id` |
| `identityId` | `string` | The user who invoked the skill |
| `executorToken` | `string` | Which executor ran it |
| `createdAt` | `Date` | Invocation timestamp |

**Indexes**:
- `(skillId, createdAt)` — for usage analytics
- `(identityId, createdAt)` — for "my usage" queries
- TTL on `createdAt` (90 days) — auto-cleanup of old records

---

### TaskDispatch (MODIFY — collection: `task_dispatches`)

**Fields added**:
- `targetExecutorToken` (`string | null`) — the specific executor this dispatch is routed to; set when dispatch originates from IM via `ImBinding`
- `targetIdentityId` (`string | null`) — the identity this dispatch belongs to; replaces `targetUserId` role

**Fields deprecated** (kept for backward compatibility, ignored in new code):
- `targetUserId` — superseded by `targetIdentityId`
- `tenantId` — still written for backward compat but not used for routing in new flows

**Index changes**:
- ADD `(targetExecutorToken, status, createdAt)` — for executor-scoped dispatch queries
- ADD `(targetIdentityId, status, createdAt)` — for identity-scoped queries

**Claim auth change**: `POST /dispatches/:id/claim` now requires `Authorization: Bearer <executorToken>`. Server validates that `executorToken` matches `targetExecutorToken` (if set) or that the executor belongs to the same identity as `targetIdentityId`.

---

### ImBinding (ACTIVATE — collection: `im_bindings`)

Already defined in `packages/core/src/entities/im-binding.entity.ts` but **not wired into any service**. This plan activates it.

| Field | Type | Notes |
|-------|------|-------|
| `platform` | `string` | IM platform identifier (e.g., `lark`, `slack`, `telegram`) |
| `platformUserId` | `string` | User's ID on the IM platform |
| `executorToken` | `string` | Currently bound executor's token |
| `identityId` | `string` | References `Identity._id` |
| `active` | `boolean` | Whether binding is active |
| `createdAt` | `Date` | |
| `updatedAt` | `Date` | |

**Indexes** (already defined):
- Unique `(platform, platformUserId)` — one binding per IM account
- `(executorToken)` — reverse lookup from executor
- `(identityId)` — all bindings for an identity

**Activation work**:
1. Wire `ImBindingModel` into `IdentityService`
2. Replace `UserIdentityBinding` usage in `WebhookHandler.resolveUserByPlatform` with `ImBinding` lookup
3. `/topichub register` flow: user provides executor token in IM → server upserts `ImBinding` for `(platform, platformUserId)` → `executorToken` + `identityId` (looked up from `ExecutorRegistration`)
4. Dispatch creation: `WebhookHandler` resolves `ImBinding` → sets `targetExecutorToken` and `targetIdentityId` on dispatch

---

### ExecutorRegistration (MODIFY — collection: `executor_registrations`)

**Fields added** (merged from `ExecutorHeartbeat`):
- `lastSeenAt` already exists; heartbeat endpoint updates it
- No new fields needed; `ExecutorHeartbeat` fields are a subset

**Model removed**: `ExecutorHeartbeat` — functionality merged into `ExecutorRegistration`

**Behavioral changes**:
- `POST /api/v1/executors/heartbeat` now updates `ExecutorRegistration.lastSeenAt` instead of separate heartbeat collection
- `isAvailable()` check (for IM "agent not running" warning) queries `ExecutorRegistration` where `lastSeenAt > (now - staleThreshold)` and `status = 'active'`
- Multiple executors per identity are supported (no unique constraint on `identityId`; already the case)

---

### Models DEPRECATED (not deleted, but no longer used in new flows)

| Model | Collection | Reason |
|-------|-----------|--------|
| `TenantSkillConfig` | `tenant_skill_configs` | No per-tenant skill config needed; unified skill type |
| `ExecutorHeartbeat` | `executor_heartbeats` | Merged into `ExecutorRegistration` |
| `UserIdentityBinding` | `user_identity_bindings` | Replaced by `ImBinding` for IM routing |
| `AiUsageRecord` | `ai_usage_records` | Skill usage now tracked by `SkillUsage`; AI-specific usage tracking is a separate concern |

---

### Tenant (NO CHANGE in this feature)

The `Tenant` model remains for backward compatibility with other subsystems (webhook channel mapping, admin API key auth). Full tenant removal is deferred to a separate migration spec. New code in this feature does NOT create or require tenants for skill operations.

---

## IM → Identity → Executor Resolution Chain

```
IM Message (signed webhook)
    │
    ▼
OpenClawBridge.handleInboundWebhook
    │  extracts: platform, platformUserId (from signed payload)
    │
    ▼
ImBinding.findOne({ platform, platformUserId, active: true })
    │  returns: executorToken, identityId
    │  if not found → reply "please /register first"
    │
    ▼
WebhookHandler creates dispatch with:
    │  targetExecutorToken = imBinding.executorToken
    │  targetIdentityId = imBinding.identityId
    │  skillName = explicit (from /use <name>) or null (generic)
    │
    ▼
ExecutorRegistration.findOne({ executorToken, status: 'active' })
    │  if lastSeenAt stale → reply "executor offline, re-register"
    │
    ▼
Executor polls/SSE (filtered by executorToken)
    │
    ▼
POST /dispatches/:id/claim
    │  Authorization: Bearer <executorToken>
    │  Server validates: executorToken === dispatch.targetExecutorToken
    │  or executor.identityId === dispatch.targetIdentityId
    │
    ▼
TaskProcessor executes skill locally
    │  if skillName is published & not cached → pull from server
    │
    ▼
POST /dispatches/:id/complete
    │  Authorization: Bearer <executorToken>
    │  Server increments SkillRegistration.usageCount
    │  Server creates SkillUsage record
```

**Security guarantees**:
1. **Webhook authenticity**: HMAC-SHA256 signature verification (existing)
2. **IM user → executor binding**: `ImBinding` unique constraint ensures one binding per `(platform, platformUserId)`; changing executor requires explicit re-register
3. **Dispatch isolation**: `targetExecutorToken` ensures only the bound executor can claim the dispatch
4. **Executor auth**: All dispatch state changes require Bearer executor token
5. **Identity integrity**: `executorToken` → `ExecutorRegistration.identityId` is server-side; the executor cannot impersonate another identity
