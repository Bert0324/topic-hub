# Feature Specification: AI-Driven Skills

**Feature Branch**: `002-ai-driven-skills`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "skill应该是ai驱动的"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skill Uses AI via Natural-Language Instructions (Priority: P1)

A Skill author creates a Type Skill (e.g., "alert") by writing a `SKILL.md` file with natural-language instructions describing what the AI should do when a topic lifecycle event occurs (e.g., "Analyze the alert metadata and generate a severity assessment and suggested first-responder actions"). When a new alert topic is created, the runtime reads the Skill's `SKILL.md` content, injects it as the system prompt into `AiService.complete()`, and passes the topic data as the user prompt. The AI response is included in the topic card posted to the IM group. The Skill author writes no `AiService` code — only natural-language instructions following the SKILL.md convention (YAML frontmatter + markdown body).

**Why this priority**: This is the core capability — Skills that can leverage AI become significantly more intelligent. Without the AI service infrastructure and the NL-to-prompt runtime, no AI-powered Skill feature is possible. This is the foundation all other AI use cases build on.

**Independent Test**: Can be tested using a test-only Skill fixture (not bundled in `skills/`) with a `SKILL.md` containing NL instructions, creating a topic, and verifying the AI-generated content appears in the topic card and timeline.

**Acceptance Scenarios**:

1. **Given** a Type Skill with a `SKILL.md` containing AI instructions for the `onTopicCreated` event, **When** a topic of that type is created, **Then** the runtime injects the SKILL.md content as the system prompt, passes the full topic snapshot + event context as the user prompt, and the AI response is appended to the topic timeline as a Skill-attributed entry and stored in topic metadata.
2. **Given** the AI service is configured and available, **When** a Skill's lifecycle hook triggers an AI call, **Then** the response is returned within the configured timeout and contains the model's output text and token usage.
3. **Given** the AI service is unavailable (circuit breaker open), **When** a Skill's lifecycle hook triggers an AI call, **Then** the call returns `null` instead of throwing, and the Skill pipeline continues gracefully (e.g., skip AI-enhanced content, use a fallback).
4. **Given** a Skill without a `SKILL.md` or without AI instructions in its `SKILL.md`, **When** a topic lifecycle event occurs, **Then** the Skill pipeline executes exactly as before — zero changes to non-AI Skills.

---

### User Story 2 - Platform Admin Configures AI Provider (Priority: P1)

