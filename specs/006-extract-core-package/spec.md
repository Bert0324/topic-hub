# Feature Specification: Extract @topichub/core for Independent Deployment

**Feature Branch**: `006-extract-core-package`  
**Created**: 2026-04-10  
**Status**: Draft  
**Input**: User description: "提取 @topichub/core，将 server 拆为 remote 和 demo，支持方案 A 的独立部署模式，CLI 连接验证，统一 webhook 端点"

## Clarifications

### Session 2026-04-10

- Q: Should all IM platforms (Feishu, Slack, Discord, etc.) share a single webhook URL or use per-platform URLs? → A: Per-platform URLs (`/webhooks/:platform`). Adding a new platform = register a new PlatformSkill, no code changes.
- Q: Should webhook signature verification be handled inside PlatformSkill or by the host application? → A: Inside PlatformSkill. Each skill verifies platform-specific signatures (Feishu token, Slack HMAC-SHA256, Discord Ed25519) using secrets from its config.
- Q: Where will `@topichub/core` be published? → A: Public npm registry (open source).
- Q: Should `@topichub/core` expose outbound messaging APIs (send messages/cards to IM platforms) in addition to inbound webhook handling? → A: Yes. Expose outbound messaging via `hub.messaging.send()` / `hub.messaging.postCard()`. Each PlatformSkill stores its outbound config (Discord webhook URL, Feishu bot credentials, Slack bot token). Discord Incoming Webhook URLs are fully compatible — used for the outbound direction.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Library Consumer Embeds TopicHub in External Project (Priority: P1)

A developer working on an independent project (e.g., `experience_server` built with Gulux framework) wants to embed TopicHub capabilities directly into their existing service without deploying a separate TopicHub server. They install `@topichub/core`, create a `TopicHub` instance by passing their existing MongoDB connection and configuration, then expose TopicHub features through their own controllers and routes (e.g., `/api/experience/topichub/*`).

**Why this priority**: This is the core value proposition — enabling TopicHub to be used as an embeddable library rather than requiring a standalone deployment. All other stories depend on the `@topichub/core` package existing.

**Independent Test**: Can be tested by creating a minimal host application that imports `@topichub/core`, initializes it with a MongoDB connection, and performs basic operations (ingest an event, execute a command, list topics).

**Acceptance Scenarios**:

1. **Given** a Node.js project with `@topichub/core` installed, **When** the developer calls `TopicHub.create({ mongoConnection, skillsDir, ai })`, **Then** a fully functional TopicHub instance is returned with access to `hub.ingest()`, `hub.commands.execute()`, `hub.topics.list()`, and `hub.auth.resolveTenant()`.
2. **Given** an initialized TopicHub instance, **When** the developer ingests an event with `hub.ingest(tenantId, eventPayload)`, **Then** the event is processed through the skill pipeline and a topic is created or updated in the shared MongoDB connection.
3. **Given** an initialized TopicHub instance, **When** the developer passes an invalid or incomplete configuration to `TopicHub.create()`, **Then** a clear validation error is thrown describing which configuration fields are missing or invalid.
4. **Given** a host application with its own dependency injection framework (e.g., Gulux `@Injectable()`), **When** the developer wraps `TopicHub` in a service class, **Then** TopicHub operates correctly without conflicts with the host framework's lifecycle management.

---

### User Story 2 — Monorepo Demo Server Uses @topichub/core (Priority: P1)

The existing NestJS server in the topic-hub monorepo is refactored to become a thin NestJS integration layer ("demo") that imports `@topichub/core` for all business logic. This validates the extraction is correct and serves as a reference implementation for other integrators.

**Why this priority**: The demo server proves that the extracted core works correctly and provides a reference implementation. It also ensures backward compatibility — existing deployments using the NestJS server continue to function identically.

**Independent Test**: Run the existing test suite against the refactored demo server and verify all tests pass with no behavioral changes.

**Acceptance Scenarios**:

1. **Given** the refactored monorepo, **When** the demo server starts, **Then** all existing REST API endpoints (`/api/v1/events`, `/api/v1/topics`, `/webhooks/:platform`, etc.) continue to function identically.
2. **Given** the demo server, **When** the full test suite (unit, integration, e2e) is executed, **Then** all previously passing tests continue to pass.
3. **Given** the demo server source code, **When** a developer examines it, **Then** the NestJS modules contain only controller routing / DI wiring and delegate all business logic to `@topichub/core`.

---

### User Story 3 — Unified Webhook Endpoint for IM Platforms (Priority: P2)

An operations engineer configures an IM platform (e.g., Lark/Feishu) to send callback events to TopicHub. They configure a single webhook URL in the IM platform's developer console. TopicHub receives the callback, identifies the platform, resolves the tenant, and dispatches the event to the appropriate skill handler.

**Why this priority**: Webhook handling is how IM platforms integrate with TopicHub in production. A unified endpoint simplifies configuration and is required for real-world deployments.

