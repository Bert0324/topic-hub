# Tasks: IM multi-agent slots, `/agent`, and IM ↔ executor routing security

**Input**: `/home/rainson/workspace/topic-hub/specs/015-im-agent-command/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/im-agent-commands.md](./contracts/im-agent-commands.md), [contracts/im-identity-dispatch-security.md](./contracts/im-identity-dispatch-security.md), [contracts/im-executor-routing.md](./contracts/im-executor-routing.md), [quickstart.md](./quickstart.md)

**Tests**: Included (constitution + plan gates; binding and dispatch security paths require automated coverage).

**Organization**: Phases by dependency; user-story phases map to **User Story 1–4** in [spec.md](./spec.md). **Phase 8** covers plan.md Phase 2 backlog (FR-014 + routing security).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no ordering dependency within the same bullet group)
- **[USn]**: Spec user story number

---

## Phase 1: Setup (shared)

**Purpose**: Constants and contracts aligned with spec.

- [x] T001 Add `packages/core/src/im/agent-slot-constants.ts` exporting `MAX_LOCAL_AGENTS`, `IM_PAYLOAD_AGENT_SLOT_KEY`, `IM_PAYLOAD_AGENT_OP_KEY`, `IM_PAYLOAD_AGENT_DELETE_SLOT_KEY` per [data-model.md](./data-model.md)
- [x] T002 [P] Keep `specs/015-im-agent-command/contracts/im-agent-commands.md` aligned with spec FR-001–FR-014 when grammar or payload keys change
- [x] T003 [P] Cross-link [contracts/im-executor-routing.md](./contracts/im-executor-routing.md) from [contracts/im-identity-dispatch-security.md](./contracts/im-identity-dispatch-security.md) (one-line “see also”) to avoid duplicate security narratives

---

## Phase 2: Foundational (blocking)

**Purpose**: Parsing, payload keys, roster I/O, dispatch meta invariants. **Blocks all user stories.**

- [x] T004 Implement `packages/core/src/im/agent-slot-parse.ts` and `packages/core/src/im/im-agent-control-dispatch.ts` with tests `packages/core/test/agent-slot-parse.test.ts`, `packages/core/test/im-agent-control-dispatch.test.ts`
- [x] T005 Thread `agentSlot` / queue / agent-op payloads into `enrichedPayload.event.payload` via `packages/core/src/command/handlers/relay.handler.ts`, `packages/core/src/command/handlers/skill-invoke.handler.ts`, `packages/core/src/command/handlers/agent.handler.ts`, `packages/core/src/skill/pipeline/skill-pipeline.ts`
- [x] T006 Audit `packages/core/src/services/dispatch.service.ts` and all dispatch `create` call sites so **`sourcePlatform`**, **`sourceChannel`**, **`targetExecutorToken`**, **`targetUserId`** are only set from trusted webhook `dispatchMeta` / server context — document findings in PR; fix gaps if any
- [x] T007 [P] Implement `packages/cli/src/commands/serve/agent-roster.ts` with tests `packages/cli/test/agent-roster.spec.ts`
- [x] T008 [P] Implement IM agent control fast path and concurrency bypass in `packages/cli/src/commands/serve/task-processor.ts` and `packages/cli/src/commands/serve/index.ts` per plan

**Checkpoint**: Parser + roster + control-dispatch paths ready.

---

## Phase 3: User Story 1 — Create and bootstrap (Priority: P1)

**Goal**: Zero agents → auto `#1`; `/agent create` adds slots; IM acks echo `#N`.

**Independent Test**: Pair IM → `/agent create` → roster shows new `#N`; confirmations include slot label.

### Tests

- [ ] T009 [P] [US1] Add or extend `packages/core/test/` webhook coverage for `/agent create` path: requires binding + active topic; outbound payload must not leak `executorToken` (use existing webhook test patterns)

### Implementation

- [x] T010 [US1] Implement `packages/core/src/command/handlers/agent.handler.ts` and register in `packages/core/src/command/command-router.ts` / `packages/core/src/topichub.ts`
- [x] T011 [US1] Handle `/agent` early branch in `packages/core/src/webhook/webhook-handler.ts` with defer ack copy for successful dispatch
- [x] T012 [US1] Implement `packages/core/src/im/im-agent-list-format.ts` for roster markdown
- [x] T013 [US1] Bootstrap and `agentSlot` handling in `packages/cli/src/commands/serve/task-processor.ts` (`ensureAtLeastOneAgent`, slot busy flags)
- [x] T014 [US1] Close `packages/cli/src/commands/serve/index.ts` review: confirm executor `token` passed into `TaskProcessor` matches roster file hash contract in [research.md](./research.md); remove task if already satisfied — **verify and mark done in PR**

