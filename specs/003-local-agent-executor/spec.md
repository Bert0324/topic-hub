# Feature Specification: Local Agent Executor

**Feature Branch**: `003-local-agent-executor`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "应该有两个server，一个是中心化的远程server来接webhook，一个是本地cli来执行任务，并和远程server通信; 本地执行的serve需要使用已有的生态，支持用户选择使用claude code或者codex，CLI 子进程调用"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Local CLI Pulls Pending Events and Dispatches to Agent (Priority: P1)

A user runs `topichub-admin serve` on their local machine. The local serve process connects to the remote Topic Hub server, authenticates, and begins listening for pending events (new topics created, status changes, signals attached, etc.). When a pending event arrives, the serve process loads the relevant Skill's `SKILL.md`, assembles the context (topic snapshot + event data), and dispatches it to the user's configured AI agent (Claude Code or Codex) as a subprocess call. The agent processes the task, and the serve process collects the result and writes it back to the remote server as a timeline entry. The user sees all of this happen automatically in their terminal.

**Why this priority**: This is the core loop — without local event processing and agent dispatch, the entire feature has no value. Every other story depends on this execution pipeline working.

**Independent Test**: Can be tested by starting `topichub-admin serve` with a configured agent, creating a topic via the remote server's API, and verifying that the local serve process picks up the event, invokes the agent, and writes the AI result back as a timeline entry on the remote server.

**Acceptance Scenarios**:

1. **Given** a running `topichub-admin serve` connected to a remote server, **When** a new topic is created on the remote server (via webhook or API), **Then** the local serve process detects the new event within 10 seconds, invokes the configured agent with the Skill's instructions and topic data, and posts the agent's result back to the remote server's timeline.
2. **Given** a running `topichub-admin serve`, **When** a topic lifecycle event occurs (status change, signal attached, assignment) that matches a Skill's event-specific instructions, **Then** the correct event-specific prompt section from SKILL.md is used for agent dispatch.
3. **Given** the configured agent is not installed or fails to start, **When** an event arrives, **Then** the serve process logs a clear error message identifying which agent was attempted and why it failed, skips AI processing, and continues listening for future events without crashing.
4. **Given** `topichub-admin serve` is started but the remote server is unreachable, **Then** the serve process retries connection with exponential backoff and displays the connection status to the user.

---

### User Story 2 - User Runs Interactive Init to Configure Local Environment (Priority: P1)

Before using `serve` or any agent-dependent command, a user runs `topichub-admin init`. The init command presents an interactive selection-based flow that configures: (1) the remote server URL, (2) the active tenant (fetched from the remote server and presented as a selection list), (3) the preferred AI agent executor (auto-detected from PATH, presented as a selection), and (4) the local Skills directory path. All settings are persisted to a global per-user config file (`~/.topichub/config.json`). The user can re-run `init` at any time to change any setting — each run presents the current values as defaults, and the user selects only what they want to change.

**Why this priority**: Without init, the user has no way to configure the essential prerequisites (server URL, tenant, executor). Every other command depends on this configuration being in place. The interactive selection-based flow ensures users don't need to memorize tenant IDs or executor names.

**Independent Test**: Can be tested by running `topichub-admin init`, completing all selection prompts, verifying `~/.topichub/config.json` is created with the correct values, and re-running init to verify current values are shown as defaults.

**Acceptance Scenarios**:

1. **Given** no prior configuration exists, **When** the user runs `topichub-admin init`, **Then** the CLI prompts for remote server URL, asks the user to paste their admin token, validates the token against the remote server, fetches available tenants for that token and presents them as a numbered selection list, detects installed agents on PATH and presents them as a selection, asks for Skills directory (with a default of `~/.topichub/skills/`), and writes all values to `~/.topichub/config.json` (token is stored in `~/.topichub/credentials.enc`).
2. **Given** a valid config already exists, **When** the user runs `topichub-admin init` again, **Then** each prompt shows the current saved value as the default and the user can press Enter to keep it or select a new value.
3. **Given** the remote server URL is entered, **When** the CLI attempts to connect, **Then** it validates the connection (e.g., calls `/health`), and if unreachable, warns the user and asks whether to continue or re-enter the URL.
4. **Given** no agents (neither `claude` nor `codex`) are found on PATH, **When** the executor selection prompt appears, **Then** the CLI warns that no agents are installed and allows the user to proceed without an executor (disabling AI execution) or to manually enter a custom executor command.

