# Contract: CLI Commands

**Date**: 2026-04-10 | **Feature**: 008-secure-im-dispatch

## topichub-admin link \<code\>

Binds the current CLI instance to an IM identity using a pairing code.

### Usage

```bash
topichub-admin link ABC123
```

### Behavior

1. Load config from `~/.topichub/config.json` — exit if missing.
2. Load admin token from `~/.topichub/credentials.enc`.
3. Call `POST /api/v1/identity/link` with `{ code: "ABC123" }`.
4. On success: print `Linked! Your IM identity (lark/ou_xxxxx) is now bound to this CLI.`
5. On error (invalid/expired code): print error and exit.
6. On error (409 conflict): print `This IM identity is already linked to another account.`

### Exit codes

- 0: Success
- 1: Invalid/expired code or server error

## topichub-admin unlink

Removes all IM identity bindings for this CLI.

### Usage

```bash
topichub-admin unlink
topichub-admin unlink --platform lark --user ou_xxxxx
```

### Behavior

1. If `--platform` and `--user` are provided, unlink that specific identity.
2. Otherwise, unlink all bindings for this CLI's claim token.
3. Call `POST /api/v1/identity/unlink`.
4. Print summary: `Unlinked. 2 pending dispatch(es) cancelled.`

## topichub-admin serve (modified)

### New flags

```bash
topichub-admin serve [--force] [--max-agents N] [--executor <type>]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--force` | false | Override active executor check (for crash recovery) |
| `--max-agents` | config value or 1 | Maximum concurrent agent subprocesses |
| `--executor` | config value | Executor type (`claude-code`, `codex`) |

### Modified startup sequence

1. Load config → load token → **resolve `topichubUserId`** from claim token.
2. Call `POST /api/v1/executors/register` with `force` flag.
   - On 409: print `An executor is already active for your account (hostname: desktop.local, last seen: 2m ago). Use --force to override.` → exit 1.
3. Start heartbeat timer (30s interval → `POST /api/v1/executors/heartbeat`).
4. Start event consumer (existing SSE + catch-up, now with user-scoped filtering).
5. Start task processor pool (up to `maxConcurrentAgents` parallel).
6. On SIGINT/SIGTERM: deregister executor → stop heartbeat → drain active tasks → exit.

### Modified task processing

When the task processor detects a Q&A need from the agent subprocess:
1. Post question to server (`POST /api/v1/dispatches/:id/question`).
2. Poll for answer (`GET /api/v1/dispatches/:id/qa?status=answered`) every 3 seconds.
3. When answer arrives, inject it into the agent subprocess (via stdin or MCP tool response).
4. If timed out (server sets dispatch to SUSPENDED), stop the subprocess and log.

## Config schema additions

```
maxConcurrentAgents: number (default: 1, min: 1, max: 10)
```

Added to `~/.topichub/config.json` via `topichub-admin init` or manual edit.
