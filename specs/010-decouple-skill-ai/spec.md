# Feature Specification: Decouple Skill AI — Local-Only Execution with Standalone AI APIs

**Feature Branch**: `010-decouple-skill-ai`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "完全去掉remote里skill对ai的使用，具体解析执行完全交给本地agents执行引擎；对topic的总结等用到ai的功能，变成单独接口提供给cli使用"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skills Execute Entirely via Local Agents (Priority: P1)

When a topic lifecycle event fires (created, updated, assigned, etc.) and a Skill applies, the remote server no longer calls AI to process the Skill's instructions. Instead, it creates a task dispatch containing the Skill's SKILL.md instructions, the topic snapshot, and event context. The local CLI (running `topichub-admin serve`) picks up the dispatch and delegates it to the user's configured local agent (Claude Code, Codex, or OpenClaw). The agent processes the Skill's natural-language instructions, optionally uses MCP tools to interact with topic data, and writes the result back as a timeline entry. The entire AI processing happens on the local machine — the remote server is a pure data hub and dispatcher.

**Why this priority**: This is the core architectural change. Removing server-side AI from the Skill pipeline and routing all Skill execution through local agents is the foundation of the feature. Without this, the decoupling has not happened.

**Independent Test**: Can be tested by creating a topic that triggers a Skill with SKILL.md AI instructions, verifying that the remote server creates a task dispatch (without calling any AI), and confirming the local serve process picks it up, runs the agent, and writes the result to the timeline.

**Acceptance Scenarios**:

1. **Given** a Skill with a `SKILL.md` containing AI instructions for `onTopicCreated`, **When** a topic of that type is created, **Then** the remote server creates a task dispatch (no AI call on the server side) and the local agent processes the task and posts a timeline entry.
2. **Given** the same Skill and event as above, **When** no local CLI is running, **Then** the task dispatch is stored and awaits a local executor — the remote server does not attempt any AI processing itself.
3. **Given** a Skill without AI instructions in SKILL.md, **When** a topic lifecycle event occurs, **Then** the Skill pipeline continues to work as before — type hooks, bridge notifications, and task dispatches all function normally.
4. **Given** the remote server's AI configuration (env vars), **When** a Skill pipeline executes, **Then** the server's AI service is never invoked for Skill execution — it is reserved solely for standalone AI API endpoints.

---

### User Story 2 - CLI Uses Standalone AI APIs for Topic Management (Priority: P1)

A user wants to summarize a topic, generate tags, or perform other AI-assisted management tasks on a topic. Instead of these being embedded in the Skill pipeline, the remote server exposes dedicated AI API endpoints. The CLI calls these endpoints on demand — for example, `topichub-admin ai summarize <topic-id>` sends the topic data to the server's AI endpoint, which returns a summary. The user sees the result in their terminal and it is recorded on the topic's timeline. These AI operations are explicit, user-initiated actions — not automatic side effects of the Skill pipeline.

**Why this priority**: Users still need AI-powered management capabilities (summarization, tag suggestion, triage assistance). Moving these to standalone APIs ensures they remain available without coupling them to the Skill execution pipeline. This is the replacement for the AI functionality being removed from Skills.

**Independent Test**: Can be tested by creating a topic with content, running `topichub-admin ai summarize <topic-id>`, and verifying the server returns an AI-generated summary and records it on the topic's timeline.

**Acceptance Scenarios**:

1. **Given** a topic with timeline entries and metadata, **When** the user runs `topichub-admin ai summarize <topic-id>`, **Then** the CLI calls the server's AI summarization endpoint, receives a summary, displays it, and the summary is appended to the topic's timeline.
2. **Given** the server's AI service is unavailable (disabled or circuit breaker open), **When** the user runs an AI management command, **Then** the CLI receives a clear error indicating AI is unavailable and no partial or corrupted data is written.
3. **Given** a tenant has AI disabled, **When** the user runs an AI management command for that tenant, **Then** the CLI receives a message indicating AI features are not enabled for this tenant.
4. **Given** a topic, **When** the user runs an AI management command, **Then** the operation uses the same rate limiting and usage tracking as before — per-tenant limits still apply.

---

### User Story 3 - Skill Pipeline Runs Without AI Dependencies (Priority: P1)

The remote server's Skill pipeline operates without any AI service dependency. When a lifecycle event fires, the pipeline runs type-skill hooks, creates task dispatches for local execution, and sends bridge notifications. The `SkillAiRuntime` step is removed from the pipeline entirely. The server starts and runs normally even when `AI_ENABLED=false` or no AI provider is configured — the Skill pipeline is fully functional without AI. AI configuration on the server only affects the standalone AI API endpoints.

