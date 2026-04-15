# Tasks: Unified Skill Center

**Input**: Design documents from `/specs/012-unified-skill-center/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — test tasks omitted. Integration tests are called out in Polish phase for critical paths.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Core domain**: `packages/core/src/`
- **Server HTTP**: `packages/server/src/`
- **CLI**: `packages/cli/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new entity files, zod schemas, and service stubs needed by multiple user stories

- [x] T001 [P] Create SkillLike entity in packages/core/src/entities/skill-like.entity.ts with fields (skillId, identityId, createdAt) and unique index (skillId, identityId)
- [x] T002 [P] Create SkillUsage entity in packages/core/src/entities/skill-usage.entity.ts with fields (skillId, identityId, executorToken, createdAt) and TTL index (90 days)
- [x] T003 [P] Create zod validation schemas for skill publish payload (name, description, version, skillMdRaw, metadata) in packages/core/src/validation/skill-center.schema.ts
- [x] T004 Register SkillLike and SkillUsage models in packages/core/src/topichub.ts TopicHub.create() alongside existing model registrations

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Skill model simplification (US6), dispatch authentication, and executor unification — MUST complete before any user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### US6: Unified Skill Type

- [ ] T005 [US6] Modify SkillRegistration entity in packages/core/src/entities/skill-registration.entity.ts: remove category, tenantId, isPrivate, modulePath fields; add authorIdentityId, published, description, likeCount, usageCount, version, publishedAt fields
- [ ] T006 [US6] Update SkillRegistration indexes in packages/core/src/entities/skill-registration.entity.ts: drop unique (name, tenantId), add unique (name, authorIdentityId), add (published, likeCount), add (authorIdentityId), add text index (name, description)
- [ ] T007 [US6] Remove SkillCategory enum and all category references from packages/core/src/entities/skill-registration.entity.ts and any re-exports
- [ ] T008 [US6] Update all SkillRegistration queries in packages/core/src/services/ to remove tenantId and category filters — replace with authorIdentityId-based queries
- [ ] T009 [US6] Remove writing-topic-hub skill scaffold from packages/cli/src/scaffold/repo-scaffold.ts: remove writeAgentSkillFiles calls that generate .cursor/skills/writing-topic-hub/ and .cursor/rules/writing-topic-hub.mdc
- [ ] T010 [US6] Remove category directory scanning (skills/topics/, skills/platforms/, skills/adapters/) from packages/cli/src/commands/publish/index.ts — prepare for flat skill directory structure
- [ ] T011 [US6] Update packages/cli/src/commands/skill-repo/index.ts: remove category subdirectory creation from scaffold, keep flat skills/ directory
- [ ] T012 [US6] Update packages/cli/src/commands/skill/index.ts: remove --category flag from create subcommand, remove category-based list/filter logic

### Dispatch Authentication

- [ ] T013 Add targetExecutorToken and targetIdentityId fields to TaskDispatch entity in packages/core/src/entities/task-dispatch.entity.ts with indexes (targetExecutorToken, status, createdAt) and (targetIdentityId, status, createdAt)
- [ ] T014 Add executor token authentication to dispatch claim endpoint in packages/server/src/api.controller.ts: require Bearer executorToken, validate against dispatch.targetExecutorToken or dispatch.targetIdentityId
- [ ] T015 Add executor token authentication to dispatch complete/fail/question endpoints in packages/server/src/api.controller.ts: require Bearer executorToken, validate claimedBy matches
- [ ] T016 Update DispatchService.claim in packages/core/src/services/dispatch.service.ts to accept and validate executorToken parameter against targetExecutorToken/targetIdentityId
- [ ] T017 Update GET /api/v1/dispatches in packages/server/src/api.controller.ts to support executor token auth alongside tenant API key, filter by targetExecutorToken or targetIdentityId
- [ ] T018 Fix SSE dispatch stream in packages/server/src/api.controller.ts to filter events by dispatch.targetExecutorToken matching the subscriber's executorToken

### Executor Unification

