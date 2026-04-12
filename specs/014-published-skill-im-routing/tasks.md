# Tasks: Published skill IM routing & IM→executor safety

**Input**: Design documents from `/home/rainson/workspace/topic-hub/specs/014-published-skill-im-routing/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Organization**: Phases follow user stories (US1–US3) after shared foundation. Tests included per constitution / plan.

## Format: `[ID] [P?] [Story?] Description`

---

## Phase 1: Setup (shared)

**Purpose**: Constants and file skeletons so later tasks do not introduce magic numbers.

- [x] T001 Add published-skill routing constants (cache TTL default, payload key names) in `packages/core/src/services/published-skill-catalog.constants.ts` (or adjacent module used by T002).

---

## Phase 2: Foundational (blocking)

**Purpose**: `PublishedSkillCatalog` + invalidation **must** exist before router or relay work.

**Checkpoint**: No user-story work until T002–T004 complete.

- [x] T002 Implement `PublishedSkillCatalog` (query `skill_registrations` for published catalog entries only, case-insensitive name set, TTL refresh, `invalidate()`) in `packages/core/src/services/published-skill-catalog.ts`.
- [x] T003 Construct and hold catalog instance in `packages/core/src/topichub.ts`, injecting required Mongoose model / `SkillCenterService` dependencies used for queries.
- [x] T004 Call `publishedSkillCatalog.invalidate()` from `packages/core/src/services/skill-center.service.ts` after publish/update/delete paths that change catalog visibility.

---

## Phase 3: User Story 1 — IM slash uses published skill name (Priority: P1) 🎯 MVP

**Goal**: `/canonical-name` routes to `skill_invoke` when name exists in Skill Center only (no server `SKILLS_DIR` copy required for matching).

**Independent Test**: [quickstart.md](./quickstart.md) “Verify published routing”.

- [x] T005 [US1] Add composite matcher (published name lookup → then `SkillRegistry.matchSkillCommandToken`) in `packages/core/src/command/composite-skill-command-matcher.ts`.
- [x] T006 [US1] Wire `CommandRouter` in `packages/core/src/topichub.ts` to use composite matcher from T005 instead of disk-only `skillRegistry.matchSkillCommandToken`.
- [x] T007 [US1] Ensure Nest `packages/server/src/topichub.provider.ts` (or equivalent bootstrap) still constructs `TopicHub` with all dependencies required by T003/T006.
- [x] T008 [US1] Add tests in `packages/core/test/published-skill-command-router.test.ts` — published-only name yields `skill_invoke` with canonical name.

**Checkpoint**: US1 testable without relay hints.

---

## Phase 4: User Story 2 — Name resolution predictable (Priority: P2)

**Goal**: Documented precedence: built-ins → published catalog → disk registry.

**Independent Test**: Matrix in [contracts/published-skill-routing.md](./contracts/published-skill-routing.md) reflected by automated cases.

- [x] T009 [US2] Extend `packages/core/test/published-skill-command-router.test.ts` (or new `packages/core/test/command-router-routing-precedence.test.ts`) with matrix: built-in wins; published vs disk ordering per [research.md](./research.md) R2.

**Checkpoint**: US1 + US2 routing behavior locked by tests.

---

## Phase 5: User Story 3 — Unknown slash token + relay hint (Priority: P3)

**Goal**: Non-built-in, non-published slash token still relays; payload includes `publishedSkillRouting` miss per [contracts/im-dispatch-payload.md](./contracts/im-dispatch-payload.md); executor sees hint.

**Independent Test**: [quickstart.md](./quickstart.md) “Verify unknown-token hint” + SC-005.

- [x] T010 [US3] Extend `packages/core/src/command/command-router.ts` `RouteResult` (and `route()` return paths) to carry optional `publishedSkillMissToken` when `handler === 'relay'`, `imCommandUsedSlash`, `hasActiveTopic`, and token is not a built-in / topic command per contract.
- [x] T011 [US3] Extend `packages/core/src/command/command-router.ts` `CommandContext` with optional `publishedSkillRouting` payload fragment; set from `RouteResult` in `packages/core/src/webhook/webhook-handler.ts` after `router.route()` before `commandDispatcher`.
- [x] T012 [US3] Update `packages/core/src/command/handlers/relay.handler.ts` to merge `context.publishedSkillRouting` into `skillPipeline.execute` extra payload (under `event`-shaped structure per contract).
- [x] T013 [US3] Adjust `packages/core/src/skill/pipeline/skill-pipeline.ts` if needed so `USER_MESSAGE` `enrichedPayload.event.payload` includes `publishedSkillRouting` for dispatch persistence.
- [x] T014 [US3] Update `packages/cli/src/commands/serve/task-processor.ts` to read `publishedSkillRouting` from claimed/enriched payload and prepend a short executor-facing hint when `status === 'miss'`.
- [x] T015 [US3] Add `packages/core/test/relay-published-skill-miss-payload.test.ts` asserting dispatch payload shape for miss path.

**Checkpoint**: US3 complete end-to-end core + CLI prompt.

---

## Phase 6: Polish & cross-cutting

**Purpose**: Security regression, FR-008 `skill-repo`, CI.

- [x] T016 [P] Add or extend dispatch isolation tests in `packages/core/test/dispatch-executor-routing.test.ts` (or new file) for `targetExecutorToken` scoping and rebinding scenario described in [plan.md](./plan.md) §Phase 2 / [data-model.md](./data-model.md).
- [x] T017 [P] Scaffold `packages/cli/src/commands/skill-repo/index.ts` and register `skill-repo` in `packages/cli/src/index.tsx` with minimal `list` (reuse existing API client patterns from `packages/cli/src/commands/skills/index.ts`).
- [x] T018 Run `pnpm --filter @topichub/core test` and `pnpm --filter @topichub/cli test` from repo root; fix failures introduced by this feature.

---

## Dependencies (story order)

```text
Phase 1 (T001)
    ↓
Phase 2 (T002–T004)
    ↓
Phase 3 US1 (T005–T008) ──┐
    ↓                     │ T009 extends router tests (depends on T006)
Phase 4 US2 (T009)       │
    ↓                     │
Phase 5 US3 (T010–T015) ←─┘ depends on Phase 2 + router from T006
    ↓
Phase 6 (T016–T018)
```

**Parallel opportunities**: T016 and T017 can run in parallel after Phase 5. T008 [P] and T007 could parallelize only if different files and T007 does not block T008 — sequential on same router is safer; only T016/T017 marked [P].

## MVP scope

Deliver **Phase 1–3 (T001–T008)** first: published name routing without relay-hint polish. Adds **T015** early only if contract tests are required before merge.

## Implementation strategy

1. Land catalog + invalidation (T002–T004).  
2. Land composite matcher + US1 tests (T005–T008).  
3. Layer precedence tests (T009), then relay hint plumbing (T010–T015).  
4. Security + `skill-repo` + full test sweep (T016–T018).

**Total tasks**: 18

| Story / phase | Task IDs | Count |
|---------------|----------|-------|
| Setup | T001 | 1 |
| Foundational | T002–T004 | 3 |
| US1 | T005–T008 | 4 |
| US2 | T009 | 1 |
| US3 | T010–T015 | 6 |
| Polish | T016–T018 | 3 |

---

## Extension Hooks

**Optional Pre-Hook** (`before_tasks`): git `speckit.git.commit` — run locally if you want a clean commit before task breakdown.

**Optional Post-Hook** (`after_tasks`): git `speckit.git.commit` — run locally after editing `tasks.md`.
