# Research: Unified Skill Center

## R1: IM Message → Identity → Executor Routing Security

**Decision**: Three-layer binding chain: `(platform, platformUserId)` → `ImBinding` → `executorToken` → `ExecutorRegistration` → `identityId`. Dispatches carry `targetExecutorToken`. Claim requires Bearer executor token matching `targetExecutorToken`.

**Rationale**: The current system has a critical gap: dispatch claim/complete/fail are unauthenticated, and `targetUserId` is a soft hint. By adding `targetExecutorToken` to dispatches and requiring the executor to present its token on claim, we cryptographically bind IM messages to the correct local executor. The `ImBinding` table (already defined but unused) maps `(platform, platformUserId)` → `executorToken`, completing the chain.

**Resolution chain**:
1. IM webhook arrives with `(platform, userId)` from signed OpenClaw payload
2. Server looks up `ImBinding` where `(platform, platformUserId)` → gets `executorToken` and `identityId`
3. Dispatch is created with `targetExecutorToken` = bound executor token, `targetIdentityId` = bound identity
4. Executor polls/SSE filters by `executorToken`; claim requires `Authorization: Bearer <executorToken>` matching `targetExecutorToken`
5. If bound executor is offline (no recent heartbeat), server replies to IM: "your executor is unavailable, re-register"

**Alternatives considered**:
- Keep `targetUserId` soft hint → rejected: no security guarantee, any caller can claim any dispatch
- JWT-signed dispatch tokens → rejected: over-engineering for a localhost-initiated system; executor token is sufficient

## R2: Unifying Two Executor Systems

**Decision**: Merge `executor_heartbeats` into `executor_registrations`. Add `lastSeenAt` to `ExecutorRegistration`. Remove `ExecutorHeartbeat` model. Heartbeat endpoint updates `ExecutorRegistration.lastSeenAt`.

**Rationale**: Currently `executor_heartbeats` (IM availability check) and `executor_registrations` (serve command) are separate systems with different schemas. The IM "agent not running" check uses heartbeats, but `serve` only writes to registrations. Unifying means one source of truth for "is this executor alive."

**Alternatives considered**:
- Keep both, sync them → rejected: unnecessary complexity, two writes per heartbeat
- Use only heartbeats → rejected: `executor_registrations` has richer schema (executorToken, identityId, status)

## R3: Removing Tenant Concept from Skill Infrastructure

**Decision**: Remove `tenantId` from `SkillRegistration`, `TenantSkillConfig`, and skill-related queries. Skills are scoped by author identity (`identityId`). The `Tenant` model and `TenantSkillConfig` are deprecated but not deleted in this feature — they may still be used by other subsystems. Skill queries use `identityId` instead of `tenantId`.

**Rationale**: Spec 011 removes tenants. Skills are now identity-owned. The `TenantSkillConfig` concept (per-tenant enable/disable) becomes unnecessary when there's a single system with identity-based ownership.

**Alternatives considered**:
- Full tenant model removal across all collections → deferred: too large a migration for this feature; other specs may handle broader tenant removal
- Keep tenantId as empty string → rejected: misleading, adds confusion

## R4: Individual Skill Publishing

**Decision**: New `POST /api/v1/skills/publish` endpoint accepts a single skill payload (name, SKILL.md content, description, version). CLI `publish` command targets a specific skill directory, not the whole repo. The server stores the skill in `skill_registrations` with the author's `identityId`.

**Rationale**: Current batch publish scans `skills/{topics,platforms,adapters}/` and sends all at once. With unified skill type, there are no category dirs. Individual publish is simpler, faster, and matches the spec requirement.

**Payload shape**:
```
{
  name: string,
  version?: string,
  description?: string,
  skillMdRaw: string,
  metadata?: Record<string, unknown>
}
```

**Alternatives considered**:
- Keep batch publish with flat directory → rejected: user explicitly requested individual publish
- Publish via git push → rejected: adds complexity, not in spec

## R5: Skill Center Web UI Architecture

**Decision**: Static HTML + vanilla JS served by NestJS via `@nestjs/serve-static`. The CLI command `topichub-admin skill-center` starts the server (if not running) and opens `http://localhost:<port>/skill-center` in the browser. The page fetches data from `/api/v1/skills/*` endpoints. Identity context (for likes) comes from a query param token passed by the CLI.

**Correction from clarification**: The spec says "no login flow, single-user machine trust." However, to support likes (which need identity), the CLI passes the identity token as a URL parameter when opening the browser. This is not a login flow — it's automatic and invisible to the user.

**Rationale**: No SPA framework needed for a skill listing page. Static HTML + fetch keeps the bundle minimal (< 50KB), meets the < 3s load target, and avoids adding React/Vue dependencies to the server.

**Alternatives considered**:
- Full React SPA → rejected: overkill for a listing page, violates simplicity principle
- CLI serves its own HTTP server → rejected: duplicates NestJS infrastructure; CLI already connects to server
- Electron app → rejected: massive dependency for a simple page

## R6: IM `/use <skill-name>` Command

**Decision**: Add `/use` as a recognized command prefix in `OpenClawBridge` / `WebhookHandler`. When a user sends `/topichub use <skill-name> [args]`, the server creates a dispatch with `skillName` = specified skill and `targetExecutorToken` = bound executor. The executor, upon claiming the dispatch, pulls the skill if not cached, registers it locally, and executes.

**Rationale**: This enables IM users to directly invoke skills without switching to CLI. The dispatch mechanism already supports `skillName`; we just need a new command handler that sets it explicitly rather than deriving it from topic type.

**Alternatives considered**:
- IM-side skill resolution (executor figures out skill from message) → rejected for explicit invocation: ambiguous, doesn't increment usage count for the right skill
- Direct HTTP call from IM to executor → rejected: violates "server never connects inbound to laptop" (FR-023/spec 008)

## R7: Skill Auto-Pull to Local Execution Engine

**Decision**: When an executor claims a dispatch referencing a published skill, the `TaskProcessor` checks if `<skillsDir>/<skillName>/SKILL.md` exists locally. If not, it fetches from `GET /api/v1/skills/:name/content` and writes to the skill directory. The skill is then available as a local skill for the execution engine (e.g., `.claude/skills/<skillName>/SKILL.md`).

**Rationale**: Makes published skills seamlessly available for local execution without manual download. The cached local copy avoids repeated network calls. Version checking (re-pull if server has newer version) uses an ETag or version field.

**Alternatives considered**:
- Pre-download all published skills → rejected: wasteful for 500+ skills
- Require manual `skill install` → rejected: friction contradicts auto-pull spec requirement (FR-010)

## R8: Removing `writing-topic-hub` Bundled Skill

**Decision**: Remove `writeAgentSkillFiles` from `repo-scaffold.ts`. Remove `.cursor/skills/writing-topic-hub/` from scaffold output. Remove `.cursor/rules/writing-topic-hub.mdc` from scaffold. `CLAUDE.md` and `AGENTS.md` generation remain (they're agent context, not skills).

**Rationale**: FR-024 explicitly prohibits bundled skill templates. Users own their skill content entirely.

**Alternatives considered**:
- Keep as optional scaffold → rejected: spec says no built-in skill templates at all
