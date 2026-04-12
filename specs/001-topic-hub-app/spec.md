# Feature Specification: Topic Hub App

**Feature Branch**: `001-topic-hub-app`  
**Created**: 2026-04-09  
**Status**: Draft  
**Input**: User description: "创建一个基于夹心层模式的事件话题中枢应用，包含服务端和 CLI 前端。将分散在不同系统中的发布、缺陷、报警、工单等事件，聚合为可追溯、可搜索、可协作的话题。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Topics from IM (Priority: P1)

Any team member types `/topichub create deploy --title "v2.3 Release"` to create a new topic. The Platform Skill automatically creates a dedicated group chat for this topic and invites relevant team members. The group chat IS the topic — all discussion within it is the topic's collaboration space. A pinned topic card at the top shows the current status, assignees, and key fields. All subsequent interaction (status updates, assignments) happens via `/topichub` commands within that topic group. End users never touch the CLI.

**Why this priority**: The 1:1 mapping of group chat to topic is the core product model. Each event/issue gets a dedicated, focused space for discussion and resolution, preventing context from being scattered across a shared channel.

**Independent Test**: Can be tested by simulating a `/topichub create` command, verifying a topic is created on the server AND a dedicated IM group is created by the Platform Skill, with the topic card pinned in the group.

**Acceptance Scenarios**:

1. **Given** a user types `/topichub create deploy --title "v2.3 Release"` in any chat without an active topic, **When** the command is processed, **Then** a topic is created, a dedicated group chat is created by the Platform Skill, and the user is added to the group with a pinned topic card.
2. **Given** a user is inside an existing group with no active topic (either a non-topic group or a group whose previous topic was closed), **When** they type `/topichub create deploy --title "Hotfix 2.3.1"`, **Then** a new topic is created and bound to this existing group. The previous closed topic remains in history.
3. **Given** a user is inside a group with an active (non-closed) topic, **When** they type `/topichub create`, **Then** the system responds with an error: "This group already has an active topic. Close or resolve the current topic first."
4. **Given** a user is inside a topic group, **When** they type `/topichub update --status in_progress`, **Then** the topic's status is updated, a timeline entry is recorded, and the pinned card refreshes. No topic ID is needed — the group context identifies the topic.
5. **Given** a user types `/topichub help` in any chat, **Then** the system lists all available actions and the topic types defined by enabled Type Skills with their supported arguments.

---

### User Story 2 - Ingest Events via API (Priority: P1)

An external system (e.g., a CI/CD pipeline, bug tracker, or monitoring tool) fires a webhook or API call to Topic Hub when an event occurs (a build fails, a bug is filed, an alert triggers). Topic Hub automatically creates or updates a topic based on the incoming event payload. For new topics, the Platform Skill creates a dedicated group chat and posts the topic card. For existing topics (matched by source URL), the existing topic group is updated with a new status/timeline entry.

**Why this priority**: Automated event ingestion is the "sandwich layer" value proposition — without it, users must manually create every topic, undermining the core promise of aggregating events from disparate systems.

**Independent Test**: Can be tested by sending a well-formed event payload to the ingestion API and verifying a topic is created with the correct type, a dedicated IM group is created by the Platform Skill, and the topic card is pinned.

**Acceptance Scenarios**:

1. **Given** the server is running, **When** an external system sends a valid event payload to the ingestion endpoint, **Then** a new topic is created, a dedicated IM group is created by the Platform Skill, and the topic card is posted in that group.
2. **Given** a topic already exists for a given source URL, **When** a new event arrives for the same source, **Then** the existing topic is updated (status change, new timeline entry) and the update is reflected in the topic's dedicated group.
3. **Given** an event payload is malformed or missing required fields, **When** it is received by the ingestion endpoint, **Then** the system responds with a clear validation error and does not create a topic.

---

### User Story 3 - Search and Query Topics from IM (Priority: P2)

An SRE engineer is on-call and wants to find all open alerts from the past 24 hours. They type `/topichub search --type alert --status open` in any chat (their personal chat with the bot, or any group). The results are displayed as a list with links to each topic's dedicated group chat. They can click a link to jump directly into the relevant topic group.

**Why this priority**: Search transforms Topic Hub from a write-only log into an actionable intelligence tool. Results link directly to topic groups, enabling instant context-switching to the right discussion.

**Independent Test**: Can be tested by creating several topics (each with their own groups), then querying via simulated `/topichub search` commands and verifying correct results are returned with links to the topic groups.

**Acceptance Scenarios**:

1. **Given** multiple topics exist, **When** a user types `/topichub search --type alert` in any chat, **Then** only topics of type "alert" are returned as a list with links to their respective topic groups.
2. **Given** multiple topics exist, **When** a user filters by status "open" and a date range, **Then** only matching topics are returned, sorted by most recent first.
3. **Given** topics with various tags exist, **When** a user searches by tag "production", **Then** all topics tagged "production" are returned regardless of type.
4. **Given** no topics match the search criteria, **When** a user performs a search, **Then** a clear "no results found" message is displayed.

