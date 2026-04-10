# Research: Secure IM Dispatch

**Date**: 2026-04-10 | **Feature**: 008-secure-im-dispatch

## R1: User Identity Binding Strategy

**Decision**: Use a pairing-code-based registration flow stored in MongoDB. The remote server generates a short-lived code when an IM user runs `/topichub register`, and the local CLI claims it via `topichub-admin link <code>`. The binding is stored in a `user_identity_bindings` collection.

**Rationale**: Pairing codes are a well-established pattern (Chromecast, Spotify Connect, VS Code Tunnels) for linking devices/identities across trust boundaries. They don't require OAuth, shared secrets, or pre-existing user accounts. The code is time-limited (10 minutes), single-use, and delivered privately to the IM user.

**Alternatives considered**:
- Admin-configured whitelist (static `tenantMapping` with user IDs) — rejected; doesn't scale, requires admin action for each user, and doesn't work cross-platform.
- OAuth/SSO-based identity — rejected; over-engineering for the expected scale, requires IM platform OAuth app registration.
- Magic link via email — rejected; Topic Hub doesn't have email infrastructure, and IM users may not want to share email addresses.

## R2: User-Scoped Dispatch Filtering

**Decision**: Add an optional `targetUserId` field to the existing `TaskDispatch` entity. When a dispatch is created from an IM command, `targetUserId` is set to the resolved Topic Hub user ID. The `DispatchService.findUnclaimed()` method is extended with a `targetUserId` filter parameter. The CLI's `EventConsumer` passes the user ID when polling.

**Rationale**: Minimal change to the existing dispatch model — one optional field + one additional query filter. Non-IM dispatches (from webhooks, API) continue to work as before with `targetUserId` unset (tenant-scoped, any CLI can claim). The change is backward-compatible.

**Alternatives considered**:
- Separate collection for user-scoped dispatches — rejected; duplicates logic and splits the dispatch pipeline.
- Client-side filtering (CLI ignores dispatches not meant for it) — rejected; insecure, any CLI could read all dispatches.
- JWT-based claim tokens with user ID embedded — rejected; adds JWT complexity to the CLI-server auth flow which currently uses simple bearer tokens.

## R3: Single-Executor Enforcement

**Decision**: Server-side enforcement via the `executor_heartbeats` collection. When `topichub-admin serve` starts, it calls `POST /api/v1/executors/register` which checks for an existing active heartbeat for the user. If an active heartbeat exists (last seen within 60s), the server returns 409 Conflict. The CLI exits with a clear error. A `--force` flag sends a `force: true` parameter that overwrites the existing heartbeat.

**Rationale**: Server-side enforcement is reliable — it doesn't depend on local process state (PID files can become stale). The heartbeat collection already tracks executor availability for the "missing executor" notification (Story 3). Adding a uniqueness check on registration reuses the same data.

**Alternatives considered**:
- Local PID file — rejected; doesn't work across machines (user starts CLI on laptop A, forgets, starts on laptop B).
- Client-side check only — rejected; unreliable, can be bypassed.
- Server-side with distributed lock (Redis) — rejected; over-engineering, MongoDB's atomic findOneAndUpdate is sufficient.

## R4: Heartbeat Mechanism

**Decision**: The local CLI sends a heartbeat (`POST /api/v1/executors/heartbeat`) every 30 seconds. The server upserts an `executor_heartbeats` document with `lastSeenAt = now()`. A heartbeat older than 60 seconds is considered stale. The IM webhook handler checks heartbeat freshness before creating a dispatch to determine whether to send a "missing executor" notification.

**Rationale**: 30s/60s intervals provide a good balance between responsiveness (detect missing executor within 60s) and overhead (1 HTTP request per 30s per user). The upsert pattern is simple and atomic.

**Alternatives considered**:
- WebSocket-based liveness — rejected; adds complexity, SSE is already used for event delivery.
- SSE reconnection as implicit heartbeat — rejected; SSE connection drops can happen without the executor being truly offline.
- Longer intervals (5 min) — rejected; too slow to detect missing executors for a good UX.

