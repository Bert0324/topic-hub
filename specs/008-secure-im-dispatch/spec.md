# Feature Specification: Secure IM Dispatch

**Feature Branch**: `008-secure-im-dispatch`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "保障执行安全，在im里的一个命令就能触发某个用户的本地操作，如何能跨im平台准确定位，并保障执行安全；一个用户的一个执行，只能让他执行自己的本地cli serve的任务；同时，如何未设置本地执行，需要在回复里提醒启动；通信是不是应该是单向的，只能本地到远程，因为本地启动可能没有公网ip; 如果有多个任务，本地支持多agents，复用claude code/codex的已有能力；如果本地执行有问答环节，需要也可以在im里完成"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bind IM Identity to Local Executor (Priority: P1)

A user links their IM account to their Topic Hub identity so the system knows which local CLI belongs to which IM user. The user runs a registration command in IM (e.g., `/topichub register`) and receives a one-time pairing code. They enter this code in their local CLI (`topichub-admin link <code>`). Once paired, the system permanently associates that IM user (across any IM platform where they use the same pairing) with that specific local CLI instance. From this point on, any command the user sends in any IM platform is routed exclusively to their own local CLI.

**Why this priority**: Without identity binding, the system cannot guarantee that an IM command reaches the correct user's local machine. This is the foundational security mechanism — every other story depends on knowing "which IM user maps to which local executor."

**Independent Test**: Can be tested by having a user send `/topichub register` in Lark, receiving a pairing code, entering it in their local CLI, and then verifying that a subsequent IM command creates a dispatch that only their local CLI can claim.

**Acceptance Scenarios**:

1. **Given** a user sends `/topichub register` in any IM channel, **When** the system generates a pairing code, **Then** the code is sent back to the user as a private/ephemeral message (not visible to other group members) and expires after 10 minutes.
2. **Given** a user enters a valid pairing code in their local CLI via `topichub-admin link <code>`, **When** the code matches an unclaimed registration, **Then** the system creates a persistent binding between the IM user identity and the local CLI's claim token, and confirms success in both the CLI and the IM channel.
3. **Given** a user has linked their IM identity on Lark, **When** they also register from Slack using `/topichub register`, **Then** they receive a new pairing code, and upon linking with the same local CLI, both IM identities (Lark + Slack) are bound to the same local executor.
4. **Given** a pairing code has expired, **When** the user tries to link it, **Then** the system rejects the code with a clear message instructing them to request a new one.
5. **Given** a pairing code is valid, **When** a different user's local CLI tries to claim it, **Then** the system rejects the claim (codes are scoped to the IM user who requested them).

---

### User Story 2 - IM Command Dispatches to User's Own Local CLI (Priority: P1)

A registered user sends a command in IM (e.g., `/topichub run bug-triage` or `/topichub create bug --title "Login broken"`). The system identifies the user via their IM identity binding, creates a user-scoped dispatch, and the user's local CLI picks it up. No other user's local CLI can see or claim this dispatch. The user receives feedback in IM when the dispatch is created, when it is picked up by their local CLI, and when execution completes.

**Why this priority**: This is the core secure dispatch flow — the direct path from IM command to local execution with user isolation. Without this, the system cannot safely route commands to the correct local machine.

**Independent Test**: Can be tested by having User A send a command in IM, verifying that User A's local CLI picks it up, and confirming that User B's local CLI (if running) never sees the dispatch.

**Acceptance Scenarios**:

1. **Given** a registered user sends `/topichub run bug-triage` in IM, **When** the system creates a dispatch, **Then** the dispatch is scoped to that user's identity and only that user's local CLI can query and claim it.
2. **Given** User A and User B both have local CLIs running, **When** User A sends an IM command, **Then** User B's local CLI does not receive or see the dispatch in its polling results.
3. **Given** a dispatch is created for a user, **When** the user's local CLI picks it up, **Then** the system sends an IM message to the user: "Task picked up by your local agent. Processing..."
4. **Given** the local CLI completes execution, **When** the result is written back to the remote server, **Then** the system sends the result summary as a rich text message back to the originating IM channel.
5. **Given** an unregistered user sends a command in IM, **When** the system cannot find an identity binding, **Then** the system replies with instructions to register: "You haven't linked a local executor yet. Run `/topichub register` to get started."

