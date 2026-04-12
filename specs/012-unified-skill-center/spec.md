# Feature Specification: Unified Skill Center

**Feature Branch**: `012-unified-skill-center`  
**Created**: 2026-04-11  
**Status**: Draft  
**Input**: User description: "去掉现有所有对 skill 的分类，仅保留一种 skill，定义和 Cursor 的 superpower 是一样的。所有 skill 会在本地被用户执行。有一个 skill center 的概念，同时用户可以通过 CLI 打开一个本地的网页去查看有哪些 skill 和对 skill 点赞，查看 skill 的被使用次数和作者。每一个用户都可以去发布自己的 skill，然后通过指令的方式，可以使用不同用户的 skill；skill 通过 cli 来 publish，当然也可以选择不发布仅自己在本地使用；这个本地页面，超管能看到信息，比如当前连接了多少 im 平台，有多少用户连接等"

## Clarifications

### Session 2026-04-11

- Q: When a user runs multiple local executors, how are dispatches routed to a specific executor? → A: Each executor obtains its own sub-token (per spec 011). IM dispatches route to the executor whose token is currently bound via the `/register` command. Users re-register to switch the active executor.
- Q: What security controls are needed for IM-triggered local execution beyond identity binding? → A: Identity binding + executor token (spec 011) is sufficient. No additional skill-level allowlists or confirmation prompts. Published skills are automatically pulled to local and registered into the execution engine's skill directory (e.g., `.claude/skills`). Private skills use the same local registration mechanism but are never published to the server.
- Q: Should skill-repo remain the unit of publishing (batch), or should individual skills be published independently? → A: Individual skill publish only. Each skill is published independently; skill-repo is just local organization. The `writing-topic-hub` built-in skill mechanism is also removed — there is no private/internal skill format; users fully own and maintain their own skill content.
- Q: Can users invoke specific skills by name from IM, or is IM limited to generic task dispatches? → A: Both. IM supports explicit skill invocation by name (e.g., `/use <skill-name> <args>`) and generic dispatches where the executor decides which skill to apply locally.
- Q: How does the Skill Center web UI authenticate the user? → A: The local web server binds to localhost and trusts the CLI process that started it. Single-user machine assumption — no token or login flow needed for the web UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and Use a Local Skill (Priority: P1)

A user authors a skill on their local machine following the standard skill manifest format (similar to Cursor superpowers — a SKILL.md with instructions, triggers, and context). The user invokes the skill via a CLI command, and the skill executes entirely on the user's local machine. The user does not need to publish the skill to use it.

**Why this priority**: This is the foundational interaction. Without local skill authoring and execution, no other feature (publishing, browsing, liking) is possible.

**Independent Test**: Can be fully tested by creating a skill file locally, running the CLI invocation command, and verifying the skill executes as defined — delivers immediate value without any server interaction.

**Acceptance Scenarios**:

1. **Given** a user has created a valid skill manifest in their local skills directory, **When** the user runs the CLI command to invoke that skill by name, **Then** the skill executes locally and produces the expected output.
2. **Given** a user has a skill that is not published to the server, **When** the user lists available skills, **Then** the local-only skill appears in the list marked as "local."
3. **Given** a user attempts to invoke a skill that does not exist, **When** the CLI processes the command, **Then** a clear error message is displayed explaining the skill was not found.

---

### User Story 2 - Publish a Skill to the Skill Center (Priority: P1)

A user who has authored a local skill decides to share it with the community. They use a CLI publish command targeting that individual skill (not a batch repo upload) to publish it to the central Skill Center. Once published, the skill becomes discoverable by all other users. The author's identity (as assigned by the superadmin) is associated with the published skill. The skill-repo remains a local organizational grouping, but each skill is published independently.

**Why this priority**: Publishing is the bridge between local usage and community value — it enables the marketplace/center that differentiates this from a purely local tool.

**Independent Test**: Can be tested by publishing a local skill via CLI, then verifying the skill appears in the Skill Center with the correct author, description, and metadata.

**Acceptance Scenarios**:

1. **Given** a user has a valid local skill and a valid identity token, **When** the user runs the publish command, **Then** the skill is uploaded to the server and becomes visible in the Skill Center.
2. **Given** a user publishes a skill with the same name as a previously published version, **When** the publish completes, **Then** the existing skill is updated (overwritten) with the new version.
3. **Given** a user without a valid identity token attempts to publish, **When** the CLI processes the command, **Then** the publish is rejected with a clear authentication error.

---

