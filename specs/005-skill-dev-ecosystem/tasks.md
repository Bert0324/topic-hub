# Tasks: Skill Development Ecosystem

**Input**: Design documents from `/specs/005-skill-dev-ecosystem/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Shared infrastructure and dependencies

- [x] T001 Add `inquirer` (or `@inquirer/prompts`) dependency to packages/cli/package.json for interactive Q&A flows
- [x] T002 [P] Create packages/cli/src/scaffold/ directory structure with empty barrel file packages/cli/src/scaffold/index.ts
- [x] T003 [P] Create packages/cli/src/commands/skill-repo/index.ts with command routing stub (export `handleSkillRepoCommand`)
- [x] T004 [P] Create packages/cli/src/commands/publish/index.ts with command routing stub (export `handlePublishCommand`)
- [x] T005 [P] Create packages/cli/src/commands/group/index.ts with command routing stub (export `handleGroupCommand`)
- [x] T006 Register new commands (`skill-repo`, `publish`, `group`) in packages/cli/src/index.tsx main switch

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Create unified manifest validation schema (zod) in packages/server/src/skill/interfaces/skill-manifest.ts per contracts/skill-manifest.md — export `SkillManifestSchema`, `PublishPayloadSchema`
- [x] T008 [P] Add `tenantId` (string | null, default null), `isPrivate` (boolean, default false), and `publishedContent` (embedded `PublishedSkillContent`) fields to packages/server/src/skill/entities/skill-registration.entity.ts per data-model.md
- [x] T009 Add compound unique index `{ name: 1, tenantId: 1 }` and regular index `{ tenantId: 1, isPrivate: 1 }` to `SkillRegistration` entity in packages/server/src/skill/entities/skill-registration.entity.ts
- [x] T010 [P] Create CLI-side manifest validation utility in packages/cli/src/scaffold/manifest-validator.ts — reusable zod schema for validating skill manifests before publish (import shared types or duplicate schema)
- [x] T011 Update skill listing in packages/server/src/admin/admin.service.ts to filter by tenant scope: `(isPrivate = false) OR (tenantId = requestingTenantId)` in `listSkills` method
- [x] T012 Update packages/server/src/skill/registry/skill-registry.ts to support tenant-scoped skill resolution — when resolving a skill by name, include tenant context to find private skills

**Checkpoint**: Foundation ready — entity changes deployed, validation schemas available, tenant-scoped queries working

---

## Phase 3: User Story 4 - Private Skill Repositories per Tenant (Priority: P1) 🎯 MVP

**Goal**: Tenant admins can create skill repo projects via CLI, publish skills as a batch, and private skills are isolated per tenant

**Independent Test**: Create a skill repo via `topichub skill-repo create`, add a minimal skill manually, run `topichub publish`, verify it appears for the owning tenant only

### Implementation for User Story 4

- [x] T013 [US4] Create repo scaffolding logic in packages/cli/src/scaffold/repo-scaffold.ts — generates project structure (package.json, tsconfig.json, .gitignore, skills/ dir, .topichub-repo.json, README.md) per contracts/cli-commands.md
- [x] T014 [US4] Implement `handleSkillRepoCommand` in packages/cli/src/commands/skill-repo/index.ts — parse args, check admin auth, call `scaffoldRepo()`, init git, print success
- [x] T015 [P] [US4] Add `publishSkills` and `createGroup` methods to packages/cli/src/api-client/api-client.ts — `POST /admin/skills/publish` with batch payload, `POST /admin/groups`
- [x] T016 [US4] Implement publish logic in packages/cli/src/commands/publish/index.ts — detect repo root via `.topichub-repo.json`, scan `skills/` dir, validate each manifest, read SKILL.md + source files, build batch payload, call `apiClient.publishSkills()`, report results per contracts/cli-commands.md
- [x] T017 [P] [US4] Implement `POST /admin/skills/publish` endpoint in packages/server/src/admin/admin.controller.ts — accept batch payload, validate with `PublishPayloadSchema`, delegate to service
- [x] T018 [US4] Implement `publishSkills` method in packages/server/src/admin/admin.service.ts — upsert `SkillRegistration` for each skill with `isPrivate: true`, `tenantId`, embedded `publishedContent`; auto-enable in `TenantSkillConfig`; return created/updated status per contracts/server-api.md
- [x] T019 [US4] Enhance `GET /admin/skills` in packages/server/src/admin/admin.controller.ts to accept `scope` and `tenantId` query params; update `listSkills` response to include `isPrivate` and `tenantId` fields
- [x] T020 [US4] Update `topichub skill list` in packages/cli/src/commands/skill/index.ts to support `--scope` and `--category` flags; display SCOPE column (public/private) per contracts/cli-commands.md
- [x] T021 [US4] Add `--dry-run` flag to publish command in packages/cli/src/commands/publish/index.ts — validate and display what would be published without sending

**Checkpoint**: Skill repo creation and batch publish working end-to-end; private skills isolated per tenant

---

## Phase 4: User Story 1 - CLI-Guided Skill Creation (Priority: P1)

**Goal**: Developers can create skills inside a repo via interactive Q&A that adapts to the selected category

**Independent Test**: Inside an existing skill repo, run `topichub skill create`, answer Q&A prompts for each category (topic/platform/adapter), verify scaffolded files match the category

### Implementation for User Story 1

- [x] T022 [US1] Implement interactive Q&A engine in packages/cli/src/scaffold/qa-flow.ts — sequential prompt flow: name → category → category-specific questions → confirmation; support `--non-interactive` mode with defaults
- [x] T023 [P] [US1] Create topic skill scaffold template in packages/cli/src/scaffold/templates/topic-skill/ — package.json template (with topichub.topicType, hooks, schema), SKILL.md template, src/index.ts implementing TypeSkill interface, README.md
- [x] T024 [P] [US1] Create platform skill scaffold template in packages/cli/src/scaffold/templates/platform-skill/ — package.json template (with topichub.platform, capabilities), SKILL.md template, src/index.ts implementing PlatformSkill interface (handleWebhook, postCard, createGroup stubs), README.md
- [x] T025 [P] [US1] Create adapter skill scaffold template in packages/cli/src/scaffold/templates/adapter-skill/ — package.json template (with topichub.sourceSystem, auth config), SKILL.md template, src/index.ts implementing AdapterSkill interface (transformWebhook, runSetup stubs), README.md
- [x] T026 [US1] Implement skill scaffolding logic in packages/cli/src/scaffold/skill-scaffold.ts — takes Q&A answers, selects template, renders with user values, writes to `skills/<name>/` dir, validates result with manifest schema
- [x] T027 [US1] Wire `skill create` subcommand in packages/cli/src/commands/skill/index.ts — detect `.topichub-repo.json` (reject if missing), run Q&A flow, call `scaffoldSkill()`, print success with next steps
- [x] T028 [US1] Add name conflict detection in packages/cli/src/scaffold/skill-scaffold.ts — check if `skills/<name>/` already exists before scaffolding; prompt for overwrite or abort

**Checkpoint**: `topichub skill create` produces valid, category-specific skill scaffolds inside a repo

---

## Phase 5: User Story 6 - AI-Assisted Skill Development (Priority: P2)

**Goal**: Scaffolded repos include bundled AI agent skills that teach Cursor/Claude Code/Codex how to write Topic Hub skills

**Independent Test**: Create a skill repo, verify `.cursor/rules/writing-topic-hub.mdc`, `AGENTS.md`, and `CLAUDE.md` exist with meaningful content; open in Cursor and verify rules load

### Implementation for User Story 6

- [x] T029 [P] [US6] Create writing-topic-hub cursor rule template in packages/cli/src/scaffold/templates/agent-skills/cursor-rules/writing-topic-hub.mdc — include skill manifest schema per category, SKILL.md format, interface contracts (TypeSkill/PlatformSkill/AdapterSkill), testing patterns, publish workflow
- [x] T030 [P] [US6] Create AGENTS.md template in packages/cli/src/scaffold/templates/agent-skills/AGENTS.md — equivalent content for Claude Code and Codex agents
- [x] T031 [P] [US6] Create CLAUDE.md template in packages/cli/src/scaffold/templates/agent-skills/CLAUDE.md — Claude Code-specific configuration referencing AGENTS.md
- [x] T032 [US6] Integrate agent skill templates into repo scaffold — update packages/cli/src/scaffold/repo-scaffold.ts to copy agent-skills templates (.cursor/rules/, AGENTS.md, CLAUDE.md) into the generated repo

**Checkpoint**: New skill repos auto-include AI agent skills; developers' AI tools provide contextual guidance

---

## Phase 6: User Story 2 - Platform IM Integration (Priority: P1)

**Goal**: Platform skills can receive webhooks, parse commands, and admins can create IM groups from CLI — only three integration points needed

**Independent Test**: Install a platform skill, send a simulated webhook message, verify command parsing and response; create a group via CLI

### Implementation for User Story 2

- [x] T033 [US2] Implement `POST /admin/groups` endpoint in packages/server/src/admin/admin.controller.ts — accept group creation request, resolve platform skill, delegate to `platformSkill.createGroup()`, return result per contracts/server-api.md
- [x] T034 [US2] Implement group creation service method in packages/server/src/admin/admin.service.ts — resolve platform skill by platform name from registry, call `createGroup`, handle platform API errors (502 on external failure)
- [x] T035 [US2] Implement `topichub group create` CLI command in packages/cli/src/commands/group/index.ts — parse args (group-name, --platform, --members, --topic-type), call `apiClient.createGroup()`, display result per contracts/cli-commands.md
- [x] T036 [US2] Verify existing webhook controller in packages/server/src/command/webhook.controller.ts handles the three-interface contract: handleWebhook → command parsing → response; document any gaps and fix if needed

**Checkpoint**: Group creation works via CLI; webhook → command → response pipeline verified

---

## Phase 7: User Story 3 - External Platform Adapter with Transparent Auth (Priority: P2)

**Goal**: Adapter skills transparently handle authentication — one-time login flow, credential storage, auto-refresh

**Independent Test**: Install an adapter skill, request public data (no auth needed), request private data (triggers auth flow), verify credentials stored and reused

### Implementation for User Story 3

- [x] T037 [P] [US3] Create credential store module in packages/cli/src/auth/credential-store.ts — `get(adapterName, userId)`, `set(adapterName, userId, credential)`, `delete(adapterName, userId)` using keytar (OS keychain) with encrypted file fallback; per data-model.md AdapterCredential type
- [x] T038 [P] [US3] Create credential types in packages/cli/src/auth/adapter-credential.ts — `AdapterCredential` interface (adapterName, userId, tokenType, accessToken, refreshToken, expiresAt), `isExpired()` utility
- [x] T039 [US3] Implement auth flow orchestrator in packages/cli/src/auth/adapter-auth-flow.ts — detect if auth needed (from adapter manifest `auth.type`), check credential store, initiate OAuth2/API key flow if missing or expired, store result, return credential
- [x] T040 [US3] Integrate credential flow into adapter skill `runSetup` pattern — update packages/cli/src/executors/ or serve pipeline to inject `CredentialStore` into adapter skill context so `runSetup` can trigger auth flows

**Checkpoint**: Adapter skills can transparently authenticate; credentials persist across sessions

---

## Phase 8: User Story 5 - Local Topic Debugging via CLI (Priority: P2)

**Goal**: CLI serve mode provides enhanced debug output and hot-reloads SKILL.md on each dispatch

**Independent Test**: Run `topichub serve`, dispatch a topic, verify enhanced terminal output; modify SKILL.md, dispatch again, verify new content is used

### Implementation for User Story 5

- [x] T041 [US5] Enhance debug output in packages/cli/src/commands/serve/index.ts — add structured log prefixes: [DISPATCH], [CLAIM], [AGENT], [RESULT], [ERROR] with topic ID, skill name, duration, and error context per contracts/cli-commands.md
- [x] T042 [US5] Implement SKILL.md hot-reload in serve task processor — update packages/cli/src/commands/serve/ to re-read SKILL.md from disk on each new dispatch instead of caching at startup; use `gray-matter` to parse on-the-fly
- [x] T043 [US5] Add error context formatting in packages/cli/src/commands/serve/index.ts — on skill processing failure, display skill name, topic ID, error message, and stack trace in a structured format for debugging

**Checkpoint**: Serve mode provides actionable debug output; SKILL.md changes take effect immediately

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T044 [P] Add input validation for all new CLI commands — validate repo names, skill names, group names match expected patterns before API calls
- [x] T045 [P] Add comprehensive error messages for auth failures across all new commands — consistent "Not authenticated. Run `topichub init` first." message
- [x] T046 [P] Update packages/cli/README or help text to document new commands: skill-repo, publish, group, skill create
- [x] T047 Run quickstart.md validation — execute the full developer workflow (init → skill-repo create → skill create → publish → serve) end-to-end
- [x] T048 [P] Review all new server endpoints for proper admin guard usage — verify `AdminGuard` or equivalent is applied to `/admin/skills/publish` and `/admin/groups`

---

## Phase 10: Unified Workflow — Public Publish Support (Clarification Delta)

**Purpose**: Implement the `--public` flag for super-admin publishing, ensuring public and private skills share the same development workflow

**Prerequisite**: All previous phases complete (T001–T048)

- [x] T049 [US4] Add `--public` flag parsing to packages/cli/src/commands/publish/index.ts — when `--public` is present, include `isPublic: true` in the publish payload; display "(public)" or "(private)" in the publishing message
- [x] T050 [US4] Update `PublishPayloadSchema` in packages/server/src/skill/interfaces/skill-manifest.ts to accept optional `isPublic` boolean field (default `false`)
- [x] T051 [US4] Add super-admin detection to the server — add `isSuperAdmin` boolean field to the Tenant entity in packages/server/src/tenant/ (or equivalent); update tenant creation to support this flag
- [x] T052 [US4] Update `publishSkills` in packages/server/src/admin/admin.service.ts — when `isPublic: true`, validate the requesting tenant has `isSuperAdmin: true` (return 403 if not); set `isPrivate: false` and `tenantId: null` on the upserted skills
- [x] T053 [US4] Handle 403 response in packages/cli/src/commands/publish/index.ts — if server returns 403 on `--public`, display "Permission denied. Only super-admins can publish public skills." and exit with code 4

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US4 (Phase 3)**: Depends on Foundational — MUST complete before US1 and US6
- **US1 (Phase 4)**: Depends on US4 (skill creation happens inside a repo)
- **US6 (Phase 5)**: Depends on US4 (agent skills are bundled in repo scaffold)
- **US2 (Phase 6)**: Depends on Foundational only — can run in parallel with US4/US1
- **US3 (Phase 7)**: Depends on Foundational only — can run in parallel with US4/US1
- **US5 (Phase 8)**: Depends on Foundational only — can run in parallel with US4/US1
- **Polish (Phase 9)**: Depends on all user stories being complete
- **Unified Workflow (Phase 10)**: Depends on Phase 9; adds `--public` flag for super-admin publishing

### User Story Dependencies

- **US4 (P1)**: Foundation — can start after Phase 2. **Blocks US1 and US6.**
- **US1 (P1)**: Depends on US4 (needs repo to create skills in)
- **US6 (P2)**: Depends on US4 (meta-skills are part of repo scaffold)
- **US2 (P1)**: Independent — can start after Phase 2 in parallel with US4
- **US3 (P2)**: Independent — can start after Phase 2 in parallel with US4
- **US5 (P2)**: Independent — can start after Phase 2 in parallel with US4

### Within Each User Story

- Models/schemas before services
- Services before endpoints/commands
- Core logic before CLI wiring
- Validation before user-facing features

### Parallel Opportunities

- T003/T004/T005 can all run in parallel (different files)
- T008/T010 can run in parallel (server entity vs CLI validator)
- T023/T024/T025 can all run in parallel (different template directories)
- T029/T030/T031 can all run in parallel (different agent skill files)
- T037/T038 can run in parallel (credential store vs types)
- US2, US3, US5 can all run in parallel with each other (independent of each other)

---

## Parallel Example: User Story 4

```bash
# Launch API client methods and server endpoint in parallel:
Task: "Add publishSkills and createGroup methods to packages/cli/src/api-client/api-client.ts"
Task: "Implement POST /admin/skills/publish endpoint in packages/server/src/admin/admin.controller.ts"
```

## Parallel Example: User Story 1

```bash
# Launch all three scaffold templates in parallel:
Task: "Create topic skill scaffold template in packages/cli/src/scaffold/templates/topic-skill/"
Task: "Create platform skill scaffold template in packages/cli/src/scaffold/templates/platform-skill/"
Task: "Create adapter skill scaffold template in packages/cli/src/scaffold/templates/adapter-skill/"
```

---

## Phase 11: Category-Based Directory Structure (Clarification Delta)

**Purpose**: Organize skills by category subdirectories (`topics/`, `platforms/`, `adapters/`) and add writing-topic-hub agent skills to public skill directory

**Prerequisite**: Phase 10 complete

- [x] T054 [US4] Fix typo: rename packages/skills/adpters/ to packages/skills/adapters/
- [x] T055 [P] [US4] Update packages/cli/src/scaffold/repo-scaffold.ts to create `skills/topics/`, `skills/platforms/`, `skills/adapters/` instead of flat `skills/`
- [x] T056 [US4] Update packages/cli/src/scaffold/skill-scaffold.ts to place skills in category subdirectory (type→topics, platform→platforms, adapter→adapters)
- [x] T057 [US4] Update packages/cli/src/commands/publish/index.ts to scan category subdirectories instead of flat `skills/*`
- [x] T058 [P] [US6] Update packages/cli/src/scaffold/templates/agent-skills/AGENTS.md to reference category-based paths
- [x] T059 [P] [US6] Update packages/cli/src/scaffold/templates/agent-skills/CLAUDE.md to reference category subdirectories
- [x] T060 [P] [US6] Update packages/cli/src/scaffold/templates/agent-skills/writing-topic-hub.mdc to reference category-based structure
- [x] T061 [P] [US6] Add AI agent skill files to packages/skills/ — create .cursor/rules/writing-topic-hub.mdc, AGENTS.md, CLAUDE.md for public skill development

**Checkpoint**: All skill repos (public and private) use category-based directory layout; packages/skills/ has AI development support

---

## Implementation Strategy

### MVP First (User Story 4 → User Story 1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US4 — Private Skill Repos (create repo + publish)
4. Complete Phase 4: US1 — CLI Skill Creation (Q&A scaffold)
5. **STOP and VALIDATE**: Create a repo, scaffold a skill, publish it, verify tenant isolation
6. Deploy/demo if ready — this is the core developer workflow

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US4 → Repo creation + publish working (MVP core)
3. Add US1 → Full Q&A skill creation → **MVP complete**
4. Add US6 → AI agent skills bundled → Developer experience enhanced
5. Add US2 → Platform integration → IM groups working
6. Add US3 → Adapter auth → External platform access
7. Add US5 → Debug enhancements → Developer iteration speed
8. Polish → Production ready

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US4 → US1 → US6 (repo-first chain)
   - Developer B: US2 (platform integration, independent)
   - Developer C: US3 + US5 (adapter auth + debug, independent)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US4 is the foundation: repo-first workflow means repo must exist before skills can be created
- US1 and US6 form a chain with US4: repo → skill creation → AI assistance
- US2, US3, US5 are fully independent and can be worked on in any order after foundational
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
