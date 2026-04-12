# Tasks: Superadmin Identity Model

**Input**: Design documents from `/specs/011-superadmin-identity/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-endpoints.md, quickstart.md

**Tests**: Not explicitly requested — test tasks are omitted.

**Organization**: Tasks are grouped by user story. US5 (Remove Tenants) is treated as foundational since it touches every existing file and must be done alongside the new entity creation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Prepare shared constants, types, and token utilities before any entity or service changes.

- [x] T001 Define token constants (lengths, prefixes) and token generation utility in `packages/core/src/common/token-utils.ts`
- [x] T002 [P] Define identity-related zod schemas (CreateIdentitySchema, UniqueIdSchema, etc.) in `packages/core/src/identity/identity-types.ts`
- [x] T003 [P] Define executor-related zod schemas (RegisterExecutorSchema, ExecutorTokenSchema) in `packages/core/src/identity/executor-types.ts`

---

## Phase 2: Foundational — New Entities & Services

**Purpose**: Create the new data model and core services that replace the tenant system. MUST be complete before user stories can be wired.

**⚠️ CRITICAL**: No user story endpoint/CLI work can begin until this phase is complete.

### New Entities

- [x] T004 [P] Create `Identity` entity with fields (uniqueId, displayName, token, isSuperAdmin, status) in `packages/core/src/entities/identity.entity.ts`
- [x] T005 [P] Create `ExecutorRegistration` entity with fields (identityId, executorToken, status, lastSeenAt, executorMeta) in `packages/core/src/entities/executor-registration.entity.ts`
- [x] T006 [P] Create `ImBinding` entity with fields (platform, platformUserId, executorToken, identityId, active) in `packages/core/src/entities/im-binding.entity.ts`

### New Services

- [x] T007 Implement `SuperadminService` (init system, create identity, list/revoke/regenerate tokens) in `packages/core/src/services/superadmin.service.ts` — depends on T004
- [x] T008 Rewrite `IdentityService` to manage ImBindings (resolve by platform, resolve by executor token, bind/unbind) in `packages/core/src/identity/identity.service.ts` — depends on T005, T006
- [x] T009 Implement new auth resolution: Bearer token → lookup in `identities` or `executor_registrations` collections, replacing API key decryption scan, in `packages/core/src/services/auth.service.ts` — depends on T004, T005

### Register Models in Facade

- [x] T010 Register Identity, ExecutorRegistration, ImBinding models in `TopicHub.create()` and wire new services in `packages/core/src/topichub.ts` — depends on T004–T009

**Checkpoint**: New entities and services exist alongside old ones. System compiles but old tenant code still functional.

---

## Phase 3: US5 — Remove All Tenant-Related Functionality (Priority: P1)

**Goal**: Strip `tenantId` from every entity, service, handler, facade operation, controller, and config. Replace tenant-based auth with identity/executor-based auth.

**Independent Test**: Verify that no `tenantId` field exists in any entity, no service method accepts `tenantId` as a parameter, and all operations work without tenant context.

### Entity Modifications

- [x] T011 [P] [US5] Remove `tenantId` from `Topic` entity and update indexes in `packages/core/src/entities/topic.entity.ts`
- [x] T012 [P] [US5] Remove `tenantId` from `TimelineEntry` entity in `packages/core/src/entities/timeline-entry.entity.ts`
- [x] T013 [P] [US5] Remove `tenantId` from `TaskDispatch` entity, replace `targetUserId` with `targetExecutorToken`, add `identityId` in `packages/core/src/entities/task-dispatch.entity.ts`
- [x] T014 [P] [US5] Remove `tenantId` from `QaExchange` entity, replace `topichubUserId` with `identityId` in `packages/core/src/entities/qa-exchange.entity.ts`
- [x] T015 [P] [US5] Remove `tenantId` from `AiUsageRecord` entity, add optional `identityId` in `packages/core/src/entities/ai-usage.entity.ts`
- [x] T016 [P] [US5] Rename `TenantSkillConfig` to `SkillConfig`, remove `tenantId`, update collection name to `skill_configs` in `packages/core/src/entities/tenant-skill-config.entity.ts` (rename file to `skill-config.entity.ts`)

### Delete Old Entities

- [x] T017 [P] [US5] Delete `Tenant` entity file `packages/core/src/entities/tenant.entity.ts`
- [x] T018 [P] [US5] Delete `PairingCode` entity file `packages/core/src/identity/pairing-code.entity.ts`

### Service Modifications (strip tenantId from all method signatures)

- [x] T019 [US5] Remove `tenantId` param from all `TopicService` methods in `packages/core/src/services/topic.service.ts` — depends on T011
- [x] T020 [US5] Remove `tenantId` param from all `TimelineService` methods in `packages/core/src/services/timeline.service.ts` — depends on T012
- [x] T021 [US5] Remove `tenantId` param from all `DispatchService` methods, update to use `identityId` and `targetExecutorToken` in `packages/core/src/services/dispatch.service.ts` — depends on T013
- [x] T022 [US5] Remove `tenantId` param from all `SearchService` methods in `packages/core/src/services/search.service.ts` — depends on T011
- [x] T023 [US5] Remove `tenantId` param from all `QaService` methods, use `identityId` in `packages/core/src/services/qa.service.ts` — depends on T014
- [x] T024 [US5] Remove `tenantId` param from `AiUsageService` and `AiService` in `packages/core/src/ai/ai-usage.service.ts` and `packages/core/src/ai/ai.service.ts` — depends on T015
- [x] T025 [US5] Rewrite `HeartbeatService` to use executor token instead of (tenantId, topichubUserId), referencing `ExecutorRegistration` in `packages/core/src/services/heartbeat.service.ts` — depends on T005
- [x] T026 [US5] Update `SkillConfigService` and `SkillRegistry` to remove tenant-scoped checks in `packages/core/src/skill/config/skill-config.service.ts` and `packages/core/src/skill/registry/skill-registry.ts` — depends on T016

### Delete Old Service

- [x] T027 [US5] Delete `TenantService` file `packages/core/src/services/tenant.service.ts`

### Command Handler Modifications

- [x] T028 [US5] Remove `tenantId` param from all command handlers (create, update, assign, show, timeline, reopen, history, help) in `packages/core/src/command/handlers/*.handler.ts` — depends on T019, T020
- [x] T029 [US5] Update `CommandRouter` and `CommandContext` to remove `tenantId`, add `identityId` and `executorToken` in `packages/core/src/command/command-router.ts`
- [x] T030 [US5] Update `IngestionService` to remove `tenantId` in `packages/core/src/ingestion/ingestion.service.ts`
- [x] T031 [US5] Update `SkillPipeline` to remove tenant-scoped dispatch creation in `packages/core/src/skill/pipeline/skill-pipeline.ts`

### Bridge Modifications

- [x] T032 [US5] Remove `tenantMapping`, `defaultTenantId` from `OpenClawConfig` and `BridgeConfig` schemas, keep optional `platformMapping` in `packages/core/src/bridge/openclaw-types.ts`
- [x] T033 [US5] Update `OpenClawBridge.handleInboundWebhook` to return platform-only result (no tenantId) in `packages/core/src/bridge/openclaw-bridge.ts` — depends on T032
- [x] T034 [US5] Remove `notifyTenantChannels` method (replaced by identity-based notification) in `packages/core/src/bridge/openclaw-bridge.ts`

### Config Modifications

- [x] T035 [US5] Remove `openclaw.tenantMapping`, `openclaw.defaultTenantId`, `bridge.tenantMapping`, `bridge.defaultTenantId` from `TopicHubConfigSchema` in `packages/core/src/config.ts`

### Facade Rewrite

- [x] T036 [US5] Rewrite `TopicHub` facade: remove all `tenantId` from operation interfaces (`TopicOperations`, `CommandOperations`, `IngestionOperations`, `AuthOperations`, `SearchOperations`, `DispatchOperations`, `AiOperations`, `IdentityOperations`, `HeartbeatOperations`, `QaOperations`), add `SuperadminOperations`, replace `AdminOperations` in `packages/core/src/topichub.ts` — depends on T007–T035
- [x] T037 [US5] Remove old model registrations (Tenant, PairingCode, UserIdentityBinding, ExecutorHeartbeat) and wire new models in `TopicHub.create()` in `packages/core/src/topichub.ts` — depends on T036

### Server Modifications

- [x] T038 [US5] Rewrite auth resolution in `api.controller.ts`: replace `tenant(req)` with `resolveIdentity(req)` and `resolveExecutor(req)` helpers using new `AuthService` in `packages/server/src/api.controller.ts` — depends on T009, T036
- [x] T039 [US5] Remove all tenant-related routes (`/admin/tenants`, `/admin/tenants/:id/token/regenerate`) from `packages/server/src/api.controller.ts`
- [x] T040 [US5] Update all existing routes (topics, dispatches, search, AI, skills, webhook) to use identity/executor auth instead of tenant auth in `packages/server/src/api.controller.ts`
- [x] T041 [US5] Remove tenant config from `topichub.provider.ts` (`TOPICHUB_DEFAULT_TENANT_ID`, tenant mapping env vars) in `packages/server/src/topichub.provider.ts`

### CLI Modifications

- [x] T042 [US5] Delete tenant CLI commands directory `packages/cli/src/commands/tenant/`
- [x] T043 [US5] Remove tenant-select step from init flow in `packages/cli/src/commands/init/`

**Checkpoint**: All tenant references removed. System compiles with identity-based model. No endpoints yet for init/identity/executor — those come in next phases.

---

## Phase 4: US1 — First-Time System Initialization (Priority: P1) 🎯 MVP

**Goal**: The first person to run init becomes the superadmin and receives a permanent token.

**Independent Test**: Run init on fresh system → superadmin created + token returned. Run init again → rejected.

### Implementation for User Story 1

- [x] T044 [US1] Add `POST /api/v1/init` endpoint (no auth, calls `SuperadminService.init()`, returns superadmin token) in `packages/server/src/api.controller.ts`
- [x] T045 [US1] Update CLI `init` command to call `POST /api/v1/init`, display superadmin token, warn about secure storage in `packages/cli/src/commands/init/index.ts`
- [x] T046 [US1] Add concurrent init protection (atomic check-and-create using MongoDB `findOneAndUpdate` with upsert) in `packages/core/src/services/superadmin.service.ts`

**Checkpoint**: `topichub-admin init` creates superadmin on fresh system, rejects if already initialized.

---

## Phase 5: US2 — Superadmin Creates User Identities (Priority: P1)

**Goal**: Superadmin provisions identities via CLI (name + unique ID → token). List/revoke/regenerate identity tokens.

**Independent Test**: Authenticate as superadmin → create identity → token returned. Create duplicate → rejected. List identities → all shown without tokens.

### Implementation for User Story 2

- [x] T047 [P] [US2] Add `POST /api/v1/admin/identities` endpoint (superadmin auth, create identity) in `packages/server/src/api.controller.ts`
- [x] T048 [P] [US2] Add `GET /api/v1/admin/identities` endpoint (superadmin auth, list identities with executor counts) in `packages/server/src/api.controller.ts`
- [x] T049 [P] [US2] Add `POST /api/v1/admin/identities/:id/revoke` endpoint (superadmin auth, prevent self-revoke) in `packages/server/src/api.controller.ts`
- [x] T050 [P] [US2] Add `POST /api/v1/admin/identities/:id/regenerate-token` endpoint (superadmin auth, revoke all executor tokens) in `packages/server/src/api.controller.ts`
- [x] T051 [US2] Create CLI `identity create` command (`--token`, `--unique-id`, `--name`, `--server`) in `packages/cli/src/commands/identity/create.ts`
- [x] T052 [US2] Create CLI `identity list` command (`--token`, `--server`) in `packages/cli/src/commands/identity/list.ts`
- [x] T053 [US2] Create CLI `identity revoke` command (`--token`, `--id`, `--server`) in `packages/cli/src/commands/identity/revoke.ts`
- [x] T054 [US2] Register identity subcommands in CLI entry point `packages/cli/src/commands/identity/index.ts`

**Checkpoint**: Superadmin can create/list/revoke identities via CLI. Tokens are generated and displayed.

---

## Phase 6: US3 & US4 — IM Binding, Executor Registration & Cross-Platform Identity (Priority: P2)

**Goal**: Executor auto-registers on startup (gets executor token printed to console). IM users bind to executor via `/topichub register <executor-token>`. All IM commands from any platform route to the correct executor and identity.

**Independent Test**: Start executor → token printed. Copy token → `/topichub register <token>` on IM → binding confirmed. Send command from IM → routed to correct executor. Switch executor → `/topichub register <new-token>` → routing updated.

### Executor Registration

- [x] T055 [US3] Add `POST /api/v1/executors/register` endpoint (identity token auth, issue executor token) in `packages/server/src/api.controller.ts`
- [x] T056 [US3] Add `POST /api/v1/executors/heartbeat` endpoint (executor token auth) in `packages/server/src/api.controller.ts`
- [x] T057 [P] [US3] Add `GET /api/v1/admin/executors` endpoint (superadmin auth, list active executors) in `packages/server/src/api.controller.ts`
- [x] T058 [P] [US3] Add `POST /api/v1/admin/executors/:executorToken/revoke` endpoint (superadmin auth) in `packages/server/src/api.controller.ts`
- [x] T059 [US3] Update CLI `serve` command: on startup, call `POST /api/v1/executors/register` with identity token, print executor token to console in `packages/cli/src/commands/serve/index.ts`
- [x] T060 [US3] Update CLI `serve` task processor: use executor token for SSE stream and task claim/complete in `packages/cli/src/commands/serve/task-processor.ts`

### IM Register/Unregister Flow

- [x] T061 [US4] Rewrite `WebhookHandler.handleRegister`: parse executor token from `/topichub register <token>`, validate executor token, create/update `ImBinding`, reply with confirmation in `packages/core/src/webhook/webhook-handler.ts`
- [x] T062 [US4] Update `WebhookHandler.handleUnregister`: deactivate ImBinding for (platform, platformUserId) in `packages/core/src/webhook/webhook-handler.ts`

### IM Command Routing (Core Security Flow)

- [x] T063 [US4] Rewrite `WebhookHandler.handleOpenClaw` main flow: resolve ImBinding by (platform, userId) → get executorToken + identityId → validate executor not revoked → check heartbeat → build CommandContext with identityId + executorToken in `packages/core/src/webhook/webhook-handler.ts` — depends on T061
- [x] T064 [US4] Update `WebhookIdentityOps` interface: replace tenant-scoped methods with `resolveByPlatform(platform, platformUserId)` returning `{ executorToken, identityId }` and `bindExecutor(platform, platformUserId, executorToken)` in `packages/core/src/webhook/webhook-handler.ts`
- [x] T065 [US4] Update `WebhookHeartbeatOps` interface: replace `isAvailable(tenantId, topichubUserId)` with `isAvailable(executorToken)` in `packages/core/src/webhook/webhook-handler.ts`
- [x] T066 [US4] Wire updated webhook ops in `TopicHub.create()` to use new `IdentityService` and `HeartbeatService` in `packages/core/src/topichub.ts`

### SSE Dispatch Stream

- [x] T067 [US3] Update SSE dispatch stream endpoint to filter by `targetExecutorToken` instead of `(tenantId, targetUserId)` in `packages/server/src/api.controller.ts`
- [x] T068 [US3] Update `DispatchService.findUnclaimed` / `findUnclaimedForUser` to filter by `targetExecutorToken` in `packages/core/src/services/dispatch.service.ts`

### QA Answer Flow

- [x] T069 [US4] Update `WebhookHandler.handleAnswer` to resolve identity via ImBinding instead of tenant-scoped lookup in `packages/core/src/webhook/webhook-handler.ts`

**Checkpoint**: Full end-to-end flow works: init → create identity → start executor → register on IM → send command → task dispatched to correct executor → result returned via IM.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Migration script, cleanup, and validation.

- [x] T070 Create data migration script: convert tenants → identities, strip tenantId from all collections, rename collections, rebuild indexes in `packages/core/src/migration/migrate-011-superadmin-identity.ts`
- [x] T071 [P] Remove all dead imports and references to deleted entities/services across all packages (Tenant, TenantService, PairingCode, UserIdentityBinding, ExecutorHeartbeat)
- [x] T072 [P] Update `packages/core/src/bridge/bridge-config-generator.ts` to remove tenant mapping generation
- [x] T073 [P] Update `start-local.sh` to remove tenant-related environment variables
- [x] T074 Verify TypeScript compilation passes across all packages (`pnpm -r build`)
- [ ] T075 Run quickstart.md validation: execute the full end-to-end flow from quickstart and verify each step
- [x] T076 Update CLI help text and command descriptions to remove any tenant references in `packages/cli/src/commands/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — creates new entities/services
- **US5 - Remove Tenants (Phase 3)**: Depends on Phase 2 — BLOCKS all user stories
- **US1 - Init (Phase 4)**: Depends on Phase 3 — needs clean identity model
- **US2 - Identity CRUD (Phase 5)**: Depends on Phase 4 — needs superadmin to exist first
- **US3 & US4 - IM Binding (Phase 6)**: Depends on Phase 5 — needs identities to create executors
- **Polish (Phase 7)**: Depends on Phase 6 — final cleanup

### User Story Dependencies

- **US5 (P1)**: Foundational — must complete first (removes old model)
- **US1 (P1)**: Depends on US5 — needs clean identity entity
- **US2 (P1)**: Depends on US1 — needs superadmin to create identities
- **US3 (P2)**: Depends on US2 — needs identity tokens for executor registration
- **US4 (P2)**: Depends on US3 — needs executors for IM binding
- **US3 + US4 are combined** into one phase because IM binding requires executor tokens (US3) and cross-platform identity (US3) depends on IM routing working (US4)

### Within Each User Story

- Entities before services
- Services before endpoints
- Endpoints before CLI commands
- Core implementation before integration

### Parallel Opportunities

**Phase 1**: T002, T003 can run in parallel
**Phase 2**: T004, T005, T006 can run in parallel (different entity files)
**Phase 3**: T011–T016 (entity mods) can all run in parallel; T017, T018 (deletes) can run in parallel
**Phase 5**: T047–T050 (admin endpoints) can run in parallel
**Phase 6**: T057, T058 can run in parallel
**Phase 7**: T071, T072, T073 can run in parallel

---

## Parallel Example: Phase 3 (Tenant Removal)

```text
# Launch all entity modifications in parallel:
T011: Remove tenantId from Topic entity
T012: Remove tenantId from TimelineEntry entity
T013: Remove tenantId from TaskDispatch entity
T014: Remove tenantId from QaExchange entity
T015: Remove tenantId from AiUsageRecord entity
T016: Rename TenantSkillConfig to SkillConfig

# Then launch service modifications in parallel:
T019: TopicService (depends on T011)
T020: TimelineService (depends on T012)
T021: DispatchService (depends on T013)
T022: SearchService (depends on T011)
T023: QaService (depends on T014)
```

---

## Implementation Strategy

### MVP First (US5 + US1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T010)
3. Complete Phase 3: US5 — Remove Tenants (T011–T043)
4. Complete Phase 4: US1 — Init (T044–T046)
5. **STOP and VALIDATE**: Init works, superadmin token returned, system compiles clean
6. Deploy if ready — system is functional for single-user CLI usage

### Incremental Delivery

1. Setup + Foundational + US5 → Clean identity model
2. + US1 → System bootstrapping works (MVP!)
3. + US2 → Multi-user support via CLI
4. + US3 & US4 → Full IM integration with executor switching
5. + Polish → Migration for existing deployments, cleanup

### Sequential Execution (Single Developer)

Total task count: **76 tasks**

Recommended order: T001 → T002/T003 → T004/T005/T006 → T007 → T008 → T009 → T010 → T011–T018 → T019–T027 → T028–T035 → T036–T043 → T044–T046 → T047–T054 → T055–T069 → T070–T076

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [US*] label maps task to specific user story
- US5 (Remove Tenants) is the largest phase (~33 tasks) because it touches every existing file
- The migration script (T070) should be written last after the model is stable
- Commit after each completed task or logical group of parallel tasks