**Independent Test**: Can be tested by sending a mock IM platform webhook payload to the unified endpoint and verifying the correct skill handler is invoked.

**Acceptance Scenarios**:

1. **Given** a configured IM platform skill (e.g., Lark, Slack, Discord), **When** the IM platform sends a callback to its per-platform webhook URL (`/webhooks/:platform`), **Then** TopicHub identifies the platform from the URL path, resolves the tenant via the platform skill, and dispatches processing to the correct handler.
2. **Given** a `@topichub/core` instance embedded in an external project, **When** the developer needs webhook handling, **Then** the core library provides a `hub.webhook.handle(platform, payload, headers)` method that can be called from any HTTP framework's route handler — the host maps its own route (e.g., `/api/experience/topichub/webhooks/:platform`) to this method.
3. **Given** the Lark/Feishu callback configuration page, **When** the operator enters the TopicHub webhook URL, **Then** they use the platform-specific URL (e.g., `https://host/webhooks/lark`). Each IM platform configures its own distinct URL.
4. **Given** a new IM platform needs to be integrated, **When** the operator registers a new PlatformSkill for that platform, **Then** the webhook endpoint for that platform becomes active automatically — no code changes or redeployment of the core library required.

---

### User Story 4 — CLI Init with Base URL Connection Verification (Priority: P2)

A developer setting up a new TopicHub CLI environment runs `topichub-admin init`. During the init flow, they provide the base URL of their TopicHub deployment (which may be a standalone server or an embedded deployment at a custom path like `/api/experience/topichub`). The CLI verifies the connection is reachable and valid before proceeding.

**Why this priority**: With TopicHub now deployable at arbitrary URL paths in embedded scenarios, the CLI must handle non-standard base URLs and verify connectivity.

**Independent Test**: Run `topichub-admin init`, provide a base URL (e.g., `http://localhost:8080/api/experience/topichub`), and observe the CLI successfully connects and proceeds to the next step.

**Acceptance Scenarios**:

1. **Given** a running TopicHub instance (standalone or embedded), **When** the user provides the base URL during `topichub-admin init`, **Then** the CLI attempts to reach the health endpoint at that base URL and reports success or failure.
2. **Given** an embedded TopicHub at a non-root path like `/api/experience/topichub`, **When** the user enters `http://host:port/api/experience/topichub` as the base URL, **Then** the CLI correctly appends `/health` to the provided base URL (not to the root) and verifies connectivity.
3. **Given** an unreachable or invalid base URL, **When** the CLI cannot connect, **Then** a clear error message is displayed with the attempted URL and failure reason, and the user is prompted to re-enter.

---

### User Story 5 — Independent Deployment in External Project Directory (Priority: P3)

A team deploys TopicHub as part of their existing service infrastructure. The `@topichub/core` package is installed in their project, configured with their own MongoDB, AI provider, and skills directory. The deployment runs as part of their host application process — no separate TopicHub process is needed.

**Why this priority**: This validates the end-to-end deployment scenario where TopicHub is a dependency, not a standalone service.

**Independent Test**: Install `@topichub/core` in an external project directory, configure it, start the host application, and verify TopicHub operations work through the host's API.

**Acceptance Scenarios**:

1. **Given** an external project with `@topichub/core` as a dependency, **When** the project is deployed, **Then** TopicHub operations are available through the host's routing without requiring a separate process or port.
2. **Given** a `@topichub/core` instance, **When** the host application provides its own MongoDB connection, **Then** TopicHub reuses that connection (no duplicate connections or separate connection pools).
3. **Given** a deployed embedded TopicHub, **When** the team upgrades `@topichub/core` to a new version, **Then** the upgrade is handled through standard package management (`npm update`) without needing to redeploy infrastructure.

---

### Edge Cases