---

### User Story 3 - Detect Missing Local Executor and Prompt User (Priority: P1)

When a registered user sends a command in IM but their local CLI (`topichub-admin serve`) is not currently running, the system detects this and replies in IM with a helpful message prompting them to start their local agent.

**Why this priority**: Without this, users would send commands and receive no feedback — a confusing silent failure. Telling users to start their local CLI is essential for usability.

**Independent Test**: Can be tested by having a registered user send an IM command without running `topichub-admin serve`, and verifying the system replies with a startup prompt.

**Acceptance Scenarios**:

1. **Given** a registered user sends a command in IM, **When** no local CLI with that user's claim token has polled the server in the last 60 seconds, **Then** the system replies: "Your local agent is not running. Start it with: `topichub-admin serve`"
2. **Given** a dispatch has been pending for a configurable timeout (default: 2 minutes) without being claimed, **When** the timeout expires, **Then** the system sends a follow-up IM message: "Your task is still waiting. Is your local agent running?"
3. **Given** the user starts their local CLI after receiving the prompt, **When** the CLI connects and claims the pending dispatch, **Then** the system sends an IM update: "Task picked up. Processing..."

---

### User Story 4 - One-Way Communication: Local Polls Remote (Priority: P1)

Communication between the local CLI and the remote server is strictly outbound from local to remote. The local CLI initiates all connections — polling for dispatches, submitting results, sending heartbeats. The remote server never initiates connections to the local CLI. This design ensures the system works for users behind NAT, corporate firewalls, or without public IP addresses.

**Why this priority**: Many developers work behind NAT or corporate networks where inbound connections are impossible. The system must work without requiring port forwarding, tunneling, or public IP addresses.

**Independent Test**: Can be tested by running the local CLI behind a NAT router (no port forwarding), sending an IM command, and verifying that the task is picked up and executed successfully.

**Acceptance Scenarios**:

1. **Given** the local CLI is running behind a NAT with no public IP, **When** a dispatch is created, **Then** the local CLI picks it up via outbound polling (HTTP GET or SSE) within 10 seconds.
2. **Given** the local CLI has been running, **When** it sends periodic heartbeats to the remote server, **Then** the remote server tracks the last-seen timestamp and uses it to determine executor availability (for User Story 3).
3. **Given** the local CLI loses connectivity temporarily, **When** connectivity is restored, **Then** the CLI resumes polling and picks up any dispatches that accumulated during the outage.
4. **Given** the remote server receives a dispatch for a user, **Then** it never attempts to push or open a connection to the user's local machine.
5. **Given** a user already has `topichub-admin serve` running, **When** they start a second instance on another machine, **Then** the second instance detects the active executor via the server and exits with error: "An executor is already active for your account."
6. **Given** a user's previous CLI crashed without clean shutdown, **When** they start a new instance with `--force`, **Then** the new instance takes over as the active executor, invalidating the old heartbeat.

---

### User Story 5 - Multi-Agent Parallel Execution (Priority: P2)

When a user has multiple pending tasks (or a single task that benefits from parallel processing), the local CLI spawns multiple AI agent instances to handle them concurrently. Each agent is an independent subprocess (Claude Code or Codex) with its own context. The number of concurrent agents is configurable. This reuses the existing Claude Code and Codex subprocess capabilities from the local agent executor.

**Why this priority**: Sequential execution is a bottleneck for users with many pending tasks. Parallel execution significantly improves throughput while reusing existing agent subprocess infrastructure.

