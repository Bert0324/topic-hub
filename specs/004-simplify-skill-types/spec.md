# Feature Specification: Simplify Skill Types

**Feature Branch**: `004-simplify-skill-types`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "基于本地执行的逻辑，auth skill是不是没必要了，仅保留3种skill类型：1. topic 接入不同topic 2. platform 适配im平台 3. adapter 外部平台的auth，适配等，比如部署平台如何鉴权"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Skill System Uses Three Categories (Priority: P1)

An administrator manages Skills across exactly three categories: **Topic Skills** (define topic types, schemas, lifecycle hooks), **Platform Skills** (IM platform transport and chat interactions), and **Adapter Skills** (external platform integration — authentication, webhook transformation, and data synchronization with external tools like CI/CD, monitoring, or deployment platforms). There is no separate authorization checkpoint in the Skill pipeline. Access control is handled at the infrastructure layer (admin tokens, tenant scoping) rather than by a dedicated auth Skill.

**Why this priority**: The three-category model is the foundation of the entire Skill architecture. All other behaviors (pipeline execution, CLI management, AI integration) depend on this taxonomy being clearly defined and consistently enforced.

**Independent Test**: Can be tested by installing one Skill of each category (Topic, Platform, Adapter), verifying each is correctly classified, and confirming no fourth category exists in the system.

**Acceptance Scenarios**:

1. **Given** a Skill declares itself as a Topic Skill (e.g., via `topicType` in its manifest), **When** it is registered, **Then** it is classified under the "topic" category and exposes lifecycle hooks (onTopicCreated, onTopicUpdated, etc.) and schema validation.
2. **Given** a Skill declares itself as a Platform Skill (e.g., via `platform` in its manifest), **When** it is registered, **Then** it is classified under the "platform" category and exposes IM transport capabilities (postCard, createGroup, handleWebhook, etc.).
3. **Given** a Skill declares itself as an Adapter Skill (e.g., via `sourceSystem` in its manifest), **When** it is registered, **Then** it is classified under the "adapter" category and exposes webhook transformation and optionally external platform authentication capabilities.
4. **Given** a Skill with no recognized manifest fields, **When** it is registered, **Then** the system falls back to classifying it as a Topic Skill (default category).
5. **Given** the system is running, **When** the pipeline processes a topic operation, **Then** no authorization check step exists in the pipeline — execution proceeds directly from topic type validation to platform delivery.

---

### User Story 2 - Adapter Skills Handle External Platform Auth (Priority: P1)

A platform administrator needs to integrate Topic Hub with an external deployment platform (e.g., Kubernetes, AWS, or a custom CI/CD system). They install an Adapter Skill that handles both the webhook transformation (incoming events from the external platform) and the authentication/authorization with that external platform (API keys, OAuth tokens, service accounts). During `skill setup`, the Adapter Skill collects the external platform's credentials through its own interactive setup flow. The adapter stores these credentials securely and uses them when communicating with the external platform.

**Why this priority**: Adapter Skills absorbing external auth is the key architectural change that makes the separate Auth Skill category unnecessary. If adapters cannot handle their own auth, a fourth category would still be needed.

**Independent Test**: Can be tested by creating a mock Adapter Skill that requires API key authentication with an external service, running `skill setup`, and verifying the adapter can both transform webhooks and authenticate outbound calls to the external platform.

**Acceptance Scenarios**:

1. **Given** an Adapter Skill for a CI/CD platform that requires API authentication, **When** an admin runs `skill setup <adapter-name>`, **Then** the setup flow prompts for the external platform's credentials and stores them securely via the SetupContext.
2. **Given** an Adapter Skill with stored credentials, **When** a webhook arrives from the external platform, **Then** the adapter transforms the webhook into a Topic Hub event and can optionally verify the webhook signature using the stored credentials.
3. **Given** an Adapter Skill needs to make outbound API calls to the external platform (e.g., to fetch additional context or post status updates), **When** the adapter is invoked, **Then** it uses the stored credentials to authenticate with the external platform.

---

### User Story 3 - Pipeline Executes Without Auth Step (Priority: P2)

When a topic operation is triggered (creation, update, status change, etc.), the Skill pipeline executes in a streamlined two-phase flow: (1) Topic Skill validates and processes the operation, (2) Platform Skills deliver results to IM platforms. There is no authorization checkpoint in the pipeline. Access control is enforced upstream — admin tokens authenticate CLI users, tenant scoping restricts data access, and IM platform identity is trusted at the command routing layer.

**Why this priority**: Removing the auth step simplifies the pipeline, reduces latency, and eliminates a category of failure modes. However, it depends on the three-category model (Story 1) being established first.

**Independent Test**: Can be tested by tracing a topic creation through the pipeline and verifying only two phases execute (topic hooks + platform delivery), with no auth-related logic invoked.

**Acceptance Scenarios**:

1. **Given** a topic creation request, **When** the pipeline processes it, **Then** the execution order is: Topic Skill hooks → Skill AI (if applicable) → Platform Skills. No auth step exists.
2. **Given** a system with no Auth Skill category defined, **When** an admin lists available Skill categories via CLI, **Then** only "topic", "platform", and "adapter" are shown.
3. **Given** existing topics and timeline entries created under the old four-category model, **When** the system is upgraded, **Then** all existing data remains accessible and functional — no data migration is required for topic data.

---

### Edge Cases

- What happens when a previously registered Auth Skill exists in the database after the upgrade? The system ignores Skills with the deprecated "auth" category during pipeline execution. They remain in the database but are treated as inactive. Admins are advised to uninstall them.
- What happens when an Adapter Skill's external platform credentials expire? The adapter's operations that require those credentials fail gracefully with a clear error, and a timeline entry records the failure. The admin re-runs `skill setup` to refresh credentials.
- What happens when a Skill manifest does not clearly indicate its category? The system falls back to "topic" as the default category, consistent with current behavior.
- What happens when an external platform requires complex multi-step OAuth for authentication? The Adapter Skill implements the full OAuth flow within its `runSetup()` function, using the SetupContext's `openBrowser` helper — the same mechanism previously available to all Skill categories.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support exactly three Skill categories: **Topic** (defines topic types, schemas, lifecycle hooks, card templates), **Platform** (handles IM transport, group management, card posting, webhook reception from IM platforms), and **Adapter** (handles external platform integration including webhook transformation, external authentication, and outbound API calls).
- **FR-002**: The Skill pipeline MUST execute topic operations in this order: (1) Topic Skill validation and lifecycle hooks, (2) Skill AI processing (if the Skill has AI instructions), (3) Platform Skill delivery. No authorization step exists in the pipeline.
- **FR-003**: Adapter Skills MUST be able to manage external platform credentials through the existing `runSetup(ctx: SetupContext)` mechanism, storing secrets via `ctx.storeSecret()` and retrieving them during webhook processing or outbound API calls.
- **FR-004**: The Skill category enumeration MUST contain only three values: `topic`, `platform`, `adapter`. The `auth` value MUST be removed.
- **FR-005**: Skill category resolution (auto-detection from manifest) MUST classify Skills based on: `topicType` in manifest → Topic, `platform` in manifest → Platform, `sourceSystem` in manifest → Adapter. No `authorize` method detection is needed.
- **FR-006**: Access control MUST be enforced at the infrastructure layer: admin tokens authenticate CLI users, tenant scoping restricts data visibility, IM platform identity is resolved by Platform Skills at the command routing layer. No per-operation auth Skill checkpoint exists.
- **FR-007**: Existing data records (Skill registrations) with the deprecated `auth` category MUST remain readable but MUST NOT be loaded into the active pipeline. The system SHOULD log a deprecation warning at startup if such records are found.
- **FR-008**: All existing Skill capabilities (lifecycle hooks, AI integration via SKILL.md, custom CLI commands via `getCommands()`, interactive setup via `runSetup()`) MUST remain available to all three Skill categories.

### Key Entities

- **Topic Skill**: Defines exactly one topic type. Declares field schema, card template, status transitions, group naming template, invitation rules. Provides lifecycle hooks for topic events. Optionally includes AI instructions via SKILL.md.
- **Platform Skill**: Represents one IM platform. Provides transport capabilities (group creation, card posting, webhook handling, tenant resolution from IM workspace). Optionally includes AI instructions via SKILL.md.
- **Adapter Skill**: Represents one external system integration. Transforms incoming webhooks into Topic Hub events. Manages external platform credentials and authentication. Optionally makes outbound API calls to the external platform. Optionally includes AI instructions via SKILL.md.
- **Skill Category** (enumeration): `topic`, `platform`, `adapter` — three values only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System operates with exactly three Skill categories, with no authorization step in the Skill pipeline.
- **SC-002**: Adapter Skills can complete full external platform integration (credential setup, webhook transformation, outbound API calls) without requiring any other Skill category's involvement.
- **SC-003**: Topic operations execute through the pipeline with one fewer step than the previous architecture (no auth check), reducing average pipeline execution time.
- **SC-004**: 100% of existing Skill capabilities (lifecycle hooks, AI integration, CLI commands, interactive setup) remain functional across all three categories.
- **SC-005**: Systems upgrading from the four-category model experience zero data loss — existing topics, timeline entries, and non-auth Skill registrations continue to work without migration.

## Assumptions

- The local execution model (feature 003) handles user authentication via admin tokens configured during CLI `init`, removing the need for per-operation auth checks within the Skill pipeline.
- No production Auth Skills have been deployed — the auth Skill category exists only in code and specs, not in any customer data. This makes removal low-risk.
- External platform authentication (API keys, OAuth tokens for CI/CD platforms, deployment tools, etc.) is conceptually distinct from user-level Topic Hub authorization. Adapter Skills handle the former; the infrastructure layer handles the latter.
- The `runSetup()` and `SetupContext` mechanisms (browser OAuth, manual credential entry, secure storage) are already general-purpose enough for Adapter Skills to handle complex external auth flows.
- This change is backwards-compatible at the data layer: existing Skill registrations with category `auth` remain in the database but are ignored by the runtime.
