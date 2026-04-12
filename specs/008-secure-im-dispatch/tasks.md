# Tasks: Secure IM Dispatch

**Input**: Design documents from `/specs/008-secure-im-dispatch/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the spec. Test tasks are omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create all new entities, types, and config schema changes shared across stories

- [x] T001 [P] Create UserIdentityBinding entity in packages/core/src/entities/user-identity-binding.entity.ts with Typegoose decorators, indexes per data-model.md
- [x] T002 [P] Create PairingCode entity in packages/core/src/identity/pairing-code.entity.ts with TTL index, Typegoose decorators per data-model.md
- [x] T003 [P] Create ExecutorHeartbeat entity in packages/core/src/entities/executor-heartbeat.entity.ts with unique compound index per data-model.md
- [x] T004 [P] Create QaExchange entity in packages/core/src/entities/qa-exchange.entity.ts with status enum and indexes per data-model.md
- [x] T005 [P] Create identity types and zod schemas in packages/core/src/identity/identity-types.ts (PairingCodeSchema, LinkRequestSchema, UnlinkRequestSchema, identity constants)
- [x] T006 Add targetUserId, sourceChannel, sourcePlatform optional fields to TaskDispatch entity in packages/core/src/entities/task-dispatch.entity.ts
- [x] T007 Add SUSPENDED value to DispatchStatus enum in packages/core/src/common/enums.ts
- [x] T008 Add maxConcurrentAgents field to CLI config schema in packages/cli/src/config/config.schema.ts (default: 1, min: 1, max: 10)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core services that MUST be complete before any user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Implement IdentityService in packages/core/src/identity/identity.service.ts — pairing code generation (6-char alphanumeric), code validation, binding CRUD, user resolution by platform+platformUserId, user resolution by claimToken
- [x] T010 Implement HeartbeatService in packages/core/src/services/heartbeat.service.ts — register executor (with active-check + force flag), heartbeat update, deregister, isAvailable check, stale heartbeat cleanup
- [x] T011 [P] Implement QaService in packages/core/src/services/qa.service.ts — create question, find pending by dispatchId, find pending by userId, submit answer, timeout handling (reminder + suspend)
- [x] T012 Extend DispatchService.findUnclaimed() in packages/core/src/services/dispatch.service.ts to accept optional targetUserId filter; add findUnclaimedForUser() method that filters by targetUserId
- [x] T013 Wire IdentityService, HeartbeatService, QaService into TopicHub facade in packages/core/src/topichub.ts — expose identity, heartbeat, qa operation interfaces
- [x] T014 Export new types and services from packages/core/src/index.ts

**Checkpoint**: Foundation ready — all services available via TopicHub facade

---

## Phase 3: User Story 1 — Bind IM Identity to Local Executor (P1) 🎯 MVP

**Goal**: Users can register their IM identity via pairing code and link it to their local CLI

**Independent Test**: Send `/topichub register` in IM, receive pairing code, run `topichub-admin link <code>`, verify binding exists in DB

### Implementation for User Story 1

- [x] T015 [US1] Add `/topichub register` command handling in packages/core/src/webhook/webhook-handler.ts — call IdentityService.generatePairingCode(), reply via OpenClaw bridge with ephemeral message containing the code
- [x] T016 [US1] Add `/topichub unregister` command handling in packages/core/src/webhook/webhook-handler.ts — call IdentityService.deactivateBinding(), cancel pending dispatches, reply with confirmation
- [x] T017 [US1] Add identity API endpoints in packages/server/src/api.controller.ts — POST /api/v1/identity/link (validate code, create binding), POST /api/v1/identity/unlink (remove binding)
- [x] T018 [US1] Create `topichub-admin link <code>` CLI command in packages/cli/src/commands/link/index.ts — load config+token, call POST /api/v1/identity/link, display success/error
- [x] T019 [US1] Create `topichub-admin unlink` CLI command in packages/cli/src/commands/unlink/index.ts — optional --platform/--user flags, call POST /api/v1/identity/unlink, display summary
- [x] T020 [US1] Register link and unlink commands in CLI entry point packages/cli/src/index.tsx — add case branches for 'link' and 'unlink'
- [x] T021 [US1] Wire TopicHubService in packages/server/src/topichub.provider.ts to expose identity operations to the controller

**Checkpoint**: Users can register, link, and unlink IM identities. Pairing codes expire automatically via TTL.

---

## Phase 4: User Story 4 — One-Way Communication: Local Polls Remote (P1)

**Goal**: CLI heartbeat, single-executor enforcement, and executor registration via outbound-only communication

**Independent Test**: Start `topichub-admin serve`, verify heartbeats appear in DB. Start a second instance, verify it exits with error. Use `--force` to override.

### Implementation for User Story 4

- [x] T022 [US4] Add executor API endpoints in packages/server/src/api.controller.ts — POST /api/v1/executors/register, POST /api/v1/executors/heartbeat, POST /api/v1/executors/deregister
- [x] T023 [US4] Modify serve startup in packages/cli/src/commands/serve/index.ts — resolve topichubUserId from claimToken, call POST /api/v1/executors/register before starting event consumer, handle 409 Conflict (print error and exit), support --force flag
- [x] T024 [US4] Add heartbeat timer to serve command in packages/cli/src/commands/serve/index.ts — send POST /api/v1/executors/heartbeat every 30 seconds, stop on SIGINT/SIGTERM
- [x] T025 [US4] Add graceful shutdown to serve command in packages/cli/src/commands/serve/index.ts — call POST /api/v1/executors/deregister on clean exit, clear heartbeat timer

**Checkpoint**: Single-executor enforced. Heartbeats tracked. Clean shutdown deregisters executor.

---

## Phase 5: User Story 2 — IM Command Dispatches to User's Own Local CLI (P1)

**Goal**: IM commands create user-scoped dispatches that only the correct user's CLI can see and claim

**Independent Test**: User A sends IM command → dispatch has targetUserId → User A's CLI picks it up → User B's CLI never sees it. Unregistered user gets registration prompt.

### Implementation for User Story 2

- [x] T026 [US2] Add identity resolution to OpenClaw webhook handler in packages/core/src/webhook/webhook-handler.ts — resolve topichubUserId from platform+platformUserId before creating dispatch; if no binding found, reply with registration instructions (FR-015)
- [x] T027 [US2] Set targetUserId, sourceChannel, sourcePlatform on dispatches created from IM commands in packages/core/src/webhook/webhook-handler.ts
- [x] T028 [US2] Modify EventConsumer in packages/cli/src/commands/serve/event-consumer.ts — pass topichubUserId when polling (catch-up GET and SSE stream) so server filters by targetUserId
- [x] T029 [US2] Modify dispatch claim validation in packages/core/src/services/dispatch.service.ts — reject claims where claimToken's user doesn't match targetUserId (FR-004)
- [x] T030 [US2] Add dispatch lifecycle IM notifications in packages/core/src/webhook/webhook-handler.ts — send IM messages for created/claimed/completed/failed events via OpenClaw bridge (FR-016)
- [x] T031 [US2] Modify SSE stream endpoint in packages/server/src/api.controller.ts to resolve topichubUserId from auth token and filter dispatches by targetUserId

**Checkpoint**: Full user-scoped dispatch flow works end-to-end. Unregistered users get prompted.

---

## Phase 6: User Story 3 — Detect Missing Local Executor and Prompt User (P1)

**Goal**: When a registered user sends a command but their CLI is offline, the system notifies them in IM

**Independent Test**: Registered user with no running CLI sends IM command → receives "Your local agent is not running" message within 15 seconds.

### Implementation for User Story 3

- [x] T032 [US3] Add executor availability check to IM command handling in packages/core/src/webhook/webhook-handler.ts — after identity resolution, check HeartbeatService.isAvailable(topichubUserId); if unavailable, reply via OpenClaw with startup instructions (FR-006)
- [x] T033 [US3] Implement unclaimed dispatch reminder background job in packages/core/src/services/dispatch.service.ts — periodic check for dispatches unclaimed >2 minutes with targetUserId set; send follow-up IM notification via OpenClaw bridge (FR-007)
- [x] T034 [US3] Wire unclaimed reminder timer in packages/core/src/topichub.ts — start/stop the periodic check on init/destroy

**Checkpoint**: Users with offline CLIs get immediate notification. Stale dispatches get follow-up reminders.

---

## Phase 7: User Story 5 — Multi-Agent Parallel Execution (P2)

**Goal**: Local CLI processes multiple dispatches concurrently using separate agent subprocesses

**Independent Test**: Queue 3 dispatches, set maxConcurrentAgents: 3, verify all 3 process simultaneously.

### Implementation for User Story 5

- [x] T035 [US5] Refactor TaskProcessor in packages/cli/src/commands/serve/task-processor.ts — change from single-task processing to a concurrency pool with configurable max slots; use a semaphore/queue pattern; each slot runs an independent agent subprocess
- [x] T036 [US5] Update serve command in packages/cli/src/commands/serve/index.ts — read maxConcurrentAgents from config (or --max-agents flag), pass to TaskProcessor constructor, update status display with concurrent task count
- [x] T037 [US5] Include executorMeta.maxConcurrentAgents in executor registration payload sent to POST /api/v1/executors/register from packages/cli/src/commands/serve/index.ts

**Checkpoint**: Parallel execution works. Multiple agents run concurrently up to configured limit.

---

## Phase 8: User Story 6 — IM-Relayed Q&A for Interactive Execution (P2)

**Goal**: Agent questions are relayed to IM; user answers with `/answer` prefix; answers delivered back to agent

**Independent Test**: Trigger a skill with a confirmation step → question appears in IM → reply with `/answer yes` → agent resumes.

### Implementation for User Story 6

- [x] T038 [US6] Add `/answer` prefix handling to OpenClaw webhook handler in packages/core/src/webhook/webhook-handler.ts — parse `/answer <text>`, resolve user identity, find most recent pending QaExchange for that user, store answer via QaService.submitAnswer()
- [x] T039 [US6] Add Q&A API endpoints in packages/server/src/api.controller.ts — POST /api/v1/dispatches/:id/question (create QaExchange + relay to IM), GET /api/v1/dispatches/:id/qa?status=answered (poll for answered exchanges)
- [x] T040 [US6] Create QA relay module in packages/cli/src/commands/serve/qa-relay.ts — post question to server, poll for answer every 3 seconds, return answer text when received, handle timeout (dispatch suspended)
- [x] T041 [US6] Integrate QA relay into TaskProcessor in packages/cli/src/commands/serve/task-processor.ts — detect agent Q&A need, call qa-relay to post question and await answer, inject answer into agent subprocess (via stdin or MCP response)
- [x] T042 [US6] Implement Q&A timeout background job in packages/core/src/services/qa.service.ts — periodic check: pending >5min without reminderSentAt → send reminder via OpenClaw; pending >10min → set timed_out + suspend dispatch
- [x] T043 [US6] Wire Q&A timeout timer in packages/core/src/topichub.ts — start/stop the periodic timeout check on init/destroy
- [x] T044 [US6] Add `/answer #N <text>` reference routing support in packages/core/src/webhook/webhook-handler.ts — parse optional sequence number to route answer to specific pending question when multiple are active