A platform admin deploys Topic Hub with AI enabled by setting environment variables: `AI_ENABLED=true`, `AI_PROVIDER=ark`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`. For internal/corporate deployments, the `AI_API_URL` points to an internal Volcengine Ark endpoint (internal-remote mode). The admin verifies the AI provider is reachable via `topichub-admin ai status` or the `/health` endpoint. No code changes are needed to switch between public and internal endpoints — only the URL changes.

**Why this priority**: Without platform-level AI provider configuration, no AI-powered Skill can function. This is the infrastructure prerequisite.

**Independent Test**: Can be tested by setting env vars, starting the server, and verifying the health endpoint reports AI as `available`. Test with an invalid URL to verify it reports `unavailable` without affecting core operations.

**Acceptance Scenarios**:

1. **Given** `AI_ENABLED=true` and valid `AI_API_URL`/`AI_API_KEY` are set, **When** the server starts, **Then** the AI provider is initialized and the health endpoint reports `"ai": "available"`.
2. **Given** `AI_ENABLED=false` or `AI_PROVIDER` is not set, **When** the server starts, **Then** no AI provider is initialized, the health endpoint reports `"ai": "disabled"`, and all non-AI functionality works normally.
3. **Given** `AI_API_URL` points to an unreachable endpoint, **When** the server starts, **Then** the health endpoint reports `"ai": "unavailable"` but the server remains fully operational for all non-AI features.
4. **Given** a running server with AI configured, **When** an admin runs `topichub-admin ai status`, **Then** the CLI displays the configured provider, model, endpoint, and current availability status.

---

### User Story 3 - Tenant Admin Enables AI for Tenant (Priority: P2)

A tenant admin enables AI features for their tenant via `topichub-admin ai enable`. Once enabled, Skills that use AI can make AI calls scoped to that tenant. The tenant admin can also set per-tenant rate limits and disable AI features independently. When AI is disabled for a tenant, Skills that depend on AI receive `null` from `AiService.complete()` and must handle it gracefully — the pipeline never fails.

**Why this priority**: Multi-tenancy requires per-tenant control over AI features. Some tenants may not want or need AI; others need rate-limited access to manage costs.

**Independent Test**: Can be tested by enabling AI for tenant A, disabling for tenant B, and verifying that Skills using AI only succeed for tenant A while both tenants' core operations remain unaffected.

**Acceptance Scenarios**:

1. **Given** AI is enabled at the platform level, **When** a tenant admin runs `topichub-admin ai enable`, **Then** AI features become available for that tenant and Skills can make AI calls with that tenant's context.
2. **Given** AI is disabled for a tenant, **When** a Skill calls `AiService.complete()` with that tenant's ID, **Then** the call returns `null` without error.
3. **Given** a tenant has a rate limit of 100 requests/hour, **When** the 101st AI request is made, **Then** the call returns `null` and the tenant admin is notified that the limit was exceeded.
4. **Given** a tenant admin runs `topichub-admin ai usage`, **Then** a summary of AI request counts and token usage for the current period is displayed.

---

### Edge Cases

- What happens when the AI model is unavailable or times out? `AiService.complete()` returns `null`. Skills MUST handle `null` responses gracefully. The circuit breaker opens after 3 consecutive failures and auto-recovers after 30 seconds. Core topic operations are never blocked.
- What happens when the AI provider returns an error (4xx, 5xx)? The error is logged with correlation ID. `AiService` returns `null` to the caller. Retryable errors (5xx) count toward circuit breaker threshold; non-retryable errors (4xx) are returned as-is for the Skill to handle.
- How does the system handle AI costs? Per-tenant rate limits (configurable requests/hour). When exceeded, `AiService` returns `null` and logs the limit event. Platform-wide rate limit prevents any single deployment from exhausting API quota.
- What happens when a Skill makes an AI call with sensitive tenant data? AI processing respects tenant data isolation — each request is scoped to a single tenant. AI model interactions do not persist data beyond the immediate request. The `AiService` enforces `tenantId` on every call.
- What happens when the AI provider configuration changes at runtime (e.g., new API key)? The server must be restarted to pick up new env var values. Hot-reload of AI config is out of scope for the initial version.
- What happens when multiple Skills in the same pipeline each make AI calls? Each call is independent. The per-tenant rate limit applies across all Skills. Skills are responsible for their own AI call management — the pipeline does not batch or deduplicate AI requests.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an `AiService` that any Skill can use to make AI model calls. The service MUST be injectable via NestJS dependency injection and available to all Skill categories (Type, Platform, Auth, Adapter). Skills define their AI behavior via a `SKILL.md` file containing natural-language instructions — the runtime reads the SKILL.md content and auto-injects it as the system prompt when the Skill's lifecycle hook fires.
- **FR-002**: `AiService.complete()` MUST accept a structured request (system prompt, user prompt, optional parameters) and return either an `AiResponse` (model output + token usage) or `null` (when AI is unavailable, disabled, or rate-limited). When invoked by the Skill runtime, the system prompt is sourced from the Skill's `SKILL.md` content and the user prompt is constructed from the topic/event data.
- **FR-014**: Skills MUST define AI instructions using a `SKILL.md` file following Cursor's SKILL.md conventions: YAML frontmatter (`name`, `description`) plus a markdown body with natural-language instructions. The `description` field is used for Skill discovery; the markdown body is the AI system prompt. Optional supporting files (e.g., `reference.md`, `examples.md`) may be referenced from SKILL.md for progressive disclosure. Skill authors write no `AiService` code — the runtime handles prompt assembly and AI invocation.
- **FR-015**: When a Skill's lifecycle hook fires and the Skill has AI instructions (SKILL.md), the runtime MUST construct the user prompt as a serialized snapshot of the full topic (all fields: type, title, description, priority, status, assignee, metadata, custom fields) plus the triggering event context (event type, actor, timestamp). This is a standardized format — Skill authors do not need to specify which data fields they need.
- **FR-016**: When a Skill's AI call returns a non-null response, the runtime MUST append the AI response to the **topic timeline** as a new entry attributed to the Skill (source: Skill name, type: `ai_response`). The response MUST also be stored in the topic's metadata under a Skill-namespaced key. If the AI call returns `null`, no timeline entry or metadata update is made.
- **FR-017**: A SKILL.md MAY contain event-specific instruction sections using markdown headings matching lifecycle event names (e.g., `## onTopicCreated`, `## onTopicUpdated`, `## onTopicAssigned`). When a lifecycle event fires, the runtime MUST use the matching section's content as the system prompt. If no event-specific section exists, the runtime MUST fall back to the entire markdown body as the system prompt. This allows simple Skills to use a single set of instructions for all events, while complex Skills can tailor instructions per event.
- **FR-003**: The AI integration MUST be provider-agnostic, using an `AiProvider` interface. The initial implementation MUST support Volcengine Ark API (Doubao Seed model) using the Responses API format (`/api/v3/responses`).
- **FR-004**: AI provider configuration MUST be driven by environment variables: `AI_ENABLED` (master switch), `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS`. The same code path handles public and internal-remote deployments — only the URL differs.
- **FR-005**: System MUST implement a circuit breaker in `AiService`. After a configurable number of consecutive failures (default: 3), the circuit opens and all AI calls return `null` immediately for a cooldown period (default: 30 seconds). The circuit half-opens after cooldown to test recovery.
- **FR-006**: System MUST support per-tenant AI enablement. Tenant admins MUST be able to enable or disable AI for their tenant via CLI (`topichub-admin ai enable/disable`). When disabled for a tenant, `AiService.complete()` returns `null` for that tenant.
- **FR-007**: System MUST enforce per-tenant AI usage rate limits (configurable requests per hour, default: 100). When the limit is exceeded, `AiService` returns `null` and logs the event. The tenant admin MUST be notified.
- **FR-008**: System MUST track per-tenant AI usage (request counts, token consumption) in time-bucketed records. Tenant admins MUST be able to view usage via CLI (`topichub-admin ai usage`).
- **FR-009**: AI processing MUST respect tenant data isolation. Each AI request MUST be scoped to a single tenant. No cross-tenant data may appear in AI prompts or responses. AI model interactions MUST NOT persist tenant data beyond the immediate request.
- **FR-010**: System MUST log all AI calls with: tenant ID, Skill name, request summary (prompt length, not content), response summary (token usage, latency), and outcome (success, null, error). Sensitive prompt content MUST NOT be logged at the default log level.
- **FR-011**: The `/health` endpoint MUST include AI provider status: `"available"`, `"unavailable"`, or `"disabled"`.
- **FR-012**: The `AiService` MUST NOT block or alter the existing Skill pipeline. Skills that do not call `AiService` MUST be completely unaffected. AI is opt-in at the individual Skill level, not a pipeline-wide concern.
- **FR-013**: Platform admin MUST be able to check AI provider configuration and health via `topichub-admin ai status`.