---

### User Story 4 - View Topic Detail and Timeline from IM (Priority: P2)

A developer investigating an incident navigates to the topic's dedicated group chat. The pinned topic card shows current status, assignees, and key fields. They type `/topichub timeline` within the topic group to see the full chronological history — creation, status changes, assignments, and signals. The chat history in the group provides the freeform discussion context alongside the structured timeline.

**Why this priority**: The topic group combines structured timeline tracking with freeform discussion. The pinned card provides at-a-glance status; the timeline command provides the audit trail for post-mortems and handoffs.

**Independent Test**: Can be tested by creating a topic (with its dedicated group), performing several updates, then running `/topichub timeline` within the group and verifying all events are listed chronologically.

**Acceptance Scenarios**:

1. **Given** a user is inside a topic group, **When** they type `/topichub timeline`, **Then** all structured timeline events are displayed in chronological order (creation, status changes, assignments, signals, errors).
2. **Given** a topic has signals attached, **When** a user types `/topichub show` in the topic group, **Then** the topic detail card is displayed with signals listed as clickable links.
3. **Given** a topic has assignees, **When** a user views the pinned topic card, **Then** all current assignees are displayed.

---

### User Story 5 - Admin Manages Skills via CLI (Priority: P2)

An administrator uses the CLI to manage the Topic Hub system. They install, enable, disable, and configure Skills (e.g., activate the Feishu Skill, set its webhook URL and target group chat). They view system statistics like topic counts by type, Skill error rates, and change history. End users never interact with the CLI — it is exclusively an admin tool.

**Why this priority**: The Skill plugin system is the backbone of Topic Hub's extensibility. Admins need a dedicated tool to manage Skills, configure IM integrations, and monitor system health without disrupting end-user chat flows.

**Independent Test**: Can be tested by running CLI commands to install a Skill, configure it, enable/disable it, and verifying the changes take effect on the server. Admin stats commands can be tested by generating activity and verifying accurate counts.

**Acceptance Scenarios**:

1. **Given** an admin has CLI access, **When** they run the install-skill command with a Skill package, **Then** the Skill is registered in the system and appears in the Skill list.
2. **Given** a Skill is installed, **When** the admin enables it and provides configuration (e.g., API keys, target chat group), **Then** the Skill becomes active and begins receiving topic events.
3. **Given** a Skill is enabled, **When** the admin disables it, **Then** the Skill stops receiving events and is marked as inactive.
4. **Given** topics have been created and modified, **When** the admin runs a stats command, **Then** aggregate statistics (topics by type, status distribution, Skill error counts) are displayed.

---

### User Story 6 - Skills Define Topic Types (Priority: P1)

Each topic type (deploy, bug, alert, ticket, etc.) is defined by a Skill. The Skill declares the type's schema (required fields, optional fields, field types), its card template (how the topic is rendered in IM), its status transitions, and its lifecycle behavior. When a new "deploy" Skill is installed, the "deploy" topic type becomes available. When the Skill is disabled, that type can no longer be created (existing topics remain).

**Why this priority**: Making Skills the owner of topic type definitions is the architectural foundation. It ensures the system is fully extensible — new event types are added by installing new Skills, not by changing the core system.

**Independent Test**: Can be tested by installing a mock Skill that defines a custom topic type "incident", verifying the type appears in `/topichub` creation flow, and verifying topics of that type follow the Skill-defined schema and card template.

**Acceptance Scenarios**:

1. **Given** a deploy Type Skill is installed and enabled, **When** a user types `/topichub help`, **Then** "deploy" appears as an available topic type with its Skill-defined arguments listed.
2. **Given** a Type Skill defines a custom type "incident" with required fields [severity, affected_service] and optional field [runbook_url], **When** a user runs `/topichub create incident --severity P1 --affected-service payments`, **Then** the system validates fields against the Skill's schema and creates the topic.
3. **Given** a Type Skill is disabled, **When** a user tries to create a topic of that Skill's type, **Then** the system returns an error indicating the type is unavailable.
4. **Given** a Type Skill defines a card template for its type, **When** a topic of that type is displayed in IM, **Then** the Skill's card template is used for rendering.

---

### Edge Cases

