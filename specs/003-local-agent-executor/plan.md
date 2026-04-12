# Implementation Plan: Local Agent Executor

**Branch**: `003-local-agent-executor` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-local-agent-executor/spec.md`

## Summary

Split the Topic Hub architecture into two runtime layers: a centralized remote server (webhook receiver + data store + lightweight AI for understanding/routing) and a local CLI serve process (agent-based task execution via Claude Code or Codex). The remote server uses its existing AiService to classify incoming data and dispatch structured tasks. The local CLI consumes these tasks, invokes the user's chosen AI agent as a subprocess, and writes enriched results back. An interactive `init` command configures the local environment (server URL, tenant, executor, skills directory). MCP tools expose topic-hub data to agents during execution.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10, Typegoose + Mongoose 8, zod, gray-matter (server); Ink 5 + React 18, zod (CLI — existing deps, Ink unused so far); `@modelcontextprotocol/sdk` (new — MCP server for CLI)  
**Storage**: MongoDB 7 (existing collections + new `task_dispatches` collection)  
**Testing**: Jest + ts-jest + mongodb-memory-server (server); Jest + ts-jest + ink-testing-library (CLI)  
**Target Platform**: Linux server (Docker) for remote; macOS/Linux/WSL for local CLI  
**Project Type**: Monorepo (pnpm 9 + Turbo): `@topichub/server` (NestJS API) + `@topichub/cli` (Node CLI)  
**Performance Goals**: Task dispatch creation < 200ms server-side; local event detection < 10s; agent subprocess timeout configurable (default 5min)  
**Constraints**: Remote server must not run agent subprocesses; local CLI must work with user-installed `claude` or `codex`; no new transport protocol (REST + SSE only)  
**Scale/Scope**: Single remote server, 1–N local CLI instances per tenant; task claim/lock prevents duplicate processing

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | ✅ Pass | New code follows existing patterns (NestJS modules, Typegoose models, zod validation). CLI init uses Ink (already a dependency). Named constants for config keys. |
| II. Testing Standards | ✅ Pass | Unit tests for: init config, executor detection, MCP tools, task dispatch service. Integration tests for: serve event loop, agent subprocess mocking, claim/lock mechanism. |
| III. User Experience Consistency | ✅ Pass | `init` follows interactive selection pattern. `serve` provides real-time terminal status. CLI commands follow existing `topichub-admin <command>` pattern. |
| IV. Performance Requirements | ✅ Pass | Task dispatch is async write. SSE for real-time events avoids polling overhead. Agent subprocess is external — no server-side performance impact. API endpoints remain < 500ms p95. |
| V. Simplicity & Maintainability | ✅ Pass | CLI subprocess invocation of existing agents (Claude Code, Codex) is simpler than building a custom agent runtime. MCP SDK is a well-maintained standard library. |
| Security & Data Integrity | ✅ Pass | Admin token auth for CLI→server. Token stored in encrypted keychain (existing `credentials.enc`). Agent API keys stay on user's machine. Tenant isolation preserved via task dispatch scoping. |
| Development Workflow | ✅ Pass | Feature branch, PR-based. Conventional commits. |

No violations. No complexity tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-local-agent-executor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── api.md           # Task dispatch REST API contracts
│   ├── mcp-tools.md     # MCP tool definitions for agents
│   ├── cli-commands.md  # New CLI commands (init, serve, ai run)
│   └── sse-events.md    # Server-Sent Events schema
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/server/src/
├── dispatch/                              # NEW MODULE — task dispatch management
│   ├── dispatch.module.ts                 # NestJS module
│   ├── dispatch.service.ts                # Create, claim, complete, expire dispatches
│   ├── dispatch.controller.ts             # REST API: GET /dispatches, POST /dispatches/:id/claim, etc.
│   ├── dispatch-sse.controller.ts         # SSE endpoint: GET /dispatches/stream
│   └── entities/
│       └── task-dispatch.entity.ts        # Typegoose model
│
├── skill/
│   ├── pipeline/
│   │   ├── skill-pipeline.ts             # MODIFY — after AI runtime, create task dispatch
│   │   └── skill-ai-runtime.ts           # EXISTING — server-side lightweight AI (understanding/routing)
│   └── ...                               # No other changes
│
├── ai/                                    # EXISTING — retained for server-side understanding/routing
│   └── ...                               # No changes
│
└── ...                                    # Other modules unchanged

packages/cli/src/
├── index.tsx                              # MODIFY — add init, serve commands to router
├── commands/
│   ├── init/                              # NEW — interactive init command
│   │   ├── index.ts                       # Init command handler
│   │   ├── steps/                         # Individual init steps
│   │   │   ├── server-url.ts             # Prompt + validate server URL
│   │   │   ├── admin-token.ts            # Prompt + validate token
│   │   │   ├── tenant-select.ts          # Fetch tenants + selection list
│   │   │   ├── executor-select.ts        # Auto-detect + selection
│   │   │   └── skills-dir.ts            # Prompt with default
│   │   └── config.ts                     # Read/write ~/.topichub/config.json
│   │
│   ├── serve/                             # NEW — persistent serve process
│   │   ├── index.ts                       # Serve command handler
│   │   ├── event-consumer.ts             # SSE client + polling fallback
│   │   ├── task-processor.ts             # Dispatch to agent, collect result, write back
│   │   └── status-display.ts            # Terminal status UI
│   │
│   ├── ai/
│   │   └── index.ts                      # MODIFY — add 'run' subcommand
│   │
│   └── ...                               # Existing commands unchanged
│
├── executors/                             # NEW — agent executor abstraction
│   ├── executor.interface.ts             # Common interface
│   ├── executor-factory.ts               # Create executor by type
│   ├── claude-code.executor.ts           # Claude Code subprocess invocation
│   ├── codex.executor.ts                 # Codex subprocess invocation
│   └── detector.ts                       # Auto-detect installed agents on PATH
│
├── mcp/                                   # NEW — MCP server for agents
│   ├── mcp-server.ts                     # MCP server setup + tool registration
│   └── tools/                            # Individual MCP tool handlers
│       ├── get-topic.ts
│       ├── search-topics.ts
│       ├── update-topic.ts
│       ├── add-timeline-entry.ts
│       └── list-signals.ts
│
├── config/                                # NEW — local config management
│   ├── config.ts                         # Read/write ~/.topichub/config.json
│   └── config.schema.ts                  # Zod schema for config validation
│
├── api-client/
│   └── api-client.ts                     # MODIFY — use config for baseUrl + auth
│
└── auth/
    └── keychain.ts                       # EXISTING — reuse for token storage

packages/server/test/
├── unit/
│   ├── dispatch-service.spec.ts          # NEW
│   └── ...                               # Existing tests unchanged
└── integration/
    └── dispatch-sse.spec.ts              # NEW

packages/cli/test/                         # NEW — CLI test directory
├── unit/
│   ├── config.spec.ts
│   ├── executor-factory.spec.ts
│   ├── claude-code-executor.spec.ts
│   ├── codex-executor.spec.ts
│   └── detector.spec.ts
└── integration/
    ├── init-command.spec.ts
    └── serve-loop.spec.ts
```

**Structure Decision**: Extends existing monorepo. New `dispatch/` module on server for task dispatch management. CLI grows significantly with `init/`, `serve/`, `executors/`, `mcp/`, and `config/` directories. No new packages — all within existing `@topichub/server` and `@topichub/cli`.