## R5: Q&A Exchange Relay

**Decision**: The Q&A relay uses a dedicated MongoDB collection (`qa_exchanges`) with a polling-based delivery model. When the local agent needs user input, the local CLI posts a question to `POST /api/v1/dispatches/:id/question`. The server stores it and relays it to IM via OpenClaw. When the user replies with `/answer <text>` in IM, the server stores the answer. The local CLI polls `GET /api/v1/dispatches/:id/qa?status=pending` for answered questions.

**Rationale**: Consistent with the one-way communication model (local polls remote). The Q&A exchange is tied to a specific dispatch, making routing unambiguous. The `/answer` prefix (clarified in spec) provides clean separation from commands.

**Alternatives considered**:
- SSE-based answer delivery — acceptable as an optimization; could be added later. Polling is simpler for v1.
- Embedding Q&A in the dispatch record itself — rejected; a dispatch can have multiple Q&A rounds, and the lifecycle (pending → answered → timed-out) is complex enough to warrant its own collection.
- Direct stdin/stdout pipe between server and agent — rejected; requires bidirectional connection, violates one-way constraint.

## R6: Parallel Agent Execution

**Decision**: The `TaskProcessor` in the CLI is extended with a concurrency pool. Instead of processing one dispatch at a time, it maintains an array of in-flight promises (up to `maxConcurrentAgents`). New dispatches are dequeued from the event consumer and started as soon as a slot opens. Each agent subprocess runs independently with its own MCP config.

**Rationale**: The existing `TaskProcessor` already handles one dispatch at a time. Adding a semaphore/pool pattern is straightforward. Each subprocess is fully isolated (own process, own MCP config, own prompt), so there are no shared-state concerns.

**Alternatives considered**:
- Worker threads — rejected; Claude Code and Codex are invoked as external CLI subprocesses, not in-process functions. Workers add no benefit.
- Separate CLI instances (one per agent) — rejected; user said single executor only. Multi-agent must happen within one CLI instance.
- OS-level process pool — rejected; over-engineering. A simple async semaphore with `Promise.all` is sufficient.

## R7: IM Command Routing (Answer vs Command)

**Decision**: The OpenClaw webhook handler processes three prefixes: `/topichub` (command), `/answer` (Q&A response), and ignores everything else. When `/answer` is received, the handler looks up the user's active Q&A exchange (most recent pending question for any of their dispatches) and stores the answer.

**Rationale**: Clean separation of concerns via prefix. The `/answer` prefix was chosen during clarification to avoid ambiguity between Q&A responses and new commands. If a user has multiple pending questions (parallel agents), the system routes `/answer` to the most recent pending question. If the user needs to answer a specific question, the IM message includes a reference ID they can use: `/answer #2 yes`.

**Alternatives considered**:
- Reply-to/quote-based routing — rejected by user; not all IM platforms support reply-to consistently.
- Session-based routing (user is "in a Q&A session") — rejected; state management is fragile across reconnections.

## R8: Pairing Code Format and Security

**Decision**: Pairing codes are 6-character alphanumeric strings (uppercase, no ambiguous characters like 0/O, 1/I/L). Generated using `crypto.randomBytes` and mapped to the safe alphabet. Stored in MongoDB with TTL index (10 minutes). The code is scoped to the requesting IM user's platform+userId pair.

**Rationale**: 6 characters from a 30-character alphabet gives ~729M combinations. Combined with the 10-minute TTL and single-use constraint, brute-force is impractical. The format is easy to type on mobile and read aloud.

**Alternatives considered**:
- UUID — rejected; too long to type manually from IM to CLI.
- Numeric PIN (6 digits) — acceptable but smaller keyspace (1M). Alphanumeric is better.
- QR code — rejected; requires the CLI to have a way to scan, which isn't typical for terminal environments.