- What happens when two events from different systems arrive simultaneously for the same source URL? The system must handle concurrent upserts without data loss or duplication.
- How does the system behave when the server is unreachable from IM? The IM Skill should respond with a user-friendly error message in the chat.
- What happens when a topic type's Skill is disabled after topics of that type already exist? Existing topic groups remain accessible and the topics are viewable/searchable, but new topics of that type cannot be created.
- How does the system handle extremely long timelines (thousands of entries)? Pagination must be supported in the timeline output.
- What happens when the Platform Skill fails to create a group chat during topic creation? The topic is still created on the server, the failure is recorded as a timeline entry, and an admin is notified. The group can be created later via a retry mechanism.
- What happens when an event payload contains a type not previously seen and no Skill defines it? The system rejects the event with an error indicating the type is unknown.
- What happens when an IM platform API is down when a Skill tries to post a card? The Skill failure is logged and recorded as a timeline entry; the topic operation completes normally.
- What happens when multiple IM Skills are enabled and one fails? Only the failing Skill's error is recorded; other Skills execute independently.
- What happens when a user types `/topichub help` but no Type Skills are enabled? The system responds with a message indicating no topic types are available and to contact an administrator.
- What happens when a user types an invalid subcommand or malformed arguments? The system returns a usage hint showing correct syntax for the action and type.
- What happens when a user runs `/topichub update` in a closed topic group? The system responds with a "topic is closed" message and suggests either `/topichub reopen` to resume the current topic or `/topichub create <type>` to start a new topic in this group.
- What happens when a user tries to `/topichub create` in a group that already has an active topic? The system rejects with "This group already has an active topic. Close the current topic first."
- What happens when a tenant's IM credentials expire or are revoked? The Platform Skill logs the failure as a Skill error; the Tenant Admin is notified to re-run `skill setup`.
- What happens when a Tenant Admin tries to access another tenant's data? The system enforces tenantId scoping; queries return only the authenticated tenant's data. Unauthorized access attempts are logged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creating topics with a unique ID, type, title, source URL, and initial status of "open"
- **FR-002**: Topic types MUST be defined by Type Skills — each Type Skill defines exactly one topic type, declaring the type name, field schema (required/optional fields and types), card template, status transition rules, group naming template, and invitation rules
- **FR-003**: System MUST track a chronological timeline of all state changes, assignments, and annotations on each topic
- **FR-004**: System MUST provide an event ingestion API that accepts structured payloads from external systems and creates or updates topics. Additionally, webhook adapter Skills MUST accept native webhook formats from common external tools (e.g., GitHub, GitLab, Jenkins, Jira, PagerDuty), transform them into Topic Hub events, and create/update topics — enabling zero-code integration for external systems.
- **FR-005**: System MUST deduplicate incoming events by source URL — if a topic already exists for a given source, the event updates the existing topic
- **FR-006**: System MUST support searching topics by type, status, tags, date range, and free-text keyword — searchable from IM via `/topichub search` commands
- **FR-007**: System MUST allow assigning one or more users to a topic. Assigned users are automatically invited to the topic group. Type Skills can define custom invitation rules (e.g., auto-invite specific roles or teams) as part of the topic type definition.
- **FR-008**: System MUST allow attaching signals (contextual links such as log URLs, monitoring dashboards, or document links) to a topic
- **FR-009**: Each group chat can have at most **one active (non-closed) topic** at a time. Topics can be created in two ways: (a) create a new dedicated group automatically via Platform Skill, or (b) create a topic in an existing group (including a group whose previous topic has been closed). When a topic is closed, a new topic can be created in the same group. The group IS the active topic's collaboration space.
- **FR-010**: Card templates MUST be defined by Skills as part of their topic type definition; templates control how topics are rendered as cards in IM platforms
- **FR-011**: System MUST support topic status transitions as defined by each Skill's type definition, with a default set of `open` → `in_progress` → `resolved` → `closed` and reopen (`closed` → `open`). When a topic is closed, its group remains open for free chat but `/topichub` mutation commands (except `create` and `reopen`) are rejected with a "topic is closed" message. Users can either reopen the existing topic or create a new topic in the same group.
- **FR-012**: System MUST support tagging topics with user-defined labels for categorization and filtering
- **FR-013**: System MUST validate all incoming data (IM commands, API payloads) against the Skill-defined schema for the topic type, and return clear, actionable error messages for invalid input
- **FR-014**: The CLI MUST support three access levels: **Platform Admin** (install Skills globally, create/manage tenants, view platform-wide stats), **Tenant Admin** (enable/configure Skills for their tenant, view tenant stats, uses `--tenant <id>` scope), and **User** (auth operations only — run permission commands provided by IM denial messages). User-level CLI access uses a lightweight token distinct from admin tokens.
- **FR-015**: System MUST persist all topic data durably; no data loss on server restart
- **FR-031**: System MUST support multi-tenancy — all data documents (topics, timeline entries, Skill registrations) MUST include a `tenantId` field. All queries MUST be scoped by tenantId at the application layer. Tenants cannot access each other's data.
- **FR-032**: System MUST allow creating new tenants via CLI (`topichub-admin tenant create --name <name>`) generating a unique tenant ID, API key, and a **tenant token** for Tenant Admin authentication. The Tenant Admin uses `topichub-admin auth <token>` to authenticate their CLI session, then self-service configures their IM Skills via `topichub-admin skill setup`.
- **FR-033**: Skills MUST be installed globally (shared code) by the platform admin. Each tenant MUST be able to independently enable/disable Skills and provide tenant-specific configuration (e.g., IM platform credentials, webhook URLs) via CLI. Skill registration is split into global installation and per-tenant configuration.
- **FR-035**: User auth credentials (CLI login tokens, OAuth tokens, personal access tokens) MUST be stored exclusively on the user's local machine and MUST NEVER be transmitted to or stored on the server. Local storage MUST use the OS keychain (macOS Keychain, Linux libsecret/keyring, Windows Credential Manager) as primary storage, with an encrypted file fallback (`~/.topichub/credentials.enc`). Tenant-level secrets (IM platform bot credentials configured during `skill setup`) are stored server-side encrypted with AES-256 as before — these are organizational credentials, not personal user credentials.
- **FR-036**: Tenant admin tokens MUST have a configurable expiry (default 30 days). Platform Admin can revoke/regenerate via CLI. All CLI auth tokens (tenant admin and user) MUST be stored in the OS keychain (macOS Keychain, Linux libsecret, Windows Credential Manager) with encrypted file fallback. The server MUST verify identity via JWT/JWKS — never by receiving or storing raw user credentials.
- **FR-037**: Tenant IM credentials MUST be write-only after initial setup. `skill config --show` MUST mask secret fields as `***`. Tenant Admin can overwrite credentials by re-running `skill setup`. Platform Admin can reset/revoke tenant credentials but MUST NOT be able to read them. No API or CLI command exposes plaintext secrets.
- **FR-038**: Each Skill MUST be able to implement a `runSetup(ctx: SetupContext)` function that owns the full CLI setup experience for that Skill — rendering prompts, opening browser for OAuth, validating credentials, storing secrets via `ctx.storeSecret()`. The CLI provides a `SetupContext` with helper utilities (prompt, openBrowser, storeSecret, log). Any Skill conforming to this interface is plug-and-play with `topichub-admin skill setup <name>`.
- **FR-039**: When an Auth Skill denies a user action in IM, the system MUST respond with a clear denial message that includes a ready-to-copy CLI command the user can run to resolve the permission issue. The CLI auth flow: (1) `topichub-admin login` opens browser for OAuth2 PKCE with the IM platform, (2) access token + ID token (signed JWT) stored locally in OS keychain, (3) when calling the server, CLI sends the ID token only, (4) server verifies JWT signature via the IM platform's JWKS endpoint — zero raw credentials transmitted.
- **FR-040**: Skills (any category) MUST be able to register custom CLI subcommands via a `getCommands()` method. The CLI dynamically discovers and exposes Skill-provided commands. This enables Auth Skills to provide permission management commands, Type Skills to provide type-specific admin tools, etc.
- **FR-034**: Platform Skills MUST resolve the tenant from the IM workspace/organization ID carried in webhook payloads. Each tenant's IM app credentials (configured during `skill setup`) create a unique mapping from IM workspace to tenantId. Tenant resolution is automatic and invisible to end users.
- **FR-016**: System MUST support a Skill plugin model with four explicit categories: Type Skills (define topic types and domain behavior), Platform Skills (handle IM transport and chat interactions), Auth Skills (handle identity mapping and permission validation), and Adapter Skills (accept native webhooks from external tools and transform them into Topic Hub events). Each Skill declares its category at registration.
- **FR-017**: System MUST allow registering, enabling, and disabling Skills via CLI. Skills placed in a designated `skills/` directory MUST be auto-discovered and registered (disabled by default) at server startup. Explicit `install` via CLI is also supported for remote/npm packages.
- **FR-018**: System MUST orchestrate Skill execution via a pipeline for each topic operation: (1) Auth Skill validates permissions (skipped entirely if no Auth Skill is enabled — all operations permitted), (2) Type Skill validates schema and produces card data, (3) all enabled Platform Skills deliver the result to their IM platforms. Skills never call each other directly.
- **FR-019**: System MUST support IM platform integration as individual Skills — each IM platform (e.g., Feishu, Slack) is a separate Skill that can be independently installed and enabled
- **FR-020**: System MUST allow administrators to configure which IM platform Skills are active for a given deployment via CLI or configuration. The CLI MUST provide a `topichub-admin skill setup <name>` command that delegates credential collection to the Skill itself — each Skill defines its own setup flow (required fields, OAuth scopes, validation logic). The CLI provides infrastructure for browser-based OAuth (default: opens local browser with callback server) and manual credential paste (`--manual` flag for headless/CI environments).
- **FR-021**: Platform Skills MUST support three capability tiers, each optionally implementable: (1) group management — create, archive, and manage dedicated topic group chats; (2) push — post and update topic cards within topic groups on topic events; (3) commands — receive and handle `/topichub` subcommands from chat users within topic groups
- **FR-022**: System MUST allow Skills to declare which capability tiers they implement; the server only invokes handlers a Skill has registered
- **FR-023**: The Skill lifecycle interface MUST expose a comprehensive set of hooks: `onTopicCreated`, `onTopicUpdated`, `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`, `onSignalAttached`, `onTagChanged`, `onThreadCreated`, and `onCommandReceived`
- **FR-024**: Skills MUST be able to selectively subscribe to only the lifecycle hooks they need; unimplemented hooks are silently skipped
- **FR-025**: Skill failures MUST NOT block or roll back core topic operations; the topic mutation always completes successfully
- **FR-026**: Skill failures MUST be logged and recorded as a timeline entry on the affected topic, including the Skill name and error summary
- **FR-027**: All end-user interactions (create, update, search, view topics) MUST happen within IM via the `/topichub` command and card interactions; the IM is the sole user-facing interface
- **FR-028**: The Topic Hub core MUST have zero built-in permission logic. All authentication and authorization is 100% delegated to Auth Skills. If no Auth Skill is installed/enabled, all operations are permitted by default. When an Auth Skill is active, it enforces **per-user per-function** permissions — each user has individual permissions for each action/function. Each Auth Skill fully owns its permission model, storage, and management UX — the core system provides only the `authorize(user, action, context)` contract.
- **FR-029**: The `/topichub` command MUST use a subcommand syntax (`/topichub <action> [args]`) with no interactive menus, ensuring compatibility across all IM platforms. Commands are split into two categories: (1) **global commands** (`create`, `search`, `help`) work from any chat context (also in groups with no active topic); (2) **topic commands** (`update`, `assign`, `show`, `timeline`, `reopen`, `history`) only work inside a topic group, where the group implicitly identifies the topic — no topic ID needed. `history` lists all past topics in the group.
- **FR-030**: Type Skills MUST be able to define custom subcommands and arguments for their topic type, extending the `/topichub` command vocabulary (e.g., a deploy Skill adds `--approver` and `--rollback-url` arguments to the create command)

