# Tasks: AI-Driven Skills

**Input**: Design documents from `/specs/002-ai-driven-skills/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. Test tasks are omitted. Tests should be added per the constitution's testing standards during implementation.

**Organization**: Tasks grouped by user story. US2 (Platform Admin Config) is ordered before US1 (Skill Uses AI) because the provider must be configured before Skills can use it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3)
- All paths relative to repository root

---

## Phase 1: Setup

**Purpose**: Create directory structure for the AI module

- [x] T001 Create directory structure `packages/server/src/ai/`, `packages/server/src/ai/providers/`, `packages/server/src/ai/usage/`, `packages/server/src/ai/__tests__/` per plan.md
- [x] T002 Create directory structure `packages/cli/src/commands/ai/` for CLI AI commands

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core AI infrastructure that MUST be complete before ANY user story can proceed

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Define AI config schema with zod validation (env vars: `AI_ENABLED`, `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_RATE_LIMIT_GLOBAL`) in `packages/server/src/ai/ai-config.ts`
- [x] T004 [P] Define `AiProvider` interface, `AiRequest`, `AiResponse`, `AiUsage`, `AiMessage`, `AiContentPart`, `AiProviderError` types in `packages/server/src/ai/providers/ai-provider.interface.ts` per contracts/ai-provider.md
- [x] T005 [P] Implement `CircuitBreaker` class (closed/open/half-open states, configurable failure threshold and cooldown) in `packages/server/src/ai/circuit-breaker.ts`
- [x] T006 Implement `ArkProvider` class implementing `AiProvider` — POST to `${apiUrl}/responses` with Bearer auth, map Ark response format (output[].type 'message'→content, 'reasoning'→reasoning, usage mapping) in `packages/server/src/ai/providers/ark-provider.ts`
- [x] T007 Implement `AiService` orchestrator — checks `AI_ENABLED`, circuit breaker state, delegates to provider, returns `AiResponse | null` (never throws), logs calls per FR-010 in `packages/server/src/ai/ai.service.ts`
- [x] T008 Create `AiModule` NestJS module — registers `AiService` as provider, creates `ArkProvider` via factory based on `AI_PROVIDER` env var, exports `AiService` in `packages/server/src/ai/ai.module.ts`
- [x] T009 Import `AiModule` in `packages/server/src/app.module.ts`

**Checkpoint**: AiService is injectable and can make AI calls when configured. No Skills integration yet.

---

## Phase 3: User Story 2 — Platform Admin Configures AI Provider (Priority: P1) 🎯 MVP

**Goal**: Platform admin can deploy with AI enabled via env vars and verify provider health

**Independent Test**: Set env vars, start server, verify `/health` reports `"ai": "available"`. Unset vars, verify `"ai": "disabled"`.

### Implementation for User Story 2

- [x] T010 [US2] Modify `packages/server/src/health.controller.ts` to include AI provider status (`"available"`, `"unavailable"`, `"disabled"`) from `AiService.isAvailable()` in the health check response
- [x] T011 [US2] Add `GET /admin/ai/status` endpoint returning provider config, availability, circuit state, and global usage — create `packages/server/src/ai/ai-admin.controller.ts` and register in `AiModule`
- [x] T012 [P] [US2] Implement `topichub-admin ai status` CLI command — calls `GET /admin/ai/status` and renders provider info in `packages/cli/src/commands/ai/status.ts`
- [x] T013 [US2] Add AI env vars (`AI_ENABLED`, `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_RATE_LIMIT_GLOBAL`) to `packages/server/src/ai/ai-config.ts` and update `.env.example` with commented AI section
- [x] T014 [US2] Add AI environment variables to `docker-compose.yml` server service

**Checkpoint**: `AI_ENABLED=true AI_API_KEY=xxx ./start-local.sh` → `/health` returns `"ai": "available"` → `topichub-admin ai status` shows provider info.

---

## Phase 4: User Story 1 — Skill Uses AI in Lifecycle Hooks (Priority: P1)

**Goal**: Skills can call `AiService.complete()` in their lifecycle hooks to make AI requests

**Independent Test**: Load a test-only Skill fixture with `ai: true` in manifest, call `AiService.complete()` in `onTopicCreated`, verify AI response is received and usable.

### Implementation for User Story 1

- [x] T015 [US1] Define `SkillContext` interface (with `aiService: AiService | null`) and add optional `ai?: boolean` field to all Skill manifest interfaces (`TypeSkillManifest`, `PlatformSkillManifest`, `AuthSkillManifest`, `AdapterSkillManifest`) in `packages/server/src/skill/interfaces/`
- [x] T016 [US1] Add optional `init?(ctx: SkillContext): void` method to all Skill interfaces (`TypeSkill`, `PlatformSkill`, `AuthSkill`, `AdapterSkill`) in `packages/server/src/skill/interfaces/`
- [x] T017 [US1] Import `AiModule` in `packages/server/src/skill/skill.module.ts`
- [x] T018 [US1] Modify `SkillRegistry` in `packages/server/src/skill/registry/skill-registry.ts` to inject `AiService`, and call `skill.init({ aiService })` after loading each Skill — pass `AiService` for Skills with `manifest.ai === true`, pass `null` otherwise
- [x] T019 [US1] Create a test-only Skill fixture in `packages/server/src/ai/__tests__/fixtures/test-ai-skill.ts` that declares `ai: true`, calls `AiService.complete()` in `onTopicCreated`, and stores the AI response for assertion

**Checkpoint**: A Skill declaring `ai: true` receives `AiService` via `init()` and can call `complete()` in its hooks. Skills without `ai: true` are unaffected.

---

## Phase 5: User Story 3 — Tenant Admin Enables AI for Tenant (Priority: P2)

**Goal**: Per-tenant AI enablement, rate limiting, usage tracking, and CLI management commands

**Independent Test**: Enable AI for tenant A, disable for tenant B. Verify Skill AI calls succeed for A (returning AI response), return `null` for B. Verify rate limit enforcement.

### Implementation for User Story 3

- [x] T020 [US3] Create `AiUsageRecord` Typegoose entity with indexes per data-model.md in `packages/server/src/ai/usage/ai-usage.entity.ts`
- [x] T021 [US3] Implement `AiUsageService` — rate limit check (aggregate count for current hour), increment usage (atomic `$inc` upsert), usage report query (by tenant, by skill, by time range) in `packages/server/src/ai/usage/ai-usage.service.ts`
- [x] T022 [US3] Register `AiUsageRecord` Mongoose model and `AiUsageService` provider in `packages/server/src/ai/ai.module.ts`
- [x] T023 [US3] Extend `AiService.complete()` in `packages/server/src/ai/ai.service.ts` to check tenant AI enablement (via `TenantSkillConfig` with reserved `skillName='__ai__'`) and per-tenant rate limit (via `AiUsageService`) before calling the provider — return `null` when disabled or rate-limited
- [x] T024 [US3] Add tenant AI endpoints to `packages/server/src/ai/ai-admin.controller.ts`: `GET /admin/tenants/:tid/ai` (config), `PATCH /admin/tenants/:tid/ai` (enable/disable/rate-limit), `GET /admin/tenants/:tid/ai/usage` (usage stats)
- [x] T025 [P] [US3] Implement `topichub-admin ai enable` command in `packages/cli/src/commands/ai/enable.ts` — calls `PATCH /admin/tenants/:tid/ai` with `{ enabled: true }`
- [x] T026 [P] [US3] Implement `topichub-admin ai disable` command in `packages/cli/src/commands/ai/disable.ts` — calls `PATCH /admin/tenants/:tid/ai` with `{ enabled: false }`
- [x] T027 [P] [US3] Implement `topichub-admin ai usage` command in `packages/cli/src/commands/ai/usage.ts` — calls `GET /admin/tenants/:tid/ai/usage` and renders table per contracts/cli-commands.md

**Checkpoint**: `topichub-admin ai enable` → Skill AI calls succeed for that tenant. Rate limit enforced at configured threshold. `topichub-admin ai usage` shows per-Skill breakdown.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, config files, and cleanup

- [x] T028 [P] Update `.env.example` with all AI environment variables (commented, with defaults and descriptions)
- [x] T029 [P] Update `docker-compose.yml` to include AI env vars with `${AI_API_URL:-}` passthrough
- [x] T030 [P] Update `packages/server/src/database/database.module.ts` to register `AiUsageRecord` model if not already handled by `AiModule`
- [x] T031 Run quickstart.md validation — verify the documented setup flow works end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US2 (Phase 3)**: Depends on Phase 2 — platform config is prerequisite for US1
- **US1 (Phase 4)**: Depends on Phase 2 — can run in parallel with US2 if needed, but US2 completing first is recommended
- **US3 (Phase 5)**: Depends on Phase 2 — extends AiService with tenant checks and rate limiting
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US2 (P1)**: Can start after Phase 2. No dependency on other stories. First to complete — validates AI provider connectivity.
- **US1 (P1)**: Can start after Phase 2. Independent of US2 at the code level (AiService works even without health endpoint). Recommended to follow US2 for logical flow.
- **US3 (P2)**: Can start after Phase 2. Independent of US1/US2 at the code level. Extends AiService with tenant-level checks.

### Within Each User Story

- Models before services
- Services before endpoints/controllers
- Core implementation before CLI commands
- Commit after each task or logical group

### Parallel Opportunities

- T004 and T005 can run in parallel (different files, no dependencies)
- T012 (CLI status) can run in parallel with T010-T011 (server endpoints)
- T025, T026, T027 (CLI commands) can all run in parallel
- T028, T029, T030 (polish) can all run in parallel
- US1 and US3 can run in parallel after Phase 2 (if team capacity allows)

---

## Parallel Example: Foundational Phase

```bash
# These can run simultaneously:
Task T004: "Define AiProvider interface in packages/server/src/ai/providers/ai-provider.interface.ts"
Task T005: "Implement CircuitBreaker in packages/server/src/ai/circuit-breaker.ts"
```

## Parallel Example: User Story 3 CLI

```bash
# These can run simultaneously (different files):
Task T025: "topichub-admin ai enable in packages/cli/src/commands/ai/enable.ts"
Task T026: "topichub-admin ai disable in packages/cli/src/commands/ai/disable.ts"
Task T027: "topichub-admin ai usage in packages/cli/src/commands/ai/usage.ts"
```

---

## Implementation Strategy

### MVP First (US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US2 — Platform Admin Configures AI Provider
4. **STOP and VALIDATE**: `AI_ENABLED=true` → health check → `ai status` CLI
5. Deploy/demo: "AI provider is connected and configurable"

### Full Delivery

1. Setup + Foundational → AI infrastructure ready
2. US2 → Platform config validated → **MVP demo**
3. US1 → Skills can use AI → Test with Skill fixture
4. US3 → Tenant control → Rate limiting validated → **Feature complete**
5. Polish → Docs, config, cleanup

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- `null` return pattern: AiService.complete() NEVER throws — returns `null` for all unavailable states
- No bundled Skills — test fixtures are test-only, not installed in `skills/`
- Per-tenant AI config reuses existing `tenant_skill_configs` collection with reserved `skillName='__ai__'`
- Total: 31 tasks across 6 phases