**Why this priority**: Decoupling the Skill pipeline from AI makes the server simpler, more reliable, and reduces operational complexity. The server can run without any AI provider configured, and Skills work purely through local agent dispatches.

**Independent Test**: Can be tested by starting the server with `AI_ENABLED=false`, creating topics that trigger Skills, and verifying the full pipeline runs (hooks, dispatches, notifications) without errors or missing functionality.

**Acceptance Scenarios**:

1. **Given** the server is started with `AI_ENABLED=false`, **When** a topic is created that triggers a Skill, **Then** the pipeline runs type hooks, creates a task dispatch, and sends bridge notifications — no errors, no missing steps.
2. **Given** the server is started with AI configured, **When** a Skill pipeline executes, **Then** no AI calls are made during the pipeline — the AI service is not invoked for any Skill-related processing.
3. **Given** the server previously had `SkillAiRuntime` entries in topic timelines, **When** the updated server processes new events, **Then** existing `AI_RESPONSE` timeline entries from previous versions are still readable and displayable — no data migration required.

---

### User Story 4 - Task Dispatches Carry Full Skill Context (Priority: P2)

When the Skill pipeline creates a task dispatch (because `SkillAiRuntime` no longer handles AI), the dispatch payload must carry the complete context that the local agent needs: the Skill's SKILL.md instructions (including event-specific sections), the full topic snapshot, the triggering event context, and any relevant tenant/Skill configuration. The local agent receives a self-contained package that enables it to perform the same quality of analysis that the server-side AI previously did — and more, since the local agent can also use MCP tools for multi-step reasoning.

**Why this priority**: The task dispatch is the bridge between the server and local execution. If it lacks context, the local agent cannot replicate the quality of server-side AI. Enriched dispatches ensure the transition is seamless.

**Independent Test**: Can be tested by triggering a Skill, inspecting the task dispatch payload, and verifying it contains the SKILL.md content (with event-specific section selected), topic snapshot, and event context.

**Acceptance Scenarios**:

1. **Given** a Skill with event-specific sections in SKILL.md (e.g., `## onTopicCreated`), **When** a `created` event fires, **Then** the task dispatch payload includes the matched event section content as the primary instruction, plus the full SKILL.md as supplementary context.
2. **Given** a Skill with no event-specific sections, **When** any lifecycle event fires, **Then** the task dispatch payload includes the full SKILL.md body as the instruction.
3. **Given** a topic with rich metadata (custom fields, signals, timeline), **When** a dispatch is created, **Then** the payload includes the complete topic snapshot — no data is omitted.

---

### Edge Cases