### Key Entities

- **Topic**: The central entity representing an event or issue being tracked. Each Topic has a 1:1 mapping to a dedicated IM group chat — the group IS the topic's collaboration space. Contains an ID, type, title, source URL, status, assignees, tags, timeline, signals, and group chat references. Its type, schema, and card template are defined by the owning Type Skill.
- **Timeline Entry**: An immutable record of a change or annotation on a Topic. Contains a timestamp, actor, action type (e.g., status_change, assignment, comment, skill_error), and a payload describing the change.
- **Topic Group**: An IM group chat bound to one active topic at a time. Can be created automatically by a Platform Skill for a new topic, or an existing group can be bound to a new topic (if it has no active topic). A group can host multiple topics sequentially over time but only one active (non-closed) topic at any moment. Contains the platform identifier (e.g., "slack", "feishu"), group ID, and group URL.
- **Card Template**: A display layout definition owned by a Skill, specifying how topics of its type are rendered in IM platforms. Contains highlighted fields, action buttons, and layout structure.
- **Signal**: A contextual reference attached to a Topic, such as a link to a monitoring dashboard, a log snippet URL, or a related document. Contains a label, URL, and optional description.
- **Skill**: A server-side plugin module that declares one of four categories and implements the corresponding interface. **Type Skills** define topic types (schema, card template, status transitions) and handle domain-specific lifecycle behavior. **Platform Skills** handle IM transport (posting cards, receiving commands, managing threads for a specific chat platform). **Auth Skills** handle identity mapping and permission validation. **Adapter Skills** accept native webhook payloads from external tools (GitHub, Jenkins, Jira, etc.) and transform them into Topic Hub events, enabling zero-code integration. Skills compose at runtime — e.g., a Type Skill provides the card template, a Platform Skill delivers it to the chat. Each Skill is registered with the server, independently testable, and loaded in-process.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a new topic via `/topichub` in IM and see the topic card posted within 3 seconds
- **SC-002**: Events ingested from external systems appear as topics (with cards posted in IM) within 5 seconds of receipt
- **SC-003**: Search results from `/topichub search` queries across up to 10,000 topics return within 3 seconds in the chat
- **SC-004**: Topic detail view via `/topichub show` displays the full timeline within 2 seconds for topics with up to 500 timeline entries
- **SC-005**: 100% of topic state changes are captured in the timeline with no missing entries
- **SC-006**: Users can complete the create → assign → update → resolve lifecycle of a topic in under 5 IM interactions
- **SC-007**: The system correctly deduplicates events by source URL with zero false duplicates or missed matches
- **SC-008**: System remains operational and responsive with up to 1,000 concurrent topics being actively managed
- **SC-009**: Installing a new Skill via CLI makes its topic type available in IM within 30 seconds without server restart
- **SC-010**: A new tenant can go from creation to first topic created in under 5 minutes (tenant create → auth → skill setup → first `/topichub create`)

