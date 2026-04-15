# Tasks: Topic Hub App

**Input**: Design documents from `specs/001-topic-hub-app/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Note**: Phase 1 (Setup), Phase 2 (Foundational), Phase 3 (Skill System), Phase 4 (Commands), Phase 5 (Ingestion), Phase 6 (Admin + CLI), Phase 7 (Search), Phase 8 (Timeline/History), and Phase 9 (Polish) were previously implemented. All source files exist. This task list reflects the CURRENT state: most tasks are complete, with remaining work on the auth model update (OAuth2 PKCE + JWKS) and final validation.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (COMPLETE)

- [x] T001 Create monorepo structure: `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`
- [x] T002 [P] Initialize `packages/server` with NestJS 10, Typegoose, Mongoose, zod, jest, mongodb-memory-server
- [x] T003 [P] Initialize `packages/cli` with Ink 5, React 18, pastel, jest
- [x] T004 [P] Create `docker-compose.yml` with MongoDB 7 + server + skills volume
- [x] T005 [P] Configure ESLint + Prettier at root
- [x] T006 [P] Create `.gitignore`, `.dockerignore`
- [x] T007 Configure turborepo (`turbo.json`)

---

## Phase 2: Foundational (COMPLETE)

- [x] T008 Create database connection module in `packages/server/src/database/database.module.ts`
- [x] T009 [P] Create AES-256 encryption service in `packages/server/src/crypto/`
- [x] T010 [P] Create enums in `packages/server/src/common/enums.ts`
- [x] T011 [P] Create Tenant entity in `packages/server/src/tenant/entities/tenant.entity.ts`
- [x] T012 Create TenantService in `packages/server/src/tenant/tenant.service.ts`
- [x] T013 Create TenantGuard in `packages/server/src/tenant/tenant.guard.ts`
- [x] T014 Create TenantModule in `packages/server/src/tenant/tenant.module.ts`
- [x] T015 [P] Create Topic entity in `packages/server/src/core/entities/topic.entity.ts`
- [x] T016 [P] Create TimelineEntry entity in `packages/server/src/core/entities/timeline-entry.entity.ts`
- [x] T017 Create TopicService in `packages/server/src/core/services/topic.service.ts`
- [x] T018 Create TimelineService in `packages/server/src/core/services/timeline.service.ts`
- [x] T019 Create CoreModule in `packages/server/src/core/core.module.ts`
- [x] T020 Create HealthController in `packages/server/src/health.controller.ts`
- [x] T021 Create AppModule in `packages/server/src/app.module.ts`

---

## Phase 3: US6 — Skills Define Topic Types (COMPLETE)

- [x] T022 [P] [US6] Define TypeSkill interface in `packages/server/src/skill/interfaces/type-skill.ts`
- [x] T023 [P] [US6] Define PlatformSkill interface in `packages/server/src/skill/interfaces/platform-skill.ts`
- [x] T024 [P] [US6] Define AuthSkill interface in `packages/server/src/skill/interfaces/auth-skill.ts`
- [x] T025 [P] [US6] Define AdapterSkill interface in `packages/server/src/skill/interfaces/adapter-skill.ts`
- [x] T026 [P] [US6] Define SetupContext interface in `packages/server/src/skill/interfaces/setup-context.ts`
- [x] T027 [US6] Create barrel export in `packages/server/src/skill/interfaces/index.ts`
- [x] T028 [US6] Create SkillRegistration entity in `packages/server/src/skill/entities/skill-registration.entity.ts`
- [x] T029 [US6] Create TenantSkillConfig entity in `packages/server/src/skill/entities/tenant-skill-config.entity.ts`
- [x] T030 [US6] Create SkillLoader in `packages/server/src/skill/registry/skill-loader.ts`
- [x] T031 [US6] Create SkillRegistry in `packages/server/src/skill/registry/skill-registry.ts`
- [x] T032 [US6] Create SkillConfigService in `packages/server/src/skill/config/skill-config.service.ts`
- [x] T033 [US6] Create SkillPipeline in `packages/server/src/skill/pipeline/skill-pipeline.ts`
- [x] T034 [US6] Create SkillModule in `packages/server/src/skill/skill.module.ts`

---

## Phase 4: US1 — Create Topics from IM (COMPLETE)

- [x] T035 [US1] Create command parser in `packages/server/src/command/parser/command-parser.ts`
- [x] T036 [US1] Create command router in `packages/server/src/command/router/command-router.ts`
- [x] T037 [US1] Create create handler in `packages/server/src/command/handlers/create.handler.ts`
- [x] T038 [US1] Create update handler in `packages/server/src/command/handlers/update.handler.ts`
- [x] T039 [US1] Create assign handler in `packages/server/src/command/handlers/assign.handler.ts`
- [x] T040 [US1] Create help handler in `packages/server/src/command/handlers/help.handler.ts`
- [x] T041 [US1] Create reopen handler in `packages/server/src/command/handlers/reopen.handler.ts`
- [x] T042 [US1] Create command controller in `packages/server/src/command/command.controller.ts`
- [x] T043 [US1] Create webhook controller in `packages/server/src/command/webhook.controller.ts`
- [x] T044 [US1] Create CommandModule in `packages/server/src/command/command.module.ts`

---

## Phase 5: US2 — Ingest Events via API (COMPLETE)

- [x] T045 [US2] Create event payload DTO in `packages/server/src/ingestion/dto/event-payload.dto.ts`
- [x] T046 [US2] Create IngestionService in `packages/server/src/ingestion/ingestion.service.ts`
- [x] T047 [US2] Create IngestionController in `packages/server/src/ingestion/ingestion.controller.ts`
- [x] T048 [US2] Create adapter webhook controller in `packages/server/src/ingestion/adapter-webhook.controller.ts`
- [x] T049 [US2] Create IngestionModule in `packages/server/src/ingestion/ingestion.module.ts`

---

## Phase 6: US5 — Admin API + CLI (COMPLETE)

- [x] T050 [US5] Create AdminService in `packages/server/src/admin/admin.service.ts`
- [x] T051 [US5] Create AdminController in `packages/server/src/admin/admin.controller.ts`
- [x] T052 [US5] Create AdminModule in `packages/server/src/admin/admin.module.ts`
- [x] T053 [US5] Create AuthService in `packages/server/src/auth/auth.service.ts`
- [x] T054 [US5] Create AuthController in `packages/server/src/auth/auth.controller.ts`
- [x] T055 [US5] Create AuthModule in `packages/server/src/auth/auth.module.ts`
- [x] T056 [US5] Create CLI API client in `packages/cli/src/api-client/api-client.ts`
- [x] T057 [US5] Create CLI auth module in `packages/cli/src/auth/auth.ts`
- [x] T058 [US5] Create CLI skill commands in `packages/cli/src/commands/skill/index.ts`
- [x] T059 [US5] Create CLI tenant commands in `packages/cli/src/commands/tenant/index.ts`
- [x] T060 [US5] Create CLI stats command in `packages/cli/src/commands/stats.ts`
- [x] T061 [US5] Create CLI health command in `packages/cli/src/commands/health.ts`
- [x] T062 [US5] Create CLI entry point in `packages/cli/src/index.tsx`

---

## Phase 7: US3 — Search (COMPLETE)

- [x] T063 [US3] Create SearchService in `packages/server/src/search/search.service.ts`
- [x] T064 [US3] Create SearchController in `packages/server/src/search/search.controller.ts`
- [x] T065 [US3] Create SearchModule in `packages/server/src/search/search.module.ts`

---

## Phase 8: US4 — Timeline + History (COMPLETE)

- [x] T066 [US4] Create show handler in `packages/server/src/command/handlers/show.handler.ts`
- [x] T067 [US4] Create timeline handler in `packages/server/src/command/handlers/timeline.handler.ts`
- [x] T068 [US4] Create history handler in `packages/server/src/command/handlers/history.handler.ts`
- [x] T069 [US4] Create TopicDetailController in `packages/server/src/core/topic-detail.controller.ts`

---

## Phase 9: Polish (COMPLETE)

- [x] T070 Create structured JSON logger in `packages/server/src/common/logger.ts`
- [x] T071 Create global exception filter in `packages/server/src/common/http-exception.filter.ts`
- [x] T072 Update main.ts with logger + exception filter in `packages/server/src/main.ts`

---

## Phase 10: Auth Model Update — OAuth2 PKCE + JWKS (NEW)

**Purpose**: Update the auth system from simple token-based to OAuth2 PKCE + ID Token + JWKS verification per Session 10 clarification. User credentials stay local (OS keychain); server verifies identity via JWT/JWKS.

### Server-side JWKS verification

- [x] T073 [US5] Add `jsonwebtoken` and `jwks-rsa` dependencies to `packages/server/package.json`
- [x] T074 [US5] Create JWKS verification service in `packages/server/src/auth/jwks.service.ts` — configure JWKS clients per IM platform (Feishu, Slack JWKS endpoints), verify JWT ID tokens, extract user identity claims
- [x] T075 [US5] Update AuthService in `packages/server/src/auth/auth.service.ts` — add `verifyIdToken(idToken: string): Promise<UserIdentity>` method using JwksService, remove any raw token storage logic
- [x] T076 [US5] Update AuthController in `packages/server/src/auth/auth.controller.ts` — add `POST /auth/verify` endpoint (accepts ID token, returns verified identity), add `GET /auth/jwks-config` (returns supported IM platform JWKS URLs)
- [x] T077 [US5] Create JWT auth guard in `packages/server/src/auth/jwt-auth.guard.ts` — NestJS guard that extracts Bearer ID token from Authorization header, verifies via JwksService, sets user identity on request

### CLI-side OAuth2 PKCE + keychain

- [x] T078 [US5] Add `keytar` (or `@aspect-build/keytar`) dependency to `packages/cli/package.json` for OS keychain access
- [x] T079 [US5] Create keychain storage module in `packages/cli/src/auth/keychain.ts` — store/retrieve/delete tokens in OS keychain (macOS Keychain, Linux libsecret, Windows Credential Manager), encrypted file fallback for headless environments
- [x] T080 [US5] Create OAuth2 PKCE flow in `packages/cli/src/auth/pkce.ts` — generate code verifier + challenge (SHA256), open browser to IM platform authorize endpoint with PKCE params, start local HTTP callback server, exchange auth code + verifier for tokens
- [x] T081 [US5] Update CLI auth module in `packages/cli/src/auth/auth.ts` — `topichub-admin login` now runs OAuth2 PKCE flow, stores ID token + access token in keychain. `topichub-admin auth <token>` for tenant admin tokens also stored in keychain.
- [x] T082 [US5] Update CLI API client in `packages/cli/src/api-client/api-client.ts` — load ID token from keychain, send as Bearer in Authorization header. Never send raw access/refresh tokens to server.

### Integration

- [x] T083 Update AuthSkill interface in `packages/server/src/skill/interfaces/auth-skill.ts` — `AuthorizeParams.user` is now `UserIdentity` (verified via JWKS, includes `verified: boolean`)
- [x] T084 Update SkillPipeline in `packages/server/src/skill/pipeline/skill-pipeline.ts` — pass verified `UserIdentity` from JWT guard to Auth Skill's `authorize()` method
- [x] T085 Update `packages/server/src/auth/auth.module.ts` — import JwksService, export JwtAuthGuard

### Tests

- [ ] T086 [P] Write unit test for JWKS verification in `packages/server/test/unit/jwks.service.spec.ts`
- [ ] T087 [P] Write unit test for PKCE flow in `packages/cli/test/pkce.spec.ts`
- [ ] T088 [P] Write unit test for keychain storage in `packages/cli/test/keychain.spec.ts`
- [ ] T089 Write integration test for auth flow in `packages/server/test/integration/auth-flow.spec.ts`

**Checkpoint**: `topichub-admin login` opens browser for OAuth2 PKCE, stores tokens in OS keychain. Server verifies ID token via JWKS. Auth Skill receives verified UserIdentity. Raw user tokens never stored server-side.

---

## Phase 11: Final Validation

- [ ] T090 Verify all server modules compile: `pnpm --filter server build`
- [ ] T091 Verify CLI compiles: `pnpm --filter cli build`
- [x] T092 Verify README.md is up to date with OAuth2 PKCE auth model
- [ ] T093 Run full test suite: `pnpm test`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1-9**: COMPLETE — all implementation done
- **Phase 10**: Auth model update — can start immediately
- **Phase 11**: Depends on Phase 10

### Within Phase 10

- T073 (deps) → T074-T077 (server JWKS) — sequential
- T078 (deps) → T079-T082 (CLI PKCE + keychain) — sequential, can parallel with server tasks
- T083-T085 (integration) — depends on both server + CLI auth done
- T086-T089 (tests) — [P] can parallel after implementation

### Parallel Opportunities

- Server JWKS tasks (T074-T077) can run in parallel with CLI PKCE tasks (T079-T082)
- All test tasks (T086-T089) are [P]
- Phase 11 validation tasks can parallel after Phase 10

---

## Implementation Strategy

### Current State

Phases 1-9 complete: 72 tasks done. The full application is implemented:
- Server: 59 TypeScript files across 11 modules
- CLI: 7 TypeScript files with all admin commands
- Config: Docker Compose, ESLint, Prettier, turborepo

### Remaining Work (Phase 10-11)

21 tasks for the auth model update:
- 5 server-side tasks (JWKS verification, auth guard, endpoints)
- 5 CLI-side tasks (keychain, OAuth2 PKCE, login flow)
- 3 integration tasks (connect JWKS to pipeline)
- 4 test tasks
- 4 validation tasks

---

## Notes

- No SDK package — Skill interfaces live in server
- No reference Skills — skills/ starts empty, added via CLI
- User credentials NEVER leave the local machine (OS keychain)
- Server verifies identity via JWT/JWKS — provably secure
- 93 total tasks, 72 complete, 21 remaining
