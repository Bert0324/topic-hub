# Research: Local Agent Executor

## R1: SSE vs WebSocket for Real-Time Event Delivery

**Decision**: Server-Sent Events (SSE)

**Rationale**: SSE is unidirectional (server → client), which matches the task dispatch pattern exactly — the server pushes new dispatches, the client claims them via separate REST calls. SSE runs over standard HTTP, requires no protocol upgrade, works through proxies/load balancers, and NestJS has built-in SSE support via `@Sse()` decorator. The local CLI only needs to receive events, not send data in real-time.

**Alternatives considered**:
- **WebSocket**: Bidirectional, but overkill — the client doesn't need to push data to the server in real-time. Adds complexity (ws library, connection management, heartbeat). Would require a new NestJS gateway.
- **Long polling**: Simpler but higher latency and more server load than SSE. Acceptable as a fallback when SSE is unavailable.

---

## R2: Task Dispatch Claim/Lock Mechanism

**Decision**: MongoDB-based optimistic locking with `findOneAndUpdate` + status field

**Rationale**: The existing stack uses MongoDB exclusively. A `findOneAndUpdate` with `{ status: 'unclaimed' }` filter and `{ $set: { status: 'claimed', claimedBy, claimExpiry } }` provides atomic claim semantics without additional infrastructure. Expired claims are released by a periodic check or on-demand query (`claimExpiry < now`).

**Alternatives considered**:
- **Redis-based distributed lock**: More robust for high concurrency, but adds a new infrastructure dependency. Overkill for the expected scale (1–5 CLI instances per tenant).
- **BullMQ / job queue**: Feature-rich but heavyweight. Adds Redis dependency and queue management complexity. The dispatch model is simpler than a full job queue.
- **Database advisory locks (PostgreSQL)**: Not applicable — project uses MongoDB.

---

## R3: MCP Server Implementation for CLI

**Decision**: Use `@modelcontextprotocol/sdk` with stdio transport

**Rationale**: The official MCP SDK (`@modelcontextprotocol/sdk`) is the standard way to build MCP servers. Both Claude Code (`--mcp-config`) and Codex support MCP server configuration. Stdio transport is recommended for local tools — the CLI spawns the MCP server as part of the agent invocation, and the agent communicates with it over stdin/stdout.

**Alternatives considered**:
- **Custom HTTP-based tool API**: Would require the agent to make HTTP calls instead of using MCP. Less standard, doesn't leverage agent built-in MCP support.
- **SSE transport MCP**: Designed for remote servers. Unnecessary for local tool execution.

---

## R4: Interactive CLI Prompts for Init Command

**Decision**: Use `@inquirer/prompts` for the init interactive flow

**Rationale**: While Ink + React are available as dependencies, they are designed for persistent terminal UIs (like the `serve` status display), not sequential prompt flows. `@inquirer/prompts` is the modern, modular successor to inquirer.js — it provides `input()`, `select()`, `password()`, and `confirm()` as standalone async functions. Perfect for the linear init flow with validation gates. Lightweight, well-maintained, and widely used.

**Alternatives considered**:
- **Ink + React**: Already a dependency but overkill for a sequential prompt flow. Better suited for the `serve` status display (persistent, updating UI).
- **@clack/prompts**: Beautiful prompts but less mature ecosystem. `@inquirer/prompts` has broader community support.
- **Raw readline**: Too low-level. Would need to reimplement selection lists, validation, and formatting.

---

## R5: Claude Code vs Codex Invocation Patterns

**Decision**: Unified executor interface with backend-specific adapters

**Rationale**: Claude Code and Codex have different CLI invocation patterns but produce equivalent outputs (text/JSON result). A common `AgentExecutor` interface with `execute(prompt, systemPrompt, mcpConfig, options)` → `Promise<ExecutionResult>` allows the rest of the system to be agent-agnostic. Each backend implements the interface with its specific CLI flags and output parsing.

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| Command | `claude -p` | `codex exec` |
| System prompt | `--append-system-prompt-file` | Inline in prompt (or stdin) |
| MCP config | `--mcp-config <json-file>` | `--mcp-config <json-file>` (if supported) or inline |
| Output format | `--output-format json` → `{ result, ... }` | `--json` → JSONL stream, last `turn/completed` event |
| Timeout | `--max-budget-usd` or external timeout | External timeout |
| No-interaction | `--bare` (skip hooks/plugins) | `--ephemeral` (no disk persistence) |

---

## R6: Config File Format and Location

**Decision**: `~/.topichub/config.json` (JSON, global per-user)

**Rationale**: JSON is native to Node.js, requires no additional parsing library, and is human-readable/editable. The `~/.topichub/` directory already exists for credentials storage (`credentials.enc`). A single global config matches the pattern of `claude` (`~/.claude.json`) and `codex` (`~/.codex/config.toml`).

**Schema**:
```json
{
  "serverUrl": "https://topichub.example.com",
  "tenantId": "abc123",
  "executor": "claude-code",
  "skillsDir": "~/.topichub/skills/"
}
```

**Alternatives considered**:
- **TOML**: Codex uses it, but would add a new parsing dependency.
- **YAML**: More verbose. Already have `gray-matter` but that's server-side only.
- **Environment variables only**: Not persistent, poor UX for multi-setting configuration.

---

## R7: Serve Process Status Display

**Decision**: Ink + React for persistent terminal UI during `serve`

**Rationale**: The `serve` command runs as a persistent process that needs to display real-time, updating information (connection state, events received, agent status). Ink is already a declared dependency in `@topichub/cli` and is specifically designed for this use case — React-based terminal UIs with state management. A simple component tree: `<ServeApp>` → `<ConnectionStatus>`, `<EventLog>`, `<AgentStatus>`.

**Alternatives considered**:
- **console.log with ANSI codes**: Simpler but can't update in-place. Would scroll the terminal with every event.
- **blessed / blessed-contrib**: Powerful terminal dashboards but heavy and poorly maintained.
- **Plain text log stream**: Functional but poor UX compared to a structured status display.

---

## R8: Task Dispatch Enriched Payload Structure

**Decision**: Include topic snapshot, event metadata, and AI classification in a structured JSON payload

**Rationale**: The enriched payload gives the local agent a head start — it doesn't need to re-classify the topic from scratch. The structure is:

```json
{
  "topic": { "id", "type", "title", "status", "metadata", "groups", "assignees", "tags", "signals", "createdAt", "updatedAt" },
  "event": { "type", "actor", "timestamp", "payload" },
  "aiClassification": { "topicType", "severity", "matchedSkill", "reasoning", "confidence" }
}
```

The `aiClassification` field is optional — populated when the server's AI was available, null when the circuit breaker was open (the dispatch is marked "unclassified" and the local agent does its own classification).