### User Story 3 - Browse and Discover Skills in the Skill Center Web UI (Priority: P1)

A user opens the Skill Center through a CLI command, which launches a local web page in their browser. On this page, the user can browse all published skills, see each skill's author, usage count, and description. The user can like/upvote skills they find useful and search or filter the skill list.

**Why this priority**: Discovery is essential for a community-driven skill ecosystem. Without a browsable interface, published skills have limited reach and adoption.

**Independent Test**: Can be tested by launching the Skill Center page, verifying published skills are listed with correct metadata, performing a like action, and confirming the like count increments.

**Acceptance Scenarios**:

1. **Given** the Skill Center has published skills, **When** a user opens the Skill Center via the CLI command, **Then** a local web page opens in the default browser showing a list of all published skills with name, author, description, and usage count.
2. **Given** a user is viewing the Skill Center, **When** the user clicks the like button on a skill, **Then** the like count for that skill increments by one and persists across page reloads.
3. **Given** a user has already liked a skill, **When** the user views that skill again, **Then** the like button reflects that they have already liked it (preventing duplicate likes from the same identity).
4. **Given** published skills exist, **When** a user types a search query into the search field, **Then** the skill list filters to show only skills matching the query by name, description, or author.

---

### User Story 4 - Use Another User's Published Skill (Priority: P2)

A user discovers a skill in the Skill Center (or knows its name) and wants to use it. They invoke the skill via a CLI command. The system automatically pulls the skill definition from the server, registers it into the local execution engine's skill directory (e.g., `.claude/skills`), and the skill becomes available for local execution — identical to a locally-authored skill. Each invocation increments the skill's usage count on the server.

**Why this priority**: Cross-user skill sharing is the core value proposition of the Skill Center, but it depends on P1 stories being functional first.

**Independent Test**: Can be tested by having User A publish a skill, then User B invoking that skill via CLI and verifying the skill is pulled to local, registered in the engine's skill directory, and executes correctly.

**Acceptance Scenarios**:

1. **Given** a skill published by another user exists in the Skill Center, **When** the current user runs the CLI invoke command with that skill's identifier, **Then** the skill definition is pulled from the server, registered into the local execution engine's skill directory, and available for execution.
2. **Given** a user invokes a published skill, **When** execution completes successfully, **Then** the usage count for that skill is incremented on the server.
3. **Given** a published skill has already been pulled to local, **When** the user invokes it again, **Then** the locally cached version is used (no re-download unless a newer version exists).
4. **Given** a user invokes a published skill that has been removed or is unavailable, **When** the CLI processes the command, **Then** a clear error message is displayed.

---

### User Story 5 - Superadmin Views System Dashboard (Priority: P2)

The superadmin opens the Skill Center web UI and sees an additional administration section not visible to regular users. This section displays system-wide information: how many IM platforms are currently connected, how many users are registered, how many executors are active, and aggregate skill usage statistics.

**Why this priority**: Operational visibility is critical for the superadmin to manage the system, but it is an enhancement on top of the core skill browsing experience.

**Independent Test**: Can be tested by logging into the Skill Center as the superadmin and verifying the admin dashboard displays accurate real-time system metrics.

**Acceptance Scenarios**:

1. **Given** the superadmin opens the Skill Center, **When** the page loads, **Then** an admin dashboard section is visible showing the count of connected IM platforms, registered users, and active executors.
2. **Given** a regular (non-superadmin) user opens the Skill Center, **When** the page loads, **Then** the admin dashboard section is not visible.
3. **Given** the system state changes (e.g., a new IM platform connects), **When** the superadmin refreshes the dashboard, **Then** the updated metrics are reflected.

---

### User Story 6 - Unified Skill Type Replaces All Categories (Priority: P1)

The system eliminates the existing skill categories (topic, platform, adapter) and replaces them with a single unified skill type. All existing skills in the system are treated as this single type. The skill manifest format is simplified — there is no longer a category field, and all skills follow the same structure: a SKILL.md file with instructions and context that is executed locally by the user's agent.

**Why this priority**: This is a prerequisite architectural change that simplifies everything else. Without this, the system still carries the complexity of three categories.

**Independent Test**: Can be tested by verifying the system no longer accepts or requires a category field in skill manifests, and that all CRUD operations work with the unified skill type.

**Acceptance Scenarios**:

1. **Given** the system has been updated to the unified skill model, **When** a user creates a new skill manifest without a category field, **Then** the system accepts it without error.
2. **Given** legacy skills exist in the database with category fields, **When** the system processes these skills, **Then** they are treated as unified skills and the category field is ignored.
3. **Given** a user attempts to specify a category in a new skill manifest, **When** the manifest is processed, **Then** the category field is silently ignored (backward compatibility).

---

### User Story 7 - Run Multiple Local Executors and Switch via IM (Priority: P2)

A user starts multiple local executor processes on their machine (e.g., one per project or one per agent type). Each executor registers with the server and receives its own executor sub-token (per spec 011). On an IM platform, the user binds to a specific executor by running the `/register` command with that executor's token. Dispatches from IM are routed only to the currently bound executor. The user can switch by re-registering with a different executor's token.

**Why this priority**: Supports power users and multi-project workflows. Depends on the core executor and identity infrastructure being in place.

**Independent Test**: Can be tested by starting two executors, registering IM to one, verifying dispatches go only to the bound executor, then re-registering to the other and verifying dispatches switch.

**Acceptance Scenarios**:

1. **Given** a user starts two local executor processes, **When** each executor registers with the server, **Then** each receives a distinct executor sub-token.
2. **Given** a user has two executors running and registers their IM account to executor A's token, **When** a dispatch is created from IM, **Then** only executor A receives and processes it.
3. **Given** a user is bound to executor A, **When** the user re-registers their IM account with executor B's token, **Then** subsequent dispatches are routed to executor B instead.
4. **Given** an executor that the user is bound to goes offline, **When** the user sends a command on IM, **Then** the system informs the user that their bound executor is unavailable and suggests re-registering.

---

### Edge Cases

- What happens when a user tries to publish a skill but has no network connectivity to the server?
- How does the system handle two users publishing skills with identical names at the same time?
- What happens when a published skill's author identity is revoked by the superadmin?
- How does the Skill Center web UI behave when no skills have been published yet (empty state)?
- What happens when a user tries to invoke a published skill but the server is unreachable — does a previously cached version execute, or does it fail?
- How does the system handle skill manifest files that are malformed or missing required fields?
- What happens when a user has multiple executors running and the bound executor crashes mid-dispatch?
- How does the system handle dispatches that arrive while the user is switching their IM binding between executors?
- What happens when a user invokes a skill by name from IM (`/use <skill>`) but that skill is not registered on the bound executor?
- How does the system distinguish between a generic task dispatch and an explicit skill invocation from IM?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support exactly one skill type — no categories, classifications, or sub-types. All skills share the same manifest format and lifecycle.
- **FR-002**: A skill MUST be defined by a SKILL.md manifest file containing instructions, triggers, and contextual information that a local agent can interpret and execute.
- **FR-003**: All skill execution MUST happen locally on the user's machine — the server never executes skill logic.
- **FR-004**: Users MUST be able to create and use skills locally without publishing them to the server.
- **FR-005**: Users MUST be able to publish individual skills (not repo-level batch) to the Skill Center via a CLI publish command, associating each skill with their identity. The `skill-repo` serves only as local organizational structure.
- **FR-006**: Users MUST be able to choose not to publish a skill, keeping it local-only with no server interaction.
- **FR-007**: The system MUST provide a CLI command that opens a local web page (Skill Center UI) in the user's default browser.
- **FR-008**: The Skill Center UI MUST display all published skills with their name, author, description, usage count, and like count.
- **FR-009**: Users MUST be able to like/upvote a skill in the Skill Center, limited to one like per identity per skill.
- **FR-010**: When a user invokes a published skill, the system MUST automatically pull the skill definition from the server to local storage and register it into the execution engine's skill directory (e.g., `.claude/skills`).
- **FR-011**: The system MUST track and display usage count for each published skill (incremented on each invocation by any user).
- **FR-012**: The Skill Center UI MUST provide search and filtering capabilities to find skills by name, description, or author.
- **FR-013**: The superadmin MUST see an admin dashboard in the Skill Center UI showing: number of connected IM platforms, number of registered users, number of active executors, and aggregate skill statistics.
- **FR-014**: The admin dashboard MUST be visible only to the superadmin identity; regular users MUST NOT see it.
- **FR-015**: When re-publishing an existing skill (same name, same author), the system MUST update the existing entry rather than creating a duplicate.
- **FR-016**: The system MUST migrate existing skills from the legacy category-based model to the unified skill type, ignoring any category metadata.
- **FR-017**: Publishing a skill MUST require a valid identity token — unauthenticated publish attempts are rejected.
- **FR-018**: A user MUST be able to run multiple local executor processes simultaneously, each receiving its own executor sub-token upon registration (per spec 011).
- **FR-019**: IM dispatches MUST route to the specific executor whose sub-token is currently bound to the user's IM account via the `/register` command.
- **FR-020**: A user MUST be able to switch their IM binding to a different executor by re-registering with the target executor's sub-token.
- **FR-021**: Both published and private (local-only) skills MUST use the same skill registration mechanism to be recognized by the execution engine.
- **FR-022**: Published skills, once pulled to local, MUST be registered into the execution engine's skill directory in the same format as locally-authored skills — no distinction at runtime.
- **FR-023**: The security boundary for IM-triggered execution MUST rely on identity binding and executor sub-tokens (per spec 011); no additional skill-level permission controls are required.
- **FR-024**: The system MUST NOT include any built-in or bundled skill templates (e.g., `writing-topic-hub`). Skill content is entirely user-maintained with no private/internal skill format imposed by the system.
- **FR-025**: The `skill-repo` CLI command MUST remain as a local organizational tool for grouping skills, but publishing MUST operate at the individual skill level, not as a batch repo upload.
- **FR-026**: Users MUST be able to invoke a specific skill by name from an IM platform (e.g., `/use <skill-name> <args>`), which creates a dispatch targeting that skill on the bound executor.
- **FR-027**: Users MUST also be able to send generic task requests from IM without specifying a skill, allowing the local executor to determine which skill (if any) to apply.
- **FR-028**: The Skill Center web UI MUST be served on localhost by the CLI process. Authentication relies on the single-user machine assumption — no login flow or token is required to access the local page.
- **FR-029**: The Skill Center web UI MUST detect whether the local CLI process was started with superadmin credentials to determine whether to show the admin dashboard.