**Checkpoint**: Full Q&A relay loop works. Timeouts send reminders then suspend. Multi-question routing supported.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T045 [P] Update packages/skills/AGENTS.md with secure dispatch registration flow and /answer prefix documentation
- [x] T046 [P] Update .cursor/skills/writing-topic-hub/SKILL.md with identity binding and Q&A exchange patterns
- [x] T047 Validate full quickstart.md flow end-to-end (register → link → serve → IM command → Q&A → result)
- [x] T048 [P] Add input sanitization for all new zod schemas — ensure pairing codes, answer text, and question text are properly bounded and escaped

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T008) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (T009-T014) — identity service needed
- **US4 (Phase 4)**: Depends on Foundational (T010) — heartbeat service needed
- **US2 (Phase 5)**: Depends on US1 (identity binding) + US4 (heartbeat/executor registration)
- **US3 (Phase 6)**: Depends on US4 (heartbeat availability check) + US2 (dispatch creation with targetUserId)
- **US5 (Phase 7)**: Depends on Foundational only — can start after Phase 2, independent of identity
- **US6 (Phase 8)**: Depends on US2 (dispatches exist) + QaService from Foundational
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — No dependencies on other stories
- **US4 (P1)**: Can start after Foundational — No dependencies on other stories. Can parallelize with US1.
- **US2 (P1)**: Depends on US1 (identity resolution) and US4 (executor registration)
- **US3 (P1)**: Depends on US4 (heartbeat) and US2 (dispatch with targetUserId)
- **US5 (P2)**: Can start after Foundational — Independent of identity stories
- **US6 (P2)**: Depends on US2 (dispatches exist with sourceChannel for reply routing)