- What happens when `@topichub/core` is initialized with an incompatible MongoDB version or missing indexes? The library should perform startup validation and report missing prerequisites clearly.
- What happens when the host application's MongoDB connection drops? The core library should propagate connection errors to the host's error handling, not silently fail.
- What happens when two TopicHub instances share the same MongoDB in different host processes? Multi-instance scenarios should work correctly since tenancy is already built into the data model.
- What happens when skills reference NestJS-specific constructs? The core library must be framework-agnostic; any NestJS-specific code stays in the demo layer.
- What happens when the webhook receives a payload for an unregistered platform? Return a clear 404-style error identifying that no skill is registered for the given platform.
- What happens when a webhook payload fails signature verification? The PlatformSkill returns a verification failure, and the core library rejects the request with an appropriate unauthorized error — the payload is never dispatched to command handling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a `@topichub/core` package that exports a `TopicHub` class with a static `create(config)` factory method for initialization.
- **FR-002**: The `TopicHub.create()` factory MUST accept an existing Mongoose connection instance, a skills directory path, and AI provider configuration — without requiring NestJS or any specific framework.
- **FR-003**: The `TopicHub` instance MUST expose domain APIs: `hub.ingest(tenantId, payload)` for event ingestion, `hub.commands.execute(tenantId, command, args)` for command execution, `hub.topics.list(tenantId, query)` for topic listing/search, `hub.auth.resolveTenant(...)` for tenant resolution, and `hub.messaging.*` for outbound messaging to IM platforms.
- **FR-004**: The `TopicHub` instance MUST expose a `hub.webhook.handle(platform, payload, headers)` method for processing **inbound** IM platform webhook callbacks without depending on a specific HTTP framework.
- **FR-004a**: The `TopicHub` instance MUST expose **outbound** messaging APIs — `hub.messaging.send(platform, groupId, message)` and `hub.messaging.postCard(platform, groupId, card)` — for sending messages and cards to IM platforms. Each PlatformSkill manages its own outbound credentials/URLs (e.g., Discord Incoming Webhook URL, Feishu bot API key, Slack bot token).
- **FR-005**: The current `packages/server` MUST be restructured into two packages: `packages/core` (the `@topichub/core` library) and `packages/server` (the NestJS demo/reference integration layer).
- **FR-006**: The demo server MUST maintain full backward compatibility — all existing API endpoints, webhook routes, and behaviors remain unchanged.
- **FR-007**: The CLI init flow MUST accept arbitrary base URLs (including non-root paths like `/api/experience/topichub`) and verify connectivity by calling the health endpoint at the provided base path.
- **FR-008**: The `@topichub/core` package MUST be published as an open-source package on the public npm registry, installable via `npm install @topichub/core`.
- **FR-009**: The core library MUST validate its configuration at startup and throw descriptive errors for missing or invalid fields.
- **FR-010**: The core library MUST be framework-agnostic — no imports from `@nestjs/*` or any other framework-specific packages in the core package.
- **FR-011**: Each PlatformSkill MUST be responsible for verifying webhook signatures using its platform-specific mechanism (e.g., Feishu verification token, Slack signing secret, Discord Ed25519). The core library MUST call the skill's signature verification before dispatching the webhook payload for processing.

### Key Entities

- **TopicHub**: The main entry point class exported by `@topichub/core`. Encapsulates all domain services (topics, commands, ingestion, skills, auth, webhooks, outbound messaging) behind a unified facade. Created via `TopicHub.create(config)`.
- **TopicHubConfig**: Configuration object for `TopicHub.create()`. Contains: MongoDB connection, skills directory, AI provider settings, and optional overrides (log level, tenant resolution strategy).
- **Package: @topichub/core**: Framework-agnostic library containing all domain logic — entities, services, skill pipeline, command handling, ingestion, search, tenant management, and AI integration.
- **Package: @topichub/server (demo)**: Thin NestJS wrapper that imports `@topichub/core` and exposes its functionality via REST controllers. Serves as both the default deployment and a reference implementation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can integrate TopicHub into an external project by installing `@topichub/core` and writing fewer than 50 lines of integration code (service wrapper + route handlers).
- **SC-002**: All existing tests in the monorepo pass after the refactoring, confirming zero behavioral regressions.
- **SC-003**: The `@topichub/core` package has zero dependencies on `@nestjs/*` packages — verified by inspecting its `package.json` and import graph.
- **SC-004**: The CLI successfully connects to embedded TopicHub instances at non-root paths during the init flow.
- **SC-005**: An IM platform webhook callback processed through `hub.webhook.handle()` produces the same result as calling the existing webhook controller endpoint.
- **SC-006**: The `@topichub/core` package size (excluding `node_modules`) is smaller than the current `packages/server` package, confirming no unnecessary code was included.

## Assumptions

- The existing MongoDB data model (topics, timeline_entries, skill_registrations, tenant_skill_configs, etc.) remains unchanged — this is a code architecture refactoring, not a data migration.
- The Mongoose/Typegoose ODM layer is compatible with receiving an external connection — the current `DatabaseModule` pattern of connecting via `MongooseModule.forRoot()` will be replaced with accepting an injected connection in the core package.
- The host application is responsible for MongoDB connection lifecycle (connect/disconnect) — `@topichub/core` does not manage connection establishment or teardown.
- The AI provider configuration (Ark API key, model settings) is passed in by the host at initialization time — `@topichub/core` does not read environment variables directly (the demo server handles env-to-config mapping).
- Skills are loaded from a local filesystem directory — the skill loading mechanism (Markdown-based skill definitions via `gray-matter`) remains unchanged.
- The CLI's existing health check mechanism (`/health` endpoint) is sufficient for connection verification — no new verification protocol is needed, just support for arbitrary base URL prefixes.
- The webhook handling uses per-platform URL routing (`/webhooks/:platform`) — platform identification comes from the URL path, not payload auto-detection. The core library exposes `hub.webhook.handle(platform, payload, headers)` where the `platform` parameter is passed by the host's route handler. Adding a new IM platform (Feishu, Slack, Discord, or future platforms) requires only registering a new PlatformSkill — no code changes.
