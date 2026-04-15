# Feature Specification: OpenClaw IM Bridge

**Feature Branch**: `007-openclaw-im-bridge`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "基于OpenClaw bridge，实现对于im平台的接入，完全在项目里去掉PlatformSkill的概念；同时不需要支持卡片这种能力，仅保留收到用户指令，im平台的bot发出富文本消息即可"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive IM Commands via OpenClaw (Priority: P1)

A user sends a slash command (e.g., `/topichub create bug --title "Login broken"`) in any IM platform (Lark, Slack, Telegram, etc.). OpenClaw receives the message and forwards it to Topic Hub via an outbound webhook. Topic Hub parses the command, executes it through its existing command pipeline, and returns a result. The user sees a confirmation reply in the IM chat.

**Why this priority**: This is the core inbound flow — without it, no IM interaction is possible. It replaces the current `PlatformSkill.handleWebhook` path entirely.

**Independent Test**: Can be tested by configuring an OpenClaw instance with any channel, sending a `/topichub` command, and verifying that Topic Hub receives, parses, and executes the command correctly.

**Acceptance Scenarios**:

1. **Given** OpenClaw is configured with a Lark channel and Topic Hub webhook is registered, **When** a user sends `/topichub create bug --title "Login broken"` in a Lark group, **Then** Topic Hub receives the webhook, creates a topic of type `bug`, and returns a success response to OpenClaw.
2. **Given** OpenClaw forwards a message that is not a `/topichub` command, **When** Topic Hub receives the webhook, **Then** it ignores the message and returns an acknowledgement without side effects.
3. **Given** OpenClaw forwards a malformed command, **When** Topic Hub receives the webhook, **Then** it returns an error message describing the issue (e.g., "Unknown command" or "Missing required argument").

---

### User Story 2 - Send Rich Text Replies to IM (Priority: P1)

After processing a command or when a topic lifecycle event occurs (e.g., topic created, status changed), Topic Hub sends a rich text message (formatted with markdown — bold, lists, headers, links) back to the originating IM channel via OpenClaw's send API.

**Why this priority**: This is the core outbound flow — users need feedback after executing commands, and the system needs to push notifications for topic lifecycle events. It replaces the current `PlatformSkill.postCard` / `PlatformSkill.sendMessage` paths.

**Independent Test**: Can be tested by triggering a topic creation and verifying that a rich text notification appears in the IM channel via OpenClaw.

**Acceptance Scenarios**:

1. **Given** a topic is created via an IM command, **When** the command completes, **Then** Topic Hub sends a rich text message to the originating channel via OpenClaw containing the topic title, type, status, and a link (if available).
2. **Given** a topic's status changes, **When** the SkillPipeline runs, **Then** Topic Hub sends a rich text notification to all configured channels for that topic's tenant.
3. **Given** the OpenClaw send API is unreachable, **When** Topic Hub attempts to send a message, **Then** the error is logged and the pipeline continues without crashing.

---

### User Story 3 - Configure OpenClaw Connection (Priority: P2)

An administrator configures the connection between Topic Hub and an OpenClaw instance — providing the OpenClaw gateway URL, authentication token, and a mapping between OpenClaw channels/agents and Topic Hub tenants. This can be done via environment variables, configuration file, or the `topichub init` CLI flow.

**Why this priority**: Configuration is required before any IM interaction works, but it is a one-time setup activity.

**Independent Test**: Can be tested by setting configuration values and verifying that Topic Hub can reach the OpenClaw API (health check or test message).

**Acceptance Scenarios**:

1. **Given** no OpenClaw configuration exists, **When** an administrator provides the gateway URL and auth token, **Then** Topic Hub validates the connection and confirms setup success.
2. **Given** an administrator maps an OpenClaw agent/channel to a tenant, **When** an inbound webhook arrives from that agent, **Then** Topic Hub correctly resolves the tenant.
3. **Given** invalid credentials are provided, **When** the administrator attempts to configure, **Then** the system reports a clear error indicating the credentials are invalid.

---

### User Story 4 - Remove PlatformSkill from Codebase (Priority: P1)

The entire `PlatformSkill` concept — interface, registry logic, webhook handler platform path, pipeline integration, messaging operations, and the existing `lark-bot` skill package — is removed from the codebase. All IM interaction is handled exclusively through the OpenClaw bridge.

**Why this priority**: This is an architectural simplification that must happen alongside the bridge implementation to avoid maintaining two parallel IM integration paths.

**Independent Test**: Can be tested by verifying that no `PlatformSkill` references remain in the codebase, the project compiles successfully, and all existing tests pass (with platform-specific tests removed or updated).

**Acceptance Scenarios**:

1. **Given** the migration is complete, **When** searching the codebase for `PlatformSkill`, **Then** zero references are found.
2. **Given** the `lark-bot` skill package is removed, **When** running `topichub publish`, **Then** the system does not attempt to load or register any platform skills.
3. **Given** existing commands (`create`, `update`, `show`, etc.) were previously routed through PlatformSkill webhooks, **When** those same commands arrive via the OpenClaw webhook, **Then** they are handled identically by the command pipeline.

---

### Edge Cases

