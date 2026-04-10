# Tasks: Decouple Skill AI

**Input**: Design documents from `/specs/010-decouple-skill-ai/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story. US1 (Pipeline Decoupling) and US3 (Pipeline Without AI Dependencies) are combined into one phase as they share the same code changes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Add the `SkillInstructions` entity to the dispatch payload schema — required before any dispatch enrichment or prompt consumption work.

**⚠️ CRITICAL**: US4 (enriched dispatches) and the TaskProcessor update depend on this entity existing.

- [x] T001 Add `SkillInstructions` and `SkillFrontmatterSnapshot` embedded classes to `EnrichedPayload` in `packages/core/src/entities/task-dispatch.entity.ts`. Add fields: `primaryInstruction` (string, required), `fullBody` (string, required), `eventName` (string, optional), `frontmatter` (embedded object with `name`, `description`, optional `executor`, `maxTurns`, `allowedTools`, `topicType`). Add `skillInstructions` as an optional field on `EnrichedPayload` using `@prop({ type: () => SkillInstructions })`.

**Checkpoint**: Entity schema updated — dispatch enrichment and prompt consumption tasks can proceed.

---

## Phase 2: User Story 1 + 3 — Pipeline Decoupling (Priority: P1) 🎯 MVP

**Goal**: Remove all AI from the Skill pipeline so it runs without any AI dependency. The pipeline sequence becomes: type-skill hooks → task dispatch creation → bridge notifications. The server starts and operates correctly with `AI_ENABLED=false`.

**Independent Test**: Start the server with `AI_ENABLED=false`, create a topic that triggers a Skill with SKILL.md AI instructions, verify the pipeline creates a task dispatch and sends bridge notifications without errors. Verify no `AI_RESPONSE` timeline entry is created server-side.

### Implementation

- [x] T002 [US1] Remove `runSkillAi` from `SkillPipeline` in `packages/core/src/skill/pipeline/skill-pipeline.ts`: delete the `import { SkillAiRuntime }` import, remove the `skillAiRuntime` constructor parameter, remove the `await this.runSkillAi(...)` call from `execute()`, and delete the entire `runSkillAi()` private method. The constructor signature becomes `(registry, configService, dispatchService, logger, bridge)`.

- [x] T003 [P] [US3] Delete the `SkillAiRuntime` class file at `packages/core/src/skill/pipeline/skill-ai-runtime.ts`. Remove any re-exports of `SkillAiRuntime` from barrel files (check `packages/core/src/index.ts` or similar).

- [x] T004 [P] [US3] Remove `aiService` dependency from `SkillRegistry` in `packages/core/src/skill/registry/skill-registry.ts`: remove the `aiService` constructor parameter (and `AiCompletionPort` import), update `initSkill()` to remove `wantsAi` / `aiSvc` logic — always pass `{ aiService: null }` to `skill.init()` (or remove the aiService property from the init argument if no code skill uses it).

- [x] T005 [US1] Update `TopicHub.create()` wiring in `packages/core/src/topichub.ts`: remove the `SkillAiRuntime` import, delete the `SkillAiRuntime` construction block (lines ~365-371), update `SkillPipeline` constructor call to remove the `skillAiRuntime` parameter, update `SkillRegistry` constructor call to remove the `aiService` parameter. Ensure the `aiService` instance is still created and retained as a private field (it is used by standalone AI operations in Phase 3).

- [x] T006 [US3] Verify and update any references to `SkillAiRuntime` or `SkillMdProvider` interface in `packages/core/src/index.ts` (public exports). Remove exports of deleted types. Ensure `OPERATION_TO_EVENT` and `ParsedSkillMd` remain exported (needed by Phase 4 dispatch enrichment).

**Checkpoint**: Pipeline decoupled from AI. Server starts and processes topic lifecycle events without any AI calls. Existing `AI_RESPONSE` timeline entries remain readable (enum value preserved).

---

## Phase 3: User Story 2 — Standalone AI APIs (Priority: P1)

**Goal**: Expose dedicated server API endpoints for AI-powered topic management (summarization, free-form assistant). CLI commands invoke these endpoints on demand. Uses existing `AiService` with rate limits, circuit breaker, and usage tracking.

**Independent Test**: Start the server with `AI_ENABLED=true` and AI provider configured, create a topic with content, run `topichub-admin ai summarize <topic-id>`, verify the server returns a summary and creates a timeline entry. Run `topichub-admin ai ask <topic-id> "What are the key issues?"`, verify the answer and timeline entry.

### Implementation

- [x] T007 [US2] Add `AiOperations` interface and `get ai()` accessor to `TopicHub` in `packages/core/src/topichub.ts`. Define the interface with `summarize(tenantId: string, topicId: string): Promise<{ summary: string; model: string; usage: AiUsage; timelineEntryId: string }>` and `ask(tenantId: string, topicId: string, question: string): Promise<{ answer: string; model: string; usage: AiUsage; timelineEntryId: string }>`. Implement by: (1) fetching the topic via `topicService`, (2) assembling context (title, type, status, tags, metadata, recent timeline entries), (3) calling `aiService.complete()` with appropriate system/user prompts, (4) creating a timeline entry (`actionType: AI_RESPONSE`, `actor: 'ai:summarize'` or `'ai:assistant'`), (5) returning the result. Return 503-style errors (throw a custom error) when AI is unavailable, disabled, or rate-limited.

- [x] T008 [US2] Add `POST api/v1/ai/summarize` and `POST api/v1/ai/ask` endpoints to `ApiController` in `packages/server/src/api.controller.ts`. Both routes use the existing `tenant()` auth helper. `summarize` validates `topicId` from request body, calls `hub.ai.summarize(tenantId, topicId)`, returns `{ summary, model, usage, timelineEntryId }`. `ask` validates `topicId` and `question` (1–4096 chars) from request body, calls `hub.ai.ask(tenantId, topicId, question)`, returns `{ answer, model, usage, timelineEntryId }`. Map AI unavailability errors to HTTP 503 with structured error body per `contracts/api-endpoints.md`. Map topic not found to 404.

- [x] T009 [P] [US2] Add `summarize` subcommand to CLI in `packages/cli/src/commands/ai/index.ts`. Add a `case 'summarize':` block that: (1) extracts `topicId` from `args[0]`, (2) calls `api.post('/api/v1/ai/summarize', { topicId })`, (3) displays the summary text, timeline entry ID, model name, and token usage per the output format in `contracts/cli-commands.md`. Handle 404 (topic not found), 503 (AI unavailable), and other errors with clear messages.

- [x] T010 [P] [US2] Add `ask` subcommand to CLI in `packages/cli/src/commands/ai/index.ts`. Add a `case 'ask':` block that: (1) extracts `topicId` from `args[0]` and `question` from `args.slice(1).join(' ')`, (2) calls `api.post('/api/v1/ai/ask', { topicId, question })`, (3) displays the question, answer, timeline entry ID, model name, and token usage per the output format in `contracts/cli-commands.md`. Handle the same errors as `summarize`.

- [x] T011 [US2] Update the `default` case help text in `packages/cli/src/commands/ai/index.ts` to include `summarize` and `ask` in the usage message: `'Usage: topichub-admin ai <status|enable|disable|config|usage|run|summarize|ask>'`.

**Checkpoint**: Standalone AI APIs functional end-to-end. CLI can summarize topics and ask questions. Rate limiting and usage tracking work for standalone calls.

---

## Phase 4: User Story 4 — Enriched Dispatches (Priority: P2)

**Goal**: Task dispatches carry the Skill's SKILL.md instructions so local agents receive a self-contained package with everything needed for execution — instructions, topic snapshot, and event context.

**Independent Test**: Trigger a Skill with a SKILL.md containing event-specific sections (e.g., `## onTopicCreated`), inspect the created task dispatch document, verify `enrichedPayload.skillInstructions` contains the matched event section as `primaryInstruction`, the full body, the event name, and frontmatter fields. Also verify a Skill without SKILL.md creates a dispatch without `skillInstructions`.

