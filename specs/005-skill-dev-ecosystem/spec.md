# Feature Specification: Skill Development Ecosystem

**Feature Branch**: `005-skill-dev-ecosystem`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "CLI skill creation with Q&A, platform IM integration, adapter system, private skill repos with publish workflow, multi-IDE skill development support"

## Clarifications

### Session 2026-04-10

- Q: Should individual skill creation (Q&A scaffold) always happen inside an existing skill repository, or can standalone skills be created outside a repo? → A: Skills are always created inside a skill repo (repo-first workflow)
- Q: How should the AI development meta-skill ("writing-topic-hub" pattern) be delivered to help developers write skills? → A: Bundled in the scaffolded repo (auto-included when repo is created, works immediately in Cursor/Claude Code/Codex)
- Q: When publishing a skill that already exists on the server, how should versioning work? → A: Overwrite — each publish replaces the current version in place; developers manage versioning themselves via git
- Q: When publishing from a multi-skill repo, what is the publish scope? → A: Publish all skills in the repo at once (batch, repo = deployment unit)
- Q: Public and private skills should use the same development workflow. How should the system determine publish scope (public vs private)? → A: Only super-admins can publish public skills; regular tenant admins always publish as private. Public skills can additionally be edited directly in the server's local SKILLS_DIR
- Q: Should public and private skill repos use the same category-based directory structure? → A: Unified — both use `skills/{category}/` subdirectories (topics/, platforms/, adapters/), each skill in its own folder. Public skills at `packages/skills/` also include writing-topic-hub agent skill files for AI-assisted development

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CLI-Guided Skill Creation (Priority: P1)

A skill developer wants to add a new skill to an existing skill repository. The developer must first have a skill repo created (see Story 4). Inside that repo, the CLI walks them through an interactive Q&A process to scaffold a new skill, collecting essential information such as skill category (topic, platform, or adapter), target platform or data source, required credentials, and expected behavior. The result is a fully scaffolded skill within the repo, ready for development.

The developer workflow is the same for both public and private skills: `cli init` (admin authentication required) → `cli skill-repo create` (create a skill repository) → `cli skill create` (Q&A scaffold inside the repo) → develop with AI agent → `cli publish` (publish to remote server). The only difference is visibility: regular tenant admins always publish as private (tenant-scoped); super-admins can publish as public (visible to all tenants). Public skills can additionally be edited directly in the server's local `SKILLS_DIR`.

The Q&A process adapts based on the skill category selected:
- **Topic skill**: asks about topic type, lifecycle hooks, schema fields
- **Platform skill**: asks about the target IM platform, webhook endpoint patterns, message card format
- **Adapter skill**: asks about the external system, authentication requirements (if any), and data operations

**Why this priority**: Skill creation is the entry point for all subsequent features. Without a smooth creation workflow, developers cannot build platform, adapter, or topic skills. This unblocks all other work.

**Independent Test**: Can be fully tested by creating a skill repo first, then running the skill creation command inside it, and verifying a complete skill is scaffolded with correct structure, metadata, and placeholder code based on Q&A answers.

**Acceptance Scenarios**:

1. **Given** a developer has an existing skill repo, **When** they run the skill creation command inside it, **Then** the system prompts them with category selection and follows up with category-specific questions, producing a scaffolded skill directory within the repo
2. **Given** a developer selects "adapter" as the category and indicates GitHub as the external system, **When** the Q&A asks about authentication, **Then** the developer can specify "OAuth required" or "no auth for public data" and the scaffold reflects this choice
3. **Given** a developer completes the Q&A, **When** the skill is scaffolded, **Then** it includes a valid manifest, a SKILL.md template, a README, and entry-point code matching the selected category
4. **Given** a developer provides incomplete answers, **When** they skip optional questions, **Then** the scaffold uses sensible defaults and documents them in the generated files
5. **Given** a developer tries to create a skill without being in a skill repo, **When** they run the create command, **Then** the system rejects the request and instructs them to create or navigate to a skill repo first

---

### User Story 2 - Platform IM Integration with Minimal Touchpoints (Priority: P1)

A tenant admin wants to connect an IM platform (e.g., Feishu/Lark, Slack, or similar) so that users in chat groups can interact with Topic Hub through the bot. The integration requires the smallest possible set of components:

1. **Webhook endpoint** — a single URL the IM platform's bot configuration points to, receiving all user messages and events
2. **Command parsing** — the system extracts user intent from incoming messages (e.g., `/create`, `/list`, `/assign`)
3. **Group creation** — admins can create new IM groups from the CLI, which the platform skill then manages

The goal is that a platform developer only needs to implement a handful of well-defined interfaces to bring a new IM platform online.

**Why this priority**: The IM platform is the primary user-facing surface. Without it, end users have no way to interact with Topic Hub from their daily communication tools.

**Independent Test**: Can be tested by configuring a platform skill with a webhook, sending a simulated message, and verifying the system parses the command and responds. Group creation can be tested via CLI independently.

**Acceptance Scenarios**:

1. **Given** a platform skill is installed and configured for an IM platform, **When** a user sends a command message in a connected group, **Then** the system receives it via webhook, parses the command, and triggers the appropriate action
2. **Given** an admin runs the group creation command in the CLI, **When** they provide a group name and member list, **Then** the system creates the group on the IM platform and registers it in Topic Hub
3. **Given** a new IM platform needs to be integrated, **When** a developer creates a platform skill, **Then** they only need to implement the webhook handler, command parser, and message card renderer — no other integration points are required
4. **Given** the webhook receives an unrecognized command, **When** the system cannot parse user intent, **Then** it responds with a helpful message listing available commands

---

### User Story 3 - External Platform Adapter with Transparent Auth (Priority: P2)

A user wants to interact with external platforms (e.g., GitHub, Jira, or any third-party service) through Topic Hub without manually managing credentials or complex setup. The adapter system handles authentication transparently:

- If the external API requires authentication (e.g., listing private GitHub repositories), the adapter guides the user through a one-time login flow and securely stores credentials
- If the operation is public (e.g., fetching trending repositories), no login is required — the adapter just works

**Why this priority**: Adapters unlock the ability to connect Topic Hub to the broader developer ecosystem. They are essential for real-world utility but depend on the core skill creation and platform integration being in place.

**Independent Test**: Can be tested by installing a GitHub adapter skill, requesting public data (no auth), then requesting private data (triggering the auth flow), and verifying both paths produce correct results.

**Acceptance Scenarios**:

1. **Given** a GitHub adapter skill is installed, **When** a user requests public trending repositories, **Then** the system fetches and returns the data without requiring login
2. **Given** a GitHub adapter skill is installed, **When** a user requests their private repository list, **Then** the system detects that authentication is needed, initiates a login flow, and after successful auth returns the repository list
3. **Given** a user has previously authenticated with an adapter, **When** they make subsequent requests, **Then** the stored credentials are reused without re-prompting
4. **Given** stored credentials have expired, **When** the user makes a request, **Then** the system transparently refreshes credentials or prompts for re-authentication only when necessary

---

### User Story 4 - Skill Repositories with Unified Workflow (Priority: P1)

Every tenant admin (authenticated via `cli init`) can create skill repos and develop skills using the same workflow. The skill repo is the prerequisite container for all skill development — both public and private. The admin uses the CLI to:

1. **Create** a new skill repository — a standalone project (git repo) containing one or more skills
2. **Develop** skills locally using their preferred AI coding tool (Cursor, Claude Code, Codex, etc.) with the help of bundled agent skills
3. **Publish** finished skills to the Topic Hub server

Publish behavior depends on the user's role:
- **Regular tenant admins** always publish as private (tenant-scoped, invisible to other tenants)
- **Super-admins** can publish as public (visible to all tenants) using a `--public` flag

Public skills can additionally be loaded from the server's local `SKILLS_DIR` (direct file editing without the publish step), which is useful for rapid iteration during platform development.

**Why this priority**: The skill repo is the foundation of the repo-first workflow — all skill creation happens inside a repo. A unified workflow for public and private skills reduces learning cost and ensures consistency.

**Independent Test**: Can be tested by creating a private skill repo via CLI, developing a simple skill, publishing it, and verifying it appears only for the creating tenant and not for others.

**Acceptance Scenarios**:

1. **Given** a tenant admin runs the skill repo creation command, **When** they provide a repo name, **Then** the system scaffolds a new skill repository with the correct project structure, dependencies, and configuration
2. **Given** a developer has a private skill repo, **When** they run the publish command, **Then** the skill is uploaded and registered on the Topic Hub server under their tenant's scope
3. **Given** a private skill is published by Tenant A, **When** Tenant B lists available skills, **Then** Tenant A's private skills are not visible to Tenant B
4. **Given** a private skill repository contains multiple skills, **When** the developer publishes, **Then** all skills in the repo are registered as a batch under the tenant

