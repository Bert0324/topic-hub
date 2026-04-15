# Tasks: Local Agent Executor

**Input**: Design documents from `/specs/003-local-agent-executor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (api.md, mcp-tools.md, cli-commands.md, sse-events.md), quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Server**: `packages/server/src/`
- **CLI**: `packages/cli/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and create directory scaffolding for new modules

- [x] T001 Install new CLI dependencies (`@inquirer/prompts`, `@modelcontextprotocol/sdk`, `eventsource`, `@types/eventsource`) in `packages/cli/package.json`
- [x] T002 [P] Create directory structure for new CLI modules: `commands/init/steps/`, `commands/serve/`, `executors/`, `mcp/tools/`, `config/`
- [x] T003 [P] Create directory structure for new server module: `dispatch/entities/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, entities, and shared modules that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Add `DispatchStatus` enum (`unclaimed`, `claimed`, `completed`, `failed`) and dispatch-related event types to `packages/server/src/common/enums.ts`
- [x] T005 [P] Create `TaskDispatch` Typegoose entity with `EnrichedPayload`, `TopicSnapshot`, `EventContext`, and `AiClassification` embedded schemas and compound indexes per data-model.md in `packages/server/src/dispatch/entities/task-dispatch.entity.ts`
- [x] T006 [P] Create zod config schema (`serverUrl`, `tenantId`, `executor`, `skillsDir`) in `packages/cli/src/config/config.schema.ts`
- [x] T007 [P] Create config read/write module (load from `~/.topichub/config.json`, validate with zod, write atomically) in `packages/cli/src/config/config.ts`
- [x] T008 [P] Create `AgentExecutor` interface with `execute(prompt, systemPrompt, mcpConfigPath, options)` → `Promise<ExecutionResult>` and `ExecutionResult` type in `packages/cli/src/executors/executor.interface.ts`
- [x] T009 Update API client to resolve `baseUrl` and auth token from local config + keychain in `packages/cli/src/api-client/api-client.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 4 — Remote Server Dispatches Tasks (Priority: P1)

**Goal**: The remote server creates structured task dispatches after AI classification, exposes REST+SSE endpoints for CLI consumption, and enforces claim/lock semantics to prevent duplicate processing.

**Independent Test**: Send a webhook to the remote server, verify a `task_dispatches` document is created with enriched payload, claim it via the REST API, and confirm SSE emits a `dispatch` event.

### Implementation for User Story 4

- [x] T010 [P] [US4] Implement `DispatchService` with `create`, `findUnclaimed`, `claim` (atomic `findOneAndUpdate`), `complete`, `fail`, and `releaseExpired` methods in `packages/server/src/dispatch/dispatch.service.ts`
- [x] T011 [US4] Implement `DispatchController` with `GET /api/v1/dispatches`, `POST /api/v1/dispatches/:id/claim`, `POST /api/v1/dispatches/:id/complete`, `POST /api/v1/dispatches/:id/fail` per contracts/api.md in `packages/server/src/dispatch/dispatch.controller.ts`
- [x] T012 [P] [US4] Implement `DispatchSseController` with `GET /api/v1/dispatches/stream` SSE endpoint (tenant-filtered, heartbeat every 30s, `Last-Event-ID` support) per contracts/sse-events.md in `packages/server/src/dispatch/dispatch-sse.controller.ts`
- [x] T013 [US4] Create `DispatchModule` registering service, controllers, and entity in `packages/server/src/dispatch/dispatch.module.ts` and register it in the app module
- [x] T014 [US4] Integrate dispatch creation into skill pipeline — after server-side AI classification, call `DispatchService.create()` with enriched payload (topic snapshot + event context + AI classification) in `packages/server/src/skill/pipeline/skill-pipeline.ts`
- [x] T015 [US4] Add scheduled claim expiry release — periodic job (every 60s) calls `DispatchService.releaseExpired()` to unlock stale claims and re-increment retry count in `packages/server/src/dispatch/dispatch.service.ts`

**Checkpoint**: Remote server creates dispatches from skill pipeline, exposes REST+SSE for CLI consumption, claim/lock mechanism prevents duplicates

---

## Phase 4: User Story 3 — AI Agent Selection (Priority: P1)

**Goal**: Users can choose between Claude Code and Codex as their AI agent backend. The system auto-detects installed agents, supports per-session and per-Skill overrides, and provides a unified executor abstraction.