## Clarifications

### Session 2026-04-09

- Q: What is a "Skill" in Topic Hub? → A: A Skill is a server-side plugin module that registers with Topic Hub and implements a standard lifecycle interface (e.g., `onTopicCreated`, `onStatusChanged`). Each Skill handles one capability (e.g., "post to Feishu", "sync from Jira"). Skills run in-process, are independently testable, and follow a pattern similar to Claude Code's skill system.
- Q: How should multi-IM compatibility be structured within the Skill system? → A: Each IM platform (Feishu, Slack, etc.) is a separate standalone Skill. No shared abstraction layer — each Skill handles its own platform-specific API integration. The system supports specifying which IM platform Skills are enabled for a given deployment.
- Q: What capabilities should IM Skills have within group chats? → A: Full bidirectional integration — Skills can push topic cards, receive slash commands and card button interactions, AND automatically manage reply threads under topic cards to aggregate discussion. The depth of capability is customizable per Skill (a Skill can choose which lifecycle hooks to implement).
- Q: Which lifecycle events should the Skill interface expose? → A: Comprehensive set (8+) for fine-grained control: `onTopicCreated`, `onTopicUpdated`, `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`, `onSignalAttached`, `onTagChanged`, `onThreadCreated`, `onCommandReceived`. Skills subscribe only to the hooks they need.
- Q: How should the system handle Skill failures? → A: Skill errors are logged and recorded as a timeline entry on the topic (e.g., "Feishu notification failed"). Core topic operations always succeed regardless of Skill failures. Skills never block or roll back topic mutations.