**Independent Test**: Can be tested by queuing 3 dispatches for a user, configuring `maxConcurrentAgents: 3`, and verifying all 3 are processed simultaneously with results appearing on the remote server in parallel.

**Acceptance Scenarios**:

1. **Given** 3 dispatches are pending for a user, **When** the local CLI is configured with `maxConcurrentAgents: 3`, **Then** all 3 dispatches are claimed and processed concurrently by separate agent subprocesses.
2. **Given** 5 dispatches are pending and `maxConcurrentAgents: 2`, **When** the local CLI starts processing, **Then** it processes 2 at a time, starting the next one as each completes.
3. **Given** multiple agents are running in parallel, **When** one agent fails, **Then** the other agents continue unaffected, and the failed dispatch is marked with an error.
4. **Given** the user changes `maxConcurrentAgents` in their config, **When** they restart `topichub-admin serve`, **Then** the new concurrency limit takes effect.

---

### User Story 6 - IM-Relayed Q&A for Interactive Execution (Priority: P2)

During local agent execution, if the task requires user input (confirmation, clarification, choice selection), the system relays the question from the local CLI back to the user's IM channel. The user answers in IM, the answer is forwarded to the local CLI, and execution continues. This enables interactive agent workflows without requiring the user to be at their terminal.

**Why this priority**: Some agent tasks need human confirmation ("Should I delete these 15 files?") or clarification ("Which branch should I work on?"). Without IM relay, users would need to monitor their terminal, defeating the purpose of IM-triggered execution.

**Independent Test**: Can be tested by triggering a Skill that includes a confirmation step, verifying the question appears in IM, answering in IM, and confirming that the local agent resumes with the answer.

**Acceptance Scenarios**:

1. **Given** a local agent reaches a point requiring user input, **When** the agent posts a question via the Q&A channel, **Then** the local CLI sends the question to the remote server, which relays it to the user's IM channel as a formatted message with instructions to reply using `/answer <response>`.
2. **Given** a question is displayed in IM, **When** the user replies with `/answer <text>`, **Then** the answer is captured by the remote server and made available to the local CLI, which forwards it to the agent subprocess. Messages not prefixed with `/answer` or `/topichub` are ignored by the system.
3. **Given** a question is sent to IM, **When** the user does not respond within a configurable timeout (default: 5 minutes), **Then** the system sends a reminder in IM. After a second timeout (default: 10 minutes total), the agent task is suspended with a "waiting for input" status.
4. **Given** multiple agents are running in parallel and two require user input simultaneously, **When** both questions are relayed to IM, **Then** each question is clearly labeled with its task context so the user can distinguish which task they are answering.
5. **Given** the user answers a question in IM, **When** the answer is delivered to the local CLI, **Then** the local CLI resumes the agent subprocess with the answer and the agent continues from where it left off.

---

### Edge Cases