- What happens when a topic is created but no local CLI is connected? The task dispatch is stored on the server. When a local CLI connects later, it picks up pending dispatches. No AI processing occurs on the server side — the task waits.
- What happens when the server has AI configured but the user expects automatic Skill AI responses? Users must run a local agent (via `topichub-admin serve`) for Skills to produce AI results. This is a deliberate architectural change — a migration note should communicate this clearly.
- What happens when a standalone AI API endpoint is called for a topic that has no content? The API returns a meaningful response (e.g., "insufficient data for summarization") without erroring.
- What happens to existing `AI_RESPONSE` timeline entries from the old server-side AI? They remain in the database and are displayed normally. No migration is needed — they are historical records.
- What happens when the user runs an AI management command while a local agent is also processing the same topic? The operations are independent — the standalone API and agent dispatch operate on different concerns (management vs. Skill execution) and both write to the timeline with different action types and attributions.
- What happens when the AI provider rate limit is exceeded for standalone API calls? The API returns an appropriate error response indicating the rate limit has been reached, and the CLI displays this to the user.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Skill pipeline on the remote server MUST NOT invoke `AiService.complete()` or any AI provider during Skill execution. The `SkillAiRuntime` step MUST be removed from the pipeline execution sequence. The pipeline sequence becomes: type-skill hooks → task dispatch creation → bridge notifications.
- **FR-002**: Task dispatches MUST include the Skill's parsed SKILL.md content (event-specific section when applicable, full body as fallback) as the agent instruction payload, the complete topic snapshot, and the triggering event context — providing the local agent with all information previously available to the server-side AI.
- **FR-003**: The remote server MUST expose standalone AI API endpoints for management operations that require AI processing. These endpoints are separate from the Skill pipeline and are called explicitly by the CLI or other clients.
- **FR-004**: The server MUST provide an AI summarization endpoint that accepts a topic ID, assembles the topic's data (timeline, metadata, description), sends it to the configured AI provider, and returns a summary. The summary MUST be recorded as a timeline entry on the topic.
- **FR-005**: The server MUST provide an AI-powered general assistant endpoint that accepts a topic ID and a free-form question or instruction, sends it along with topic context to the AI provider, and returns the response. This enables open-ended AI management tasks (triage, tag suggestion, analysis) without requiring a fixed command for each use case.
- **FR-006**: Standalone AI API endpoints MUST respect the existing AI guardrails: per-tenant enablement, per-tenant rate limits, circuit breaker, and usage tracking. The same `AiService` infrastructure continues to power these endpoints.
- **FR-007**: The CLI MUST provide commands to invoke standalone AI APIs: at minimum `topichub-admin ai summarize <topic-id>` for summarization. Additional AI management commands MAY be added as the standalone API surface grows.
- **FR-008**: The Skill pipeline MUST function correctly when `AI_ENABLED=false` or no AI provider is configured on the server. The pipeline's core operations (hooks, dispatches, notifications) MUST NOT depend on AI availability.
- **FR-009**: The `AiService`, `ArkProvider`, and related AI infrastructure MUST be retained on the server for use by standalone AI API endpoints. Only the Skill pipeline's AI integration (`SkillAiRuntime`) is removed.
- **FR-010**: Existing `AI_RESPONSE` timeline entries created by the previous `SkillAiRuntime` MUST remain readable and displayable. No data migration or deletion is required.
- **FR-011**: The `TimelineActionType.AI_RESPONSE` enum value MUST be preserved for backward compatibility with existing data and MAY be reused by standalone AI API endpoints for their timeline entries, distinguished by the `source` field.
- **FR-012**: Skills with `ai: true` in their manifest or `SKILL.md` with AI instructions MUST continue to be registerable and functional — the `ai` flag now indicates that the Skill's SKILL.md instructions should be included in the task dispatch payload for local agent processing, rather than triggering server-side AI.

### Key Entities

- **Task Dispatch (enriched)**: Extended to carry the Skill's SKILL.md instruction content (event-specific section or full body), the complete topic snapshot, and event context. Represents the complete self-contained package for local agent execution.
- **Standalone AI Endpoint**: A server API endpoint that performs a specific AI-powered management operation (summarization, assistant query) using the server's `AiService`. Separate from the Skill pipeline — called explicitly by CLI or API clients.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero AI provider calls are made during Skill pipeline execution on the remote server — all Skill-driven AI processing happens exclusively on the local agent side.
- **SC-002**: The remote server starts and processes topic lifecycle events correctly with `AI_ENABLED=false` — Skills create task dispatches and bridge notifications without any AI dependency.
- **SC-003**: Users can summarize a topic via CLI command and receive an AI-generated summary within the same response time as the previous server-side AI (accounting for the additional network round-trip from CLI to server).
- **SC-004**: Task dispatches created after the change contain all the context (SKILL.md instructions, topic snapshot, event context) that local agents need — local agent result quality matches or exceeds the previous server-side AI quality by providing richer context and multi-step reasoning capability.
- **SC-005**: Per-tenant AI rate limits and usage tracking continue to work correctly for standalone AI API calls — the same quotas that previously applied to Skill AI calls now apply to management API calls.
- **SC-006**: Existing timeline entries with `AI_RESPONSE` type from the previous server-side AI remain intact and accessible after the upgrade — zero data loss.

## Assumptions

- The local agent execution infrastructure (features 003, 009) is operational — users have a local agent (Claude Code, Codex, or OpenClaw) configured and `topichub-admin serve` running for Skill-driven AI processing
- The server's `AiService` and `ArkProvider` remain functional and configured for standalone AI API endpoints — only their usage within the Skill pipeline is removed
- The SKILL.md format and parsing (`skill-md-parser.ts`) are retained unchanged — SKILL.md content is now packaged into task dispatch payloads instead of being used as server-side AI prompts
- Users understand that after this change, Skills no longer produce automatic AI responses on the server — a local agent must be running to process Skill tasks
- The standalone AI API endpoints use the same AI provider configuration (env vars) as the previous Skill AI — no new AI provider setup is required
- The CLI command structure (`topichub-admin ai ...`) can be extended with new subcommands for standalone AI operations alongside existing subcommands (`ai status`, `ai enable`, etc.)