**Checkpoint**: Create + bootstrap E2E.

---

## Phase 4: User Story 4 — `/agent list` (Priority: P1)

**Goal**: `/agent list` returns `#N`, label, state; not in `/help` unbound exception set.

**Independent Test**: `/agent list` with 0/1/ many agents matches canonical `#N` order.

### Tests

- [ ] T015 [P] [US4] Add `packages/core/test/webhook-agent-list.test.ts` (or extend nearest module) for bound vs unbound and dispatch payload shape for list op

### Implementation

- [x] T016 [US4] `/agent list` wiring in `packages/core/src/webhook/webhook-handler.ts` + `agent.handler.ts`
- [x] T017 [US4] Formatting in `packages/core/src/im/im-agent-list-format.ts`
- [x] T018 [US4] Observable state in `packages/cli/src/commands/serve/agent-roster.ts` + `task-processor.ts` lifecycle
- [x] T019 [US4] Executor-side list execution via `topichubAgentOp` in `packages/cli/src/commands/serve/task-processor.ts`

**Checkpoint**: List works without external UI.

---

## Phase 5: User Story 2 — `#N` routing + FR-014 legibility (Priority: P1)

**Goal**: Optional **`#N`** on relay/slash paths; default `#1`; when **≥2** local agents, user-visible copy must not hide which agent ran (FR-014).

**Independent Test**: Two agents; with/without `#2`; default path shows **agent #1** explicitly in IM when roster ≥2.

### Tests

- [x] T020 [P] [US2] Add `packages/core/test/dispatch-agent-slot-payload.test.ts` ensuring `agentSlot` survives `packages/core/src/services/dispatch.service.ts` create into `enrichedPayload.event.payload`
- [ ] T021 [P] [US2] Add `packages/cli/test/task-processor-agent-slot.spec.ts` mocking dispatch payload — `agentSlot` 2 vs default `#1`
- [x] T022 [P] [US2] Add `packages/core/test/im-fr014-notify-body.test.ts` — `pickImNotifyBody` keeps leading **`*(agent #N)*`** line in short completion text (pairs with T027 CLI prefix)

### Implementation

- [x] T023 [US2] Plain relay + slash parsing in `packages/core/src/webhook/webhook-handler.ts`, `packages/core/src/command/handlers/relay.handler.ts`, `packages/core/src/command/handlers/skill-invoke.handler.ts`, `packages/core/src/im/agent-slot-parse.ts`
- [x] T024 [US2] `/queue` / `/answer` ordering vs agent `#N` documented in parser module and `packages/core/src/webhook/webhook-handler.ts`
- [x] T025 [US2] `buildPrompt` / payload stripping in `packages/cli/src/commands/serve/task-processor.ts`
- [x] T026 [US2] Help copy in `packages/core/src/command/handlers/help.handler.ts` and `packages/core/src/webhook/webhook-handler.ts`
- [x] T027 [US2] Extend `packages/cli/src/commands/serve/task-processor.ts` (and if needed `packages/core/src/topichub.ts` claim line) so **≥2 agents** ⇒ IM-visible **agent `#N`** on claim and/or **Task completed** body per [spec.md](./spec.md) FR-014 and [plan.md](./plan.md) Phase 2 item 1 — roster size from `listAgentSlots(this.options.token).length` in CLI; avoid logging tokens
- [ ] T028 [P] [US2] Optional: prefix **`Your local agent is running (agent #N)`** in `packages/core/src/topichub.ts` only if server can read `agentSlot` from dispatch doc without local roster (prefer **CLI `complete`/`imSummary`** if server lacks roster)

**Checkpoint**: Routing + FR-014 satisfied.

---

## Phase 6: User Story 3 — `/agent delete #N` (Priority: P2)

**Goal**: Safe delete, busy rejection, invalid `#N` errors with list tail.

**Independent Test**: Delete `#2`, list updates; busy slot rejected.

### Tests

- [ ] T029 [P] [US3] Add `packages/cli/test/agent-roster-delete.spec.ts` for busy rejection and renumber semantics
- [ ] T030 [P] [US3] Add `packages/core/test/webhook-agent-delete.test.ts` for invalid `#N` / unbound

### Implementation

- [x] T031 [US3] `delete` in `packages/core/src/command/handlers/agent.handler.ts` + webhook
- [x] T032 [US3] Busy detection + fail path in `packages/cli/src/commands/serve/task-processor.ts`
- [ ] T033 [US3] Confirm `packages/cli/src/commands/serve/agent-roster.ts` renumber + in-flight policy matches spec FR-008; extend if any edge case remains open

