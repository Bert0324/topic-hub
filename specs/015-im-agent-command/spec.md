# Feature Specification: IM multi-agent slots and `/agent` command

**Feature Branch**: `015-im-agent-command`  
**Created**: 2026-04-12  
**Status**: Draft  
**Input**: User description: "在im命令里引入/agent指令，支持：create 在本地执行引擎里创建新agent；delete 在本地执行引擎里删除agent。每个agent都有可复用的#N，让用户清晰的知道自己在操作哪些。本地执行引擎，不再自动创建新agent，而是如果是0个agent，才会自动创建一个，不然就默认使用第一个。同时，所有会让本地执行引擎执行的命令，都支持带上 #N来指定agent，不带#N就默认是第一个。"

## Clarifications

### Session 2026-04-12

- Q: Should `/agent` include an explicit **list** subcommand for roster visibility? → A: **Yes** — `/agent list` shows the current local execution engine agent roster with **`#N`** and each agent’s **observable state** (idle, busy, or other states the product defines), so users know what they are operating on without guessing.
- Q: How must **IM → local execution** trust work when users can run **multiple local processes** and **switch IM credentials**? → A: **Pairing is initiated on the local side** (local executor surfaces a pairing code); the user completes pairing **in IM**. The trust model is **one local executor to many IM bindings** (1:N); switching IM accounts must **never** route commands to another user’s unpaired local process.
- Q: Exceptions for binding, unknown skills, developer workflows, and legacy CLI? → A: **`/help` is exempt** — it MUST work **without** prior IM binding because it returns **fixed/static** content only. **Unknown slash skill** names MUST still be forwarded to the **local execution engine**, with a short user-visible note that **no remote/published skill matched**. **Skill lifecycle** for developers continues under the **`skill-repo`** command family. **No backward-compatibility requirement** for legacy **`/topichub`** CLI paths or semantics.
- Q: If the user never runs **`/agent create`** and never specifies **`#N`**, how should local execution behave? → A: All such IM-originated work MUST route through **one** logical agent — the **default `#1`** slot (after the zero→one bootstrap). There MUST be **no** per-message implicit creation of additional agents and **no** rotating default across messages.
- Q: Must **“per-task implicit multi-agent”** be removed entirely, and when can UX stay **“无感”**? → A: **Yes** — no new agent slots may be inferred from **task count, dispatch boundaries, skill choice, or retries**; any **second and further** slot MUST come only from **explicit** user intent (**`/agent create`** or a documented equivalent). **Seamless UX** (no obligation to type **`#N`**) is allowed **only** while the roster contains **exactly one** agent after bootstrap; once **two or more** slots exist, routing and acknowledgements MUST keep **`#N`** and roster state **legible** (default `#1` remains defined, but the product MUST NOT pretend there is still a single invisible agent).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Create and list agents from IM (Priority: P1)

A user runs several tasks in the same chat and wants **separate parallel “brains”** (agents) on their machine, each with a clear label. They use an IM command to **create** a new agent and see it appear in a numbered list so they know which slot they got.

**Why this priority**: Without explicit creation and visible numbering, users cannot intentionally target a specific local agent.

**Independent Test**: From a linked IM session, issue create; observe confirmation that includes a stable slot reference for that agent until the roster changes.

**Acceptance Scenarios**:

1. **Given** the local execution engine has zero agents configured for this binding/session, **When** the user sends any command that would normally require an agent, **Then** the system ensures **exactly one** default agent exists (auto-created once) and uses it without extra steps.
2. **Given** at least one agent already exists, **When** the user invokes **create** via the IM agent command, **Then** a **new** agent is added locally and the user receives feedback that identifies the new agent in the same numbering scheme used elsewhere (`#N` style).
3. **Given** multiple agents exist, **When** the user sends **`/agent list`**, **Then** each agent is shown with **`#N` plus a short human-readable line and current state** (so the user can copy or match commands later).

---

### User Story 2 — Target the right agent on every execution (Priority: P1)

A user has multiple agents. Every IM interaction that triggers work on the **local execution engine** (plain chat relay, skill slash, queue/answer flows that bind to an agent, etc.) must be able to specify **which** agent runs the work. If they omit the selector, the **first** agent in the default ordering is used — i.e. they stay in **one** default agent (`#1`) until they add slots or pass another `#N`.

**Why this priority**: This is the core usability fix: predictable routing without accidental “wrong agent” runs.

**Independent Test**: With two agents, run the same kind of command twice—once without `#N` (hits default) and once with `#2`—and observe distinct handling or confirmation that references `#2`.

**Acceptance Scenarios**:

1. **Given** two or more agents exist, **When** the user sends a local-execution command **with** `#2` (or the documented slot token) in the supported position, **Then** agent **#2** receives the work (not the default), and the outbound confirmation (if any) references **#2** consistently with the list format.
2. **Given** two or more agents exist, **When** the user sends the same class of command **without** `#N`, **Then** the **first** agent in the canonical ordering (`#1`) is used **and** the user receives an explicit indication that **`#1`** ran (or equivalent unambiguous copy), because multi-slot mode is never “silent”—only the **single-agent** roster may omit **`#N`** without extra cognitive load.
3. **Given** only one agent exists, **When** the user sends a command with `#1` or without `#N`, **Then** behavior is equivalent and no error is required solely for omitting `#N`.

