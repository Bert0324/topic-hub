# Research: Streamline Commands & Skills

**Feature**: 013-streamline-commands-skills  
**Date**: 2026-04-11

## R1: IM Command Prefix Removal — Parser & Bridge Impact

**Decision**: Remove `/topichub` prefix entirely; reject it with an error (no backward compat).

**Rationale**: The current `CommandParser.PREFIX = '/topichub'` strips the prefix before parsing. The `normalizeImCommandMessage` in `openclaw-bridge.ts` looks for `/topichub` or `/answer` after stripping @-mentions. Both must be updated to handle the new prefix-free command set.

**Implementation approach**:
- `CommandParser`: Remove the prefix-stripping logic. Parse the first `/`-prefixed token as the action directly. If input starts with `/topichub`, return a dedicated error action.
- `normalizeImCommandMessage`: Instead of searching for `/topichub` or `/answer`, search for any `/` command token after stripping mentions. This makes the bridge command-agnostic.
- `WebhookHandler.handleOpenClaw`: Replace the string prefix checks (`/topichub register`, `/topichub unregister`) with `/register` and `/unregister`. Add `/help` to the pre-binding command whitelist alongside `/register`.

**Alternatives considered**:
- Keep prefix-stripping silently for backward compat → Rejected by user directive.
- Deprecation period with warnings → Rejected by user directive.

## R2: Pairing Flow Reversal — Executor Generates Code

**Decision**: The local executor generates a pairing code on startup (or on-demand); the IM user enters `/register <code>` to bind.

**Rationale**: The current flow has IM generate a code (`identityOps.generatePairingCode`) and the CLI user claims it via `POST /api/v1/identity/link`. Spec 013 reverses this: the executor is the origin. The relationship is 1 executor : N IM accounts.

**Implementation approach**:
- **Executor side** (`serve` command): After registering with the server and receiving an executor token, call a new API endpoint `POST /api/v1/executors/pairing-code` to generate a code. Display it in the console. Optionally regenerate on demand.
- **Server side**: New endpoint creates a `pairing_codes` record with `executorId` (or `topichubUserId` + executor token reference) instead of `platform/platformUserId`. The code maps to the executor's identity.
- **IM side** (`/register <code>`): The webhook handler validates the code via `identityOps.claimPairingCode(platform, platformUserId, code)`. The claim resolves the executor's `topichubUserId` and creates/updates a `user_identity_binding` record for the IM account → that user identity.
- **Pairing code entity**: Add `topichubUserId` and optional `executorToken` fields. Remove the requirement for `platform`/`platformUserId` at creation time (those are filled on claim).
- Remove `POST /api/v1/identity/link` and `POST /api/v1/identity/unlink` endpoints (CLI link/unlink removed).

**Alternatives considered**:
- Keep current IM-generated code flow → Rejected; user clarified executor must originate the code.
- QR code-based pairing → Over-engineered for CLI display; short alphanumeric code is sufficient.

## R3: IM Binding Security — Platform→Identity→Executor Chain

**Decision**: Token chain only (spec 011). No additional command-layer security.

**Rationale**: The IM→executor dispatch chain is:
1. IM user @-mentions bot → OpenClaw bridge verifies webhook HMAC → extracts `(platform, userId, channel, message)`.
2. `resolveUserByPlatform(platform, userId)` → looks up `user_identity_bindings` → gets `topichubUserId`.
3. `heartbeatOps.isAvailable(topichubUserId)` → checks executor is online.
4. Command is dispatched with `dispatchMeta.targetUserId = topichubUserId`.
5. Executor receives via SSE, validates its executor token, processes task.

**Security guarantees**:
- HMAC verification prevents spoofed webhooks.
- Binding record ensures IM account maps to exactly one `topichubUserId` at a time.
- Executor token ensures only the legitimate executor receives tasks.
- No cross-identity leakage: platform+userId is unique-indexed.

**Gap identified**: FR-022 (reject when executor busy) is not implemented today. The `TaskProcessor` in CLI has a `canAcceptMore()` check and local queue, but the server doesn't enforce capacity — it just sends events. Need to add server-side capacity awareness or let the executor NAK the dispatch.

## R4: CLI Command Surface — Removal & Addition Impact

**Decision**: Reduce CLI to: `init`, `serve`, `identity` (me/create/list/revoke/regenerate-token), `skill create`, `publish <path>`, `login`, `logout`, `topic create`.

**Rationale**: Removed commands map directly to deleted switch cases in `packages/cli/src/index.tsx`. Added commands require new handlers.

**File impact**:
- `index.tsx`: Remove cases for `stats`, `health`, `skill-repo`, `group`, `link`, `unlink`, `auth`. Add `topic` case. Restrict `skill` to only `create` subcommand. Add `identity me` subcommand.
- `commands/skill/index.ts`: Remove `list`, `install`, `enable`, `disable`, `setup`, `config`, `uninstall` cases.
- `commands/identity/index.ts`: Add `me` subcommand calling `GET /api/v1/identity/me`.
- Delete files: `commands/health.ts`, `commands/stats.ts`, `commands/skill-repo/index.ts`, `commands/group/index.ts`, `commands/link/index.ts`, `commands/unlink/index.ts`.
- Server: Add `GET /api/v1/identity/me` endpoint (FR-007).

## R5: `/help` and `/register` — Binding Exemption

**Decision**: `/help` and `/register` work without an executor binding. All other IM commands require binding.

**Rationale**: In `WebhookHandler.handleOpenClaw`, after the special register/unregister/answer checks, there is an identity resolution gate. Unbound users get a "link executor" message. `/help` must bypass this gate since it returns static content. `/register` already bypasses it (handled before the gate).

**Implementation approach**:
- In `handleOpenClaw`, after `bridge.handleInboundWebhook()`, check if the command is `/help` before the identity resolution step. If so, execute the help handler directly and return.
- `/register <code>` is already pre-gated (string prefix check) — just update to the new syntax.
- `/unregister` logically requires a binding to exist, so it should remain behind the gate.

## R6: Skill Lifecycle Simplification — Registry Impact

**Decision**: Remove install/enable/disable/setup/config/uninstall. Published skills are immediately available.

**Rationale**: The current `SkillRegistry` uses `SkillCategory` (TYPE, ADAPTER) and `tenant_skill_configs` with enabled flags. Spec 012 already mandates unifying skill types, and spec 013 removes the lifecycle management commands.

**Implementation approach**:
- `SkillRegistry`: The `isTypeAvailable` check currently consults `tenant_skill_configs` for enabled status. This should be simplified to: if the skill is registered (published), it's available.
- CLI `skill` command: Only `create` subcommand remains. All others return "unknown command."
- The `publish` command reads a local SKILL.md, validates it, and POSTs to the server.
- Server-side skill storage: Published skills are stored in `skill_registrations` without `enabled` flags.