- [ ] T019 Merge ExecutorHeartbeat functionality into ExecutorRegistration: update heartbeat endpoint in packages/server/src/api.controller.ts (ExecutorController) to update ExecutorRegistration.lastSeenAt instead of creating ExecutorHeartbeat records
- [ ] T020 Update HeartbeatService.isAvailable in packages/core/src/services/heartbeat.service.ts to query ExecutorRegistration (status=active, lastSeenAt > staleThreshold) instead of executor_heartbeats collection
- [ ] T021 Update CLI serve command in packages/cli/src/commands/serve/index.ts: send executor token in Authorization header for claim/complete/fail requests via TaskProcessor and ApiClient

**Checkpoint**: Foundation ready — skill model is unified, dispatch is authenticated, executor system is merged. User story implementation can now begin.

---

## Phase 3: User Story 1 — Create and Use a Local Skill (Priority: P1) 🎯 MVP

**Goal**: Users can author a SKILL.md locally and invoke it via CLI without any server interaction

**Independent Test**: Create a skill file in the skills directory, run CLI invoke command, verify output

### Implementation for User Story 1

- [ ] T022 [US1] Implement local skill discovery in packages/cli/src/commands/skill/index.ts: scan configured skillsDir for subdirectories containing SKILL.md, list with "local" marker
- [ ] T023 [US1] Implement local skill invocation in packages/cli/src/commands/skill/index.ts: add `use <name>` subcommand that reads SKILL.md from skillsDir/<name>/SKILL.md and delegates to the configured executor
- [ ] T024 [US1] Update skill list subcommand in packages/cli/src/commands/skill/index.ts to show local skills (from skillsDir) alongside server-published skills with source indicator (local/published)
- [ ] T025 [US1] Add validation for SKILL.md format in packages/cli/src/commands/skill/index.ts: parse frontmatter with gray-matter, validate required fields (name, description)
- [ ] T026 [US1] Add error handling for missing/malformed skills: clear error messages for "skill not found", "invalid SKILL.md format", "executor not configured"

**Checkpoint**: User Story 1 fully functional — users can create and invoke local skills via CLI

---

## Phase 4: User Story 2 — Publish a Skill to the Skill Center (Priority: P1)

**Goal**: Users can publish individual skills from CLI to the server, making them discoverable

**Independent Test**: Publish a skill via CLI, verify it appears in GET /api/v1/skills response

### Implementation for User Story 2

- [ ] T027 [P] [US2] Create SkillCenterService in packages/core/src/services/skill-center.service.ts with publishSkill(identityId, payload) method: validate payload with zod schema, upsert SkillRegistration by (name, authorIdentityId), set published=true and publishedAt=now
- [ ] T028 [P] [US2] Create SkillCenterController in packages/server/src/skill-center.controller.ts with POST /api/v1/skills/publish route: resolve identity from Bearer token (identity or executor), delegate to SkillCenterService.publishSkill
- [ ] T029 [US2] Rewrite CLI publish command in packages/cli/src/commands/publish/index.ts: target individual skill directory (not batch repo), read SKILL.md + metadata, POST to /api/v1/skills/publish with identity/executor token
- [ ] T030 [US2] Update publish validation in packages/cli/src/validation/skill-manifest.ts: replace PublishPayloadSchema (batch array) with single-skill schema matching the contract (name, description, version, skillMdRaw, metadata)
- [ ] T031 [US2] Add re-publish (update) logic: when publishing a skill that already exists for the same author, update version and content without creating duplicates
- [ ] T032 [US2] Add DELETE /api/v1/skills/:name route to SkillCenterController in packages/server/src/skill-center.controller.ts for unpublishing (author only, sets published=false)

**Checkpoint**: User Story 2 fully functional — skills can be published and unpublished individually

---

## Phase 5: User Story 3 — Browse and Discover Skills in Skill Center Web UI (Priority: P1)

**Goal**: Users open a local web page via CLI to browse, search, and like published skills

**Independent Test**: Run CLI skill-center command, browser opens, published skills displayed with search and like

### Implementation for User Story 3