---

### User Story 3 - User Selects AI Agent Backend (Priority: P1)

A user chooses which AI agent backend to use for local task execution. The executor is configured during `init` (interactive selection) and persisted in `~/.topichub/config.json`. It can be overridden per-session via environment variable (`TOPICHUB_EXECUTOR`) or CLI flag (`topichub-admin serve --executor claude-code`). Each Skill can also declare a preferred executor in its `SKILL.md` frontmatter, overriding the global default for that specific Skill. The system detects whether the selected agent is installed locally and warns the user if it is not found.

**Why this priority**: Without agent selection, the system cannot execute anything. Users must be able to choose the agent that matches their existing setup and API keys.

**Independent Test**: Can be tested by configuring different executors via init, starting serve, and verifying the correct agent CLI is invoked. Test with an uninstalled agent to verify the warning message.

**Acceptance Scenarios**:

1. **Given** the executor is set to `claude-code` in config, **When** `topichub-admin serve` starts, **Then** the system verifies that the `claude` CLI is available on PATH and reports the active executor on startup.
2. **Given** the executor is set to `codex` in config, **When** `topichub-admin serve` starts, **Then** the system verifies that the `codex` CLI is available on PATH and reports the active executor on startup.
3. **Given** a CLI flag `--executor codex` is provided, **When** `topichub-admin serve` starts, **Then** the flag overrides the config file value for this session only.
4. **Given** a Skill's `SKILL.md` frontmatter contains `executor: codex`, **When** that Skill's event fires, **Then** the system uses Codex for that specific Skill regardless of the global executor setting.

---

### User Story 4 - Remote Server Uses AI to Understand Skills and Dispatch Tasks (Priority: P1)

External platforms (Feishu, Slack, GitHub, etc.) send webhook payloads to the centralized remote server. The remote server uses its built-in AI capabilities (existing AiService/ArkProvider from feature 002) to understand incoming data, classify it, determine which Skills apply, and create structured task dispatches for local CLI execution. For example, when a webhook arrives, the server uses AI to parse the payload, match it to a topic type, run lightweight Skill logic (type hooks, validation), and then dispatch an execution task to the local CLI for heavy agent-based processing. The remote server handles AI-driven understanding and routing; the local CLI handles multi-step agentic execution via Claude Code/Codex.

**Why this priority**: The remote server is the data hub, webhook endpoint, and intelligent dispatcher. Without its ability to understand incoming data and route tasks to the right Skills, local CLI instances would not know what to execute.

**Independent Test**: Can be tested by sending a webhook to the remote server, verifying the topic is created with AI-classified metadata, and confirming a task dispatch record is created that a local CLI instance can query.

**Acceptance Scenarios**:

1. **Given** an external platform sends a webhook to the remote server, **When** the webhook contains data that matches a registered Skill, **Then** the server uses AI to classify/understand the data, creates or updates the topic, runs lightweight Skill hooks, and creates a task dispatch for local agent execution.
2. **Given** multiple local CLI instances are connected to the same remote server, **When** a dispatched task is available, **Then** only one local instance picks it up (task is claimed/locked to prevent duplicate processing).
3. **Given** a dispatched task has been waiting for more than a configurable timeout (default: 5 minutes) without being claimed, **Then** the task becomes available again for any local instance to pick up.
4. **Given** the remote server receives a webhook but no local CLI is currently connected, **Then** the dispatched task is stored and will be processed when a local CLI next connects and catches up.
5. **Given** the remote server's AI is unavailable (circuit breaker open), **When** a webhook arrives, **Then** the server still creates the topic and records a task dispatch, but marks it as "unclassified" — the local CLI can still process it with the agent applying its own classification.

---

### User Story 5 - Agent Accesses Topic Data via MCP Tools (Priority: P2)

When the local CLI dispatches a task to an AI agent, it exposes topic-hub data as MCP (Model Context Protocol) tools that the agent can call during execution. The agent can read topic details, search related topics, update topic fields, and append timeline entries — all through standardized MCP tool calls. This allows the agent to perform multi-step reasoning: analyze a topic, look up similar past topics, and write structured results back, all within a single agent session.

**Why this priority**: Without MCP tools, the agent can only receive a static prompt and return text. MCP tools enable the agent to interact with topic-hub data during execution, making skills dramatically more capable (multi-step analysis, cross-topic search, structured updates).

