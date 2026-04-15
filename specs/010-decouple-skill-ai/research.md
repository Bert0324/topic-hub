# Research: Decouple Skill AI

## R1: Where AI is used in the Skill pipeline and how to remove it

**Decision**: Remove the `runSkillAi` step from `SkillPipeline.execute()` entirely.

**Rationale**: The pipeline currently runs four sequential steps: `runTypeSkillHook` → `runSkillAi` → `createTaskDispatch` → `runBridgeNotifications`. The `runSkillAi` step is the only place where `SkillAiRuntime` is called, which in turn is the only call site for `AiService.complete()` during Skill execution. Removing this single call from the pipeline cuts all AI coupling. The `SkillAiRuntime` class, while no longer used in the pipeline, can be deleted or kept as dead code — deletion is preferred for cleanliness.

**Alternatives considered**:
- Making `runSkillAi` a no-op: Rejected — leaving dead code paths violates the constitution's "no dead code" principle.
- Keeping `SkillAiRuntime` but disabling it via config: Rejected — adds unnecessary complexity and doesn't achieve the goal of structural decoupling.

## R2: How to enrich dispatch payloads with SKILL.md instructions

**Decision**: Add a `skillInstructions` field to `EnrichedPayload` containing the resolved SKILL.md instruction text (event-specific section or full body), the full SKILL.md body for context, event name, and frontmatter metadata.

**Rationale**: Currently `createTaskDispatch` builds `enrichedPayload` with only `topic` (snapshot) and `event` (context). The local agent needs the Skill's instructions to know what to do. The `SkillMdParser` already parses event-specific sections and the full body. The pipeline already resolves the type skill and has access to the `SkillRegistry` which caches parsed SKILL.md data. Adding the instruction content to the dispatch payload is a straightforward extension.

**Alternatives considered**:
- Having the local CLI load SKILL.md from its own filesystem: This is already how `ai run` works, but `serve` mode receives dispatches from the server. The CLI may not have the same Skill directory or version. Including instructions in the dispatch ensures the server-side Skill definition is authoritative.
- Storing SKILL.md content separately and referencing by ID: Over-engineered — the payload is already a mixed document and the content is small (kilobytes at most).

## R3: Standalone AI API design pattern

**Decision**: Add two new endpoints on the server: `POST /api/v1/ai/summarize` (topic summarization) and `POST /api/v1/ai/ask` (general AI assistant). Both are tenant-scoped (require auth via existing `tenant()` pattern), accept a topic ID, call `AiService.complete()`, and record results on the timeline.

**Rationale**: The server already has `AiService` fully wired with rate limiting, circuit breaker, tenant checks, and usage tracking. Adding thin endpoint handlers that assemble topic context and call `AiService.complete()` is the simplest approach. The existing `ApiController` pattern (with `tenant()` auth helper and `toHttpError()` error mapping) provides a consistent template.

**Alternatives considered**:
- Creating a separate NestJS module for AI API: Over-engineered for two endpoints — the existing `ApiController` handles all tenant-scoped routes and this fits naturally.
- Using a generic `POST /api/v1/ai` endpoint with an action discriminator: Less explicit and harder to document. Separate endpoints are clearer.

## R4: How the CLI should call standalone AI APIs

**Decision**: Add `summarize` and `ask` subcommands to the existing `topichub-admin ai` command group. These use `ApiClient` to call the new server endpoints, display results, and confirm timeline writes.

**Rationale**: The CLI already has an `ai` subcommand group with `status`, `enable`, `disable`, `config`, `usage`, and `run`. Adding `summarize` and `ask` follows the same pattern. The `ApiClient` class handles auth headers and server URL resolution.

**Alternatives considered**:
- Creating a separate `topichub-admin topic` command: Rejected — these are AI operations, not topic CRUD. The `ai` group is the natural home.

## R5: Code skill AI injection (`manifest.ai = true`)

**Decision**: Remove the `aiService` injection in `SkillRegistry.initSkill()`. Code skills that set `manifest.ai = true` previously received `aiService` via `init({ aiService })`. Since no existing code skill actually calls `aiService.complete()` directly (they rely on `SkillAiRuntime`), this injection is dead code after the pipeline change. If a code skill needs AI in the future, it should use the standalone API.

**Rationale**: Grep across the codebase shows no code skill calling `aiService.complete()`. The only consumer was `SkillAiRuntime`. Removing this injection simplifies the `SkillRegistry` constructor (it no longer needs `aiService`).

**Alternatives considered**:
- Keeping the injection for backward compatibility: Rejected — there are no consumers, and it creates confusing API surface.

## R6: Impact on local serve TaskProcessor

**Decision**: Update `TaskProcessor.buildPrompt()` to include the `skillInstructions` field from the enriched dispatch payload. The instructions become the primary guidance for the local agent, prepended to the prompt before topic/event context. If `skillInstructions` is absent (backward compatibility with old dispatches), fall back to the current behavior.

**Rationale**: The dispatch payload is the TaskProcessor's sole source of information. Adding instructions there and consuming them in `buildPrompt` completes the end-to-end flow. The existing SKILL.md file path mechanism in `ai run` remains unchanged (it loads from local filesystem for one-off runs).

**Alternatives considered**:
- Having TaskProcessor load SKILL.md from local filesystem during serve mode: Rejected — the dispatch should be self-contained, and the server is the source of truth for Skill definitions.

## R7: TopicHub core wiring changes

**Decision**: Add an `ai` operations interface on `TopicHub` (similar to `admin`, `topics`, `dispatch`) that exposes `summarize(tenantId, topicId)` and `ask(tenantId, topicId, question)`. These methods assemble context, call `AiService.complete()`, and record timeline entries. The server's `ApiController` delegates to these methods.

**Rationale**: The `TopicHub` class is the facade for all operations. Adding AI operations here follows the existing pattern and keeps the server controller thin. The `AiService` is already available as a private field on `TopicHub`.

**Alternatives considered**:
- Having the controller call `AiService` directly: Violates the pattern where controllers delegate to `TopicHub` methods. Would bypass the facade.