- [ ] T033 [P] [US3] Add listSkills(query, sort, page, limit) method to SkillCenterService in packages/core/src/services/skill-center.service.ts: paginated query with text search on (name, description), sort by popular/recent/usage, join authorDisplayName from Identity
- [ ] T034 [P] [US3] Add getSkill(name, author?) method to SkillCenterService in packages/core/src/services/skill-center.service.ts: single skill lookup with full metadata
- [ ] T035 [P] [US3] Add toggleLike(identityId, skillName) method to SkillCenterService in packages/core/src/services/skill-center.service.ts: atomic insert/remove SkillLike + increment/decrement likeCount on SkillRegistration
- [ ] T036 [US3] Add GET /api/v1/skills, GET /api/v1/skills/:name, POST /api/v1/skills/:name/like, GET /api/v1/skills/:name/liked routes to SkillCenterController in packages/server/src/skill-center.controller.ts
- [ ] T037 [P] [US3] Create Skill Center web UI: packages/server/src/skill-center-ui/index.html with skill listing grid, search input, sort dropdown, like buttons — static HTML + vanilla JS fetching from /api/v1/skills endpoints
- [ ] T038 [P] [US3] Create Skill Center CSS: packages/server/src/skill-center-ui/styles.css with responsive layout, skill cards, search bar, like button states — WCAG 2.1 AA compliant (contrast, focus indicators, semantic HTML)
- [ ] T039 [US3] Configure NestJS to serve static files from skill-center-ui/ directory at /skill-center path in packages/server/src/app.module.ts (use @nestjs/serve-static or manual static middleware)
- [ ] T040 [US3] Create CLI skill-center command in packages/cli/src/commands/skill-center/index.ts: open http://localhost:<port>/skill-center in default browser (use open package), pass identity token as query param for like functionality
- [ ] T041 [US3] Register skill-center command in CLI entry point packages/cli/src/index.tsx

**Checkpoint**: User Story 3 fully functional — Skill Center web UI is browsable with search and likes

---

## Phase 6: User Story 4 — Use Another User's Published Skill (Priority: P2)

**Goal**: Users can invoke published skills via CLI; system auto-pulls skill content to local and tracks usage

**Independent Test**: User A publishes skill, User B invokes it, skill is pulled to local skillsDir, usage count increments

### Implementation for User Story 4

- [ ] T042 [P] [US4] Add pullSkillContent(name, author?) method to SkillCenterService in packages/core/src/services/skill-center.service.ts: return skill content with ETag header for caching
- [ ] T043 [P] [US4] Add recordUsage(identityId, executorToken, skillName) method to SkillCenterService in packages/core/src/services/skill-center.service.ts: create SkillUsage record, increment SkillRegistration.usageCount atomically
- [ ] T044 [US4] Add GET /api/v1/skills/:name/content and POST /api/v1/skills/:name/usage routes to SkillCenterController in packages/server/src/skill-center.controller.ts
- [ ] T045 [US4] Implement skill auto-pull in CLI TaskProcessor packages/cli/src/commands/serve/task-processor.ts: before executing a dispatch with skillName, check if skillsDir/<skillName>/SKILL.md exists; if not, fetch from /api/v1/skills/:name/content and write to skillsDir
- [ ] T046 [US4] Add version-based cache invalidation to skill auto-pull: compare local version (from SKILL.md frontmatter) with server ETag/version, re-pull if newer
- [ ] T047 [US4] Update CLI skill use subcommand in packages/cli/src/commands/skill/index.ts to support published skills: if not found locally, attempt pull from server, then execute
- [ ] T048 [US4] Report usage after successful execution: TaskProcessor calls POST /api/v1/skills/:name/usage after completing a dispatch with a published skillName

**Checkpoint**: User Story 4 fully functional — published skills auto-pull to local and usage is tracked

---

## Phase 7: User Story 7 — Run Multiple Local Executors and Switch via IM (Priority: P2)

**Goal**: Users run multiple executors, bind IM to a specific executor via /register, switch via re-register

**Independent Test**: Start two executors, register IM to one, verify dispatches route only to bound executor, re-register to other

### Implementation for User Story 7