**Checkpoint**: Delete story complete.

---

## Phase 7: Polish & cross-cutting

**Purpose**: `/help`, unknown skill, manual quickstart, checklist.

- [ ] T034 [P] Regression: `/help` unbound static-only per FR-011 in `packages/core/src/webhook/webhook-handler.ts` — add `packages/core/test/webhook-help-unbound.test.ts` if coverage missing
- [ ] T035 [P] FR-012 unknown published skill miss + local forward — extend `packages/core/test/relay-published-skill-miss-payload.test.ts` or sibling
- [ ] T036 Run `specs/015-im-agent-command/quickstart.md` scenarios; record results in PR description
- [ ] T037 [P] Update `specs/015-im-agent-command/checklists/requirements.md` for any spec/plan deltas

---

## Phase 8: IM ↔ executor security (plan.md backlog)

**Purpose**: Map **platform + IM user** → **binding + claimToken** → **dispatch + executor API**; never mis-route replies (contracts C1–C3).

- [x] T038 [P] Add `packages/core/test/heartbeat-bound-session.test.ts` — `HeartbeatService.isBoundExecutorSessionLive` returns false when `claimToken` on heartbeat ≠ binding token (mock `executor_heartbeats` model)
- [ ] T039 [P] Add `packages/core/test/im-binding-dispatch-meta.test.ts` — given mocked `resolveUserByPlatform`, assert `dispatchMeta.targetExecutorToken` / `targetUserId` / `sourceChannel` passed into `SkillPipeline.execute` match inbound `OpenClawInboundResult` fields (unit-level handler helper or minimal webhook handler fixture)
- [x] T040 Verify `packages/core/src/webhook/webhook-handler.ts` private `sendThreadReply` always passes `{ sessionKey: result.sessionId }` into `packages/core/src/bridge/openclaw-bridge.ts` `sendMessage` for thread-scoped replies; patch any call path that bypasses wrapper
- [ ] T041 [P] Add `packages/server/test/` or `packages/core/test/` coverage that `POST /api/v1/dispatches/:id/claim` with wrong `Authorization: Bearer` cannot claim another executor’s dispatch (use existing API test harness if present)
- [x] T042 [P] Add table-driven test `packages/core/test/im-platform-principal-key.test.ts` — distinct `(platform, platformUserId)` tuples resolve to distinct bindings without collision (strings only; no live IM)
- [ ] T043 Document in PR how **multiple local `serve` processes** interact with **pairing rotation** (`packages/core/src/identity/identity.service.ts` `invalidateLeakedPairingCodeAndRotate`, `packages/core/src/topichub.ts` SSE subscription) — no code change if already correct

**Checkpoint**: Security invariants in [contracts/im-executor-routing.md](./contracts/im-executor-routing.md) have automated anchors.

---

## Dependencies & execution order

| Phase | Depends on |
|-------|------------|
| 1 Setup | — |
| 2 Foundational | 1 |
| 3 US1 | 2 |
| 4 US4 | 2 (may parallel US1 after T007) |
| 5 US2 | 2 + US1 bootstrap (≥1 slot; tests need ≥2) |
| 6 US3 | US1 + US4 + US2 |
| 7 Polish | All targeted user stories |
| 8 Security | 2 (can parallel Phase 5 after dispatch meta stable); **T040** should follow shallow audit anytime |

**MVP**: Phases 1–3, then 4, then 5.

### Parallel opportunities

- T003 ∥ T006 (docs vs audit).
- T020 ∥ T021 ∥ T022 after Phase 2.
- T038 ∥ T039 ∥ T041 ∥ T042 (security tests) after Phase 2.

---

## Parallel example (security phase)

```text
packages/core/test/heartbeat-bound-session.test.ts
packages/core/test/im-binding-dispatch-meta.test.ts
packages/core/test/im-platform-principal-key.test.ts
packages/server/test/dispatch-claim-auth.test.ts  (path as created)
```

---

## Implementation strategy

1. Finish **Phase 2** open items (T006, T003).  
2. Close **US1** T014 verification.  
3. Land **US2** FR-014 (T027/T028) + tests T020–T022.  
4. **US3** tests + T033.  
5. **Phase 7–8** polish + security tests.  
6. Run `pnpm --filter @topichub/core test && pnpm --filter @topichub/cli test` before merge.

---

## Notes

- Never log or echo raw `executorToken` / Bearer secrets in IM or tests.  
- Prefer **CLI** for FR-014 roster-length gating (server has no roster file).  
- Update checkboxes in PRs as work lands.