**Independent Test**: Can be tested by starting serve with MCP enabled, triggering a Skill that instructs the agent to search for related topics, and verifying the agent successfully calls the MCP search tool and uses the results in its response.

**Acceptance Scenarios**:

1. **Given** a Skill's instructions tell the agent to "search for similar topics", **When** the agent executes, **Then** it calls the `search_topics` MCP tool, receives results, and incorporates them into its analysis.
2. **Given** a Skill's instructions tell the agent to "update the topic with classification results", **When** the agent executes, **Then** it calls the `update_topic` MCP tool with structured data, and the remote server reflects the update.
3. **Given** the Skill's `SKILL.md` declares `allowedTools` in frontmatter, **When** the agent is invoked, **Then** only the declared MCP tools are available to the agent (principle of least privilege).
4. **Given** the MCP server is running and the agent calls a tool that fails (e.g., topic not found), **Then** the agent receives a structured error and can handle it in its reasoning loop.

---

### User Story 6 - User Runs One-Off Agent Tasks via CLI (Priority: P3)

In addition to the persistent `serve` mode, a user can run a one-off agent task against a specific topic. For example, `topichub-admin ai run <topic-id> --skill bug-triage` triggers the bug-triage Skill's AI instructions against the specified topic, using the configured agent, and writes the result back. This is useful for manual re-analysis, testing new Skills, or ad-hoc AI processing without running a persistent serve process.

**Why this priority**: This is a convenience feature for development, testing, and manual intervention. The core value is delivered by the persistent serve mode (P1), but one-off runs improve the developer experience.

**Independent Test**: Can be tested by running the one-off command against a known topic, verifying the agent is invoked, and checking the timeline for the result entry.

**Acceptance Scenarios**:

1. **Given** a topic exists on the remote server and a Skill is configured locally, **When** the user runs `topichub-admin ai run <topic-id> --skill <name>`, **Then** the agent is invoked with the Skill's instructions and the topic's current data, and the result is posted back to the topic's timeline.
2. **Given** the specified topic does not exist, **When** the user runs the command, **Then** a clear error message is displayed.
3. **Given** the specified Skill does not have a `SKILL.md`, **When** the user runs the command, **Then** a clear error message is displayed indicating the Skill has no AI instructions.

---

### Edge Cases