### Within Each User Story

- Entities/types before services
- Services before API endpoints
- API endpoints before CLI commands
- Webhook handling integrated last (touches multiple layers)

### Parallel Opportunities

- **Phase 1**: All 8 setup tasks (T001-T008) can run in parallel — all different files
- **Phase 2**: T009, T010, T011 can run in parallel (different services). T012 depends on T009 being aware of targetUserId semantics. T013-T014 are sequential (wiring).
- **Phase 3 + Phase 4**: US1 and US4 can run in parallel after Foundational
- **Phase 7**: US5 can start as soon as Phase 2 completes — no dependency on identity stories
- **Phase 9**: All polish tasks can run in parallel

---

## Parallel Example: Phase 1 (Setup)

```bash
# All entity creation tasks run simultaneously:
Task T001: "Create UserIdentityBinding entity"
Task T002: "Create PairingCode entity"
Task T003: "Create ExecutorHeartbeat entity"
Task T004: "Create QaExchange entity"
Task T005: "Create identity types and zod schemas"
```

## Parallel Example: Phase 3 + Phase 4 (US1 + US4)

```bash
# US1 and US4 can run in parallel after Foundational:
# Developer A: US1 (identity binding flow)
Task T015: "Add /topichub register command handling"
Task T017: "Add identity API endpoints"
Task T018: "Create link CLI command"

# Developer B: US4 (heartbeat + single-executor)
Task T022: "Add executor API endpoints"
Task T023: "Modify serve startup with executor check"
Task T024: "Add heartbeat timer"
```

---

## Implementation Strategy

### MVP First (US1 + US4 + US2)

1. Complete Phase 1: Setup (all entities + types)
2. Complete Phase 2: Foundational (core services)
3. Complete Phase 3: US1 (identity binding — pairing code flow)
4. Complete Phase 4: US4 (heartbeat + single-executor enforcement)
5. Complete Phase 5: US2 (user-scoped dispatch)
6. **STOP and VALIDATE**: Register via IM → link CLI → send IM command → verify only your CLI picks it up

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 + US4 → Identity binding + heartbeat (independently testable)
3. Add US2 → User-scoped dispatch (full secure flow!)
4. Add US3 → Missing executor detection (UX improvement)
5. Add US5 → Multi-agent parallel execution (throughput)
6. Add US6 → Q&A relay (interactivity)
7. Polish → Docs, validation, security hardening

---

## Notes

- [P] tasks = different files, no dependencies
- [US*] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The `/answer` prefix handling (US6) should also update OpenClaw bridge's inbound processing to recognize the new prefix alongside `/topichub`