### Key Entities

- **Skill Definition (SKILL.md)**: A natural-language instruction document following Cursor's SKILL.md format. Contains YAML frontmatter (`name`: unique identifier, `description`: trigger/discovery text) and a markdown body with NL instructions that become the AI system prompt at runtime. The body may optionally contain event-specific sections (`## onTopicCreated`, `## onTopicUpdated`, etc.) — if present, only the matching section is used as the system prompt for that event; otherwise the full body applies to all events. May reference supporting files (reference.md, examples.md) for progressive disclosure.
- **AI Usage Record**: A per-tenant tracking record for AI feature consumption. Contains the tenant ID, feature/Skill name, request count, token count, and time period (hourly buckets).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A test-only Skill fixture with a `SKILL.md` containing NL instructions for `onTopicCreated` executes successfully — the runtime injects the instructions as system prompt, the AI-generated response appears in the topic timeline as a Skill-attributed entry within 5 seconds
- **SC-002**: When AI services are unavailable, zero core topic operations are affected — 100% availability of create, update, search, and assign functions
- **SC-003**: `AiService.complete()` returns `null` (not an error) within 100ms when the circuit breaker is open, AI is disabled, or the tenant rate limit is exceeded
- **SC-004**: Per-tenant rate limiting correctly enforces the configured limit with zero cross-tenant interference
- **SC-005**: The AI provider can be switched from a public Ark endpoint to an internal-remote endpoint by changing only the `AI_API_URL` environment variable — no code changes required
- **SC-006**: AI usage tracking accurately reports request counts and token consumption per tenant per hour

## Clarifications

### Session 2026-04-10

