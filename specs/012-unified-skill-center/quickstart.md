# Quickstart: Unified Skill Center

## Prerequisites

- Node.js 20 LTS
- MongoDB 7 running locally or accessible
- pnpm (workspace manager)
- An initialized Topic Hub instance (superadmin created via `topichub-admin init`)

## Development Setup

```bash
# Clone and install
git checkout 012-unified-skill-center
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start server in dev mode
pnpm --filter @topichub/server dev

# In another terminal, start CLI
cd packages/cli
pnpm dev -- serve --executor claude-code
```

## Key Changes Overview

### 1. Skill Model Simplification

**Before**: Skills have categories (topic/platform/adapter), tenant scoping, batch publish.
**After**: Single unified skill type, identity-scoped, individual publish.

Files to modify:
- `packages/core/src/entities/skill-registration.entity.ts` — remove `category`, `tenantId`, `isPrivate`; add `authorIdentityId`, `published`, `description`, `likeCount`, `usageCount`
- `packages/cli/src/commands/publish/index.ts` — individual skill publish
- `packages/cli/src/scaffold/repo-scaffold.ts` — remove category dirs, remove `writing-topic-hub`

### 2. Skill Center Service + API

**New service**: `packages/core/src/services/skill-center.service.ts`
- `publishSkill(identityId, payload)` — upsert skill
- `listSkills(query, sort, page)` — paginated listing with search
- `getSkill(name, author?)` — single skill
- `pullSkillContent(name)` — content for local execution
- `toggleLike(identityId, skillName)` — like/unlike
- `recordUsage(identityId, executorToken, skillName)` — usage tracking

**New controller**: `packages/server/src/skill-center.controller.ts`
**New static UI**: `packages/server/src/skill-center-ui/` — HTML + CSS + JS

### 3. Dispatch Authentication

Files to modify:
- `packages/server/src/api.controller.ts` — add auth to claim/complete/fail/question
- `packages/core/src/services/dispatch.service.ts` — validate executor token against `targetExecutorToken`
- `packages/core/src/entities/task-dispatch.entity.ts` — add `targetExecutorToken`, `targetIdentityId`

### 4. ImBinding Activation

Files to modify:
- `packages/core/src/identity/identity.service.ts` — wire `ImBinding` model, new `resolveByImAccount()` method
- `packages/core/src/webhook/webhook-handler.ts` — use `ImBinding` instead of `UserIdentityBinding`, add `/use` command handler
- `packages/core/src/topichub.ts` — ensure `ImBindingModel` is passed to services

### 5. Executor Unification

Files to modify:
- `packages/core/src/services/heartbeat.service.ts` — query `ExecutorRegistration` instead of `ExecutorHeartbeat`
- `packages/cli/src/commands/serve/index.ts` — heartbeat updates `ExecutorRegistration.lastSeenAt`

## Testing Strategy

### Unit Tests
- `SkillCenterService`: publish, list, search, like, pull, usage tracking
- `DispatchService.claim`: auth validation, executor token matching
- `IdentityService.resolveByImAccount`: ImBinding lookup

### Integration Tests
- Full publish → browse → pull → execute flow
- IM webhook → ImBinding resolution → dispatch → claim → complete
- Multi-executor: two executors, re-register, verify routing switch
- Auth rejection: wrong executor token on claim

### Migration Test
- Existing skills with `category` field continue to work
- Existing dispatches with `targetUserId` remain claimable

## Migration Notes

Run after deploying new code:

1. **SkillRegistration migration**: Script to set `authorIdentityId` from tenant admin identity, set `published = !isPrivate`, set `description` from metadata or SKILL.md frontmatter
2. **Index migration**: Drop old `(name, tenantId)` unique index, create new `(name, authorIdentityId)` unique index
3. **ImBinding seeding**: For existing `UserIdentityBinding` records, create corresponding `ImBinding` entries (without `executorToken` — identity-only binding until user re-registers)
4. **ExecutorHeartbeat merge**: Copy `lastSeenAt` from heartbeat records to matching `ExecutorRegistration` records