- What happens when a user has linked multiple IM identities (Lark + Slack) and sends commands from both simultaneously? Each command creates a separate dispatch; they are processed according to the concurrency limit. IM responses are sent back to the originating platform.
- What happens when a user unlinks their IM identity? They can run `/topichub unregister` in IM or `topichub-admin unlink` in CLI. Pending dispatches for that user are cancelled, and future IM commands prompt re-registration.
- What happens when the pairing code is intercepted by another user? Pairing codes are sent as ephemeral/private messages. Even if intercepted, the code can only be linked from a CLI that authenticates with the same tenant. An attacker would need both the pairing code AND valid tenant credentials.
- How does the system handle a user attempting to start a second local CLI? The system enforces a single-executor constraint: only one `topichub-admin serve` instance may be active per user at any time. If a second instance starts while one is already active (heartbeat received within the last 60 seconds), the new instance exits immediately with an error: "An executor is already active for your account." If the previous instance crashed without a clean shutdown, the user must wait for the heartbeat timeout (60 seconds) before starting a new one, or use `topichub-admin serve --force` to explicitly override.
- What happens when a Q&A answer arrives after the agent has timed out? The answer is discarded. The user is notified that the task was suspended due to timeout, and they can re-trigger it.
- What happens when the remote server rate-limits outbound IM messages during a burst of agent completions? Messages are queued and sent as rate limits permit. The agent execution results are persisted regardless of IM delivery status.
- What happens when a user sends a free-text message (no `/topichub` or `/answer` prefix) in a channel with a pending Q&A? The message is ignored by the system. Only `/answer <text>` is captured as a Q&A response; only `/topichub ...` is processed as a new command.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a user registration flow where an IM user requests a pairing code via `/topichub register`, receives the code privately, and completes the binding by entering the code in their local CLI via `topichub-admin link <code>`.
- **FR-002**: System MUST maintain a persistent identity mapping between IM platform user identifiers (e.g., Lark `ou_xxx`, Slack `U0XXX`, Telegram numeric ID) and a Topic Hub user identity. A single Topic Hub user identity can have multiple IM platform identifiers bound to it.
- **FR-003**: System MUST scope all dispatch records by user identity. When the local CLI polls for pending dispatches, it MUST only receive dispatches assigned to the authenticated user.
- **FR-004**: System MUST reject dispatch claims from local CLI instances whose claim token does not match the dispatch's assigned user identity.
- **FR-005**: System MUST track local CLI availability via periodic heartbeats. The local CLI MUST send a heartbeat at a regular interval (default: 30 seconds). The remote server MUST consider a local CLI unavailable if no heartbeat has been received within a configurable threshold (default: 60 seconds).
- **FR-006**: System MUST notify the user in IM when their local CLI is not available and a command requires local execution. The notification MUST include instructions on how to start the local agent.
- **FR-007**: System MUST send proactive follow-up notifications in IM when a dispatch remains unclaimed beyond a configurable timeout (default: 2 minutes).
- **FR-008**: Communication between the local CLI and the remote server MUST be strictly outbound from local to remote. The remote server MUST NOT initiate any connections to the local CLI. The local CLI MUST use outbound HTTP polling or Server-Sent Events (SSE) to receive dispatches and Q&A answers.
- **FR-009**: System MUST support configurable parallel agent execution on the local CLI. Users MUST be able to set a maximum number of concurrent agent subprocesses (default: 1). Each concurrent agent runs as an independent subprocess (Claude Code or Codex).
- **FR-010**: System MUST support relaying interactive questions from local agent execution back to the user's IM channel. The relay MUST include: the question text, the task context (which Skill and topic it relates to), and formatting suitable for IM display.
- **FR-011**: System MUST support receiving user answers from IM via the `/answer <text>` command prefix and delivering them to the local CLI for the agent subprocess to continue execution. The answer routing MUST match the answer to the correct pending question (by task/dispatch ID). Messages without the `/answer` or `/topichub` prefix MUST be ignored by the system.
- **FR-012**: System MUST handle Q&A timeouts — if the user does not respond within a configurable period, the system MUST send a reminder and eventually suspend the task.
- **FR-013**: Pairing codes MUST be single-use and time-limited (default: 10 minutes). Expired or already-used codes MUST be rejected.
- **FR-014**: System MUST support unlinking IM identities via `/topichub unregister` (in IM) or `topichub-admin unlink` (in CLI). Unlinking MUST cancel any pending dispatches for that user and prevent future IM commands from being dispatched until re-registration.
- **FR-015**: When a dispatch is created from an IM command, if the user has no identity binding, the system MUST reply with registration instructions instead of silently failing.
- **FR-016**: Dispatch lifecycle events (created, claimed, completed, failed, suspended) MUST be communicated back to the user via IM messages in the originating channel.
- **FR-017**: System MUST enforce a single-executor constraint: only one `topichub-admin serve` instance may be active per user at any time. If a second instance attempts to start while an active executor exists (heartbeat received within the last 60 seconds), the new instance MUST exit with a clear error message. A `--force` flag MUST be available to override the check when the user knows the previous instance has crashed.