---

### User Story 3 — Delete an agent safely (Priority: P2)

A user finishes a long-running thread and wants to free the slot. They use **delete** with the correct `#N`. The system removes that agent locally and updates numbering/listing so remaining agents are still easy to reference.

**Why this priority**: Creation without deletion leads to clutter and stale slots; still secondary to create + route.

**Independent Test**: Create two agents, delete `#2`, list again—user sees updated roster and can still run commands against remaining slots.

**Acceptance Scenarios**:

1. **Given** agent `#2` exists and has no in-flight work **or** the product defines a clear policy for busy agents, **When** the user issues **delete** for `#2`, **Then** that agent is removed and confirmations/listings no longer show it.
2. **Given** the user requests delete for a non-existent `#N`, **When** the command runs, **Then** they receive a clear error and the current valid list (or range) without partial deletion.

---

### User Story 4 — Inspect roster on demand (Priority: P1)

A user wants to see **which agents exist and whether they are busy** before choosing `#N` for the next command.

**Why this priority**: Listing is the cheapest way to prevent wrong-agent mistakes; it complements create/delete.

**Independent Test**: With zero, one, and many agents, `/agent list` output matches the same `#N` order used for defaults and selectors.

**Acceptance Scenarios**:

1. **Given** any roster size, **When** the user sends **`/agent list`**, **Then** the reply is self-contained (no dependency on an external UI) and includes every agent with **`#N`** and **state** sufficient to choose the next command safely.
2. **Given** the user is not yet paired for other commands, **When** they send **`/agent list`**, **Then** the product applies the same binding rule as other `/agent` subcommands (list is **not** in the `/help` unbound-exception set).

---

### Edge Cases