### Session 2026-04-09 (2)

- Q: Who can trigger topic creation? → A: Any IM user can trigger topic creation — not limited to team leads. All user-facing interaction happens exclusively in IM via `/topichub` commands and card interactions.
- Q: What is the CLI's role? → A: CLI is exclusively an admin tool for managing the Topic Hub system (install/configure/enable/disable Skills, view statistics, review change history). End users never see or use the CLI.
- Q: Where do end-user interactions happen? → A: All end-user interactions (create, update, search, view topics) happen within IM. Users initiate via `/topichub` in their chat platform.
- Q: How are topic types defined? → A: Each topic type is defined by a Skill. The Skill declares the type's field schema, card template, status transitions, and lifecycle behavior. New types are added by installing new Skills.
- Q: How is auth handled? → A: Authentication and authorization are controlled via Skills. Skills can implement auth hooks to map IM user identities to Topic Hub permissions and validate actions.
- Q: Are there distinct Skill categories or one generic Skill type? → A: Three explicit categories — Type Skills (define topic types, schemas, card templates, status transitions), Platform Skills (handle IM transport: posting cards, receiving commands, managing threads), and Auth Skills (handle identity mapping and permissions). Each Skill declares its category. They compose at runtime: a Type Skill provides the template, a Platform Skill delivers it.
- Q: Can one Type Skill define multiple topic types? → A: No. One-to-one: each Type Skill defines exactly one topic type. This keeps Skills small, focused, and independently installable.
- Q: How do Skill categories compose at runtime? → A: Server-orchestrated pipeline. For each topic operation the server runs a fixed sequence: (1) Auth Skill validates permissions, (2) Type Skill validates schema and produces card data, (3) all enabled Platform Skills deliver the card to their respective IM platforms. Skills never call each other directly — the server owns the pipeline.
- Q: How should the `/topichub` command be structured in IM? → A: Subcommands only (`/topichub <action> [type] [args]`), no interactive menus. This ensures cross-platform IM compatibility since not all platforms support interactive card menus. Type Skills can define custom subcommands and arguments for their topic type.

### Session 2026-04-09 (3)

- Q: What is the relationship between a group chat and a topic? → A: One group chat = one topic. Each topic maps 1:1 to a dedicated IM group chat created by the Platform Skill. The group IS the topic's collaboration space. All discussion in the group belongs to that topic. The Chat Thread entity is replaced by Topic Group.
- Q: What happens to the topic group when a topic is closed? → A: The group remains active — users can still freely chat in it. However, `/topichub` commands (update, assign, etc.) are rejected with a "topic is closed" message. If the topic is reopened, commands become available again.
- Q: How do commands know which topic to operate on? → A: Topic-specific commands (`update`, `assign`, `timeline`, `show`, `reopen`) only work inside a topic group — the group context identifies the topic, no ID needed. Global commands (`create`, `search`, `help`) work from any chat context.
- Q: Who gets invited to a new topic group? → A: The topic creator + explicitly assigned users at creation time. Additional members can be added later via `/topichub assign`. Type Skills can define custom invitation rules as part of their topic type definition (e.g., an "alert" Type Skill could specify that on-call SREs are auto-invited).
- Q: How are topic groups named? → A: Each Type Skill declares a naming template using topic fields as variables (e.g., `[deploy] {title}` or `🚨 {title} - {severity}`). This ensures groups are consistently formatted within each type while allowing customization per type.