### Implementation

- [x] T012 [US4] Enrich dispatch payload with SKILL.md instructions in `packages/core/src/skill/pipeline/skill-pipeline.ts`. In `createTaskDispatch()`, after resolving the type skill: (1) import `OPERATION_TO_EVENT` from `'../interfaces/skill-md'`, (2) call `this.registry.getSkillMd(typeSkill.manifest.name)`, (3) if parsed MD exists and `hasAiInstructions`, resolve the event-specific section: `const eventName = OPERATION_TO_EVENT[operation]; const primaryInstruction = parsedMd.eventPrompts.get(eventName) ?? parsedMd.systemPrompt;`, (4) build `skillInstructions: { primaryInstruction, fullBody: parsedMd.systemPrompt, eventName: parsedMd.eventPrompts.has(eventName) ? eventName : undefined, frontmatter: { name: parsedMd.frontmatter.name, description: parsedMd.frontmatter.description, executor: parsedMd.frontmatter.executor, maxTurns: parsedMd.frontmatter.maxTurns, allowedTools: parsedMd.frontmatter.allowedTools, topicType: parsedMd.frontmatter.topicType } }`, (5) add to `enrichedPayload` alongside `topic` and `event`. If no parsed MD or `!hasAiInstructions`, omit `skillInstructions`.

- [x] T013 [US4] Update `TaskProcessor.buildPrompt()` in `packages/cli/src/commands/serve/task-processor.ts` to consume `skillInstructions` from the dispatch payload. Before the existing `## Topic` section: (1) check `payload.skillInstructions?.primaryInstruction`, (2) if present, prepend `## Skill Instructions\n<primaryInstruction>`, (3) if `fullBody` differs from `primaryInstruction`, append `## Full Skill Context\n<fullBody>`, (4) if absent (backward compat with old dispatches), fall back to current behavior. Keep existing `## Topic` and `## Event` sections unchanged.

