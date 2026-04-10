# Tasks: OpenClaw IM Bridge

**Input**: Design documents from `/specs/007-openclaw-im-bridge/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the spec. Tests are omitted.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths included in descriptions

## Phase 1: Setup

**Purpose**: Create bridge module structure and shared types

- [x] T001 Create bridge directory at packages/core/src/bridge/
- [x] T002 [P] Define OpenClaw zod schemas (OpenClawConfigSchema, OpenClawWebhookPayloadSchema, TenantChannelEntrySchema) in packages/core/src/bridge/openclaw-types.ts
- [x] T003 [P] Add `openclaw` optional field to TopicHubConfigSchema in packages/core/src/config.ts — import OpenClawConfigSchema from bridge/openclaw-types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core bridge components that MUST be complete before user story implementation

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement MessageRenderer class in packages/core/src/bridge/message-renderer.ts — takes CardData and renders markdown per outbound-send contract (title as H2 with type prefix, status bold, fields as bullet list, actions as links)
- [x] T005 Implement OpenClawBridge class skeleton in packages/core/src/bridge/openclaw-bridge.ts — constructor takes OpenClawConfig + logger; methods: send(channel, target, message), verifySignature(body, signature), resolveTenant(channel), isDuplicate(sessionId, message)
- [x] T006 Export bridge module from packages/core/src/bridge/index.ts — re-export OpenClawBridge, MessageRenderer, and types

**Checkpoint**: Bridge module compiles independently. Ready for user story integration.

---

## Phase 3: User Story 1 — Receive IM Commands via OpenClaw (Priority: P1)

**Goal**: Accept inbound webhooks from OpenClaw, parse commands, execute through existing command pipeline, send reply.

**Independent Test**: POST a mock OpenClaw `message.received` webhook payload to `/webhooks/openclaw` with a valid `/topichub create` command and verify the topic is created and a reply is sent.

### Implementation for User Story 1

- [x] T007 [US1] Add inbound webhook handling to OpenClawBridge in packages/core/src/bridge/openclaw-bridge.ts — implement handleInboundWebhook(payload, rawBody) method: verify signature, filter event type, detect command prefix, check dedup, resolve tenant, return parsed command context (channel, user, message, tenantId, platform)
- [x] T008 [US1] Modify WebhookHandler to support OpenClaw inbound path in packages/core/src/webhook/webhook-handler.ts — add handleOpenClawWebhook(payload, rawBody) method that delegates to OpenClawBridge.handleInboundWebhook(), then feeds result into existing CommandParser → CommandRouter → commandDispatcher pipeline
- [x] T009 [US1] Wire OpenClawBridge into TopicHub.create() in packages/core/src/topichub.ts — instantiate OpenClawBridge from config.openclaw (if present), pass to WebhookHandler; add bridge-based reply sending after command execution
- [x] T010 [US1] Update WebhookController in packages/server/src/api.controller.ts — ensure POST /webhooks/openclaw route passes raw body for signature verification to hub.webhook.handleOpenClaw()

**Checkpoint**: Inbound commands from OpenClaw are received, parsed, and executed. Reply sent back via bridge.

---

## Phase 4: User Story 2 — Send Rich Text Replies to IM (Priority: P1)

**Goal**: Send markdown notifications for topic lifecycle events and command results via OpenClaw's send API.

**Independent Test**: Create a topic via REST API and verify a rich text notification is sent to the mapped OpenClaw channel.

### Implementation for User Story 2

- [x] T011 [US2] Implement outbound send in OpenClawBridge in packages/core/src/bridge/openclaw-bridge.ts — implement sendMessage(channel, target, message) using fetch() to POST to {gatewayUrl}/api/v1/send with Bearer token auth, action: "send", and error handling (log + graceful failure)
- [x] T012 [US2] Implement notifyTenantChannels(tenantId, topicData, operation) in OpenClawBridge in packages/core/src/bridge/openclaw-bridge.ts — resolve all channels mapped to the tenant from config.tenantMapping, render topic as markdown via MessageRenderer, send to each channel
- [x] T013 [US2] Modify SkillPipeline.execute() in packages/core/src/skill/pipeline/skill-pipeline.ts — add runBridgeNotifications() step (replacing runPlatformSkills) that calls OpenClawBridge.notifyTenantChannels() for created/updated/status_changed/assigned/closed/reopened operations
- [x] T014 [US2] Update TopicHub messaging facade in packages/core/src/topichub.ts — replace messaging.send() to delegate to OpenClawBridge.sendMessage(); remove messaging.postCard() (no longer needed); update MessagingOperations type

**Checkpoint**: Topic lifecycle events produce markdown notifications in IM channels via OpenClaw.

---

## Phase 5: User Story 4 — Remove PlatformSkill from Codebase (Priority: P1)

**Goal**: Complete removal of PlatformSkill interface, types, registry paths, and the lark-bot skill package.

**Independent Test**: Run `rg PlatformSkill packages/` — zero matches. Run `pnpm build` — success with no errors.

### Implementation for User Story 4

- [x] T015 [P] [US4] Delete packages/core/src/skill/interfaces/platform-skill.ts
- [x] T016 [P] [US4] Delete packages/skills/platforms/lark-bot/ directory entirely
- [x] T017 [P] [US4] Delete packages/cli/src/scaffold/templates/platform-skill.ts
- [x] T018 [US4] Remove PlatformSkill re-export from packages/core/src/skill/interfaces/index.ts
- [x] T019 [US4] Remove PlatformSkill from AnySkill union, remove getPlatformSkills() method, remove PLATFORM category handling from resolveCategory() and extractMetadata() in packages/core/src/skill/registry/skill-registry.ts
- [x] T020 [US4] Remove PLATFORM from SkillCategory enum in packages/core/src/common/enums.ts
- [x] T021 [US4] Remove PlatformSkill exports (PlatformSkill, PlatformSkillManifest, PlatformCapability, CommandResult, CreateGroupParams, GroupResult, PostCardParams) from packages/core/src/index.ts — add OpenClawBridge and MessageRenderer exports
- [x] T022 [US4] Remove runPlatformSkills() method from packages/core/src/skill/pipeline/skill-pipeline.ts (already replaced by bridge notifications in T013)
- [x] T023 [US4] Remove handlePlatformWebhook() and findPlatformSkill() from packages/core/src/webhook/webhook-handler.ts
- [x] T024 [US4] Remove findPlatformSkill() private method from packages/core/src/topichub.ts — remove old messaging.postCard path (already replaced in T014)
- [x] T025 [US4] Remove platform skill scaffold generation from packages/cli/src/scaffold/skill-scaffold.ts — remove import of generatePlatformSkill and the platform case
- [x] T026 [US4] Update documentation reference to PlatformSkill in packages/cli/src/scaffold/repo-scaffold.ts
- [x] T027 [US4] Verify build passes: run `pnpm build` from monorepo root and fix any remaining compilation errors from PlatformSkill references

**Checkpoint**: Zero PlatformSkill references in source code. Build succeeds. All existing tests pass.

---

## Phase 6: User Story 3 — Configure OpenClaw Connection (Priority: P2)

**Goal**: Enable administrators to configure the OpenClaw bridge via environment variables, config file, or CLI setup flow.

**Independent Test**: Set TOPICHUB_OPENCLAW_GATEWAY_URL and related env vars, start the server, and verify the bridge initializes with the correct config.

### Implementation for User Story 3

- [x] T028 [US3] Add openclaw config fields to CLI LocalConfigSchema in packages/cli/src/config/config.schema.ts — add optional openclawGatewayUrl, openclawToken, openclawWebhookSecret, openclawTenantMapping fields
- [x] T029 [US3] Add environment variable loading for OpenClaw config in packages/server/src/topichub.provider.ts — read TOPICHUB_OPENCLAW_GATEWAY_URL, TOPICHUB_OPENCLAW_TOKEN, TOPICHUB_OPENCLAW_WEBHOOK_SECRET, TOPICHUB_OPENCLAW_TENANT_MAPPING (JSON) and pass to TopicHub.create()
- [x] T030 [US3] Add OpenClaw config validation on TopicHub startup in packages/core/src/topichub.ts — if openclaw config is present, validate with zod schema; log warning if absent (IM messaging disabled)

**Checkpoint**: OpenClaw bridge can be configured via env vars or programmatic config. Invalid config produces clear error messages.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and cleanup across monorepo

- [x] T031 [P] Update packages/skills/AGENTS.md — remove PlatformSkill section, add OpenClaw bridge documentation
- [x] T032 [P] Update packages/skills/CLAUDE.md — remove PlatformSkill references, document bridge
- [x] T033 [P] Update .cursor/skills/writing-topic-hub/SKILL.md — remove platform skill category from table, update Interface Contracts section, note bridge replaces platform skills
- [x] T034 Run full build and lint: `pnpm build && pnpm lint` from monorepo root — fix any remaining issues
- [x] T035 Run quickstart.md validation — verify the documented setup steps produce a working configuration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003)
- **US1 (Phase 3)**: Depends on Foundational (T004-T006)
- **US2 (Phase 4)**: Depends on Foundational (T004-T006); can run in parallel with US1
- **US4 (Phase 5)**: Depends on US1 (Phase 3) AND US2 (Phase 4) — removal happens AFTER replacements are wired in
- **US3 (Phase 6)**: Depends on Foundational (T004-T006); can run in parallel with US1/US2
- **Polish (Phase 7)**: Depends on US4 (Phase 5) completion

### User Story Dependencies

- **US1 (P1)**: Needs Foundational. No dependency on other stories.
- **US2 (P1)**: Needs Foundational. No dependency on US1 (different code paths).
- **US4 (P1)**: MUST wait for US1 + US2 — cannot remove PlatformSkill until bridge replacements are in place.
- **US3 (P2)**: Needs Foundational. Independent of US1/US2/US4.

### Within Each User Story

- Bridge types (Foundational) before bridge usage (US1/US2)
- Inbound handling (US1) before outbound notifications (US2) if sequential
- Both US1 and US2 before PlatformSkill removal (US4)
- Config (US3) can be done at any time after Foundational

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Foundational
- US3 (Phase 6) can run in parallel with US1/US2
- T015, T016, T017 within US4 can run in parallel (independent file deletions)
- T031, T032, T033 in Polish can run in parallel (independent doc files)

---

## Parallel Example: After Foundational

```text
# These can all start simultaneously after Phase 2 completes:

Agent A (US1 — inbound):
  T007 → T008 → T009 → T010

Agent B (US2 — outbound):
  T011 → T012 → T013 → T014

Agent C (US3 — config):
  T028 → T029 → T030

# Then sequentially:
Agent A or B (US4 — removal): T015-T027
Agent any (Polish): T031-T035
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T006)
3. Complete Phase 3: US1 — Inbound commands (T007-T010)
4. **STOP and VALIDATE**: Send a mock webhook and verify command execution
5. Both old (PlatformSkill) and new (bridge) paths coexist temporarily

### Incremental Delivery

1. Setup + Foundational → Bridge module exists
2. US1 → Inbound commands work via OpenClaw → Validate
3. US2 → Outbound notifications work via OpenClaw → Validate
4. US4 → PlatformSkill fully removed → Build passes, zero references
5. US3 → Config via env vars / CLI → Validate
6. Polish → Docs updated → Ready for PR

### Single-Developer Sequential

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015-T027 → T028 → T029 → T030 → T031-T035

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- US4 (PlatformSkill removal) is intentionally Phase 5 — after US1+US2 wire in the replacements
- CardData types are NOT removed — they belong to TypeSkill, not PlatformSkill
- SkillCategory.PLATFORM is removed but TYPE and ADAPTER remain
- Commit after each phase or logical group