### Key Entities

- **Skill**: A unit of reusable agent capability defined by a SKILL.md manifest. Has a unique name, author (identity), description, version metadata, instructions, and optional triggers/context. Can exist locally-only or be published to the Skill Center.
- **Skill Center**: The central registry of published skills hosted on the server. Stores skill metadata, usage counts, and like counts. Exposes a browsable web UI and CLI-accessible APIs.
- **Identity**: A unique user identifier assigned by the superadmin (as defined in spec 011). Associates published skills with their author and tracks likes and usage per user.
- **Superadmin**: The bootstrapped administrator identity that manages the system, creates user identities, and has access to the admin dashboard.
- **Like**: A per-identity, per-skill record indicating a user's endorsement. Each identity can like a given skill at most once.
- **Executor**: A local process running on the user's machine that registers with the server, receives a unique sub-token, and executes skills. A user may run multiple executors simultaneously. IM dispatches route to the executor currently bound via `/register`.
- **Usage Record**: A per-invocation record tracking that a specific skill was used. Aggregated into a usage count displayed in the Skill Center.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new skill and invoke it locally in under 5 minutes following the documentation.
- **SC-002**: Publishing a skill from CLI to the Skill Center completes in under 10 seconds on a standard connection.
- **SC-003**: The Skill Center web UI loads and displays the full skill list in under 3 seconds.
- **SC-004**: Users can discover and invoke a published skill by another user within 2 minutes of first opening the Skill Center.
- **SC-005**: The superadmin dashboard accurately reflects the current system state (connected IM platforms, user count, executor count) within 30 seconds of any change.
- **SC-006**: 100% of existing skills continue to function after migration from the category-based model to the unified skill type.
- **SC-007**: The system handles at least 500 published skills in the Skill Center without noticeable performance degradation in browsing or search.

## Assumptions

- The superadmin identity system (spec 011) is implemented and operational — user identities and tokens are available.
- The IM bridge and executor infrastructure (specs 007, 008) are in place, providing the connected IM platform and active executor data that the admin dashboard displays.
- Skills follow a SKILL.md-based manifest format simplified to remove category-specific fields. There are no bundled skill templates or internal skill formats — users fully own their skill content.
- The `skill-repo` CLI command remains for local organization but no longer drives batch publishing. Publishing is per-skill.
- The local web UI for the Skill Center is a lightweight, single-purpose page served on localhost by the CLI process — not a full-featured web application. It assumes single-user access on the local machine (no authentication flow needed).
- "Like" and "usage count" data is stored on the server and requires network connectivity to update; viewing cached data locally when offline is out of scope for v1.
- Skill name uniqueness is scoped per author — two different authors may publish skills with the same name, distinguished by author identity.