**Independent Test**: Instantiate each executor type, verify the correct CLI command is built, mock subprocess invocation, and confirm output parsing works for both JSON (Claude) and JSONL (Codex) formats.

### Implementation for User Story 3

- [x] T016 [P] [US3] Create agent detector that checks PATH for `claude` and `codex` binaries, extracts version info, and returns available executors in `packages/cli/src/executors/detector.ts`
- [x] T017 [P] [US3] Create Claude Code executor implementing `AgentExecutor` — builds `claude -p "<prompt>" --append-system-prompt-file <skill.md> --output-format json --bare --mcp-config <path>`, spawns subprocess, parses JSON output in `packages/cli/src/executors/claude-code.executor.ts`
- [x] T018 [P] [US3] Create Codex executor implementing `AgentExecutor` — builds `codex exec "<prompt>" --json --ephemeral`, spawns subprocess, parses JSONL output to extract final result in `packages/cli/src/executors/codex.executor.ts`
- [x] T019 [US3] Create executor factory with resolution order (Skill frontmatter → CLI flag → env `TOPICHUB_EXECUTOR` → config file → auto-detect) in `packages/cli/src/executors/executor-factory.ts`

**Checkpoint**: Executor abstraction is complete — any command can request an executor and get the correct agent backend

---

## Phase 5: User Story 2 — Interactive Init (Priority: P1)

**Goal**: Users run `topichub-admin init` to configure their local environment through an interactive step-by-step flow with validation gates at each step.

**Independent Test**: Run `topichub-admin init`, complete all prompts (mocking remote server responses), verify `~/.topichub/config.json` is created with correct values. Re-run and verify defaults are pre-populated.

### Implementation for User Story 2

- [x] T020 [P] [US2] Create server URL step — prompt for URL, validate connection via `GET /health`, display server version in `packages/cli/src/commands/init/steps/server-url.ts`
- [x] T021 [P] [US2] Create admin token step — password prompt, validate token against remote server, store in encrypted keychain in `packages/cli/src/commands/init/steps/admin-token.ts`
- [x] T022 [P] [US2] Create tenant selection step — fetch tenants using validated token, present numbered selection list in `packages/cli/src/commands/init/steps/tenant-select.ts`
- [x] T023 [P] [US2] Create executor selection step — use detector to find installed agents, present selection list with version info, include `none` option in `packages/cli/src/commands/init/steps/executor-select.ts`
- [x] T024 [P] [US2] Create skills directory step — prompt with default `~/.topichub/skills/`, validate or create directory in `packages/cli/src/commands/init/steps/skills-dir.ts`
- [x] T025 [US2] Create init command handler orchestrating all steps sequentially with current-value defaults on re-run in `packages/cli/src/commands/init/index.ts`
- [x] T026 [US2] Register `init` command in CLI router in `packages/cli/src/index.tsx`

**Checkpoint**: Users can fully configure their local environment via `topichub-admin init`

---

## Phase 6: User Story 1 — Serve Loop (Priority: P1) 🎯 MVP

**Goal**: `topichub-admin serve` connects to the remote server, consumes task dispatches via SSE + polling, claims them, loads local SKILL.md, dispatches to the configured agent, and writes results back to the server timeline. Real-time terminal status shows activity.

**Independent Test**: Start `topichub-admin serve` with a configured agent (mock), create a topic via the remote server API, verify the local serve process detects the event, invokes the agent, and writes the result back as a timeline entry.

### Implementation for User Story 1