### Session 2026-04-09 (4)

- Q: Which database should be used? → A: MongoDB with Typegoose (TypeScript-first ODM built on Mongoose). Replaces the earlier assumption of PostgreSQL + Prisma. MongoDB's document model is a natural fit for Skill-defined flexible topic metadata and embedded timeline entries.

### Session 2026-04-09 (5)

- Q: Should the system ship with bundled Type Skills auto-enabled? → A: No. The system ships clean with no bundled Skills. Admins install only the Skills they need. Reference/example Skills are provided in the repository for easy adoption but not auto-enabled.
- Q: How should Skills be discovered and loaded? → A: Dual mode — Skills in a designated `skills/` directory are auto-discovered and registered (but disabled by default) at startup. Admin enables them with a quick `enable` command. Explicit `install` remains available for remote/npm packages. This cuts the install step for local Skills.
- Q: What deployment model should minimize setup cost? → A: Docker Compose all-in-one. A single `docker compose up` starts the server + MongoDB. Skills are mounted as a volume (`./skills:/app/skills`). One command from zero to running. Separate-component deployment remains supported for production scaling.
- Q: How should Platform Skill onboarding be simplified? → A: Guided CLI setup. `topichub-admin skill setup <name>` runs an interactive prompt flow — asks for API credentials, validates them against the IM platform API, and auto-registers the webhook URL. One-command onboarding per platform.
- Q: How to reduce external system integration cost? → A: Webhook adapter Skills. Pre-built Skills accept native webhook formats from common tools (GitHub, GitLab, Jenkins, Jira, PagerDuty, etc.), transform the payload into Topic Hub events, and create/update topics automatically. Teams just point existing webhooks at a Topic Hub endpoint — zero code required on the external system side.

### Session 2026-04-09 (6)

- Q: Should the system support multi-tenancy? → A: Yes. One deployment serves multiple tenants. New tenants can be quickly onboarded via CLI to support early-stage promotion. Replaces the earlier "single-organization, multi-tenancy is a future concern" assumption.
- Q: How should tenant data be isolated? → A: Shared database with `tenantId` field on every document. All tenants share one MongoDB database. Queries are scoped by tenantId at the application layer. Simplest, lowest operational cost, and best for the early-stage many-small-tenants use case.
- Q: Should Skills be shared or per-tenant? → A: Global install, per-tenant config. Skills are installed once (shared code) by the platform admin. Each tenant enables/disables Skills independently and provides their own configuration (IM credentials, webhook URLs). E.g., Feishu Skill installed once; Tenant A configures with their Feishu app, Tenant B with theirs.
- Q: How should admin roles be structured for multi-tenancy? → A: Two-level hierarchy. Platform Admin manages the deployment (install Skills globally, create/manage tenants). Tenant Admin manages their own tenant (enable/configure Skills, view tenant stats). Tenant Admin uses CLI with `--tenant` scope. Platform Admin has full access.
- Q: What is the tenant onboarding flow? → A: Token handoff. Platform Admin runs `topichub-admin tenant create --name "Acme Corp"` → gets a tenant token. Tenant Admin authenticates with `topichub-admin auth <token>` → runs `topichub-admin skill setup feishu` to configure their IM platform. Self-service onboarding in 2 commands.
- Q: How does the system identify which tenant an IM user belongs to? → A: IM workspace mapping. Each tenant configures their own IM app credentials during `skill setup`. The Platform Skill maps the IM workspace/org ID (from webhook payload) to a tenantId. Tenant resolution is automatic and invisible to end users — no extra input or command prefix needed.

### Session 2026-04-09 (7)

- Q: How should CLI `skill setup` collect IM platform credentials? → A: The CLI provides infrastructure for both browser-based OAuth (default, opens local browser with callback server) and manual credential paste (`--manual` flag for headless/CI). Each Skill defines its own setup flow — what fields to collect, what OAuth scopes are needed, and how to validate. The CLI is the runner; the Skill is the author of the credential collection logic.
- Q: How should tenant IM credentials be stored securely? → A: Application-layer encryption (AES-256). Secrets are encrypted before storing in MongoDB's config field and decrypted at runtime by the server using an encryption key from env var (`ENCRYPTION_KEY`). This protects against database dump exposure without requiring external secrets infrastructure.
- Q: How should tenant tokens be managed over time? → A: Configurable expiry (default 30 days). Platform Admin can revoke or regenerate tokens via `topichub-admin tenant token regenerate <name>`. Tenant Admin's CLI session stores the token locally and prompts for re-auth when expired.
- Q: Who can view/modify tenant IM credentials after setup? → A: Write-only secrets. No one can read secrets after setup — `skill config --show` masks them as `***`. Tenant Admin can re-run `skill setup` to overwrite with new credentials. Platform Admin can reset/revoke tenant credentials but cannot read them. Principle of least privilege enforced.
- Q: How should Skills define their setup flow for the CLI? → A: Each Skill implements a `runSetup(ctx: SetupContext)` function that takes full control of the CLI during setup — rendering prompts, opening browser for OAuth, validating credentials, etc. The CLI provides the `SetupContext` with helpers (prompt, openBrowser, storeSecret). Skills conforming to the standard interface are plug-and-play. The Skill is both the domain logic AND the CLI setup experience.