- What happens when OpenClaw sends a webhook but the mapped tenant does not exist in Topic Hub?
- How does the system handle duplicate webhook deliveries (OpenClaw retry on timeout)?
- What happens when a user sends a command in a channel that has no tenant mapping?
- How does the system behave when the OpenClaw API rate limit is exceeded during outbound message sending?
- What happens if OpenClaw webhook signature verification fails?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept inbound webhooks from OpenClaw containing user messages and route them through the existing command pipeline (parse → route → handler).
- **FR-002**: System MUST verify the authenticity of inbound OpenClaw webhooks using HMAC-SHA256 signature verification.
- **FR-003**: System MUST resolve the Topic Hub tenant from the OpenClaw webhook payload (using agent ID, channel, or metadata mapping).
- **FR-004**: System MUST ignore inbound messages that are not Topic Hub commands (messages not starting with `/topichub` or the configured command prefix).
- **FR-005**: System MUST send rich text messages (supporting bold, lists, headers, links in markdown format) to IM channels via OpenClaw's send API.
- **FR-006**: System MUST send outbound notifications when topic lifecycle events occur (created, updated, status changed, assigned, closed, reopened).
- **FR-007**: System MUST handle OpenClaw API failures gracefully — log errors and continue pipeline execution without crashing.
- **FR-008**: System MUST support configuring the OpenClaw gateway URL, authentication token, and tenant-to-channel mapping.
- **FR-009**: System MUST completely remove the `PlatformSkill` interface, related types, registry logic, pipeline integration, messaging operations, and the `lark-bot` skill package.
- **FR-010**: System MUST support idempotent webhook processing — duplicate deliveries of the same message MUST NOT create duplicate topics or execute commands twice.
- **FR-011**: System MUST render topic data (title, type, status, assignees, key metadata fields) into a human-readable rich text format for outbound messages.
- **FR-012**: The OpenClaw bridge layer MUST NOT use any AI/LLM processing — it functions purely as a message relay for sending and receiving messages between IM platforms and Topic Hub. Topic Hub's own internal AI capabilities (SkillAiRuntime, AI-driven type skills) remain unaffected.

### Key Entities

- **OpenClaw Configuration**: Gateway URL, authentication credentials, webhook signing secret, and tenant mapping rules. Determines how Topic Hub communicates with the OpenClaw instance.
- **Tenant Channel Mapping**: Associates OpenClaw identifiers (agent ID, channel name) with Topic Hub tenant IDs. Used to resolve which tenant an inbound message belongs to.
- **Rich Text Message**: A formatted text message (markdown) representing topic data, command results, or lifecycle notifications. Replaces the current `CardData` concept for IM output.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can send Topic Hub commands from any OpenClaw-supported IM platform and receive a response within 5 seconds (excluding OpenClaw network latency).
- **SC-002**: Topic lifecycle notifications (create, update, status change) are delivered to the correct IM channel within 10 seconds of the event.
- **SC-003**: All existing Topic Hub commands (`create`, `update`, `assign`, `show`, `timeline`, `search`, `help`, `history`, `reopen`) work identically whether invoked via the OpenClaw webhook or the authenticated REST API.
- **SC-004**: Zero `PlatformSkill` references remain in the codebase after migration — the concept is fully removed.
- **SC-005**: Adding a new IM platform requires only configuring a new channel in OpenClaw — no code changes in Topic Hub are needed.
- **SC-006**: The system handles OpenClaw API outages without data loss — commands are still processed and results are persisted, even if the reply message fails to send.

## Assumptions

- An OpenClaw instance is available and the administrator has access to configure channels and agents on it.
- OpenClaw is configured to operate as a pure message relay — its AI agent pipeline is disabled or bypassed for Topic Hub traffic. OpenClaw's role is strictly channel adapter: receive messages from IM platforms and forward to Topic Hub, deliver messages from Topic Hub to IM platforms.
- OpenClaw's outbound webhook format includes sufficient metadata (agent ID, channel, user ID, conversation ID, message content) to resolve tenant and route commands.
- OpenClaw's send API (`/api/v1/send`) supports markdown-formatted text messages for all major IM platforms (Lark, Slack, Telegram, Discord).
- The existing `CommandParser` and `CommandRouter` in Topic Hub do not depend on `PlatformSkill`-specific behavior and can process commands from any source.
- The `AdapterSkill` concept is unaffected by this change — it continues to serve as a connector for external systems (GitHub, Jira, etc.) that create topics via webhooks.
- The `lark-bot` skill package is the only existing platform skill and its removal does not break any other skill packages.
- Rich text (markdown) provides sufficient formatting for topic notifications — structured interactive cards and action buttons are explicitly out of scope.
- Topic Hub's internal AI capabilities (SkillAiRuntime, AI-driven type skills via SKILL.md) continue to function independently — the no-AI constraint applies only to the OpenClaw bridge layer.

## Clarifications

### Session 2026-04-10

- Q: Should the OpenClaw bridge layer involve AI processing? → A: No. The bridge layer must not use AI — it functions purely as a message relay for IM platform connectivity. Topic Hub's own internal AI skills are unaffected.