- [ ] T049 [US7] Wire ImBindingModel into IdentityService in packages/core/src/identity/identity.service.ts: add resolveByImAccount(platform, platformUserId) method returning { executorToken, identityId } from ImBinding
- [ ] T050 [US7] Update WebhookHandler.resolveUserByPlatform in packages/core/src/webhook/webhook-handler.ts to use ImBinding lookup (via IdentityService.resolveByImAccount) instead of UserIdentityBinding
- [ ] T051 [US7] Update WebhookHandler dispatch creation in packages/core/src/webhook/webhook-handler.ts: set targetExecutorToken and targetIdentityId from ImBinding resolution instead of dispatchMeta.targetUserId
- [ ] T052 [US7] Update /topichub register handler in packages/core/src/webhook/webhook-handler.ts: support direct executor-token registration (/topichub register <executor-token>) — validate token against ExecutorRegistration, upsert ImBinding
- [ ] T053 [US7] Update POST /api/v1/identity/link in packages/server/src/api.controller.ts: accept executor token or identity token as Bearer, upsert ImBinding (not UserIdentityBinding) with executorToken from ExecutorRegistration
- [ ] T054 [US7] Update /topichub unregister handler in packages/core/src/webhook/webhook-handler.ts: deactivate ImBinding instead of UserIdentityBinding
- [ ] T055 [US7] Add /topichub use <skill-name> [args] command handler in packages/core/src/webhook/webhook-handler.ts: parse skill name and args, create dispatch with skillName, eventType=skill_invocation, targetExecutorToken and targetIdentityId from ImBinding
- [ ] T056 [US7] Add executor availability check in WebhookHandler before dispatching: query ExecutorRegistration.lastSeenAt for bound executor, reply "executor offline" if stale
- [ ] T057 [US7] Ensure ImBindingModel is passed from TopicHub.create() into services that need it in packages/core/src/topichub.ts

**Checkpoint**: User Story 7 fully functional — multi-executor with IM binding and switching works securely

---

## Phase 8: User Story 5 — Superadmin Views System Dashboard (Priority: P2)

**Goal**: Superadmin sees connected IM platforms, user count, executor count, skill stats in Skill Center UI

**Independent Test**: Open Skill Center as superadmin, verify admin section visible with accurate metrics

### Implementation for User Story 5

- [ ] T058 [P] [US5] Add getDashboardStats() method to SkillCenterService in packages/core/src/services/skill-center.service.ts: aggregate connected IM platforms (from ImBinding), registered users (from Identity), active executors (from ExecutorRegistration), total published skills, usage stats
- [ ] T059 [US5] Add GET /api/v1/admin/dashboard route to SkillCenterController or ApiController in packages/server/src/: require superadmin token auth, return dashboard stats
- [ ] T060 [US5] Add admin dashboard section to Skill Center web UI in packages/server/src/skill-center-ui/index.html: conditional display based on superadmin detection (query param or API probe), show IM platforms, users, executors, skill stats
- [ ] T061 [US5] Style admin dashboard section in packages/server/src/skill-center-ui/styles.css: visually distinct from skill browsing area, responsive grid of stat cards

**Checkpoint**: User Story 5 fully functional — superadmin dashboard shows real-time system metrics

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T062 [P] Write migration script for existing SkillRegistration records: set authorIdentityId from tenant admin identity, set published=!isPrivate, set description from metadata/frontmatter in packages/core/src/migrations/012-unified-skill-migration.ts
- [ ] T063 [P] Write migration script for ImBinding seeding from UserIdentityBinding: create ImBinding entries for existing bindings (identity-only, no executorToken) in packages/core/src/migrations/012-im-binding-seed.ts
- [ ] T064 [P] Write migration script for ExecutorHeartbeat merge: copy lastSeenAt from executor_heartbeats to matching ExecutorRegistration records in packages/core/src/migrations/012-executor-heartbeat-merge.ts
- [ ] T065 [P] Update CLI help text in packages/cli/src/index.tsx: add skill-center command, update publish help for individual skill mode, remove category references
- [ ] T066 Remove or deprecate TenantSkillConfig references in packages/core/src/services/ — ensure no new code depends on it
- [ ] T067 Update skill-repo scaffold README template in packages/cli/src/scaffold/repo-scaffold.ts: reflect unified skill type, individual publish, no categories
- [ ] T068 Run npm run lint and tsc --noEmit across all packages to verify zero warnings
- [ ] T069 Run existing test suite (npm test) and fix any regressions from model changes
- [ ] T070 Write integration tests for critical paths: dispatch claim auth (executor token validation), IM binding resolution chain, skill publish + pull flow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**
- **User Stories (Phase 3–8)**: All depend on Foundational phase completion
  - US1 (Phase 3): No dependencies on other stories
  - US2 (Phase 4): No strict dependency on US1, but logically follows
  - US3 (Phase 5): Depends on US2 (needs published skills to display)
  - US4 (Phase 6): Depends on US2 (needs published skills to pull)
  - US7 (Phase 7): No dependency on US1–US4 (independent executor/IM concern)
  - US5 (Phase 8): Depends on US3 (extends Skill Center UI) and US7 (executor/IM metrics)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US6 (Unified Type)**: Foundational — blocks everything (Phase 2)