**Checkpoint**: Dispatches contain complete Skill context. Local agents (`serve` mode) receive and use SKILL.md instructions in their prompts. Old dispatches without `skillInstructions` continue to work.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, export verification, and backward compatibility confirmation.

- [x] T014 [P] Update `packages/core/src/index.ts` barrel exports: remove `SkillAiRuntime` and `SkillMdProvider` exports if present. Ensure `AiOperations` interface is exported for server use. Verify `OPERATION_TO_EVENT`, `ParsedSkillMd`, and all AI-related types (`AiService`, `AiResponse`, etc.) remain exported.

- [x] T015 Verify backward compatibility: confirm `TimelineActionType.AI_RESPONSE` enum value is unchanged in `packages/core/src/common/enums.ts` (no modification needed — just verify). Confirm existing `AI_RESPONSE` timeline entries in the database remain readable by the server and CLI without any migration.

- [x] T016 Run `npm test && npm run lint` across all packages (`packages/core`, `packages/server`, `packages/cli`) to verify no regressions. Fix any TypeScript compilation errors caused by removed types or changed constructor signatures.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately
- **Pipeline Decoupling (Phase 2)**: No dependency on Phase 1 (different files) — can start in parallel with Phase 1
- **Standalone AI APIs (Phase 3)**: Depends on Phase 2 T005 (TopicHub wiring update, since `get ai()` is added in the same file)
- **Enriched Dispatches (Phase 4)**: Depends on Phase 1 (entity) and Phase 2 T002 (pipeline already modified)
- **Polish (Phase 5)**: Depends on all previous phases

### User Story Dependencies

- **US1+US3 (Pipeline Decoupling)**: Can start immediately — no dependencies on other stories
- **US2 (Standalone AI)**: Depends on US1/US3 pipeline wiring update in `topichub.ts` (T005), since `get ai()` accessor is added to the same file
- **US4 (Enriched Dispatches)**: Depends on foundational entity (T001) and pipeline update (T002)

### Within Each User Story

- T002 before T005 (pipeline signature change before TopicHub wiring)
- T003, T004 can run in parallel with T002 (different files)
- T007 before T008 (core AI operations before server endpoints)
- T009, T010 can run in parallel (different switch cases, same file but additive)
- T012 before T013 (dispatch enrichment before prompt consumption)

### Parallel Opportunities

- Phase 1 (T001) and Phase 2 (T002, T003, T004) can run in parallel — different files, no dependencies
- Within Phase 2: T003 and T004 can run in parallel with T002 (different files)
- Within Phase 3: T009 and T010 can run in parallel (additive cases in same file)
- Phase 3 and Phase 4 can partially overlap — T012 only depends on T001+T002, not on Phase 3

---

## Parallel Example: Pipeline Decoupling (Phase 2)

```bash
# These three tasks modify different files and can run in parallel:
Task T002: "Remove runSkillAi from SkillPipeline in packages/core/src/skill/pipeline/skill-pipeline.ts"
Task T003: "Delete SkillAiRuntime file at packages/core/src/skill/pipeline/skill-ai-runtime.ts"
Task T004: "Remove aiService from SkillRegistry in packages/core/src/skill/registry/skill-registry.ts"

# Then T005 depends on T002 (updated constructor signature):
Task T005: "Update TopicHub wiring in packages/core/src/topichub.ts"
```

## Parallel Example: Standalone AI APIs (Phase 3)

```bash
# T007 must complete first (core AI operations):
Task T007: "Add AiOperations interface and get ai() accessor to TopicHub"

# Then T008 (server endpoints) and T009+T010 (CLI commands) can overlap:
Task T008: "Add POST api/v1/ai/summarize and api/v1/ai/ask endpoints"
Task T009: "Add summarize subcommand to CLI"  # parallel with T010
Task T010: "Add ask subcommand to CLI"         # parallel with T009
```

---

## Implementation Strategy

### MVP First (US1 + US3 Only)

1. Complete Phase 1: Foundational entity
2. Complete Phase 2: Pipeline Decoupling
3. **STOP and VALIDATE**: Server starts with `AI_ENABLED=false`, pipeline creates dispatches without AI calls
4. This is the minimum viable change — Skills are decoupled from server-side AI

### Incremental Delivery

1. Phase 1 + Phase 2 → Pipeline decoupled (MVP)
2. Add Phase 3 → Standalone AI APIs available (users can summarize/ask)
3. Add Phase 4 → Dispatches carry Skill instructions (local agents get full context)
4. Phase 5 → Clean up and verify
5. Each phase adds value without breaking previous phases

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US3 are combined into one phase because they share the same code changes (removing AI from pipeline = pipeline runs without AI dependencies)
- The `AiService` infrastructure is intentionally preserved — it powers standalone AI endpoints (US2)
- Backward compatibility is maintained: old dispatch payloads without `skillInstructions` work with the updated TaskProcessor
- Existing `AI_RESPONSE` timeline entries remain readable — no data migration needed
