# Tasks: Extract @topichub/core

**Input**: Design documents from `/specs/006-extract-core-package/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new `packages/core` workspace package and configure the monorepo

- [x] T001 Create `packages/core/` directory structure matching plan.md layout: `src/`, `src/common/`, `src/entities/`, `src/services/`, `src/ai/`, `src/skill/`, `src/skill/interfaces/`, `src/skill/registry/`, `src/skill/config/`, `src/skill/pipeline/`, `src/command/`, `src/command/handlers/`, `src/ingestion/`, `src/webhook/`
- [x] T002 Create `packages/core/package.json` with name `@topichub/core`, dependencies: `mongoose`, `@typegoose/typegoose`, `zod`, `gray-matter`, `jsonwebtoken`, `jwks-rsa` (no `@nestjs/*` deps). Add `main`, `types`, `files` fields and `build`/`test`/`lint`/`prepublishOnly` scripts
- [x] T003 [P] Create `packages/core/tsconfig.json` extending `../../tsconfig.base.json` with `rootDir: ./src`, `outDir: ./dist`, `declaration: true`, `declarationMap: true`
- [x] T004 [P] Update `pnpm-workspace.yaml` to add `packages/core` workspace entry
- [x] T005 [P] Update `turbo.json` to include `@topichub/core` build pipeline (core must build before server)
- [x] T006 Update `packages/server/package.json` to add `@topichub/core` as a workspace dependency (`"@topichub/core": "workspace:*"`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Move shared types, ports, and entities into `@topichub/core` — these are needed by ALL user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Copy `packages/server/src/common/enums.ts` to `packages/core/src/common/enums.ts` (no changes needed — file has zero NestJS imports)
- [x] T008 [P] Create logger port interface in `packages/core/src/common/logger.ts`: define `TopicHubLogger` interface (`log`, `warn`, `error`, `debug` methods) and `LoggerFactory` type. Create default `ConsoleLoggerFactory` implementation
- [x] T009 [P] Create `AiCompletionPort` interface in `packages/core/src/skill/interfaces/skill-context.ts` replacing `import type { AiService }` with a narrow `{ complete(prompt, options): Promise<result> }` interface. Update `SkillContext` to use `AiCompletionPort` instead of `AiService`
- [x] T010 [P] Copy entity files to `packages/core/src/entities/`: `topic.entity.ts`, `timeline-entry.entity.ts`, `skill-registration.entity.ts`, `tenant-skill-config.entity.ts`, `task-dispatch.entity.ts`, `tenant.entity.ts`, `ai-usage.entity.ts` (no changes needed — entities have zero NestJS imports, only Typegoose decorators)
- [x] T011 [P] Copy skill interface files to `packages/core/src/skill/interfaces/`: `index.ts`, `type-skill.ts`, `platform-skill.ts`, `adapter-skill.ts`, `skill-manifest.ts`, `skill-md.ts`, `setup-context.ts`. Update `platform-skill.ts` and `adapter-skill.ts` imports to use the new `skill-context.ts` (T009)
- [x] T012 Create `packages/core/src/config.ts` with zod schema for `TopicHubConfig` per `contracts/topichub-config.ts`: validate `mongoConnection` XOR `mongoUri`, `skillsDir` (required), optional `ai`, `logger`, `encryption` fields

**Checkpoint**: Foundation ready — core package has types, entities, interfaces, and config schema

---

## Phase 3: User Story 1 — Core Library Extraction (Priority: P1) 🎯 MVP

**Goal**: Extract all domain services from `packages/server` into `packages/core`, create the `TopicHub` facade, and produce a functional `@topichub/core` package that can be imported standalone.

**Independent Test**: Create a minimal test that imports `@topichub/core`, calls `TopicHub.create()` with `mongodb-memory-server`, ingests an event, lists topics, and shuts down.

### Implementation for User Story 1

#### Services (strip NestJS decorators, accept constructor params)

- [x] T013 [P] [US1] Port `TopicService` to `packages/core/src/services/topic.service.ts`: remove `@Injectable`, `@InjectModel`; accept `Model<Topic>` and `Model<TimelineEntry>` via constructor params; replace `ConflictException`/`BadRequestException` with plain error classes; keep `VALID_TRANSITIONS` logic
- [x] T014 [P] [US1] Port `TimelineService` to `packages/core/src/services/timeline.service.ts`: remove `@Injectable`, `@InjectModel`; accept `Model<TimelineEntry>` via constructor
- [x] T015 [P] [US1] Port `TenantService` to `packages/core/src/services/tenant.service.ts`: remove `@Injectable`, `@InjectModel`; accept `Model<Tenant>` and `CryptoService` via constructor
- [x] T016 [P] [US1] Port `CryptoService` and `SecretManager` to `packages/core/src/services/crypto.service.ts`: remove `@Injectable`; accept master key config via constructor; keep AES-256-CBC and HKDF logic unchanged
- [x] T017 [P] [US1] Port `SearchService` to `packages/core/src/services/search.service.ts`: remove `@Injectable`, `@InjectModel`; accept `Model<Topic>` via constructor
- [x] T018 [P] [US1] Port `DispatchService` to `packages/core/src/services/dispatch.service.ts`: remove `@Injectable`, `@InjectModel`, `OnModuleInit`, `OnModuleDestroy`; accept `Model<TaskDispatch>` via constructor; replace `rxjs.Subject` with Node.js `EventEmitter` for task notifications; add `init()` and `destroy()` lifecycle methods

#### AI Subsystem

- [x] T019 [P] [US1] Port `AiProviderInterface`, `ArkProvider`, `CircuitBreaker`, `AiConfig` to `packages/core/src/ai/`: remove `@Injectable` decorators; keep pure logic unchanged
- [x] T020 [P] [US1] Port `AiUsageService` to `packages/core/src/ai/ai-usage.service.ts`: remove `@Injectable`, `@InjectModel`; accept `Model<AiUsageRecord>` via constructor
- [x] T021 [US1] Port `AiService` to `packages/core/src/ai/ai.service.ts`: remove `@Injectable`, `@Inject`, `@Optional`; accept config, provider, usage service, and tenant-skill-config model via constructor. Implement `AiCompletionPort` interface (from T009)

#### Skill Subsystem

- [x] T022 [P] [US1] Port `SkillLoader` to `packages/core/src/skill/registry/skill-loader.ts`: remove `@Injectable`; accept `skillsDir` and logger via constructor instead of `process.env.SKILLS_DIR`
- [x] T023 [P] [US1] Port `SkillMdParser` to `packages/core/src/skill/registry/skill-md-parser.ts`: remove `@Injectable`; keep pure parsing logic
- [x] T024 [US1] Port `SkillRegistry` to `packages/core/src/skill/registry/skill-registry.ts`: remove `@Injectable`, `@InjectModel`, `@Optional`, `@Inject`, `OnModuleInit`; accept models, loader, parser, and optional `AiCompletionPort` via constructor; add explicit `loadAll()` method (replaces `onModuleInit`)
- [x] T025 [P] [US1] Port `SkillConfigService` to `packages/core/src/skill/config/skill-config.service.ts`: remove `@Injectable`, `@InjectModel`; accept `Model<TenantSkillConfig>` via constructor
- [x] T026 [US1] Port `SkillPipeline` to `packages/core/src/skill/pipeline/skill-pipeline.ts`: remove `@Injectable`, `@Optional`; accept registry, config service, optional AI runtime, and optional dispatch service via constructor
- [x] T027 [P] [US1] Port `SkillAiRuntime` to `packages/core/src/skill/pipeline/skill-ai-runtime.ts`: remove `@Injectable`, `@Optional`; accept `AiService` (core version) via constructor

#### Command Subsystem

- [x] T028 [P] [US1] Port `CommandParser` to `packages/core/src/command/command-parser.ts`: remove `@Injectable` (it's the only NestJS construct). Pure parsing logic untouched
- [x] T029 [P] [US1] Port `CommandRouter` to `packages/core/src/command/command-router.ts`: remove `@Injectable`; accept `SkillRegistry` via constructor
- [x] T030 [P] [US1] Port all command handlers to `packages/core/src/command/handlers/`: `assign`, `create`, `help`, `history`, `reopen`, `show`, `timeline`, `update`. Remove NestJS decorators if any; accept service dependencies via constructor

#### Ingestion

- [x] T031 [US1] Port `IngestionService` to `packages/core/src/ingestion/ingestion.service.ts`: remove `@Injectable`; accept `TopicService`, `TimelineService`, `SkillRegistry`, `SkillPipeline` via constructor
- [x] T032 [P] [US1] Copy `EventPayload` DTO to `packages/core/src/ingestion/event-payload.ts`: convert from NestJS DTO decorators (if any) to plain zod schema or interface

#### Webhook Handler

- [x] T033 [US1] Create `packages/core/src/webhook/webhook-handler.ts`: implement `WebhookHandler` class that encapsulates the webhook dispatch logic from current `WebhookController` and `AdapterWebhookController`. Accept `SkillRegistry`, `CommandParser`, `CommandRouter`, `TopicService`, `IngestionService` via constructor. Expose `handle(platform, payload, headers)` method. Include signature verification call before dispatch

#### TopicHub Facade

- [x] T034 [US1] Create `packages/core/src/topichub.ts`: implement `TopicHub` class per `contracts/topichub-facade.ts`. The `static create(config)` method: validates config with zod (T012), creates Mongoose models via `getModelForClass(Entity, { existingConnection })` (or connects via URI), instantiates all services with those models, loads skills, and returns a `TopicHub` instance with namespace-style properties (`topics`, `commands`, `ingestion`, `webhook`, `messaging`, `auth`, `search`, `skills`, `dispatch`). Include `shutdown()` method that cleans up the dispatch service and optionally disconnects Mongoose (URI mode only)
- [x] T035 [US1] Create `packages/core/src/index.ts`: export `TopicHub`, `TopicHubConfig`, all enums, all entity types, all skill interfaces, `EventPayload`, `AiCompletionPort`, `TopicHubLogger`, and operation namespace types. This is the public API surface

**Checkpoint**: `@topichub/core` is a self-contained package. Run `pnpm --filter @topichub/core build` to verify zero compile errors and zero `@nestjs/*` imports.

---

## Phase 4: User Story 2 — Demo Server Refactoring (Priority: P1)

**Goal**: Refactor `packages/server` to be a thin NestJS shell that imports `@topichub/core` for all business logic. All existing API endpoints and behaviors remain identical.

**Independent Test**: Run the full existing test suite (`pnpm --filter @topichub/server test`) — all tests must pass with zero behavioral changes.

### Implementation for User Story 2

- [x] T036 [US2] Create `packages/server/src/topichub.provider.ts`: NestJS provider that calls `TopicHub.create()` in `onModuleInit`, passing the Mongoose connection from `DatabaseModule` and env config. Register `TopicHub` instance as a NestJS provider available for injection
- [x] T037 [US2] Rewrite `packages/server/src/app.module.ts`: import `DatabaseModule` (keep env-based connection) + `TopicHubModule` (new thin module wrapping topichub.provider). Remove all business-logic module imports (`CoreModule`, `SkillModule`, `AiModule`, etc.)
- [x] T038 [P] [US2] Rewrite `packages/server/src/ingestion/ingestion.controller.ts` → `packages/server/src/controllers/ingestion.controller.ts`: inject `TopicHub`, delegate to `hub.ingestion.ingest()`
- [x] T039 [P] [US2] Rewrite `packages/server/src/command/command.controller.ts` → `packages/server/src/controllers/command.controller.ts`: inject `TopicHub`, delegate to `hub.commands.execute()`
- [x] T040 [P] [US2] Rewrite `packages/server/src/command/webhook.controller.ts` → `packages/server/src/controllers/webhook.controller.ts`: inject `TopicHub`, delegate to `hub.webhook.handle(platform, payload, headers)`
- [x] T041 [P] [US2] Rewrite `packages/server/src/core/topic-detail.controller.ts` → `packages/server/src/controllers/topic-detail.controller.ts`: inject `TopicHub`, delegate to `hub.topics.*`
- [x] T042 [P] [US2] Rewrite `packages/server/src/search/search.controller.ts` → `packages/server/src/controllers/search.controller.ts`: inject `TopicHub`, delegate to `hub.search.search()`
- [x] T043 [P] [US2] Rewrite `packages/server/src/admin/admin.controller.ts` → `packages/server/src/controllers/admin.controller.ts`: inject `TopicHub`, delegate to `hub.skills.*` and `hub.topics.*`
- [x] T044 [P] [US2] Rewrite `packages/server/src/auth/auth.controller.ts` → `packages/server/src/controllers/auth.controller.ts`: inject `TopicHub`, delegate to `hub.auth.*`
- [x] T045 [P] [US2] Rewrite `packages/server/src/dispatch/dispatch.controller.ts` and `dispatch-sse.controller.ts` → `packages/server/src/controllers/dispatch.controller.ts`: inject `TopicHub`, delegate to `hub.dispatch.*`
- [x] T046 [P] [US2] Rewrite `packages/server/src/ingestion/adapter-webhook.controller.ts` → merge into `packages/server/src/controllers/webhook.controller.ts`: use `hub.webhook.handle()` for both platform and adapter webhooks
- [x] T047 [US2] Rewrite `packages/server/src/guards/tenant.guard.ts` and `jwt-auth.guard.ts`: keep NestJS guard decorators but delegate tenant resolution / JWT verification to `hub.auth.*`
- [x] T048 [US2] Delete all business logic files from `packages/server/src/` that were moved to core: `core/`, `skill/`, `ai/`, `command/` (handlers, parser, router), `ingestion/ingestion.service.ts`, `search/search.service.ts`, `dispatch/dispatch.service.ts`, `tenant/tenant.service.ts`, `crypto/`, `common/enums.ts`. Keep only controllers, guards, database module, main.ts, app.module
- [x] T049 [US2] Update `packages/server/package.json`: remove dependencies that are now in core (`gray-matter`, `jsonwebtoken`, `jwks-rsa`). Keep `@nestjs/*`, `mongoose`, `@typegoose/typegoose` (needed for connection setup)
- [x] T050 [US2] Update existing tests in `packages/server/test/` to work with the refactored architecture — tests should still test the HTTP API surface (integration/e2e) and continue passing

**Checkpoint**: `pnpm --filter @topichub/server test` passes. All API endpoints return identical responses. The server package contains only NestJS wiring (~15 files) vs the previous ~80 files.

---

## Phase 5: User Story 3 — Webhook Endpoint for IM Platforms (Priority: P2)

**Goal**: Ensure the webhook handling in `@topichub/core` supports per-platform URLs with signature verification, and the demo server correctly routes to it.

**Independent Test**: Send a mock Lark webhook payload to `/webhooks/lark` and verify it's processed. Send a request to `/webhooks/unknown` and verify a 404-style error.

### Implementation for User Story 3

- [x] T051 [US3] Add optional `verifySignature?(payload: unknown, headers: Record<string, string>): Promise<boolean> | boolean` method to `PlatformSkill` interface in `packages/core/src/skill/interfaces/platform-skill.ts`
- [x] T052 [US3] Update `WebhookHandler.handle()` in `packages/core/src/webhook/webhook-handler.ts` to call `skill.verifySignature()` before dispatch (if the method exists). Return unauthorized error on verification failure
- [x] T053 [P] [US3] Add `AdapterSkill` webhook handling to `WebhookHandler`: support `webhooks/adapter/:skillName` path pattern in the core handler, routing to adapter skills for ingestion (mirrors current `AdapterWebhookController` logic)
- [x] T054 [US3] Verify demo server webhook controller (T040) correctly passes `platform` from URL path, `body` as payload, and `headers` to `hub.webhook.handle()`

**Checkpoint**: Webhook handling works end-to-end. New platforms can be added by registering a PlatformSkill — zero code changes needed.

---

## Phase 6: User Story 4 — CLI Base URL Support (Priority: P2)

**Goal**: Update the CLI init flow to accept arbitrary base URL paths and verify connectivity at that path.

**Independent Test**: Run `topichub-admin init`, enter `http://localhost:3000/api/v1` as the server URL, verify the CLI calls `http://localhost:3000/api/v1/health`.

### Implementation for User Story 4

- [x] T055 [US4] Update `packages/cli/src/commands/init/steps/server-url.ts`: strip trailing slash from user input, append `/health` to the full base URL (not just the host). Update success message to show the verified base URL
- [x] T056 [US4] Update `packages/cli/src/api-client/api-client.ts`: use the stored `serverUrl` as a base URL prefix for all API calls (not assuming root path). Ensure all endpoints like `/api/v1/topics` are appended to the base URL correctly
- [x] T057 [P] [US4] Update `packages/cli/src/config/config.schema.ts` if needed: ensure `serverUrl` validation accepts paths (not just host:port)

**Checkpoint**: CLI connects to TopicHub at arbitrary base URL paths. `topichub-admin health` works for both `http://localhost:3000` and `http://host:8080/api/experience/topichub`.

---

## Phase 7: User Story 5 — Independent Deployment Validation (Priority: P3)

**Goal**: Validate that `@topichub/core` can be installed and used in an external project directory. Ensure the package is publishable.

**Independent Test**: In a fresh directory outside the monorepo, `npm install @topichub/core`, import it, create a TopicHub instance, and verify basic operations.

### Implementation for User Story 5

- [x] T058 [US5] Add `prepublishOnly` script to `packages/core/package.json`: runs `pnpm build && pnpm test` before publishing
- [x] T059 [US5] Create `packages/core/README.md` with installation instructions, basic usage example (from quickstart.md), and API reference overview
- [x] T060 [US5] Verify `packages/core` can be packed (`pnpm pack`) and the resulting tarball contains all necessary files (`dist/`, `package.json`, `README.md`). Verify no `@nestjs/*` appears in the dependency tree
- [x] T061 [US5] Create integration test in `packages/core/test/integration/topichub-facade.test.ts`: test `TopicHub.create()` with `mongodb-memory-server`, ingest an event, list topics, execute a command, and shut down. This validates the full facade lifecycle without NestJS

**Checkpoint**: `@topichub/core` is ready for `npm publish`. The package works standalone without NestJS.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all packages

- [x] T062 [P] Verify zero `@nestjs/*` imports in `packages/core/`: run `rg "@nestjs" packages/core/src/` and confirm zero results (SC-003)
- [x] T063 [P] Verify `packages/core/src/` file count is smaller than original `packages/server/src/` (SC-006)
- [x] T064 Run full monorepo test suite: `pnpm test` — all packages must pass (SC-002)
- [x] T065 [P] Run `pnpm lint` across all packages — zero new warnings
- [x] T066 Update `packages/server/src/health.controller.ts` to include `@topichub/core` version in health response (so CLI can verify compatibility)
- [x] T067 Run quickstart.md examples mentally / as integration test to validate documented API matches implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 - Core Extraction (Phase 3)**: Depends on Foundational — must complete before US2
- **US2 - Demo Server (Phase 4)**: Depends on US1 (needs `@topichub/core` to exist)
- **US3 - Webhooks (Phase 5)**: Depends on US1 (core webhook handler must exist). Can run in parallel with US2
- **US4 - CLI (Phase 6)**: Independent of US1-US3 after Foundational. Can run in parallel with US1/US2
- **US5 - Deployment (Phase 7)**: Depends on US1 (package must be buildable)
- **Polish (Phase 8)**: Depends on US1 + US2 (both packages must be refactored)

### User Story Dependencies

- **US1 (P1)**: Foundational → US1 — no other story dependencies. **MVP target.**
- **US2 (P1)**: Foundational → US1 → US2 — sequential dependency on US1
- **US3 (P2)**: Foundational → US1 → US3 — can run in parallel with US2
- **US4 (P2)**: Foundational → US4 — independent of US1/US2/US3
- **US5 (P3)**: Foundational → US1 → US5 — can run in parallel with US2/US3

### Within Each User Story

- Models/entities before services
- Services before facade/handler
- Facade before controllers
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 2**: T007, T008, T009, T010, T011 can all run in parallel (different files)
- **Phase 3 (US1)**: T013–T018 (services) all in parallel; T019–T020 (AI) in parallel; T022–T023, T025, T027 (skill support) in parallel; T028–T030 (command) in parallel. Then sequential: T021, T024, T026, T031, T033, T034, T035
- **Phase 4 (US2)**: T038–T046 (controllers) all in parallel after T036+T037
- **Phase 5 (US3)**: T051, T053 in parallel
- **Phase 6 (US4)**: T055, T056, T057 — T055 and T057 in parallel
- **Cross-phase**: US4 (CLI) can run entirely in parallel with US1/US2/US3

---

## Parallel Example: User Story 1 (Core Extraction)

```bash
# Wave 1: All services in parallel (different files, no deps)
Task: T013 "Port TopicService to packages/core/src/services/topic.service.ts"
Task: T014 "Port TimelineService to packages/core/src/services/timeline.service.ts"
Task: T015 "Port TenantService to packages/core/src/services/tenant.service.ts"
Task: T016 "Port CryptoService to packages/core/src/services/crypto.service.ts"
Task: T017 "Port SearchService to packages/core/src/services/search.service.ts"
Task: T018 "Port DispatchService to packages/core/src/services/dispatch.service.ts"
Task: T019 "Port AI providers to packages/core/src/ai/"
Task: T020 "Port AiUsageService to packages/core/src/ai/ai-usage.service.ts"
Task: T022 "Port SkillLoader to packages/core/src/skill/registry/skill-loader.ts"
Task: T023 "Port SkillMdParser to packages/core/src/skill/registry/skill-md-parser.ts"
Task: T025 "Port SkillConfigService to packages/core/src/skill/config/"
Task: T027 "Port SkillAiRuntime to packages/core/src/skill/pipeline/"
Task: T028 "Port CommandParser to packages/core/src/command/command-parser.ts"
Task: T029 "Port CommandRouter to packages/core/src/command/command-router.ts"
Task: T030 "Port command handlers to packages/core/src/command/handlers/"
Task: T032 "Copy EventPayload to packages/core/src/ingestion/event-payload.ts"

# Wave 2: Services with cross-dependencies (after Wave 1)
Task: T021 "Port AiService to packages/core/src/ai/ai.service.ts"
Task: T024 "Port SkillRegistry to packages/core/src/skill/registry/skill-registry.ts"
Task: T026 "Port SkillPipeline to packages/core/src/skill/pipeline/skill-pipeline.ts"
Task: T031 "Port IngestionService to packages/core/src/ingestion/ingestion.service.ts"

# Wave 3: Facade (after Wave 2)
Task: T033 "Create WebhookHandler in packages/core/src/webhook/webhook-handler.ts"
Task: T034 "Create TopicHub facade in packages/core/src/topichub.ts"
Task: T035 "Create public API exports in packages/core/src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T006)
2. Complete Phase 2: Foundational (T007–T012)
3. Complete Phase 3: User Story 1 — Core Extraction (T013–T035)
4. **STOP and VALIDATE**: `pnpm --filter @topichub/core build` succeeds, `rg "@nestjs" packages/core/src/` returns zero results
5. Optionally deploy/demo the standalone core

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Core Extraction) → Validate core builds and works standalone → **MVP!**
3. US2 (Demo Server) → Validate all existing tests pass → Full backward compatibility
4. US3 (Webhooks) + US4 (CLI) → Can run in parallel → Enhanced integration
5. US5 (Deployment) → Package publishing ready
6. Polish → Ship it

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Core Extraction) — critical path
   - Developer B: US4 (CLI Base URL) — independent
3. After US1 completes:
   - Developer A: US2 (Demo Server Refactoring)
   - Developer B: US3 (Webhooks) or US5 (Deployment)
4. All converge for Polish phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The critical path is: Setup → Foundational → US1 → US2 → Polish
- US4 (CLI) is fully independent and can start immediately after Foundational