---

### User Story 5 - Local Topic Debugging via CLI (Priority: P2)

A developer working on a skill wants to test it locally by dispatching topics and observing the skill's behavior in real time. The CLI provides a local debugging mode where:

- Topics can be dispatched to the local executor
- The developer can observe the skill processing pipeline step by step
- Errors and logs are surfaced directly in the terminal

**Why this priority**: Rapid iteration is critical for skill quality. Without local debugging, developers must deploy to test, which drastically slows the development cycle.

**Independent Test**: Can be tested by running the CLI in debug/serve mode, dispatching a test topic, and verifying the local executor processes it and displays output in the terminal.

**Acceptance Scenarios**:

1. **Given** a developer is running the CLI in serve mode locally, **When** a topic is dispatched that matches their skill, **Then** the local executor claims and processes it, showing progress and results in the terminal
2. **Given** a skill encounters an error during local processing, **When** the error occurs, **Then** the CLI displays the error with context (skill name, topic ID, error message, stack trace) for debugging
3. **Given** a developer modifies their SKILL.md, **When** a new dispatch arrives, **Then** the updated skill definition is used without requiring a restart

---

### User Story 6 - AI-Assisted Skill Development (Priority: P2)

When a skill repository is created (Story 4), it comes bundled with AI agent skills — a "writing-topic-hub" style meta-skill that teaches the developer's own AI agent (Cursor, Claude Code, Codex) how to write Topic Hub skills. The developer opens the repo in their preferred AI coding tool and the agent already understands:

- The skill's purpose, category interfaces, and manifest structure
- How to generate implementation code following Topic Hub conventions
- How to run tests and validate behavior

The bundled agent skill is delivered as IDE-native configuration files (e.g., `.cursor/rules/` for Cursor, `AGENTS.md` for Claude Code/Codex) so no separate installation step is needed.

**Why this priority**: This is a core differentiator of the skill development experience. The developer uses their own agent, and the bundled meta-skill ensures that agent produces valid, convention-compliant Topic Hub skills out of the box.

**Independent Test**: Can be tested by creating a skill repo, opening it in a supported AI coding tool, and verifying the agent can read the bundled skill files and provide meaningful guidance for writing a Topic Hub skill.

**Acceptance Scenarios**:

1. **Given** a skill repo is created, **When** a developer opens it in Cursor, **Then** Cursor automatically loads the bundled rules/skills and can guide the developer through writing a Topic Hub skill
2. **Given** a skill repo is created, **When** a developer opens it in Claude Code or Codex, **Then** the agent reads the AGENTS.md and understands how to generate implementation code aligned with the skill's category and interfaces
3. **Given** a skill scaffold includes test templates, **When** the AI tool generates implementation, **Then** the developer can run tests locally to validate the generated code
4. **Given** a developer creates a new skill inside the repo (Story 1 Q&A), **When** the scaffold is generated, **Then** the bundled agent skill automatically includes context about the new skill's category and configuration

---

### Edge Cases

