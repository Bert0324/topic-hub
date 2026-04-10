# Implementation Plan: Decouple Skill AI

**Branch**: `010-decouple-skill-ai` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-decouple-skill-ai/spec.md`

## Summary

Remove AI from the remote server's Skill pipeline so all Skill-driven AI execution happens on local agents (Claude Code, Codex, OpenClaw). Enrich task dispatch payloads with SKILL.md instructions so local agents are fully self-contained. Add standalone AI API endpoints (`/api/v1/ai/summarize`, `/api/v1/ai/ask`) for topic management operations, invoked via new CLI commands (`ai summarize`, `ai ask`). The server's `AiService` infrastructure is retained for the standalone APIs; only the pipeline integration (`SkillAiRuntime`) is removed.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Typegoose + Mongoose 8 (ODM), zod (validation), gray-matter (SKILL.md parsing), @inquirer/prompts (CLI)  
**Storage**: MongoDB 7 (existing collections: `task_dispatches`, `topics`, `timeline_entries`, `skill_registrations`, `tenant_skill_configs`, `ai_usage_records`)  
**Testing**: Jest 29, mongodb-memory-server (in-memory MongoDB for integration tests)  
**Target Platform**: Linux server (remote), Linux/macOS/WSL workstation (CLI)  
**Project Type**: Monorepo — `packages/core` (library), `packages/server` (NestJS web service), `packages/cli` (CLI tool)  
**Performance Goals**: API p50 < 200ms, p95 < 500ms for non-AI endpoints; AI endpoints limited by provider latency (~2-10s)  
**Constraints**: Backward compatible with existing dispatch payloads and timeline entries; zero data migration  
**Scale/Scope**: ~8 files changed, 2 new endpoints, 2 new CLI commands, 1 file deleted

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Code Quality First | ✅ Pass | Removing dead code (`SkillAiRuntime`), reducing coupling. No magic numbers — reuses existing constants. |
| II. Testing Standards | ✅ Pass | Plan includes unit tests for pipeline changes, dispatch enrichment, standalone AI operations, and CLI commands. Existing test infrastructure (Jest + mongodb-memory-server) is reused. |
| III. User Experience Consistency | ✅ N/A | No UI changes. CLI output follows existing patterns (`ai status`, `ai run`). |
| IV. Performance Requirements | ✅ Pass | Non-AI endpoints unaffected. AI endpoints (summarize, ask) are inherently limited by AI provider latency, same as the previous `SkillAiRuntime`. Pipeline becomes faster by removing the AI step. |
| V. Simplicity & Maintainability | ✅ Pass | Net reduction in complexity — removes `SkillAiRuntime` class and its pipeline integration. Standalone AI endpoints are thin wrappers around existing `AiService`. No new abstractions. |
| Security & Data Integrity | ✅ Pass | New endpoints use existing `tenant()` auth pattern. Input validation via zod. Rate limits and tenant isolation preserved via existing `AiService` guardrails. |
| Development Workflow | ✅ Pass | Feature branch, atomic commits, CI pipeline. Breaking change (Skills no longer produce server-side AI responses) documented in quickstart.md. |

## Project Structure

### Documentation (this feature)

```text
specs/010-decouple-skill-ai/
├── spec.md
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
├── quickstart.md              # Phase 1 output
├── contracts/
│   ├── api-endpoints.md       # REST API contracts
│   ├── cli-commands.md        # CLI command contracts
│   └── dispatch-payload.md    # Dispatch payload contract
└── checklists/
    └── requirements.md        # Spec quality checklist
```

### Source Code (files to modify)

```text
packages/core/
├── src/
│   ├── entities/
│   │   └── task-dispatch.entity.ts     # Add SkillInstructions to EnrichedPayload
│   ├── skill/
│   │   ├── pipeline/
│   │   │   ├── skill-pipeline.ts       # Remove runSkillAi, enrich dispatch
│   │   │   └── skill-ai-runtime.ts     # DELETE
│   │   ├── registry/
│   │   │   └── skill-registry.ts       # Remove aiService dependency
│   │   └── interfaces/
│   │       └── skill-md.ts             # (no change — types reused)
│   ├── ai/
│   │   └── ai.service.ts              # (no change — retained for standalone)
│   └── topichub.ts                     # Remove SkillAiRuntime wiring, add ai ops
└── tests/
    └── (new test files for pipeline, dispatch, AI ops)

packages/server/
└── src/
    └── api.controller.ts               # Add POST /ai/summarize, /ai/ask

packages/cli/
└── src/
    ├── commands/
    │   └── ai/
    │       └── index.ts                # Add summarize, ask subcommands
    └── commands/
        └── serve/
            └── task-processor.ts       # Update buildPrompt for skillInstructions
