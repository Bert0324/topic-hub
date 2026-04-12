# Tasks: IM-First Identification (`/id`)

**Input**: Design documents from `/specs/017-im-first-identification/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included for critical paths (identity creation, duplicates, routing invariants) per repository constitution; service-level tests with in-memory Mongo pattern used elsewhere in `packages/core/test/`.

**Organization**: Phases follow user stories from [spec.md](./spec.md) (US1 P1, US2 P2, US3 P1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label for story phases only

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align implementation with contracts and naming before code changes.

- [x] T001 Read `specs/017-im-first-identification/contracts/im-id-command.md` and `specs/017-im-first-identification/contracts/im-identity-routing.md` and confirm handler ordering rules vs current `packages/core/src/webhook/webhook-handler.ts` early-return structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persistence + domain service required before any IM command work.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Add Typegoose entity `ImIdentityLink` in `packages/core/src/entities/im-identity-link.entity.ts` per `specs/017-im-first-identification/data-model.md` (collection name, unique compound index on `platform` + `platformUserId`)
- [x] T003 [P] Add opaque `Identity.uniqueId` generator helper in `packages/core/src/identity/generate-im-self-serve-unique-id.ts` (or `packages/core/src/common/` if shared naming utilities live there—pick one directory and document in PR)
- [x] T004 Register `ImIdentityLink` with `getModelForClass` / `model()` in `packages/core/src/topichub.ts` alongside existing `IdentityModel` wiring
- [x] T005 Implement `ImSelfServeIdentityService` in `packages/core/src/services/im-self-serve-identity.service.ts` (create `Identity` + `ImIdentityLink` atomically; enforce duplicate IM key; `getMe` reads link + identity) using `IdentityModel` and new link model injected from `packages/core/src/topichub.ts`

**Checkpoint**: Models + service compile; ready for webhook integration.

---

## Phase 3: User Story 1 — Self-serve `/id create` & `/id me` (Priority: P1) 🎯 MVP

**Goal**: IM users can run `/id create` once per IM account (name from IM, generated id, token returned) and `/id me` to read token, name, id; superadmin path unchanged.

**Independent Test**: DM bot: `/id create` → token+fields; `/id me` matches; second `/id create` rejected; superadmin `createIdentity` still works via existing gateway/admin flow.

### Implementation for User Story 1

- [x] T006 [US1] Extend `packages/core/src/webhook/webhook-handler.ts` with an optional callback interface (e.g. `WebhookImSelfServeOps`) for `createFromIm` / `getLinkedIdentityForIm` implemented by `packages/core/src/topichub.ts` wiring
- [x] T007 [US1] Insert `/id create` and `/id me` parsing branches in `packages/core/src/webhook/webhook-handler.ts` inside `handleOpenClaw` **after** `/help` handling and **before** the generic `resolveUserByPlatform` gate, following `specs/017-im-first-identification/contracts/im-identity-routing.md`
- [x] T008 [US1] Implement IM replies via existing `sendThreadReply` in `packages/core/src/webhook/webhook-handler.ts` (no token content in `packages/core` log calls—verify `TopicHubLogger` usage)
- [x] T009 [US1] Wire `ImSelfServeIdentityService` into `new WebhookHandler(...)` from `packages/core/src/topichub.ts` (pass closure or adapter matching the new optional parameter)
- [x] T010 [P] [US1] Add `/id create` and `/id me` entries to command list in `packages/core/src/command/handlers/help.handler.ts` and adjust lifecycle blurb if needed

**Checkpoint**: Manual OpenClaw test: `/id` flows succeed; executor-only commands still prompt `/register` until paired.

---

## Phase 4: User Story 2 — Second IM platform (Priority: P2)

**Goal**: Same human can `/id create` on another platform account; both identities coexist per spec (no automatic merge).

**Independent Test**: Two distinct `(platform, platformUserId)` pairs each complete `/id create` without collision.

### Tests for User Story 2

- [x] T011 [US2] Add multi-platform success coverage in `packages/core/test/im-self-serve-identity.test.ts` (or split file under `packages/core/test/` if preferred) asserting two different platform keys bind to two `Identity` rows

**Checkpoint**: US2 acceptance documented by automated test.

---

## Phase 5: User Story 3 — No duplicate for same IM account (Priority: P1)

**Goal**: Second `/id create` from the same `(platform, platformUserId)` is rejected deterministically.

**Independent Test**: Duplicate create hits unique constraint or pre-check and returns user-visible error without second `Identity`.

### Tests for User Story 3

- [x] T012 [US3] Add duplicate `/id create` rejection test in `packages/core/test/im-self-serve-identity.test.ts` covering same `platform` + `platformUserId` twice
- [x] T013 [P] [US3] Add idempotent duplicate handling test (simulate repeated service calls) in `packages/core/test/im-self-serve-identity.test.ts` ensuring exactly one `Identity` remains

**Checkpoint**: US3 scenarios covered by tests; aligns with US1 implementation.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Governance, docs, CI.

- [x] T014 Add `CONSTITUTION-EXCEPTION:` inline comment at token-return sites in `packages/core/src/webhook/webhook-handler.ts` referencing `specs/017-im-first-identification/spec.md` § Clarifications
- [x] T015 [P] Verify `packages/core/src/index.ts` exports remain sufficient for `packages/server` if any new types must cross package boundary; update only if required
- [x] T016 [P] Refresh operator notes in `specs/017-im-first-identification/quickstart.md` with final DM vs group policy implemented in `packages/core/src/webhook/webhook-handler.ts`
- [x] T017 Run `pnpm test` (or package-scoped equivalent used in CI) from repository root and fix regressions tied to this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** → **Phase 2** → **Phases 3–5** (US1 implements core; US2/US3 primarily tests validating spec) → **Phase 6**
- **US2 / US3** depend on **Phase 2** + **US1 service** (`T005`); test tasks **T011–T013** depend on `ImSelfServeIdentityService` behavior (`T005`) and stable entity (`T002`–`T004`)

### User Story Dependencies

- **US1**: After Phase 2 — no dependency on US2/US3
- **US2**: After US1 service (`T005`) — tests validate cross-platform; no extra product code if unique key already platform-scoped
- **US3**: After US1 — duplicate enforcement lives in service + webhook; tests assert it

### Parallel Opportunities

- **T002** and **T003** can run in parallel (different new files) before **T004**/**T005**
- **T010** can run in parallel with **T006–T009** if merge conflicts avoided (same handler file → serialize **T007–T008** vs **T010** or do help after webhook)
- **T013** and **T011** can run in parallel after test file scaffold exists
- **T015** and **T016** in parallel during polish

---

## Parallel Example: Foundational

```text
# After T001:
Task T002: entity file `packages/core/src/entities/im-identity-link.entity.ts`
Task T003: generator `packages/core/src/identity/generate-im-self-serve-unique-id.ts`
# Then T004, then T005
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1–2  
2. Complete Phase 3 (US1)  
3. **STOP and VALIDATE**: `/id create`, `/id me`, duplicate rejection manually in IM  
4. Optionally defer Phases 4–5 test tasks into same PR if small

### Incremental Delivery

1. Foundation (entity + service) → mergeable slice behind no IM entry yet (optional) or feature-flag if required by team process  
2. US1 webhook wiring → enable `/id` in staging  
3. US2/US3 tests → CI confidence  
4. Polish → constitution comment + docs + full test run

### Parallel Team Strategy

- Dev A: T002 + T004 + T005  
- Dev B: T003 + scaffold `packages/core/test/im-self-serve-identity.test.ts`  
- After T005 lands: Dev A webhook (`T006`–`T009`), Dev B help (`T010`) + tests (`T011`–`T013`)

---

## Notes

- **Task count**: 17 tasks (**US1**: 5 implementation tasks T006–T010; **US2**: 1 test T011; **US3**: 2 tests T012–T013; setup 1; foundational 4; polish 4)
- **MVP scope**: Phases 1–3 (through **T010**)
- If `WebhookHandler` constructor arity becomes unwieldy, prefer a single optional `deps` object—document deviation in PR referencing `plan.md`