### Session 2026-04-09 (8)

- Q: At what level should auth/permissions operate? → A: Per-user per-function. Each user has individual permissions for each action/function, not per-tenant blanket access. Auth Skills validate at the granularity of user + action (e.g., user A can `create deploy` but cannot `close`; user B can `assign` but not `reopen`). This replaces the earlier simpler "map IM identity to permissions" model.
- Q: Who manages per-user permissions? → A: Each Auth Skill fully owns its permission model, storage, and management UX. The core system provides only the `authorize(user, action)` contract — the Auth Skill decides how to implement it (IM role sync, custom DB, external LDAP, etc.). This is consistent with the Skill-owns-everything architecture.
- Q: What happens when a user is denied permission in IM? → A: The system responds in IM with a clear denial message AND a ready-to-copy CLI command to grant the missing permission. The user copies and runs the command directly to resolve the issue.
- Q: Who runs the permission CLI command? → A: The user themselves (self-service). End users get a lightweight CLI auth token (separate from the admin token) that allows them to run auth-related commands only. The CLI now has two modes: admin mode (full system management) and user mode (auth operations only). This breaks the strict "CLI is admin-only" boundary for auth, but keeps all other operations admin-only.
- Q: How do users get CLI access for auth? → A: Browser OAuth. User runs `topichub-admin login` → opens local browser → authenticates via IM platform's OAuth. Token is scoped to auth operations only.
- Q: Does the Topic Hub core have built-in permission control? → A: No. Topic Hub core has zero built-in permission logic. All auth/permission control is 100% delegated to Auth Skills. If no Auth Skill is installed, all operations are permitted. This keeps the core lightweight and maximally flexible.
- Q: How does the pipeline behave without an Auth Skill? → A: Skip the auth step entirely. Pipeline runs Type → Platform directly when no Auth Skill is enabled. All operations permitted, zero overhead.

### Session 2026-04-09 (9)

- Q: Can topics be created in existing groups? → A: Yes. Topics can be created in two ways: (a) create a new dedicated group automatically, or (b) create in an existing group (including groups whose previous topic was closed). A group can only have one active (non-closed) topic at a time. When a topic is closed, a new topic can be created in the same group. The group-topic model is "1:1 at any time, sequential over time."
- Q: Can users see previous topics in a reused group? → A: Yes. `/topichub history` lists all previous topics that lived in the group with status, creation date, and links to their timelines. The current active topic is highlighted.

### Session 2026-04-09 (10)

- Q: Where should user auth credentials be stored? → A: User auth credentials MUST stay local on the user's machine and NEVER be uploaded to the server. Security model: **OAuth2 PKCE + ID Token + JWKS verification**. (1) CLI initiates OAuth2 PKCE flow with IM platform in browser. (2) User authorizes; CLI receives auth code, exchanges for access token + signed JWT (ID token). (3) Tokens stored locally in OS keychain (never sent to Topic Hub server). (4) When proving identity to server, CLI sends the ID token (signed JWT). (5) Server verifies JWT signature against the IM platform's JWKS endpoint — no raw credentials ever transmitted. This is industry-standard, provably secure: PKCE prevents code interception, JWT/JWKS is cryptographically verifiable, raw tokens never leave the local machine.

## Assumptions

- The server and CLI communicate over HTTP; the CLI is an admin-only terminal tool, not an end-user interface
- The server uses NestJS as specified by the user; the CLI uses Ink (React for terminal) as specified by the user
- End users interact exclusively through IM platforms (Feishu, Slack, etc.) via the `/topichub` command and card interactions
- Chat platform integration is achieved through the Skill plugin model; each IM platform is implemented as a Skill
- Authentication is handled by Skills; a dedicated auth Skill or per-IM-Skill auth maps IM user identity to Topic Hub permissions
- Topic types are fully defined by Skills — the core system provides no built-in types; all types come from installed Skills
- The JS snippet for embedding "Sync to Topic Hub" buttons in external systems is out of scope for the initial version
- The iframed Admin panel is out of scope for the initial version; admin configuration is done via CLI
- AI features (natural language search, AI summaries/daily reports) are Phase 1+ and out of scope for the initial version
- MongoDB is used for persistence with Typegoose as the ODM; its document model naturally fits Skill-defined flexible topic metadata and embedded timeline data
- The system supports multi-tenancy: one deployment serves multiple tenants (organizations/teams). New tenants can be onboarded quickly via CLI to support early-stage promotion and growth.
- The event ingestion API uses a simple API key mechanism for initial authentication of external callers