```

**Structure Decision**: Existing monorepo structure (`packages/core`, `packages/server`, `packages/cli`) is fully suitable. No new packages or modules needed. Changes are surgical modifications within existing files.

## Implementation Steps

### Step 1: Add SkillInstructions to EnrichedPayload entity

**File**: `packages/core/src/entities/task-dispatch.entity.ts`

Add a `SkillInstructions` embedded class with fields: `primaryInstruction`, `fullBody`, `eventName`, `frontmatter`. Add it as an optional field on `EnrichedPayload`.

See [data-model.md](./data-model.md) for the complete schema.

### Step 2: Remove SkillAiRuntime from pipeline

**File**: `packages/core/src/skill/pipeline/skill-pipeline.ts`

1. Remove the `import { SkillAiRuntime }` import
2. Remove `skillAiRuntime` from constructor parameter (change to not accept it)
3. Remove the `await this.runSkillAi(...)` call from `execute()`
4. Delete the entire `runSkillAi()` private method

### Step 3: Enrich dispatch with SKILL.md instructions

**File**: `packages/core/src/skill/pipeline/skill-pipeline.ts`

In `createTaskDispatch()`, after resolving the type skill:

1. Get parsed SKILL.md: `this.registry.getSkillMd(typeSkill.manifest.name)`
2. If it has AI instructions, resolve the event-specific section using `OPERATION_TO_EVENT`
3. Build the `skillInstructions` object
4. Add to `enrichedPayload` alongside `topic` and `event`

This requires importing `OPERATION_TO_EVENT` from `../interfaces/skill-md` and accepting the `SkillRegistry` reference (already available via `this.registry`).

### Step 4: Delete SkillAiRuntime

**File**: `packages/core/src/skill/pipeline/skill-ai-runtime.ts`

Delete the entire file. It is no longer referenced after Step 2.

### Step 5: Remove aiService from SkillRegistry

**File**: `packages/core/src/skill/registry/skill-registry.ts`

1. Remove `aiService` from constructor parameter
2. Remove `AiCompletionPort` import
3. In `initSkill()`, remove the `wantsAi` / `aiSvc` logic — pass `null` for `aiService` (or remove the `init({ aiService })` call entirely if no code skill uses it)

### Step 6: Update TopicHub wiring

**File**: `packages/core/src/topichub.ts`

1. Remove `SkillAiRuntime` import and construction
2. Update `SkillPipeline` constructor call (remove `skillAiRuntime` parameter)
3. Update `SkillRegistry` constructor call (remove `aiService` parameter)
4. Add an `AiOperations` interface and `get ai()` accessor:
   - `summarize(tenantId, topicId)` — fetch topic, assemble context, call `AiService.complete()`, create timeline entry
   - `ask(tenantId, topicId, question)` — same flow with user's question as the primary prompt

### Step 7: Add standalone AI API endpoints

**File**: `packages/server/src/api.controller.ts`

Add two new routes in the `ApiController`:

1. `POST api/v1/ai/summarize` — validates `topicId`, calls `hub.ai.summarize()`, returns summary + usage + timeline entry ID
2. `POST api/v1/ai/ask` — validates `topicId` + `question`, calls `hub.ai.ask()`, returns answer + usage + timeline entry ID

Both use the existing `tenant()` auth helper. Error handling maps AI unavailability to 503.

See [contracts/api-endpoints.md](./contracts/api-endpoints.md) for full request/response contracts.

### Step 8: Add CLI commands for standalone AI

**File**: `packages/cli/src/commands/ai/index.ts`

Add `summarize` and `ask` cases to the existing `switch (sub)`:

1. `summarize` — takes `topicId` from args, calls `POST /api/v1/ai/summarize`, displays result
2. `ask` — takes `topicId` and `question` from args, calls `POST /api/v1/ai/ask`, displays result

See [contracts/cli-commands.md](./contracts/cli-commands.md) for output format.

### Step 9: Update TaskProcessor prompt building

**File**: `packages/cli/src/commands/serve/task-processor.ts`

Update `buildPrompt()` to check for `enrichedPayload.skillInstructions`:

1. If present: prepend `## Skill Instructions\n<primaryInstruction>` to the prompt
2. If `fullBody` differs from `primaryInstruction`: add `## Full Skill Context\n<fullBody>`
3. Fall through to existing `## Topic` and `## Event` sections
4. If absent (backward compat): use current behavior unchanged

### Step 10: Tests

- **Unit**: Pipeline executes without AI, dispatch contains `skillInstructions`, standalone AI operations return expected results
- **Unit**: `buildPrompt` correctly incorporates `skillInstructions`
- **Integration**: End-to-end pipeline creates enriched dispatch when Skill has SKILL.md
- **Integration**: Standalone AI endpoint returns summary and creates timeline entry

## Complexity Tracking

No constitution violations. This feature simplifies the codebase by removing `SkillAiRuntime` and its pipeline coupling. The net line count change is approximately negative (more code removed than added).
