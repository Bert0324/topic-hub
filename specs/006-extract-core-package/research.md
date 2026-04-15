# Research: Extract @topichub/core

**Branch**: `006-extract-core-package` | **Date**: 2026-04-10

## Research Topics

### 1. Decoupling Typegoose/Mongoose from NestJS DI

**Decision**: Services in `@topichub/core` receive Mongoose `Model` instances via constructor injection (plain TypeScript classes, no decorators). The `TopicHub.create()` factory uses `getModelForClass()` with the provided Mongoose connection to build models, then instantiates services with those models.

**Rationale**: Typegoose's `getModelForClass(EntityClass, { existingConnection })` works independently of NestJS `MongooseModule.forFeature()`. This eliminates all `@InjectModel` decorators while preserving the exact same Mongoose model behavior. Services become plain classes with constructor parameters instead of decorated providers.

**Alternatives considered**:
- **Repository pattern with interface**: Would add an abstraction layer over Mongoose, enabling non-Mongo backends. Rejected per YAGNI — only MongoDB is used, and the Mongoose API surface is stable. The abstraction would need 7+ repository interfaces with no second implementation.
- **Keep @nestjs/mongoose in core**: Would make the core package depend on NestJS, violating FR-010 and defeating the purpose.

### 2. Replacing NestJS Logger with a Logger Port

**Decision**: Define a `Logger` interface in `@topichub/core` with methods `log`, `warn`, `error`, `debug`. Default implementation uses `console`. The `TopicHubConfig` accepts an optional `logger` factory function. All services use this interface instead of `@nestjs/common` `Logger`.

**Rationale**: The NestJS `Logger` class requires `@nestjs/common` and uses NestJS's internal logging pipeline. A simple interface decouples logging while allowing the demo server to bridge to NestJS Logger or any other framework's logger.

**Alternatives considered**:
- **Use a logging library directly (pino, winston)**: Adds a mandatory dependency to the core package. Users who already have a logger would need to configure a second one. The interface approach lets them bring their own.
- **No logging in core**: Losing observability in the library would make debugging difficult for integrators.

### 3. Decoupling SkillContext from AiService

**Decision**: Replace `import type { AiService } from '../../ai/ai.service'` in `skill-context.ts` with a narrow `AiCompletionPort` interface defined within the skill interfaces directory. `AiService` in the core package implements this interface. The `SkillContext` type becomes `{ aiService: AiCompletionPort | null }`.

**Rationale**: The current `SkillContext` imports `AiService` by type only (no runtime dependency), but this type import pulls in the entire `AiService` shape including internal methods. A narrow port interface (just `complete(prompt, options)`) is cleaner and makes the skill contract truly independent.

**Alternatives considered**:
- **Keep the type import**: Would work at compile time but makes the skill interface conceptually coupled to a specific service class.
- **Pass AI as a generic callback**: Too unstructured; skills need to know the AI capabilities available.

### 4. Handling the DispatchService's RxJS Subject

**Decision**: Replace `rxjs.Subject<TaskDispatch>` in `DispatchService` with a simple event emitter pattern using Node.js `EventEmitter` or a custom `Subscribable` interface. The core package should not depend on RxJS.

**Rationale**: The `Subject` is used solely for SSE (Server-Sent Events) push to CLI consumers. In the core package, this becomes a simple event emission — the demo server's SSE controller subscribes using whatever mechanism it prefers (RxJS, EventEmitter adapter, etc.).

**Alternatives considered**:
- **Keep RxJS in core**: Adds a large dependency for a single use case (dispatch notifications). External integrators may not use RxJS.
- **Remove event streaming entirely**: Would break CLI's dispatch polling mechanism.

### 5. TopicHub Facade API Design

**Decision**: The `TopicHub` class uses a **namespace-style** API where each domain is a readonly property:

```typescript
class TopicHub {
  static async create(config: TopicHubConfig): Promise<TopicHub>;
  
  readonly topics: TopicOperations;      // list, get, create, update, addTag, etc.
  readonly commands: CommandOperations;   // execute, parse
  readonly ingestion: IngestionOperations; // ingest
  readonly webhook: WebhookOperations;   // handle
  readonly messaging: MessagingOperations; // send, postCard
  readonly auth: AuthOperations;         // resolveTenant
  readonly skills: SkillOperations;      // registry access
  readonly search: SearchOperations;     // search
  
  async shutdown(): Promise<void>;       // cleanup
}
```

**Rationale**: Namespaced API mirrors the user's expected usage (`hub.topics.list()`, `hub.webhook.handle()`), aligns with the spec's FR-003, and keeps the facade clean. Each `*Operations` type is a plain object with bound methods (not a class), avoiding inheritance complexity.

**Alternatives considered**:
- **Flat API** (`hub.listTopics()`, `hub.handleWebhook()`): Gets unwieldy with 30+ methods. Hard to discover related operations.
- **Service-per-module** (`hub.getTopicService()`, `hub.getCommandService()`): Exposes internal service classes as public API, making the package harder to evolve.

### 6. Mongoose Connection Handling

**Decision**: `TopicHub.create()` accepts **either** an existing `mongoose.Connection` instance (for embedded use) **or** a MongoDB URI string (for standalone convenience). When a URI is provided, the core creates and manages the connection; when a `Connection` is provided, the caller manages lifecycle.

**Rationale**: Embedded use case (experience_server) requires passing an existing connection to avoid duplicate pools. Standalone use case (quick setup, testing) benefits from URI-based auto-connection. The config's zod schema validates that exactly one of `mongoUri` or `mongoConnection` is provided.

**Alternatives considered**:
- **Connection only**: Forces standalone users to create their own Mongoose connection boilerplate.
- **URI only**: Prevents connection sharing, defeating the embedded use case.

### 7. Package Publishing Strategy

**Decision**: Publish `@topichub/core` to the public npm registry. Use a `prepublishOnly` script that runs `tsc` build + tests. Version follows semver. The monorepo uses Turborepo's `--filter` for selective publishing.

**Rationale**: Clarification confirmed public npm. Standard npm publishing flow with workspace support.

**Alternatives considered**: N/A — user decision.

### 8. CLI Base URL Health Check

**Decision**: Modify `promptServerUrl()` in the CLI to treat the user-provided URL as a base URL prefix. Append `/health` to whatever the user provides (stripping trailing slash first). This handles both `http://localhost:3000` (standalone) and `http://host:8080/api/experience/topichub` (embedded).

**Rationale**: Minimal change — the existing health check logic is correct, it just needs to stop assuming the server is at the root path. The `api-client.ts` module should also use this base URL for all subsequent API calls.

**Alternatives considered**:
- **Discovery endpoint**: Over-engineered for this use case.
- **Separate "embedded" init mode**: Adds UX complexity; a single URL input handles both cases.