- **US1 (Local Skill)**: Can start after Phase 2 — no dependencies on other stories
- **US2 (Publish)**: Can start after Phase 2 — no strict dependency on US1
- **US3 (Browse UI)**: Depends on US2 for published skill data
- **US4 (Use Published)**: Depends on US2 for published skills to pull
- **US7 (Multi-Executor/IM)**: Can start after Phase 2 — independent of US1–US4
- **US5 (Admin Dashboard)**: Depends on US3 (UI) and benefits from US7 (IM/executor data)

### Within Each User Story

- Models/entities before services
- Services before controller routes
- Server routes before CLI commands
- Core implementation before integration points

### Parallel Opportunities

- Phase 1: T001, T002, T003 can all run in parallel (different files)
- Phase 2: US6 tasks and dispatch auth tasks can run in parallel (different files)
- Phase 3–4: US1 and US2 can run in parallel after Phase 2
- Phase 5–7: US3, US4, US7 — US7 can run in parallel with US3/US4
- Phase 9: All migration scripts (T062, T063, T064) can run in parallel

---

## Parallel Example: Phase 2 (Foundational)

```
# These can run in parallel (different files):
Task T005: Modify SkillRegistration entity (packages/core/src/entities/skill-registration.entity.ts)
Task T013: Add fields to TaskDispatch entity (packages/core/src/entities/task-dispatch.entity.ts)
Task T019: Merge heartbeat into ExecutorRegistration (packages/server/src/api.controller.ts)
Task T009: Remove writing-topic-hub scaffold (packages/cli/src/scaffold/repo-scaffold.ts)

# These depend on T005 completing first:
Task T006: Update SkillRegistration indexes (same file as T005)
Task T008: Update queries in services (packages/core/src/services/)
```

## Parallel Example: User Stories After Phase 2

```
# These three user stories can run in parallel (different concern areas):
Developer A: US1 — Local Skill (T022–T026) + US2 — Publish (T027–T032)
Developer B: US7 — Multi-Executor/IM (T049–T057)
Developer C: US3 — Skill Center UI (T033–T041) after US2 publishes exist
```

---

## Implementation Strategy

### MVP First (US6 + US1 + US2)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: Foundational — US6 + dispatch auth + executor unification (T005–T021)
3. Complete Phase 3: US1 — Local skill create and use (T022–T026)
4. Complete Phase 4: US2 — Publish skill (T027–T032)
5. **STOP and VALIDATE**: Skills can be created locally and published to server
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Model is unified, dispatch is secure
2. Add US1 → Local skills work → Demo
3. Add US2 → Publishing works → Demo (MVP!)
4. Add US3 → Skill Center UI → Demo (community browsing)
5. Add US4 → Auto-pull published skills → Demo
6. Add US7 → Multi-executor + IM switching → Demo (power users)
7. Add US5 → Admin dashboard → Demo (operational visibility)
8. Polish → Migrations, tests, cleanup

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 + US2 (skill lifecycle)
   - Developer B: US7 (IM/executor security)
3. After US2 complete:
   - Developer A: US3 (Skill Center UI)
   - Developer C: US4 (auto-pull)
4. After US3 + US7:
   - Developer A or C: US5 (admin dashboard)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The `/use` IM command (T055) is the highest-security-impact task — ensure dispatch auth (T014–T016) is solid before testing
