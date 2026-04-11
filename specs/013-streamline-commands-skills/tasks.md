# Tasks: Streamline Commands & Skills

**Input**: Design documents from `specs/013-streamline-commands-skills/`  
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md

**Organization**: Tasks grouped by user story. User stories map to spec.md priorities. This is a subtractive refactor — most tasks involve removing/modifying existing code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US7)

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this is a refactor of an existing monorepo. Phase 1 ensures the spec artifacts are accessible.

- [x] T001 Verify specs 011 and 012 prerequisites are merged or in progress on current branch
- [x] T002 Review existing test coverage for files that will be modified: `packages/core/src/command/command-parser.ts`, `packages/core/src/webhook/webhook-handler.ts`, `packages/core/src/bridge/openclaw-bridge.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core command parsing changes that ALL user stories depend on. Must complete before any IM or CLI story work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Update `CommandParser` to remove `/topichub` prefix stripping — if input starts with `/topichub`, return `{ action: 'topichub', args: {} }` as a rejectable action in `packages/core/src/command/command-parser.ts`
- [x] T004 Update `normalizeImCommandMessage` to detect any `/`-prefixed command after stripping @-mentions (replace hardcoded `/topichub` and `/answer` search with generic `/` command detection) in `packages/core/src/bridge/openclaw-bridge.ts`
- [x] T005 Add `use` to `GLOBAL_COMMANDS` array and add `topichub` to rejection handling in `CommandRouter.route()` in `packages/core/src/command/command-router.ts`

**Checkpoint**: Parser accepts short-form commands and rejects `/topichub` prefix

---

## Phase 3: User Story 1 — Simplified IM Commands Without Prefix (Priority: P1) 🎯 MVP

**Goal**: IM users issue commands directly (`/create`, `/show`, etc.) without `/topichub` prefix after @-mentioning the bot

**Independent Test**: @-mention bot, send `/create bug`, verify topic created. Send `/topichub create bug`, verify rejection with guidance message.

### Implementation for User Story 1

- [x] T006 [US1] Add `/help` bypass in `handleOpenClaw` — execute help handler before identity resolution gate when parsed action is `help` in `packages/core/src/webhook/webhook-handler.ts`
- [x] T007 [US1] Replace `/topichub register` string check with `/register <code>` parsing — extract pairing code from `result.rawCommand` in `packages/core/src/webhook/webhook-handler.ts`
- [x] T008 [US1] Replace `/topichub unregister` string check with `/unregister` in `packages/core/src/webhook/webhook-handler.ts`
- [x] T009 [US1] Add unbound user rejection — if `resolveUserByPlatform` returns null and action is not `help`/`register`, send "register first" message per contracts/im-commands.md error responses in `packages/core/src/webhook/webhook-handler.ts`
- [x] T010 [US1] Add executor busy rejection (FR-022) — after binding resolution, check `executorMeta.maxConcurrentAgents` vs active dispatches; reject if at capacity in `packages/core/src/webhook/webhook-handler.ts`
- [x] T011 [US1] Update `formatOpenClawCommandReply` help text — replace all `/topichub` references with short-form commands per contracts/im-commands.md in `packages/core/src/webhook/webhook-handler.ts`
- [x] T012 [US1] Update `HelpHandler.execute()` — change command list to use short-form syntax (`/create`, `/show`, etc.) in `packages/core/src/command/handlers/help.handler.ts`
- [x] T013 [US1] Add `/topichub` prefix rejection handler — return error message per FR-004: "Commands no longer use the `/topichub` prefix. Try `/help`." in `packages/core/src/webhook/webhook-handler.ts`

**Checkpoint**: All 13 IM commands work without prefix. `/help` works without binding. `/topichub` rejected.

---

## Phase 4: User Story 6 — Complete IM Command Set with New Syntax (Priority: P1)

**Goal**: Enumerate and verify the final set of 13 IM commands all work correctly

**Independent Test**: Issue each of the 13 listed commands via IM and verify processing

### Implementation for User Story 6

- [x] T014 [US6] Verify all 13 IM commands are recognized by `CommandRouter`: `create`, `update`, `assign`, `show`, `timeline`, `reopen`, `history`, `search`, `help`, `use`, `register`, `unregister` + `/answer` in `packages/core/src/command/command-router.ts`
- [x] T015 [US6] Add `/use` command dispatch logic — parse skill name from first arg, include in dispatch meta for executor in `packages/core/src/webhook/webhook-handler.ts`

**Checkpoint**: Complete IM command surface verified

---

## Phase 5: User Story 3 — Simplified Skill Lifecycle (Priority: P1)

**Goal**: Reduce skill lifecycle to create + publish only. Remove install/enable/disable/setup/config/uninstall commands.

**Independent Test**: Run `skill create`, verify scaffold. Run `skill install`, verify "unknown command." Run `publish <path>`, verify skill published.

### Implementation for User Story 3

- [x] T016 [P] [US3] Remove `list`, `install`, `enable`, `disable`, `setup`, `config`, `uninstall` cases from `handleSkillCommand` switch — update default case to show only `create` in usage in `packages/cli/src/commands/skill/index.ts`
- [x] T017 [P] [US3] Simplify `SkillRegistry.isTypeAvailable` — remove `tenant_skill_configs` enabled check; treat all registered skills as available in `packages/core/src/skill/registry/skill-registry.ts`
- [x] T018 [P] [US3] Deprecate `SkillConfigService` — add deprecation notice or remove tenant_skill_configs queries in `packages/core/src/skill/config/skill-config.service.ts`
- [x] T019 [US3] Update `publish` command — remove dependency on `.topichub-repo.json` for publishing; accept `<path>` argument directly pointing to a skill directory with SKILL.md in `packages/cli/src/commands/publish/index.ts`

**Checkpoint**: Skill lifecycle is create + publish only. Registry no longer checks enabled status.

---

## Phase 6: User Story 2 — Superadmin-Only Identity Management (Priority: P1)

**Goal**: Restrict identity CRUD to superadmin; add `identity me` for regular users.

**Independent Test**: Run `identity create` with regular token — rejected. Run `identity me` with regular token — returns own details.

### Implementation for User Story 2

- [x] T020 [P] [US2] Add `GET /api/v1/identity/me` endpoint — extract `topichubUserId` from Bearer token, return identity details + active executor count in `packages/server/src/api.controller.ts`
- [x] T021 [P] [US2] Add `getIdentityDetails(topichubUserId)` method to `IdentityService` — return display name, unique ID, status, active executor count in `packages/core/src/identity/identity.service.ts`
- [x] T022 [US2] Add `me` subcommand to `handleIdentityCommand` — call `GET /api/v1/identity/me` with caller's token and display results in `packages/cli/src/commands/identity/index.ts`
- [x] T023 [US2] Add client-side superadmin check in `handleIdentityCommand` — for `create`, `list`, `revoke`, `regenerate-token` subcommands, verify token role before making API call; reject with "superadmin only" error in `packages/cli/src/commands/identity/index.ts`
- [x] T024 [US2] Verify all `POST/GET /api/v1/admin/identities*` endpoints call `requireSuperadmin(req)` in `packages/server/src/api.controller.ts`

**Checkpoint**: Identity management access control enforced. `identity me` works for all users.

---

## Phase 7: User Story 7 — Streamlined CLI Command Surface (Priority: P1)

**Goal**: Remove dead CLI commands, add `topic create`, update usage output.

**Independent Test**: Run `topichub-admin` with no args — usage lists only retained commands. Run `health` — "unknown command."

### Implementation for User Story 7

- [x] T025 [US7] Remove switch cases for `stats`, `health`, `skill-repo`, `group`, `link`, `unlink`, `auth` from main CLI entry in `packages/cli/src/index.tsx`
- [x] T026 [US7] Add `topic` case routing to new topic command handler in `packages/cli/src/index.tsx`
- [x] T027 [P] [US7] Create `handleTopicCommand` with `create` subcommand — reuse group create logic with `topic` naming; accept `--platform`, `--channel`, `--type` args in `packages/cli/src/commands/topic/index.ts`
- [x] T028 [US7] Update default case usage output to list only retained commands per FR-021 in `packages/cli/src/index.tsx`
- [x] T029 [P] [US7] Delete `packages/cli/src/commands/health.ts`
- [x] T030 [P] [US7] Delete `packages/cli/src/commands/stats.ts`
- [x] T031 [P] [US7] Delete `packages/cli/src/commands/skill-repo/` directory
- [x] T032 [P] [US7] Delete `packages/cli/src/commands/group/` directory
- [x] T033 [P] [US7] Delete `packages/cli/src/commands/link/` directory
- [x] T034 [P] [US7] Delete `packages/cli/src/commands/unlink/` directory

**Checkpoint**: CLI surface matches FR-021 exactly. Dead files removed.

---

## Phase 8: User Story 4 — Topic Creation Replaces Group Management (Priority: P2)

**Goal**: `topic create` CLI command works, `group create` is gone.

**Independent Test**: Run `topic create bug --platform discord --channel general`, verify topic created. Run `group create` — "unknown command."

### Implementation for User Story 4

- [x] T035 [US4] Verify `handleTopicCommand` (from T027) creates topics via the same API as `group create` — reuse `POST /admin/groups` or create new `POST /api/v1/topics` endpoint in `packages/cli/src/commands/topic/index.ts`
- [x] T036 [US4] Update error message for removed `group` command to suggest `topic create` instead — add a helpful redirect if `group` is attempted in `packages/cli/src/index.tsx`

**Checkpoint**: `topic create` works. `group` fully removed.

---

## Phase 9: User Story 5 — Removal of Monitoring Commands (Priority: P3)

**Goal**: `health` and `stats` CLI commands removed. Monitoring consolidated to Skill Center dashboard.

**Independent Test**: Run `health` — "unknown command." Run `stats` — "unknown command."

### Implementation for User Story 5

- [x] T037 [US5] Verify `health` and `stats` cases are removed from CLI entry (done in T025) and files deleted (T029, T030) in `packages/cli/src/index.tsx`
- [x] T038 [US5] Verify server `/health` API endpoint still exists for infrastructure monitoring (load balancers, uptime checks) in `packages/server/src/api.controller.ts`

**Checkpoint**: CLI monitoring commands removed. Server health endpoint preserved for infra.

---

## Phase 10: Pairing Flow Reversal (Cross-cutting — US1 + Security)

**Goal**: Executor generates pairing code. IM user registers with `/register <code>`. 1:N executor→IM binding.

**Independent Test**: Start `serve` → see pairing code. In IM, `/register <code>` → binding created. Send `/create` → dispatched to correct executor.

### Implementation for Pairing Flow

- [x] T039 Update `pairing_codes` entity — make `platform`/`platformUserId`/`channel` optional (remove `required: true`); add `topichubUserId` (required string) and `executorClaimToken` (required string) fields in `packages/core/src/identity/pairing-code.entity.ts`
- [x] T040 Add `generateExecutorPairingCode(topichubUserId, executorClaimToken)` method to `IdentityService` — creates pairing code record with executor's identity, no IM fields in `packages/core/src/identity/identity.service.ts`
- [x] T041 Update `claimPairingCode` in `IdentityService` — accept `(platform, platformUserId, code)` from IM side; validate code, resolve `topichubUserId` from code record, upsert `user_identity_binding` with executor's identity in `packages/core/src/identity/identity.service.ts`
- [x] T042 Add `POST /api/v1/executors/pairing-code` endpoint — requires executor token auth; calls `generateExecutorPairingCode`; returns `{ code, expiresAt }` in `packages/server/src/api.controller.ts`
- [x] T043 Update `serve` command — after executor registration, call `POST /api/v1/executors/pairing-code`; display code with instructions "Enter in IM: /register <code>" in `packages/cli/src/commands/serve/index.ts`
- [x] T044 Update `handleRegister` in `WebhookHandler` — extract code from `/register <code>` command; call updated `claimPairingCode(platform, userId, code)`; send success/error message in `packages/core/src/webhook/webhook-handler.ts`
- [x] T045 Remove `POST /api/v1/identity/link` endpoint from server in `packages/server/src/api.controller.ts`
- [x] T046 Remove `POST /api/v1/identity/unlink` endpoint from server in `packages/server/src/api.controller.ts`

**Checkpoint**: Pairing flow fully reversed. Executor originates code. IM consumes it. Old link/unlink endpoints removed.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, consistency checks, documentation

- [x] T047 [P] Update all error messages in webhook handler referencing old commands/flow to use new terminology per contracts/im-commands.md in `packages/core/src/webhook/webhook-handler.ts`
- [x] T048 [P] Remove any remaining `tenantId` references in modified files (if spec 011 not fully applied yet) across `packages/core/src/`
- [x] T049 [P] Update `packages/core/src/index.ts` exports — remove any re-exports of deleted services/entities
- [x] T050 Remove `tenant_skill_configs` queries from `topichub.ts` provider setup if present in `packages/core/src/topichub.ts`
- [x] T051 Update `packages/server/src/topichub.provider.ts` — remove link/unlink wiring, add pairing-code and identity/me wiring
- [x] T052 [P] Update README.md — document new IM command syntax, CLI commands, and pairing flow
- [x] T053 Run full test suite and fix any regressions from removed code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — MVP target
- **US6 (Phase 4)**: Depends on Phase 3 (command parsing changes)
- **US3 (Phase 5)**: Depends on Phase 2 only — can parallel with US1
- **US2 (Phase 6)**: Depends on Phase 2 only — can parallel with US1
- **US7 (Phase 7)**: Depends on Phase 2 only — can parallel with US1
- **US4 (Phase 8)**: Depends on Phase 7 (topic command created there)
- **US5 (Phase 9)**: Depends on Phase 7 (monitoring commands removed there)
- **Pairing (Phase 10)**: Depends on Phase 3 (webhook changes) — can start after US1
- **Polish (Phase 11)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: After Foundational — no story dependencies
- **US6 (P1)**: After US1 (verifies command set US1 established)
- **US3 (P1)**: After Foundational — independent of US1
- **US2 (P1)**: After Foundational — independent of US1
- **US7 (P1)**: After Foundational — independent of US1
- **US4 (P2)**: After US7 (topic command created in CLI cleanup)
- **US5 (P3)**: After US7 (monitoring removed in CLI cleanup)

### Parallel Opportunities

```
After Phase 2 (Foundational) completes:
  ├── US1 (IM commands)        ─── can start
  ├── US3 (Skill lifecycle)    ─── can start in parallel
  ├── US2 (Identity access)    ─── can start in parallel
  └── US7 (CLI cleanup)        ─── can start in parallel

After US1 completes:
  └── US6 (Verify IM set)      ─── can start
  └── Phase 10 (Pairing)       ─── can start

After US7 completes:
  ├── US4 (Topic create)       ─── can start
  └── US5 (Monitoring removal) ─── can start
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (parser changes)
3. Complete Phase 3: US1 (IM commands without prefix)
4. **STOP and VALIDATE**: All 13 IM commands work, `/topichub` rejected, `/help` works unbound
5. This alone delivers the most visible user-facing improvement

### Incremental Delivery

1. Setup + Foundational → Parser ready
2. US1 → IM commands streamlined → Test independently (MVP!)
3. US3 + US2 + US7 in parallel → Skill/identity/CLI cleanup
4. US6 → Verify complete IM surface
5. Phase 10 → Pairing flow reversed (highest-risk change)
6. US4 + US5 → Topic naming + monitoring removal
7. Polish → Final cleanup and docs

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- This is predominantly a **subtractive refactor** — 34 of 53 tasks involve removing or simplifying code
- The **pairing flow reversal** (Phase 10) is the only high-risk area with new logic
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