- What happens when the agent subprocess times out? The serve process enforces a configurable timeout per agent invocation (default: 5 minutes). On timeout, the subprocess is killed, a timeout error is logged, the event is marked as failed with a retry counter, and the serve process continues processing other events.
- What happens when the remote server restarts while a local CLI is connected? The local CLI detects the disconnection and retries with exponential backoff. Events that were in-flight are re-queued by the remote server after the unclaimed timeout expires.
- What happens when multiple Skills apply to the same topic event? Each applicable Skill's agent invocation runs sequentially. If one fails, the remaining Skills still execute. Each result is written as a separate timeline entry.
- What happens when the agent writes conflicting data back (e.g., two CLI instances process different events that update the same topic field)? Last-write-wins at the field level. The timeline preserves the full audit trail of all changes regardless of conflicts.
- What happens when the user's agent API quota is exhausted? The agent subprocess reports an error (non-zero exit code). The serve process logs the error, marks the event as failed, and continues. The user is responsible for their own agent API costs and quotas.
- How does the system handle Skill code that is present locally but not registered on the remote server? The remote server is the source of truth for which Skills are registered and enabled. The local CLI loads Skill files (SKILL.md) from the local filesystem for prompt content, but only processes events for Skills that are registered on the remote server.
- What happens when the user runs `serve` or `ai run` without running `init` first? The command checks for `~/.topichub/config.json` on startup. If missing or incomplete, it exits with a clear message: "Run `topichub-admin init` first to configure your environment."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a split architecture with two distinct runtime components: a centralized remote server (webhook receiver + data store + API) and a local CLI serve process (event consumer + agent dispatcher). The remote server handles all inbound webhooks, data persistence, and API operations. The local CLI handles AI/agent execution.
- **FR-002**: The remote server MUST record pending events when topic lifecycle actions occur (created, updated, status changed, assigned, signal attached, tag changed, reopened). Each pending event MUST include the topic ID, event type, actor, timestamp, and Skill name (if applicable).
- **FR-003**: The local CLI MUST provide a `serve` command that connects to the remote server, authenticates, and continuously consumes pending events. The serve process MUST support both real-time event delivery (preferred) and polling-based catch-up on startup.
- **FR-004**: The local CLI MUST dispatch tasks to an AI agent (Claude Code or Codex) as a subprocess invocation. The dispatch MUST pass the Skill's instructions (from SKILL.md) as the system/append prompt, and an enriched payload as the task prompt containing: the topic snapshot, the triggering event context, and the remote server's AI classification/understanding results (e.g., topic type classification, severity assessment, matched Skill reasoning). The local agent uses this enriched context as a starting point for deeper multi-step analysis.
- **FR-005**: System MUST support Claude Code as an agent backend via CLI subprocess: `claude -p "<prompt>" --append-system-prompt-file <skill.md> --output-format json --bare --mcp-config <mcp-config>`. The system MUST parse the JSON output to extract the agent's result.
- **FR-006**: System MUST support Codex as an agent backend via CLI subprocess: `codex exec "<prompt>" --json --ephemeral`. The system MUST parse the JSONL output to extract the agent's final message.
- **FR-007**: The local CLI MUST provide an `init` command that runs an interactive selection-based setup flow. The `init` command MUST configure: remote server URL, admin token (entered by user, validated against the remote server, stored in `~/.topichub/credentials.enc`), active tenant (selected from a list fetched from the remote server using the validated token), preferred AI agent executor (auto-detected from PATH and presented as a selection), and local Skills directory. Non-secret values MUST be persisted to `~/.topichub/config.json`.
- **FR-008**: The `init` command MUST follow a linear step-by-step flow with validation gates: (1) prompt for remote server URL → validate connection via `/health` → (2) prompt for admin token → validate token against remote server → (3) fetch and present available tenants as a numbered selection list → (4) auto-detect installed agents on PATH and present as a selection → (5) prompt for local Skills directory with default `~/.topichub/skills/` → write config and confirm. Each step validates before advancing; if validation fails, the user is prompted to re-enter or abort.
- **FR-008a**: The `init` command MUST be re-runnable. On subsequent runs, each prompt MUST display the current saved value as the default. The user can press Enter to keep the current value or select a new one. Only changed values are overwritten. Validation gates still apply on re-run (e.g., changing the server URL re-validates connection before proceeding).
- **FR-009**: Users MUST be able to override the configured executor per-session via environment variable (`TOPICHUB_EXECUTOR=claude-code|codex`) or CLI flag (`--executor`). Skill-level overrides via SKILL.md frontmatter `executor` field MUST also be supported. Resolution order: Skill-level → CLI flag → environment variable → config file → auto-detect.
- **FR-010**: The local CLI MUST auto-detect available agents by checking for `claude` and `codex` on the system PATH during init and when no explicit executor is configured at runtime.
- **FR-011**: The local CLI MUST expose topic-hub data as an MCP server with tools: `get_topic`, `search_topics`, `update_topic`, `add_timeline_entry`, `list_signals`. The MCP server MUST be passed to the agent via MCP configuration so the agent can call these tools during execution.
- **FR-012**: Pending events MUST support a claim/lock mechanism to prevent duplicate processing when multiple local CLI instances connect to the same remote server. A claimed event that is not completed within a configurable timeout MUST be automatically released for re-processing.
- **FR-013**: The local CLI MUST write agent execution results back to the remote server as timeline entries (action type: `AI_RESPONSE`), attributed to the Skill that triggered the execution, including the agent backend used.
- **FR-014**: SKILL.md MUST support additional frontmatter fields for agent execution: `executor` (preferred agent backend), `allowedTools` (list of MCP tools the agent may use), `maxTurns` (maximum agent reasoning steps).
- **FR-015**: The remote server retains its existing AI capabilities (AiService/ArkProvider from feature 002) for lightweight understanding and routing: classifying incoming data, determining which Skills apply, running type-skill hooks, and creating task dispatches. The remote server MUST NOT run Claude Code, Codex, or any external agent subprocess. All multi-step agentic execution MUST happen on the local CLI side. The AI responsibility split is: remote = understanding & routing, local = task execution.
- **FR-016**: The local CLI MUST provide a one-off execution command (`topichub-admin ai run <topic-id> --skill <name>`) that processes a single topic with a specified Skill without requiring a persistent serve process.
- **FR-017**: The local CLI MUST load Skill definitions (SKILL.md files) from the Skills directory configured during `init` (default: `~/.topichub/skills/`). Skills are matched to remote events by Skill name.
- **FR-018**: The serve process MUST display real-time status in the terminal: connection state, events received, agent invocations in progress, results written back, and errors encountered.
- **FR-019**: Commands that depend on init configuration (`serve`, `ai run`, etc.) MUST check for a valid config file on startup. If `~/.topichub/config.json` is missing or incomplete, the command MUST exit with a clear message instructing the user to run `topichub-admin init` first.