- [x] T027 [P] [US1] Create SSE event consumer — connect to `/api/v1/dispatches/stream`, handle `dispatch`/`heartbeat`/`error` events, implement reconnection with exponential backoff, poll `GET /dispatches?status=unclaimed` on startup for catch-up in `packages/cli/src/commands/serve/event-consumer.ts`
- [x] T028 [P] [US1] Create Ink status display component — show connection state, tenant/executor info, scrolling event log with timestamps and status icons, summary counters, uptime per contracts/cli-commands.md in `packages/cli/src/commands/serve/status-display.tsx`
- [x] T029 [US1] Create task processor — claim dispatch via API, load SKILL.md from local skills dir (parse frontmatter with gray-matter for executor/allowedTools/maxTurns), assemble prompt from enriched payload + event-specific SKILL.md section, invoke executor, handle timeout (configurable, default 5min), write result back via `POST /dispatches/:id/complete` or `POST /dispatches/:id/fail`, write timeline entry via API in `packages/cli/src/commands/serve/task-processor.ts`
- [x] T030 [US1] Create serve command handler — validate config, resolve executor, initialize event consumer + task processor + status display, wire event→process→display pipeline, handle Ctrl+C graceful shutdown (wait for in-flight agent up to 30s) in `packages/cli/src/commands/serve/index.ts`
- [x] T031 [US1] Register `serve` command with `--executor` flag in CLI router in `packages/cli/src/index.tsx`
- [x] T032 [US1] Add config validation guard — shared utility that checks `~/.topichub/config.json` existence and completeness, exits with "Run `topichub-admin init` first" message, used by `serve` and `ai run` commands in `packages/cli/src/config/config.ts`

**Checkpoint**: Full event-driven execution loop works end-to-end — remote dispatch → local claim → agent execution → result write-back. This is the MVP.

---

## Phase 7: User Story 5 — MCP Tools for Agents (Priority: P2)

**Goal**: Agents can access topic-hub data during execution via MCP tool calls (`get_topic`, `search_topics`, `update_topic`, `add_timeline_entry`, `list_signals`), enabling multi-step reasoning and structured updates.

**Independent Test**: Start serve with MCP enabled, trigger a Skill that instructs the agent to search for related topics, verify the agent calls the MCP search tool and results appear in the response.

### Implementation for User Story 5

- [x] T033 [P] [US5] Create MCP server setup using `@modelcontextprotocol/sdk` with stdio transport, tool registration, and server lifecycle in `packages/cli/src/mcp/mcp-server.ts`
- [x] T034 [P] [US5] Create `get_topic` MCP tool handler per contracts/mcp-tools.md in `packages/cli/src/mcp/tools/get-topic.ts`
- [x] T035 [P] [US5] Create `search_topics` MCP tool handler per contracts/mcp-tools.md in `packages/cli/src/mcp/tools/search-topics.ts`
- [x] T036 [P] [US5] Create `update_topic` MCP tool handler per contracts/mcp-tools.md in `packages/cli/src/mcp/tools/update-topic.ts`
- [x] T037 [P] [US5] Create `add_timeline_entry` MCP tool handler per contracts/mcp-tools.md in `packages/cli/src/mcp/tools/add-timeline-entry.ts`
- [x] T038 [P] [US5] Create `list_signals` MCP tool handler per contracts/mcp-tools.md in `packages/cli/src/mcp/tools/list-signals.ts`
- [x] T039 [US5] Integrate MCP config generation into executor invocations — write temporary `mcp-config.json` with topichub server definition, pass via `--mcp-config` flag, respect `allowedTools` from SKILL.md frontmatter in `packages/cli/src/executors/claude-code.executor.ts` and `packages/cli/src/executors/codex.executor.ts`

**Checkpoint**: Agents can interactively query and update topic-hub data during execution via MCP tools

---

## Phase 8: User Story 6 — One-Off Agent Run (Priority: P3)

**Goal**: Users can run a single agent task against a specific topic without a persistent serve process, useful for testing Skills and manual re-analysis.

**Independent Test**: Run `topichub-admin ai run <topic-id> --skill bug-triage`, verify the agent is invoked with the correct Skill instructions, and the result appears on the topic's timeline.

### Implementation for User Story 6

- [x] T040 [US6] Create `ai run` command handler — load config, fetch topic from remote server, load local SKILL.md, invoke executor, write result to timeline, print summary per contracts/cli-commands.md in `packages/cli/src/commands/ai/index.ts`
- [x] T041 [US6] Register `ai run <topic-id> --skill <name> [--executor <type>]` subcommand in CLI router in `packages/cli/src/index.tsx`