- User deletes the **only** agent: next command either recreates the single default (zero agents → one) per the bootstrap rule, or errors until create—**behavior must be documented in one place** and stay consistent with “0 agents → auto one”.
- User specifies `#N` where **N** is out of range: error plus valid `#` range or list.
- **Concurrent** commands targeting different `#N` while both agents are busy: product defines whether queueing, rejection, or parallel run is allowed; default assumption is **do not lose work**—surface a clear busy state for the targeted agent.
- **No per-task implicit multi-agent**: The system MUST **never** create or rotate agents based on **per-dispatch / per-task** boundaries, task volume, skill type, or retries. The **only** automatic roster mutation is **zero → exactly one** (`#1`) bootstrap; every additional slot requires **explicit** **`/agent create`** (or documented equivalent). **Seamless “no `#N` typing”** UX applies **only** while **exactly one** agent exists—never as a disguise when multiple slots are present.
- User switches **IM account or credential** mid-session: commands MUST only affect the **local executor and roster** bound by the **active pairing** for that IM identity—no cross-user “wrong machine” execution.
- User invokes a **slash token that does not match** any remote/published skill: message still goes to **local execution**, plus the **“no remote skill match”** hint (must not silently drop or pretend success on the server alone).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose an IM-facing **`/agent`** command family with **`create`**, **`delete`**, and **`list`** subcommands that operate on the **local execution engine’s** agent roster for the **actively paired** user/binding context.
- **FR-002**: Each agent in the roster MUST be addressable with a **user-visible slot index `#N`** that matches the order shown in agent listings and in command acknowledgements, until the roster changes (create/delete/reorder policy).
- **FR-003**: The local execution engine MUST **not** automatically create a **new** agent for every incoming task when agents already exist; it MUST maintain a stable default of **“use the first agent”** unless the user specifies another `#N`.
- **FR-004**: When the roster for that context contains **zero** agents, the engine MUST **automatically create exactly one** default agent the first time an agent is needed, then use it as the sole `#1`.
- **FR-005**: Every IM-originated user action category that today triggers work on the local execution engine MUST accept an **optional `#N` agent selector** in a documented, consistent position; when omitted, the selector MUST default to **`#1`** (the first agent in the canonical ordering). Omitting both **`/agent create`** (no user-driven roster expansion) and **`#N`** MUST mean **all** such commands run against that **same** default agent — **`#1`** — not a different implicit slot per message.
- **FR-006**: Successful **create** and **delete** operations MUST return IM-visible confirmations that repeat **`#N` plus the same one-line context style** used in listings (skill/topic labels may be omitted for agent rows if not applicable; agent name or “Agent #N” line is mandatory).
- **FR-007**: Help text and in-product hints for IM MUST describe: bootstrap (0 agents), default-first behavior, optional `#N` on execution commands, and **`/agent create` / `/agent delete` / `/agent list`** usage.
- **FR-008**: If **delete** is requested while the targeted agent has work in progress, the system MUST apply a single documented policy (e.g., reject with explanation, or queue delete after idle)—and MUST NOT leave the user uncertain whether the agent still exists.
- **FR-009**: **`/agent list`** MUST return, for **each** agent in the roster: **`#N`**, a **one-line label** (product-defined), and **observable run state** (e.g., idle vs busy vs queued—exact enum left to planning) so a user can decide which `#N` to pass on the next command.
- **FR-010**: **Trust & routing**: Only IM identities that have completed **pairing** against the intended **local executor** MAY trigger local execution for that executor’s roster. **Pairing codes are generated by the local executor** and consumed in IM. The supported topology is **one local executor : many IM pairings**; credential switches MUST re-resolve binding so commands never attach to another user’s local engine.
- **FR-011**: **`/help`** MUST be callable **without** prior IM binding and MUST return only **static, pre-defined** help content (no personalized roster or execution).
- **FR-012**: When a user invokes a **slash skill name** that does **not** match any **remote/published** skill, the system MUST still **forward** the invocation to the **local execution engine** (per existing routing direction) and MUST include a concise user-visible line that **no remote skill matched** (wording may be localized).
- **FR-013**: Developer-facing **skill repository** lifecycle operations remain under the **`skill-repo`** CLI command family; this feature MUST NOT reintroduce or require legacy **`/topichub`** CLI compatibility.
- **FR-014**: **Explicit multi-agent only**: Beyond the **zero → one** bootstrap, the product MUST NOT add agent slots implicitly (including tying slot count to concurrent tasks, failures, or “one brain per run”). **Seamless UX**—users not required to type **`#N`** on ordinary commands—is permitted **only** when the roster holds **exactly one** agent; with **two or more** agents, confirmations and help MUST keep slot choice **legible** (including which agent ran on default **`#1`** when **`#N`** is omitted).

### Key Entities

- **Local agent slot**: A logical execution context on the user’s machine (not an IM platform account). Holds configuration needed to run tasks; has display index `#N` within the current roster.
- **Agent roster**: Ordered list of local agent slots visible to the user for the active session/binding; drives default-first routing.
- **IM execution command**: Any user message class that results in local executor work (including plain relay text where applicable, slash skills, and other documented command paths in scope for this feature).
- **IM pairing**: Association between an IM platform identity/channel context and exactly one **local executor** instance the user controls; drives who may trigger local work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability tests with **two agents**, **≥90%** of participants correctly predict which agent will run after reading only the bot’s list + one confirmation message (without reading source code).
- **SC-002**: After **create → run → delete** flows, **100%** of sampled IM transcripts show the same `#N` reference style in list, command acknowledgement, and completion where the product already echoes task identity.
- **SC-003**: With one agent, **100%** of common execution paths require **no extra** `#N` typing (no regression vs “single agent” simplicity).
- **SC-004**: Documentation/help for IM fits in **one screen** at typical IM widths (qualitative: reviewers agree it is not longer than prior multi-select help blocks unless split across `/help` sections).
- **SC-005**: In **security review scenarios** (credential switch + parallel local executors), **100%** of attempted unpaired or wrong-binding triggers are **rejected** with a user-readable explanation—**zero** silent executions on the wrong local engine.

## Assumptions

- “**第一个**” means the **first row** in the canonical roster list (stable ordering rule: e.g., creation time ascending); exact ordering is implementation detail but must be **consistent** between list, default, and `#N` parsing.
- **Single default agent until explicit expansion**: Until the user runs **`/agent create`** (or otherwise adds a second slot per product rules), the roster is **at most one** agent after bootstrap; **every** execution path without **`#N`** uses that **one** agent (**无感** — no need to surface `#N` on every line). After multiple slots exist, “no `#N`” still means **only `#1`** runs the work — never an implicit round-robin or “pick any idle” default — and the product MUST surface slot identity **explicitly** enough that multi-agent mode is never mistaken for a single invisible brain.
- “**可复用的 `#N`**” means the user can **repeatedly** reference the same slot in subsequent commands until that slot is removed or the roster is renumbered; it does **not** require permanent IDs across server restarts unless separately specified later.
- IM command syntax follows existing Topic Hub patterns (leading slash, optional subcommands); detailed grammar is left to planning.
- Out-of-scope unless added later: cross-device sync of agent rosters, server-side persistence of agent internals beyond what the product already stores for sessions/bindings.
- **Skill-repo** remains the canonical developer surface for publishing/managing skills referenced by this product; IM features do not replace it.

## Out of Scope (v1)

- Changing how **server-side** multi-tenancy or identities work globally (this spec only covers **local agent slots** and IM routing).
- Replacing existing **`#N`** meanings for **pending Q&A** or **claimed dispatch queues**; if numbering appears in multiple domains, UX copy must **disambiguate** (e.g., “agent #2” vs “queue #2”) in the same message when both could appear.
- **Backward compatibility** for deprecated **`/topichub`** CLI entry points or semantics (v1 may break or remove without migration shims).