- What happens when a developer tries to create a skill with a name that already exists in the tenant's scope?
- How does the system handle publishing a skill when the server is unreachable?
- What happens when an adapter's external service is down or rate-limited?
- How does the system behave when a platform webhook receives malformed or unsigned requests?
- What happens when a private skill's dependencies conflict with the server's installed packages?
- How does the CLI handle concurrent skill creation commands from the same tenant?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce a repo-first workflow: skill creation (Q&A scaffold) MUST only be allowed inside an existing skill repository. Skill repos (both public and private) organize skills by category subdirectories: `skills/topics/`, `skills/platforms/`, `skills/adapters/`
- **FR-001a**: System MUST require admin authentication (via `cli init`) before allowing skill repo creation or publishing
- **FR-002**: System MUST provide a CLI command to create a new skill inside a repo with an interactive Q&A flow that adapts questions based on the selected skill category (topic, platform, or adapter)
- **FR-002a**: System MUST scaffold a complete skill including manifest, SKILL.md, entry-point code, and README based on Q&A answers
- **FR-003**: System MUST support platform skills that expose a webhook endpoint for receiving IM platform bot events
- **FR-004**: System MUST parse user commands from incoming IM messages and route them to the appropriate handler
- **FR-005**: System MUST allow admins to create IM groups from the CLI, with the group being registered on both the IM platform and in Topic Hub
- **FR-006**: Platform skills MUST require only three integration points: webhook handler, command parser, and message card renderer
- **FR-007**: Adapter skills MUST support both authenticated and unauthenticated operations, determined by the specific API call's requirements
- **FR-008**: Adapter skills MUST provide a guided authentication flow when credentials are needed for the first time
- **FR-009**: System MUST securely store adapter credentials per user and reuse them for subsequent requests
- **FR-010**: System MUST support private skill repositories scoped to a specific tenant
- **FR-011**: System MUST provide a CLI command to create a new skill repository with proper project scaffolding
- **FR-012**: System MUST provide a CLI command to publish all skills in a repo as a batch to the Topic Hub server; the repo is the deployment unit. Regular tenant admins publish as private (tenant-scoped). Super-admins can publish as public (`--public` flag). Publishing overwrites existing versions on the server (no server-side version history — developers manage versions via git)
- **FR-012a**: System MUST reject public publishing attempts from non-super-admin users
- **FR-013**: Private skills MUST be invisible to tenants other than the owning tenant
- **FR-014**: System MUST support local topic dispatching and debugging through the CLI serve mode
- **FR-015**: System MUST reload updated SKILL.md definitions without requiring a CLI restart when processing new dispatches
- **FR-016**: Scaffolded skill repos MUST bundle a "writing-topic-hub" agent skill as IDE-native configuration files (e.g., cursor rules, AGENTS.md) that teach the developer's AI agent how to write Topic Hub skills — no separate install step required
- **FR-017**: System MUST distinguish between public skills (shared across tenants) and private skills (tenant-scoped) in skill discovery and listing
- **FR-018**: System MUST validate skill manifests before publishing to prevent invalid registrations (name format, category, required fields); name collisions within the same tenant result in an overwrite

### Key Entities

- **Skill**: A reusable unit of functionality categorized as topic, platform, or adapter. Contains a manifest (name, category, metadata), a SKILL.md (agent instructions), and executable code. No server-side version history; the server holds only the latest published snapshot
- **Skill Repository**: A project containing one or more skills organized by category subdirectories (`skills/topics/`, `skills/platforms/`, `skills/adapters/`), owned by a tenant, with its own version control and publish lifecycle. Includes bundled AI agent skills (writing-topic-hub) for development assistance
- **Platform Integration**: The connection between Topic Hub and an IM platform, defined by a webhook endpoint, a command parser, and a message renderer
- **Adapter Credential**: Per-user authentication data for an external platform, securely stored and automatically refreshed
- **Topic Dispatch**: A unit of work routed to a local CLI executor for processing by a specific skill, containing enriched context about the topic and event

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can create a new skill of any category (topic, platform, adapter) through the CLI in under 5 minutes, including Q&A completion
- **SC-002**: A new IM platform can be fully integrated by implementing only the three defined integration points (webhook handler, command parser, card renderer), requiring no other system changes
- **SC-003**: Users can access external platform data (e.g., GitHub repos) with zero manual credential management after initial one-time authentication
- **SC-004**: Private skills published by one tenant are never accessible or visible to other tenants
- **SC-005**: A developer can modify a skill and test it locally against a dispatched topic within 30 seconds of saving changes
- **SC-006**: 90% of skill scaffolds produced by the CLI pass validation checks without manual edits
- **SC-007**: Skill creation Q&A collects sufficient information to generate a functional scaffold for each category without post-scaffolding configuration

## Assumptions

- The existing three-category skill model (topic, platform, adapter) as defined in spec 004 is the foundation; no new categories are introduced
- The first IM platform to be fully supported will be Feishu/Lark, based on existing partial implementation in the codebase
- Private skill repositories are git-based projects that developers manage with standard version control tools
- Adapter authentication follows OAuth2 or token-based patterns, which cover the majority of external platform APIs
- The CLI `serve` mode (spec 003) is operational and can be extended for local debugging without architectural changes
- Public and private skills use the same development workflow (repo-first); public skills can additionally be loaded from the server's local `SKILLS_DIR` for direct editing during platform development
- AI coding tool integration is convention-based (file naming, SKILL.md format) rather than requiring tool-specific plugins
- Credential storage for adapters follows the existing pattern used for admin tokens (encrypted local store)
