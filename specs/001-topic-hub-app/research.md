# Research: Topic Hub App

**Branch**: `001-topic-hub-app` | **Date**: 2026-04-09

## 1. ODM: Typegoose (User-Specified)

**Decision**: Typegoose + Mongoose for MongoDB access.

**Rationale**: This stack is user-specified. Typegoose layers TypeScript-first, decorator-based model definitions on top of Mongoose, giving compile-time types and runtime validation paths that stay aligned with NestJS patterns (`@nestjs/mongoose`, DI-friendly models). Mongoose remains the de facto standard driver-level ODM for Node and MongoDB, with mature indexing, middleware, and ecosystem support.

**Alternatives considered**:

- **Prisma with MongoDB**: Strong ergonomics for SQL; MongoDB support is improving but historically lags relational features, and Prisma’s document modeling differs from Mongoose’s native document APIs. Less natural fit when the product leans on embedded documents, Mongoose middleware, and existing MongoDB-centric patterns.
- **Mongoose alone**: Fully viable; Typegoose is chosen to reduce schema/type drift and improve DX without abandoning Mongoose’s feature set.

---

## 2. Monorepo Tooling

**Decision**: pnpm workspaces with Turborepo for task orchestration and caching.

**Rationale**: pnpm offers content-addressable storage, strict dependency isolation, and fast installs—well suited to multiple packages (server, CLI, shared libs, skills). Turborepo adds incremental builds, remote/local caching, and parallel pipelines for `build`, `test`, and `lint` with minimal configuration compared to heavier monorepo suites.

**Alternatives considered**:

- **Nx**: Powerful graph-aware builds, generators, and plugins; adds more configuration and opinion than needed for a modest package count. Reasonable if the repo grows large or needs first-class Nest/React codegen; deferred for YAGNI.
- **Yarn workspaces**: Familiar and workable; pnpm’s disk efficiency and dependency strictness are preferable for reproducible CI and avoiding phantom dependencies.

---

## 3. Skill Loading Mechanism

**Decision**: NestJS dynamic modules with file-system-based auto-discovery from a `skills/` directory. Skills found there are registered automatically but **disabled by default** until enabled via config; additionally supports explicit installation via npm (e.g. `@topichub/skill-*`) for packaged skills.

**Rationale**: In-process loading keeps latency and ops simple versus separate deployables. Dynamic modules let each skill encapsulate providers, imports, and lifecycle within Nest’s DI graph. Directory scanning plus optional npm packages matches “drop in a folder” and “install from registry” workflows without a custom plugin runtime. Default-off avoids accidentally executing untrusted or incomplete skills.

**Alternatives considered**:

- **Microservices per skill**: Strong isolation and independent scaling, but conflicts with a single cohesive Topic Hub deployment, increases network and operational cost, and complicates shared tenancy and DB access patterns.
- **Isolated VM / worker sandbox**: Stronger security boundary for untrusted code; meaningful complexity (IPC, resource limits, debugging). Deferred unless threat model requires executing untrusted skill code.

---

## 4. Command Parsing

**Decision**: Custom parser for `/topichub` subcommands. IM text arrives through Platform Skills; the parser splits input into **action**, **type** (when present), and **args**. Type Skill–specific custom arguments are merged into the parse/validation path; the combined shape is validated with **zod**.

**Rationale**: IM payloads are plain text, not `process.argv`. A small dedicated parser keeps control over splitting rules, skill extension points, and error messages. zod gives a single validation story shared with HTTP APIs and skill schemas. Deterministic subcommands avoid NLP ambiguity for v1.

**Alternatives considered**:

- **yargs / commander**: Optimized for CLI argv and help generation; adapting IM strings is awkward and blurs separation between admin CLI and bot command paths.
- **Natural language**: Flexible for users but brittle without ML investment; harder to test and to map to strict CRUD and tenant-scoped operations.

---

## 5. Database: MongoDB (User-Specified)

**Decision**: MongoDB 7 as the primary data store.

**Rationale**: User-specified. The document model maps cleanly to topics with **embedded** subdocuments for groups, assignees, tags, signals, and skill-defined metadata—without forcing relational joins or wide JSONB columns. Native **text indexes** support keyword search (FR-006). MongoDB 7 aligns with the chosen ODM stack and expected scale (e.g. on the order of 10k topics per tenant).

**Alternatives considered**:

- **PostgreSQL**: Excellent for relational invariants and ACID-heavy workflows; flexible metadata is usually JSONB. Fits if the team standardizes on SQL; here it adds impedance versus nested documents and text search ergonomics for this domain.
- **SQLite**: Simple single-file deployment but weak for concurrent server writers, distributed deployment, and rich text search—poor fit for a multi-tenant server product.

---

## 6. Skill-Defined Fields Storage

**Decision**: Store skill-defined fields in an embedded subdocument (e.g. `metadata`) on the **Topic** document. Validation uses the **Type Skill’s zod schema** at the application layer before persist.

**Rationale**: Co-locating custom fields with the topic keeps reads/writes single-document for common paths, matches MongoDB’s strengths, and avoids joins. The Type Skill owns the schema contract; the app enforces it consistently for API and command paths.

**Alternatives considered**:

- **EAV (entity-attribute-value)**: Normalized and query-flexible in theory; in MongoDB it usually devolves into awkward queries and indexing—poor fit versus embedded documents.
- **Separate collections per type or per field set**: Can simplify very large or rarely accessed blobs but adds application complexity and multi-document transactions for routine topic updates; unnecessary for typical topic sizes.

---

## 7. IM Platform Skill Architecture

**Decision**: Webhook-based **bidirectional** integration. **Outbound HTTP** from the app/skill to IM APIs (cards, groups, messages). **Inbound webhooks** per Platform Skill route events into Nest. **Tenant** is resolved from the IM **workspace** (or equivalent) identifier carried in the webhook payload.

**Rationale**: IM vendors standardize on HTTP webhooks for bot events; this matches their models and scales without holding open sockets per tenant. Outbound calls use the same credential and tenant context established during webhook handling. Workspace-scoped IDs are a stable key for multi-tenant routing.

**Alternatives considered**:

- **WebSocket / long-lived connections**: Possible for some platforms; more connection management, reconnect logic, and infra cost for comparable functionality where webhooks suffice.
- **Polling**: Simple but wasteful, higher latency, and rate-limit prone—unsuitable as the primary event path.

---

## 8. Testing Strategy

**Decision**: Three-layer pyramid—**unit** (Jest, **≥80%** where mandated, **mocked Mongoose** models), **integration** (**mongodb-memory-server**, skill pipeline, **tenant isolation** assertions), **E2E** (**supertest** + mongodb-memory-server for HTTP; **ink-testing-library** for CLI). **Contract tests** exercise the Skill SDK via **reference Skills** (golden implementations).

**Rationale**: Unit tests keep domain logic fast and isolated. Integration tests catch real Mongo query behavior and middleware (e.g. `tenantId` scoping) without Docker dependency when using mongodb-memory-server. E2E validates wiring and auth boundaries. Reference skills double as living contracts for `getCommands()`, parsers, and registration behavior.

**Alternatives considered**:

- **E2E-only / heavy manual QA**: High cost, slow feedback, poor regression signal for parsers and validation.
- **Unit-only**: Misses index behavior, transaction/middleware bugs, and real serialization paths.
- **Always-on Docker Mongo for CI**: Valid; mongodb-memory-server trades a little realism for simpler CI setup (no socket/port orchestration).

---

## 9. CLI Architecture

**Decision**: **Ink 5** with **pastel** for command routing and command structure. Three access levels: **Platform Admin**, **Tenant Admin**, and **User** (auth-only / limited). **Browser OAuth** for user login (`topichub-admin login` opens the system browser, callback to local handler). Skill-provided commands merged via **`getCommands()`** (or equivalent) from discovered skills.

**Rationale**: Ink yields composable React terminal UIs (tables, forms, progress) beyond line-printing CLIs. Pastel’s file-system-based routing scales as subcommands grow. OAuth in the browser matches user expectations for secure token acquisition versus password prompts. Dynamic commands from skills mirror server-side extensibility without hardcoding every subcommand.

**Alternatives considered**:

- **commander / oclif**: Mature for traditional CLIs; weaker first-class story for rich TUI and React-driven layouts unless augmented heavily.
- **Direct DB access from CLI**: Skips API validation, authz, and audit paths; duplicates business rules and risks tenant leakage—rejected.

---

## 10. Observability

**Decision**: **Structured JSON logging** with **correlation IDs** per request/command trace. **`/health`** returns process liveness plus **DB connectivity** and **Skill registry** status (e.g. loaded/disabled/error states). **Prometheus metrics** and **distributed tracing** deferred per YAGNI.