### Key Entities

- **User Identity Binding**: The link between one or more IM platform user identifiers and a single Topic Hub user identity. Includes: binding ID, Topic Hub user ID, platform name, platform user ID, created timestamp, and active status.
- **Pairing Code**: A temporary token used during registration to securely bind an IM identity to a local CLI. Includes: code value, requesting IM user (platform + user ID), expiry timestamp, claimed status, and the Topic Hub user ID that claimed it.
- **User-Scoped Dispatch**: An extension of the existing Task Dispatch that includes a `targetUserId` field to ensure only the intended user's local CLI can claim and execute it.
- **Executor Heartbeat**: A record of the last time a user's local CLI checked in. Includes: user ID, claim token, last-seen timestamp, and executor metadata (agent type, concurrency capacity).
- **Q&A Exchange**: A message pair (question + answer) linked to a specific dispatch. Includes: dispatch ID, question text, question timestamp, answer text, answer timestamp, and status (pending, answered, timed-out).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An IM command sent by a registered user triggers execution on their own local CLI and only their own — no other user's local CLI can see or claim the dispatch.
- **SC-002**: Users can bind IM identities from 2 or more different IM platforms to the same local executor, and commands from any bound platform are correctly routed.
- **SC-003**: When a user's local CLI is not running, the system notifies them in IM within 15 seconds of receiving the command, with clear instructions on how to start the local agent.
- **SC-004**: The local CLI operates behind NAT without public IP, requiring zero inbound port configuration — all communication is outbound from local to remote.
- **SC-005**: With parallel execution enabled, the local CLI processes multiple dispatches concurrently (up to the configured limit), reducing total processing time proportionally.
- **SC-006**: Interactive Q&A questions from local agent execution appear in IM within 5 seconds, and user answers are delivered back to the agent within 5 seconds of being sent.
- **SC-007**: The pairing code registration flow completes end-to-end in under 2 minutes for a user performing it for the first time.
- **SC-008**: Zero dispatches are processed by the wrong user's local CLI — the system enforces user-scoped isolation with no bypass.

## Clarifications

### Session 2026-04-10

- Q: When a user starts a second `topichub-admin serve` while one is already running, what should happen? → A: Reject the new CLI — the second `serve` exits with error: "An executor is already active for your account." A `--force` flag is available for crash recovery.
- Q: How does the system distinguish Q&A answers from new commands in IM? → A: Dedicated prefix — Q&A answers require `/answer <text>`. Only `/topichub` and `/answer` prefixes are processed; all other messages are ignored.

## Assumptions

- The OpenClaw IM Bridge (feature 007) is operational — IM messages are received and sent via OpenClaw. This feature builds on top of 007's inbound/outbound messaging capabilities.
- The Local Agent Executor (feature 003) is operational — the local CLI's `serve` mode, agent subprocess dispatch (Claude Code/Codex), and MCP tools infrastructure are in place. This feature adds user-scoped security, multi-agent concurrency, and Q&A relay on top of 003's execution model.
- IM platforms (via OpenClaw) support sending ephemeral/private messages to individual users for pairing codes. If a platform does not support ephemeral messages, the pairing code is sent as a direct message to the user.
- Users have already completed `topichub-admin init` (feature 003) before running `topichub-admin link`. The local CLI is already configured with the remote server URL and tenant credentials.
- The existing SSE/polling infrastructure for dispatches (feature 003) can be extended with user-scoped filtering without architectural changes.
- Agent subprocesses (Claude Code/Codex) support a mechanism for the local CLI to inject questions and receive answers during execution (stdin/stdout or MCP tools).
- Users accept that Q&A-relayed execution is asynchronous — there may be latency between sending a question and receiving the answer via IM.
