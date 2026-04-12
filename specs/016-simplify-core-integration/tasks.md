# Tasks: Simplify Core Integration Surfaces (016)

**Input**: Design documents from `/home/rainson/workspace/topic-hub/specs/016-simplify-core-integration/`  
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Constitution requires automated tests on critical paths; tasks below include targeted `packages/core` tests (server package has no test script yet).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no ordering dependency within the same checkpoint)
- **[USn]**: User story from [spec.md](./spec.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Align constants and docs before code changes.

- [x] T001 Review [plan.md](./plan.md), [contracts/native-gateway.md](./contracts/native-gateway.md), and [contracts/im-identity-security.md](./contracts/im-identity-security.md) and lock literal path for native ingress (e.g. `topic-hub`) vs env-driven segment
- [x] T002 [P] Add chosen `TOPICHUB_HTTP_PREFIX` (or final name) and native ingress path to [quickstart.md](./quickstart.md) and cross-link from [contracts/native-gateway.md](./contracts/native-gateway.md)
- [x] T003 [P] Add `packages/core/src/gateway/constants.ts` exporting `NATIVE_INTEGRATION_SEGMENT` (or equivalent) used by server and CLI string building

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core gateway envelope + TopicHub wiring. **No user story starts until this checkpoint passes.**

- [x] T004 Create `packages/core/src/gateway/native-gateway.schema.ts` with Zod schemas for `{ v, op, idempotencyKey?, payload }` and per-op payload stubs
- [x] T005 Implement `packages/core/src/gateway/native-integration-gateway.ts` with op registry, `health` op, and structured `{ ok, v, op, data|error }` responses per [contracts/native-gateway.md](./contracts/native-gateway.md)
- [x] T006 Wire `NativeIntegrationGateway` in `packages/core/src/topichub.ts` (construct with needed services) and expose accessor on `TopicHub` / facade used by server
- [x] T007 [P] Export gateway symbols from `packages/core/src/index.ts` if required by `packages/server`
- [x] T008 [P] Add `packages/core/test/native-gateway-envelope.test.ts` covering valid/invalid envelopes and unknown `op`
- [x] T009 Extend `packages/core/src/gateway/native-integration-gateway.ts` with executor ops (`executors.register`, `executors.pairing_code`, `executors.heartbeat`, `executors.deregister`) delegating to the same logic paths currently invoked from `packages/server/src/api.controller.ts` executor endpoints
- [x] T010 Add explicit `403/404`-style error mapping policy for cross-user dispatch access in gateway delegations per [contracts/im-identity-security.md](./contracts/im-identity-security.md)

**Checkpoint**: Core package builds; gateway unit tests pass; executor ops callable from a direct unit/integration harness.

---

## Phase 3: User Story 1 — Host Topic Hub under a path prefix (Priority: P1) 🎯 MVP

**Goal**: Global HTTP prefix + CLI **single** `baseUrl` reaches the **one** native integration ingress.

**Independent Test**: Set `TOPICHUB_HTTP_PREFIX`, start server, configure CLI `serverUrl` including prefix, run `health` op through native gateway successfully.

- [x] T011 [US1] Read optional prefix env and call `app.setGlobalPrefix` in `packages/server/src/main.ts` (strip slashes per [quickstart.md](./quickstart.md))
- [x] T012 [US1] Implement `POST /<NATIVE_SEGMENT>` handler in `packages/server/src/api.controller.ts` delegating body to `hub.getHub().nativeGateway.handle(...)` using `TopicHubService`
- [x] T013 [US1] Update `packages/cli/src/commands/init/steps/server-url.ts` to validate server using native gateway `health` op (POST envelope) instead of or in addition to `GET /health`
- [x] T014 [US1] Add `packages/cli/src/api-client/native-gateway.ts` (or extend `packages/cli/src/api-client/api-client.ts`) with `postNativeEnvelope(op, payload)` joining `baseUrl` + `NATIVE_INTEGRATION_SEGMENT`
- [x] T015 [US1] Migrate `packages/cli/src/commands/serve/index.ts` executor `fetch` calls to native gateway ops via the helper from T014
- [x] T016 [P] [US1] Update `start-local.sh` comments/examples to show prefixed `TOPICHUB_BRIDGE_WEBHOOK_URL` and CLI `serverUrl` when prefix env is set
- [x] T017 [P] [US1] Add `packages/core/test/native-gateway-prefix-integration.test.ts` spinning `TopicHub` with in-memory/mongo test harness if available, asserting gateway resolves under logical prefix (or document skip if harness missing)

**Checkpoint**: Prefix + native POST + CLI `serve` register/heartbeat path works.

---

## Phase 4: User Story 2 — Choose integration surface (Priority: P1)

**Goal**: Configuration selects bridge vs native behavior expectations without adding third public integration ingress.

**Independent Test**: With surface=native, bridge webhook returns disabled/disallowed; with surface=bridge or both, documented behavior holds.

- [ ] T018 [US2] Add integration-surface flag to `TopicHub` config validation (env or config object) in `packages/core` config module used by `TopicHub.create`
- [ ] T019 [US2] Enforce flag in `packages/server/src/api.controller.ts`: when bridge disabled, `WebhookController` route returns `404` or `410` with stable JSON error body
- [ ] T020 [US2] When native gateway disabled (if mode exists), native `POST` returns documented error; default remains both enabled unless configured
- [ ] T021 [P] [US2] Document matrix in [contracts/native-gateway.md](./contracts/native-gateway.md) (surface × which ingress active)

**Checkpoint**: Surface switch behavior documented and covered by at least one automated test (extend T008/T017 or add `packages/core/test/integration-surface-gate.test.ts`).

---

## Phase 5: User Story 3 — Mount under either host routing model (Priority: P2)

**Goal**: Operators can place Topic Hub behind host-specific reverse proxies; docs match behavior.

**Independent Test**: Follow expanded [quickstart.md](./quickstart.md) nginx snippets for at least one prefix layout per host type.

- [ ] T022 [US3] Expand [quickstart.md](./quickstart.md) with nginx `location` examples for native base + bridge webhook on same origin and on split origins
- [ ] T023 [P] [US3] Add troubleshooting for double-prefix mistakes in [quickstart.md](./quickstart.md)

**Checkpoint**: Doc-only story complete once examples render correctly.

---

## Phase 6: User Story 4 — Only two integration ingress routes in `api.controller.ts` (Priority: P2)

**Goal**: `packages/server/src/api.controller.ts` exposes **exactly two** integration-class HTTP ingress handlers (bridge + native); other REST paths removed or demoted to non-integration controllers per plan.

**Independent Test**: Grep + manual smoke: only `POST …/webhooks/openclaw` and `POST …/<native>` are required for integration checklist; CLI no longer calls `/api/v1/*` for integrated flows.

- [ ] T024 [US4] Inventory all `@Get/@Post/...` routes in `packages/server/src/api.controller.ts` and map each to a gateway `op` in a short table inside [plan.md](./plan.md) or `specs/016-simplify-core-integration/migration-routes.md` (new file)
- [ ] T025 [US4] Implement remaining gateway ops in `packages/core/src/gateway/native-integration-gateway.ts` for every CLI/API path still used by `packages/cli` (dispatches, topics, admin publish, etc.) per T024 inventory
- [ ] T026 [US4] Migrate `packages/cli/src/api-client/api-client.ts` remaining methods to gateway ops (remove hardcoded `/api/v1/...` and `/admin/...` paths where spec requires)
- [ ] T027 [US4] Remove superseded routes from `packages/server/src/api.controller.ts` after T025/T026 parity; keep non-integration routes only if constitutionally required elsewhere (e.g. move to `packages/server/src/skill-center.controller.ts`) — **do not** add new integration ingress
- [ ] T028 [US4] Consolidate `WebhookController` + `ApiController` in `packages/server/src/api.controller.ts` so reviewers see **two** integration `@Post` handlers in one file (Nest allows multiple classes per file)
- [ ] T029 [P] [US4] Update [contracts/native-gateway.md](./contracts/native-gateway.md) with final `op` list and HTTP paths
- [ ] T030 [P] [US4] Run repo-wide search for `/api/v1/` string usage in `packages/cli` and remove stale references

**Checkpoint**: Two-route integration contract satisfied; old paths gone or return explicit `410`.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: IM → identity safety tests, lint, leak audit.

- [ ] T031 Add `packages/core/test/im-inbound-security-matrix.test.ts` covering cases in [contracts/im-identity-security.md](./contracts/im-identity-security.md) (HMAC failure, unregistered user, cross-user dispatch denial)
- [ ] T032 [P] Audit `packages/core/src/webhook/webhook-handler.ts` and `packages/core/src/bridge/openclaw-bridge.ts` logging paths to ensure tokens/codes never logged (align constitution)
- [ ] T033 [P] Run `pnpm --filter @topichub/core test` from repository root
- [ ] T034 [P] Run `pnpm --filter @topichub/server lint` and `pnpm --filter @topichub/cli lint` from repository root
- [ ] T035 Execute manual validation steps in [quickstart.md](./quickstart.md) and record results in PR description or `specs/016-simplify-core-integration/quickstart.md` changelog section

---

## Dependencies & Execution Order

### Phase Dependencies

| Phase | Depends on | Notes |
|-------|------------|--------|
| 1 Setup | — | Start immediately |
| 2 Foundational | Phase 1 | Blocks all user stories |
| 3 US1 | Phase 2 | MVP |
| 4 US2 | Phase 2 | Can overlap late Phase 3 once gateway exists |
| 5 US3 | Phase 3 (doc accuracy) | Mostly docs; can parallelize with US4 drafting |
| 6 US4 | Phase 3 (CLI using gateway) for safe route removal | Strong dependency on executor path migration |
| 7 Polish | US4 near-complete | Security tests can start after gateway stable |

### User Story Dependencies

- **US1**: After Foundational — no dependency on US2–US4
- **US2**: After Foundational — light coupling to US1 for server file edits order (serialize if same file conflicts)
- **US3**: Weak dependency — best after US1 prefix behavior verified
- **US4**: Depends on US1 + substantial gateway coverage (T025) before deleting routes

### Parallel Opportunities

- T002, T003 in parallel after T001
- T007, T008 parallel after T006
- T016, T017 parallel after US1 core (T012–T015)
- T021 parallel with T022 when different files
- T029, T030 parallel
- T032, T033, T034 parallel after implementation stabilizes

### Parallel Example: User Story 1

```text
# After T012 lands:
T016 [P] [US1] start-local.sh comments
T017 [P] [US1] core integration test file
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1–2 (gateway + executor ops + tests).  
2. Complete Phase 3 (US1): prefix + native POST + CLI `serve`.  
3. **STOP**: Run `pnpm --filter @topichub/core test` and manual quickstart smoke.

### Incremental Delivery

1. Add US2 (surface flags) → test matrix.  
2. Add US3 docs.  
3. US4 route deletion in batches per T024 inventory to avoid breaking CLI mid-flight.

### Parallel Team Strategy

- Dev A: Phase 2 core gateway + tests  
- Dev B: Phase 3 server prefix + CLI (after T006)  
- Dev C: US3 docs + US2 config in parallel once T005 exists  

---

## Summary

| Metric | Count |
|--------|-------|
| **Total tasks** | 35 |
| **Phase 1** | 3 |
| **Phase 2** | 7 |
| **US1** | 7 |
| **US2** | 4 |
| **US3** | 2 |
| **US4** | 7 |
| **Polish** | 5 |
| **Parallel-friendly ([P])** | 14 |

**Suggested MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) through T016.

---

## Notes

- Native ingress path string must stay **one** exported constant shared by `packages/server` and `packages/cli` (T003) to avoid drift.  
- Do not delete `packages/server/src/app.module.ts` registrations for non-integration controllers until each route’s consumers are migrated (T027).  
- If a task requires touching secrets, use placeholders only in scripts (never commit real tokens).