### Key Entities

- **Local Config**: A per-user configuration file (`~/.topichub/config.json`) created and managed by `topichub-admin init`. Contains: remote server URL, active tenant ID, preferred executor type, and local Skills directory path. Read by all commands that depend on server connectivity or agent execution.
- **Task Dispatch**: A record on the remote server representing a task that requires local agent execution. Contains: dispatch ID, topic ID, event type, Skill name, timestamp, claim status (unclaimed/claimed/completed/failed), claimed-by identifier, claim expiry, retry count, and an enriched payload (topic snapshot + event context + remote AI classification results such as type, severity, matched Skill reasoning).
- **Agent Executor**: An abstraction representing a local AI agent backend (Claude Code or Codex). Contains: executor type, CLI command path, invocation pattern, output parser, and availability status.
- **MCP Tool**: A topic-hub operation exposed to the agent via Model Context Protocol. Contains: tool name, description, input schema, and handler function that communicates with the remote server API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A topic created via webhook on the remote server triggers agent processing on the local CLI and a timeline result appears on the topic within 30 seconds of the event occurring
- **SC-002**: Users can switch between Claude Code and Codex agent backends by changing a single configuration value, with no changes to Skills or server setup
- **SC-003**: The remote server performs only lightweight AI (understanding, classification, routing) using the existing AiService — zero Claude Code/Codex dependencies, zero external agent subprocess invocations on the server side
- **SC-004**: When multiple local CLI instances connect to the same remote server, each pending event is processed exactly once (no duplicate processing)
- **SC-005**: The local serve process recovers from temporary remote server unavailability and processes all accumulated pending events after reconnection, with zero event loss
- **SC-006**: An agent invoked via MCP tools can successfully read topic data, search for related topics, and write structured results back to the remote server in a single execution session

## Clarifications

### Session 2026-04-10

- Q: Should init configuration be stored globally per-user, per-project, or layered? → A: Global per-user only (`~/.topichub/config.json`). One identity across all projects, matching the pattern of `claude` and `codex` themselves.
- Q: How does the local CLI authenticate to the remote server during init? → A: Admin token entry — user pastes the token they received when the tenant was created. Token is validated against the remote server and stored in the existing encrypted keychain (`~/.topichub/credentials.enc`). No browser-based OAuth during init.
- Q: What is the init step order and interaction style? → A: Linear with validation gates — Server URL → validate connection → Admin token → validate token → Select tenant → Select executor → Skills dir → Done. Each step validates before advancing.
- Q: What happens to the existing server-side AI infrastructure? → A: Remote server keeps its AI (AiService/ArkProvider) for understanding incoming data, classifying, and routing/dispatching tasks. Local CLI uses Claude Code/Codex for heavy agentic task execution. Both layers have AI, but with different roles: remote = understanding & routing, local = execution.
- Q: What data does the remote server include in task dispatches to the local CLI? → A: Enriched payload — topic snapshot + event context + remote server's AI classification/understanding results (type classification, severity, matched Skill reasoning). The local agent builds on top of this pre-analysis rather than starting from scratch.

## Assumptions

- Users have Claude Code (`claude` CLI) or Codex (`codex` CLI) installed locally and authenticated with their own API keys — topic-hub does not manage agent installation or API key provisioning
- The remote server is deployed on a publicly reachable host with a stable URL, capable of receiving webhooks from external platforms; it retains its own AI provider (AiService/ArkProvider) for lightweight classification and routing
- Network latency between the local CLI and remote server is acceptable for event processing (typical home/office internet connection)
- The existing Topic and Timeline data model on the remote server can accommodate a new "pending event" concept without fundamental schema changes
- Agent subprocess invocations (Claude Code, Codex) are stateless — each invocation is independent and does not rely on previous agent sessions
- SKILL.md format extensions (executor, allowedTools, maxTurns frontmatter fields) are backward-compatible — Skills without these fields use global defaults
- The MCP server exposed by the local CLI communicates with the remote server via the existing REST API — no new transport protocol is needed
- Users are responsible for their own AI agent costs (API tokens consumed by Claude Code or Codex)