- Q: Which AI model provider should be supported? → A: Volcengine Ark API (doubao-seed model) as the primary provider, using the OpenAI-compatible Responses API format (`/api/v3/responses`). The provider layer must be pluggable to support additional backends.
- Q: How should the AI model be configured? → A: Via environment variables. An `internal-remote` startup mode connects to an internally-hosted or VPN-accessible Ark endpoint. Configuration includes `AI_PROVIDER`, `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` env vars.
- Q: What is the scope of this feature? → A: Skills supporting AI is the scope. The feature provides the AI provider infrastructure (`AiModule`, `AiService`, `ArkProvider`) and makes it available for Skills to use. Specific AI use cases (NL command parsing, event classification, summarization, semantic linking, scaffold generation) are out of scope — they will be built as separate features on top of this foundation.
- Q: How should unknown webhook payloads be handled? → A: Log the payload and discard it. No processing, no review queue, no error response to the caller beyond a standard acknowledgement. This applies to the ingestion layer (001 feature scope) and reinforces that AI-based classification of unknown payloads is out of scope for this feature.
- Q: Should this feature include pre-built AI-powered Skills? → A: No. No preset/reference Skills are bundled. All Skills are created and added manually by users. This feature ships only the AI infrastructure (AiModule, AiService, ArkProvider). Test fixtures for validation are test-only and not installed in the `skills/` directory.
- Q: Do new Skills require an approval/review workflow? → A: No. Only admins can add Skills, so direct installation is sufficient — no review step needed. Admin places a Skill in the `skills/` directory or runs `skill install`, and it is registered immediately (disabled by default per 001 spec).
- Q: Should Smart Topic Deduplication and Linking be included? → A: No. Cross-topic features (deduplication, semantic linking) are out of scope. Each topic is independent — focus on one topic at a time.
- Q: How does first-time CLI setup work? → A: Users must run a CLI init flow on first use to set local context — server URL and tenant selection. This is a cross-cutting CLI concern (001 scope) that the AI commands (`ai enable`, `ai usage`, etc.) depend on. AI commands assume tenant context is already established via CLI init.
- Q: How should the natural-language Skill definition (SKILL.md) map to AI behavior at runtime? → A: The SKILL.md content becomes the system prompt. The runtime auto-injects it into `AiService.complete()` when the Skill's lifecycle hook fires. Skill authors write natural language instructions only — no explicit `AiService.complete()` calls in Skill code. The format follows Cursor's SKILL.md conventions (YAML frontmatter with name/description + markdown body with NL instructions).
- Q: What topic data should be injected as the user prompt when a Skill's AI instructions are invoked? → A: Full topic snapshot (all fields: type, title, description, priority, status, assignee, metadata, custom fields) plus triggering event context (event type, actor, timestamp). Standardized format — Skill authors do not specify which fields they need.
- Q: How should the AI response from a SKILL.md-driven call be used in the topic lifecycle? → A: Append to topic timeline as a Skill-attributed entry (source: Skill name, type: `ai_response`) and store in topic metadata under a Skill-namespaced key. Simple, visible, auditable. If AI returns `null`, no timeline entry or metadata update.
- Q: Should a single SKILL.md apply to all lifecycle events or support per-event instructions? → A: Section-based event mapping. SKILL.md can optionally use headings matching lifecycle event names (`## onTopicCreated`, `## onTopicUpdated`, etc.) for event-specific instructions. If no event-specific sections exist, the entire body applies to all events as a fallback. Simple Skills stay simple; complex Skills get fine-grained control.

## Assumptions

- An LLM/AI model service is available and accessible from the Topic Hub server — the primary provider is Volcengine Ark (Doubao Seed model), configured via environment variables with an `internal-remote` deployment mode
- AI processing adds acceptable latency for the use cases each Skill implements (Skill developers are responsible for their own timeout and fallback handling)
- The existing Skill pipeline architecture can accommodate AI as an injectable service without fundamental restructuring; the runtime reads SKILL.md content at Skill registration and uses it as the system prompt for AI calls
- AI model costs are managed by per-tenant rate limits; cost optimization beyond rate limiting is out of scope
- No new Skill category is needed — AI is a service that existing Skill categories (Type, Platform, Auth, Adapter) can opt into
- Specific AI-powered features (NL parsing, classification, summarization, scaffold generation) are out of scope for this feature and will be specified separately
- Cross-topic features (smart deduplication, semantic linking) are explicitly out of scope — each topic is independent; one topic at a time
- No pre-built AI-powered Skills are bundled with this feature; the `skills/` directory ships empty and all Skills are user-created
- CLI tenant context is established via first-time init (001 scope); AI CLI commands assume this context exists