**Checkpoint**: Users can execute one-off agent tasks for testing and manual intervention

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T042 [P] Add comprehensive error messages for common failure modes (agent not installed, server unreachable, token expired, skill not found) across CLI modules
- [x] T043 [P] Add SKILL.md frontmatter parsing utility (gray-matter) for `executor`, `allowedTools`, `maxTurns` fields with backward-compatible defaults in `packages/cli/src/commands/serve/task-processor.ts`
- [x] T044 Code cleanup — ensure all new modules have barrel exports (`index.ts`) and consistent error handling patterns
- [x] T045 Run quickstart.md validation — walk through the full quickstart flow end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US4 (Phase 3)**: Depends on Foundational — server-side only, can start immediately after Phase 2
- **US3 (Phase 4)**: Depends on Foundational — CLI executor abstraction, can start in parallel with US4
- **US2 (Phase 5)**: Depends on Foundational + US3 (executor detector) — can start once T016 is done
- **US1 (Phase 6)**: Depends on US4 + US3 + US2 — the core integration point
- **US5 (Phase 7)**: Depends on US1 (executor invocations must exist to integrate MCP config)
- **US6 (Phase 8)**: Depends on US3 (executor) + US2 (config) — reuses task processing logic from US1
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
  ├── US4 (Phase 3) ─────────────────────────────┐
  ├── US3 (Phase 4) ──┬── US2 (Phase 5) ─────────┤
  │                    │                           ├── US1 (Phase 6) ── US5 (Phase 7)
  │                    └── US6 (Phase 8) ──────────┘
```

- **US4 + US3**: Can run in parallel after Foundational
- **US2**: Can start once US3's detector (T016) is complete
- **US1**: Requires US4, US3, and US2 to be complete — this is the integration story
- **US5**: Enhances US1 — can only start after US1's executor invocations work
- **US6**: Reuses patterns from US1 but only requires US3 + config from US2

### Within Each User Story

- Entities/schemas before services
- Services before controllers
- Controllers before module registration
- Parallel tasks ([P]) target different files with no shared state

### Parallel Opportunities

- **Phase 2**: T004, T005, T006, T007, T008 can all run in parallel (different packages/files)
- **Phase 3 + Phase 4**: US4 (server) and US3 (CLI executors) can run entirely in parallel
- **Phase 4**: T016, T017, T018 can run in parallel (different executor files)
- **Phase 5**: T020–T024 (init steps) can all run in parallel (independent step files)
- **Phase 7**: T033–T038 (MCP tools) can all run in parallel (independent tool handlers)

---

## Parallel Example: Phases 3 + 4 (Server + CLI in parallel)

```bash
# Server-side (US4) — one developer:
Task: T010 "DispatchService in packages/server/src/dispatch/dispatch.service.ts"
Task: T012 "DispatchSseController in packages/server/src/dispatch/dispatch-sse.controller.ts"

# CLI-side (US3) — another developer (or agent):
Task: T016 "Agent detector in packages/cli/src/executors/detector.ts"
Task: T017 "Claude Code executor in packages/cli/src/executors/claude-code.executor.ts"
Task: T018 "Codex executor in packages/cli/src/executors/codex.executor.ts"
```

## Parallel Example: Phase 5 (Init steps)

```bash
# All init steps can be written simultaneously:
Task: T020 "Server URL step in packages/cli/src/commands/init/steps/server-url.ts"
Task: T021 "Admin token step in packages/cli/src/commands/init/steps/admin-token.ts"
Task: T022 "Tenant selection step in packages/cli/src/commands/init/steps/tenant-select.ts"
Task: T023 "Executor selection step in packages/cli/src/commands/init/steps/executor-select.ts"
Task: T024 "Skills directory step in packages/cli/src/commands/init/steps/skills-dir.ts"
```

---

## Implementation Strategy

### MVP First (Phases 1–6)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phases 3 + 4 in parallel: Server dispatches (US4) + Executor abstraction (US3)
4. Complete Phase 5: Interactive init (US2)
5. Complete Phase 6: Serve loop (US1)
6. **STOP and VALIDATE**: Full end-to-end flow — webhook → dispatch → claim → agent → result

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US4 + US3 → Server dispatches + executors ready
3. US2 → Init configured → can now test partial flows
4. US1 → **MVP!** Full serve loop works end-to-end
5. US5 → MCP tools enable richer agent behavior
6. US6 → One-off runs for dev/testing convenience
7. Polish → Error handling, cleanup, quickstart validation

### Suggested MVP Scope

Phases 1–6 (Setup through US1). This delivers the complete core loop: remote server dispatches tasks, local CLI consumes them, executes via agent, writes results back. MCP tools (US5) and one-off runs (US6) are enhancements.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Server and CLI can be developed in parallel (US4 and US3+US2 target different packages)
- Research decisions (R1–R8 in research.md) inform implementation choices within tasks