**Rationale**: JSON logs integrate with typical aggregators; correlation IDs tie webhook → command → DB operations. Health checks support orchestration and quick diagnosis without shipping a full observability platform on day one.

**Alternatives considered**:

- **Full stack on day one (Prometheus + Grafana + OpenTelemetry + Jaeger)**: Valuable at scale but operational overhead before traffic and SLOs justify it.
- **Unstructured plain text logs only**: Cheaper initially but painful for search and cross-service correlation.

---

## 11. Multi-Tenancy

**Decision**: **Shared MongoDB database** with a **`tenantId` field** on every tenant-owned document. Queries are scoped in the **application layer** via **Mongoose middleware** (or equivalent repository guards). **Skills** are installed **globally**; **enablement and configuration** are **per tenant**. Tenant resolution uses the IM **workspace ID** (via Platform Skills) as the canonical key into Topic Hub’s tenant mapping.

**Rationale**: One cluster and database simplify ops and backups versus many databases. Discipline via middleware reduces the risk of cross-tenant reads/writes compared to ad hoc queries. Per-tenant skill config matches “same codebase, different tenants, different enabled platforms/types.”

**Alternatives considered**:

- **Separate database per tenant**: Strongest isolation; higher cost, migration complexity, and connection pool sprawl—usually reserved for enterprise/regulatory tiers.
- **Separate collection per tenant**: Similar isolation flavor with shared DB; more dynamic schema management and migration scripts across many collections.

---

## 12. Secret Management

**Decision**: **AES-256** encryption at the **application layer** for **tenant-level** secrets only—organizational IM bot / platform API credentials and similar values stored **on the server**—not end-user personal credentials. A single **symmetric key** from **`ENCRYPTION_KEY`** (env). **Write-only** semantics: after persistence, **no API or CLI path returns plaintext**—only “configured” / masked indicators or rotate flows that replace ciphertext.

**Rationale**: Protects data at rest in MongoDB if backups or disks are exposed, without requiring every deployment to run Vault first. Env-based keys match small-team and single-region deployments; rotation is operational (re-encrypt) rather than productized in v1.

Note: This covers tenant-level organizational secrets stored server-side. User personal credentials are handled separately via OAuth2 PKCE + OS keychain (see sections 13-14).

**Alternatives considered**:

- **External secrets manager (HashiCorp Vault, cloud SM)**: Better rotation, auditing, and HSM integration; adds infra dependency and latency—appropriate when org standards mandate it.
- **Plaintext in DB**: Unacceptable for IM tokens and client secrets under basic security hygiene.

---

## 13. User Authentication Architecture

**Decision**: OAuth2 PKCE + ID Token (JWT) + JWKS Verification  
**Rationale**: User-specified requirement that user credentials MUST stay local and never be uploaded to the server. The security model must be provably complete using industry standards. OAuth2 PKCE is the standard for CLI/native app authentication (used by gh, gcloud, aws-cli). The flow: (1) CLI initiates OAuth2 PKCE with IM platform, (2) user authorizes in browser, (3) CLI receives access token + ID token (signed JWT), (4) tokens stored in OS keychain locally, (5) CLI sends only the ID token to the server, (6) server verifies JWT signature via the IM platform's JWKS endpoint. Provable security: PKCE prevents auth code interception, JWT signature is cryptographically verifiable, JWKS delegates trust to IM platform's PKI, raw tokens never leave the local machine.  
**Alternatives considered**:
- Token-based auth (send raw token to server): Violates the "credentials stay local" requirement. Server would store user secrets.
- Client certificates (mTLS): More complex to manage, less standard for CLI tools, harder for end users.
- API keys per user: Not scalable, no identity verification, no revocation mechanism tied to IM platform.

---

## 14. Local Credential Storage

**Decision**: OS Keychain (primary) + Encrypted file fallback  
**Rationale**: User credentials stored in the platform's native secure storage: macOS Keychain (via `keytar` or Security framework), Linux libsecret/keyring, Windows Credential Manager. Encrypted file fallback (`~/.topichub/credentials.enc`) for environments without keychain access (containers, CI). The fallback file uses AES-256-GCM with a key derived from a user-provided passphrase via PBKDF2. Standard approach used by Docker credentials, npm tokens, GitHub CLI.  
**Alternatives considered**:
- Plaintext file: Insecure, violates requirements.
- Only OS Keychain: Doesn't work in headless/container environments.
- External secret manager (Vault): Overkill for CLI-local credentials; adds infrastructure dependency.
