# Tasks: AI-Driven Skills

**Input**: Design documents from `/specs/002-ai-driven-skills/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — Constitution mandates tests for all features (§II Testing Standards).

**Organization**: Tasks grouped by user story. US2 and US3 are already implemented in the codebase; their phases contain only verification tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Server**: `packages/server/src/`
- **CLI**: `packages/cli/src/`
- **Tests**: `packages/server/test/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add new dependency and create shared type definitions

- [x] T001 Add `gray-matter` dependency to `packages/server/package.json` via `pnpm --filter @topichub/server add gray-matter` and add `@types/gray-matter` as devDependency
- [x] T002 [P] Create SKILL.md type definitions in `packages/server/src/skill/interfaces/skill-md.ts` — export `ParsedSkillMd`, `SkillMdFrontmatter`, `TopicSnapshot`, `EventContext`, `SkillAiUserPrompt`, `SkillAiResult`, `KNOWN_LIFECYCLE_EVENTS`, `OPERATION_TO_EVENT` per contracts/ai-service-request.ts
- [x] T003 [P] Add `AI_RESPONSE = 'ai_response'` to `TimelineActionType` enum in `packages/server/src/common/enums.ts`

**Checkpoint**: Dependencies installed, shared types available, enum extended.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core SKILL.md parser and entity changes that MUST be complete before US1 implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement `SkillMdParser` in `packages/server/src/skill/registry/skill-md-parser.ts` — `parse(filePath: string): ParsedSkillMd | null` using gray-matter for frontmatter extraction, regex-based `## onXxx` heading extraction for event sections, zod validation for frontmatter (name: max 64 chars lowercase+hyphens, description: max 1024 chars non-empty). Preamble (content before first event heading) is included in the default systemPrompt. Event-specific prompts use preamble + section content. Unknown headings treated as regular content. Returns `null` on invalid/missing frontmatter with warning logged.
- [x] T005 [P] Add `skillMd` field to `SkillRegistration` entity in `packages/server/src/skill/entities/skill-registration.entity.ts` — optional `@prop({ type: () => mongoose.Schema.Types.Mixed })` field typed as `SkillMdData | null`, containing `name`, `description`, `systemPrompt`, `eventPrompts` (Record<string,string>), `hasAiInstructions` (boolean). Default `null`.
- [x] T006 [P] Write unit tests for `SkillMdParser` in `packages/server/test/unit/skill-md-parser.spec.ts` — test cases: valid SKILL.md with frontmatter + body, SKILL.md with event-specific sections (## onTopicCreated, ## onTopicUpdated), SKILL.md with preamble + event sections (verify preamble included in event prompts), empty body (hasAiInstructions=false), missing frontmatter (returns null), invalid frontmatter name (too long, wrong chars → null), unknown ## headings (treated as regular content), no SKILL.md file (returns null)

**Checkpoint**: Foundation ready — SKILL.md parser tested and entity schema updated. US1 implementation can begin.

---

## Phase 3: User Story 1 — Skill Uses AI via Natural-Language Instructions (Priority: P1) 🎯 MVP

**Goal**: When a Skill has a `SKILL.md`, the runtime auto-injects its NL instructions as the system prompt into `AiService.complete()` on lifecycle events. AI responses are appended to the topic timeline and stored in topic metadata.

**Independent Test**: Load a test-only Skill fixture with a `SKILL.md`, create a topic, verify the AI-generated response appears in the topic timeline as an `ai_response` entry and in `metadata._ai.{skillName}`.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Write unit tests for `SkillAiRuntime` in `packages/server/test/unit/skill-ai-runtime.spec.ts` — test cases: (1) executeIfApplicable with valid ParsedSkillMd + mock AiService returns non-null → verify timeline entry created with AI_RESPONSE actionType and metadata updated under `_ai.{skillName}`, (2) executeIfApplicable when AiService returns null → verify no timeline entry or metadata update, (3) event-specific section selected when matching ## heading exists, (4) fallback to full body when no matching event section, (5) skill with no AI instructions (hasAiInstructions=false) → no AiService call, (6) system prompt constructed from SKILL.md content + user prompt from serialized topic snapshot + event context JSON
- [x] T008 [P] [US1] Write integration test for SKILL.md pipeline in `packages/server/test/integration/skill-ai-pipeline.spec.ts` — test with mongodb-memory-server: (1) register a test skill with SKILL.md, create a topic, verify timeline contains ai_response entry and topic metadata has `_ai.testSkill`, (2) register a skill WITHOUT SKILL.md, create a topic, verify no ai_response timeline entry (zero impact), (3) when AiService is unavailable (AI_ENABLED=false), verify pipeline completes normally with no AI entries

### Implementation for User Story 1

- [x] T009 [US1] Extend `SkillLoader.scanDirectory()` in `packages/server/src/skill/registry/skill-loader.ts` — after reading `package.json`, check if `SKILL.md` exists in the skill directory. If found, read its contents. Add `skillMdPath?: string` and `skillMdContent?: string` to `SkillManifestInfo` interface. Return these alongside existing fields.
- [x] T010 [US1] Extend `SkillRegistry` in `packages/server/src/skill/registry/skill-registry.ts` — (1) inject `SkillMdParser`, (2) in `loadAll()` after loading skill: if `manifest.skillMdContent` exists, call `SkillMdParser.parse()` and store result, (3) add in-memory cache `Map<string, ParsedSkillMd>` for parsed SKILL.md content (keyed by skill name), (4) persist `skillMd` field to `SkillRegistration` document on upsert, (5) add `getSkillMd(skillName: string): ParsedSkillMd | null` method for runtime lookup
- [x] T011 [US1] Implement `SkillAiRuntime` in `packages/server/src/skill/pipeline/skill-ai-runtime.ts` — injectable NestJS service with method `async executeIfApplicable(tenantId: string, skillName: string, operation: string, topicData: any, actor: string, extra?: Record<string, unknown>): Promise<void>`. Steps: (1) look up ParsedSkillMd via SkillRegistry.getSkillMd(), (2) if null or hasAiInstructions=false → return, (3) map operation to event name via OPERATION_TO_EVENT, (4) select system prompt: eventPrompts[eventName] ?? systemPrompt, (5) build TopicSnapshot from topicData (serialize _id, dates to ISO strings), (6) build EventContext, (7) construct AiServiceRequest with system message (SKILL.md content) + user message (JSON of {event, topic}), (8) call AiService.complete(), (9) if response non-null: create TimelineEntry with actionType=AI_RESPONSE, actor=`ai:{skillName}`, payload={skillName, content, model, usage}; update topic metadata at `_ai.{skillName}` with {content, model, timestamp}
- [x] T012 [US1] Register `SkillAiRuntime` and `SkillMdParser` as providers in `packages/server/src/skill/skill.module.ts` — add both to providers array. SkillAiRuntime depends on SkillRegistry, AiService, and needs access to Topic/TimelineEntry models (import CoreModule or inject models directly).
- [x] T013 [US1] Integrate `SkillAiRuntime` into `SkillPipeline` in `packages/server/src/skill/pipeline/skill-pipeline.ts` — (1) inject `SkillAiRuntime` via constructor, (2) in `execute()`, after `runTypeSkillHook()` call `runSkillAi()`, (3) implement `private async runSkillAi(tenantId, operation, topicData, actor, extra)` that resolves the type skill name from topicData.type, then calls `skillAiRuntime.executeIfApplicable()`. Wrap in try/catch — AI failures MUST NOT break the pipeline (log error, continue).
- [x] T014 [US1] Create SKILL.md-based test fixture in `packages/server/src/ai/__tests__/fixtures/` — add a `test-ai-skill-md/` directory containing: `SKILL.md` (frontmatter with name: `test-ai-nl`, description, body with NL instructions for onTopicCreated + onTopicUpdated sections), minimal `package.json`, and minimal `index.js` (TypeSkill with manifest.ai: true, topicType: `test-ai-nl`, renderCard, validateMetadata — no code-based AI calls). This fixture validates the SKILL.md-driven flow end-to-end.

**Checkpoint**: User Story 1 complete. A Skill with SKILL.md has its NL instructions auto-injected as system prompt on lifecycle events. AI responses appear in topic timeline and metadata. Skills without SKILL.md are unaffected.

---

## Phase 4: User Story 2 — Platform Admin Configures AI Provider (Priority: P1) — Already Implemented

**Goal**: Platform admin configures AI via env vars. Health endpoint reports AI status.

**Status**: ✅ Already implemented in codebase. `AiModule`, `AiService`, `ArkProvider`, `ai-config.ts`, `health.controller.ts`, and `AiAdminController` all exist and function correctly.

**Independent Test**: Set AI env vars, start server, verify `/health` reports `"ai": "available"`. Disable AI, verify `"ai": "disabled"`.

### Verification for User Story 2

- [x] T015 [US2] Verify health endpoint works with SKILL.md-based skills loaded — manual or integration test: start server with AI env vars + a SKILL.md skill in `SKILLS_DIR`, confirm `GET /health` returns `{ status: "ok", ai: "available" }` and `GET /admin/ai/status` returns provider info
- [x] T016 [P] [US2] Write unit test for AiService in `packages/server/test/unit/ai-service.spec.ts` — test cases: (1) complete() returns null when AI_ENABLED=false, (2) complete() returns null when circuit breaker open, (3) complete() returns null when tenant AI disabled, (4) complete() returns AiResponse on success with usage recorded, (5) complete() returns null on provider error with circuit breaker incremented

**Checkpoint**: US2 verified — platform AI configuration works correctly with SKILL.md skills.

---

## Phase 5: User Story 3 — Tenant Admin Enables AI for Tenant (Priority: P2) — Already Implemented

**Goal**: Per-tenant AI enablement, rate limiting, usage tracking.

**Status**: ✅ Already implemented. `AiService.isTenantAiEnabled()`, `getTenantRateLimit()`, `AiUsageService`, and admin API endpoints all exist.

**Independent Test**: Enable AI for tenant A, disable for tenant B. Verify SKILL.md-driven AI calls succeed for A and return null for B.

### Verification for User Story 3

- [x] T017 [US3] Write integration test for per-tenant AI gating with SKILL.md in `packages/server/test/integration/tenant-ai-gating.spec.ts` — test with mongodb-memory-server: (1) tenant with AI enabled → SKILL.md AI call succeeds, timeline entry created, (2) tenant with AI disabled → SKILL.md AI call returns null, no timeline entry, (3) tenant rate limit exceeded → returns null, logs warning, (4) usage record created after successful SKILL.md AI call

**Checkpoint**: US3 verified — per-tenant AI controls work correctly with SKILL.md-driven calls.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Code quality, documentation, final validation

- [x] T018 Run linter and type-checker across `packages/server/` — fix any errors introduced by new code: `pnpm --filter @topichub/server run lint`
- [x] T019 [P] Verify all existing tests still pass — `pnpm --filter @topichub/server run test` (no regressions from pipeline changes)
- [x] T020 [P] Run quickstart.md validation — follow steps in `specs/002-ai-driven-skills/quickstart.md` to verify end-to-end flow with a real or mocked AI endpoint

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — main new implementation work
- **US2 (Phase 4)**: Depends on US1 completion (verification that existing code works with new SKILL.md layer)
- **US3 (Phase 5)**: Depends on US1 completion (verification that per-tenant gating works with SKILL.md)
- **Polish (Phase 6)**: Depends on all user story phases being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — **this is the core new work**
- **User Story 2 (P1)**: Already implemented — verification after US1 is complete
- **User Story 3 (P2)**: Already implemented — verification after US1 is complete

### Within User Story 1

- T007, T008 (tests) SHOULD be written first and FAIL before implementation
- T009 (SkillLoader) before T010 (SkillRegistry) — loader provides content for registry
- T010 (SkillRegistry) before T011 (SkillAiRuntime) — runtime reads from registry cache
- T011 (SkillAiRuntime) before T013 (pipeline integration) — runtime must exist before pipeline calls it
- T012 (SkillModule) can run after T011 — wires providers
- T014 (test fixture) can run in parallel with T011-T013

### Parallel Opportunities

- Phase 1: T002 and T003 can run in parallel
- Phase 2: T005 and T006 can run in parallel (after T004)
- Phase 3: T007 and T008 (tests) can run in parallel; T014 (fixture) can run in parallel with T011-T013
- Phase 4-5: T015, T016, T017 can all run in parallel once US1 is complete
- Phase 6: T018, T019, T020 can run in parallel

---

## Parallel Example: User Story 1

```bash
# Step 1: Write tests first (parallel)
Task: T007 "Unit tests for SkillAiRuntime in packages/server/test/unit/skill-ai-runtime.spec.ts"
Task: T008 "Integration test for SKILL.md pipeline in packages/server/test/integration/skill-ai-pipeline.spec.ts"

# Step 2: Implementation (sequential due to dependencies)
Task: T009 "Extend SkillLoader to detect SKILL.md"
Task: T010 "Extend SkillRegistry to cache SKILL.md"
Task: T011 "Implement SkillAiRuntime"
Task: T012 "Register providers in SkillModule"
Task: T013 "Integrate into SkillPipeline"

# Step 3: Test fixture (parallel with T011-T013)
Task: T014 "Create SKILL.md-based test fixture"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T006)
3. Complete Phase 3: User Story 1 (T007-T014)
4. **STOP and VALIDATE**: Run tests, verify SKILL.md-based AI pipeline works end-to-end
5. Deploy/demo if ready

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready
2. Add US1 → Test independently → Deploy (MVP!)
3. Verify US2 → Confirm platform config works with SKILL.md layer
4. Verify US3 → Confirm per-tenant controls work with SKILL.md layer
5. Polish → Lint, type-check, quickstart validation

### Key Implementation Notes

- **Zero breaking changes**: Skills without SKILL.md work identically to before
- **Code-based AI calls still work**: Skills using `manifest.ai: true` + `init({ aiService })` + explicit `AiService.complete()` calls in hooks are unaffected — both models coexist
- **AI infrastructure already built**: AiService, ArkProvider, circuit breaker, rate limiting, usage tracking, admin API, health endpoint — all exist and need no changes
- **New code is concentrated**: 2 new files (SkillMdParser, SkillAiRuntime), 1 new type file, 4 modified files (SkillLoader, SkillRegistry, SkillPipeline, SkillModule), 1 enum change
- **One new dependency**: `gray-matter` for YAML frontmatter parsing

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
