# Quickstart: Streamline Commands & Skills

**Feature**: 013-streamline-commands-skills

## Implementation Order

Work should proceed in this order to maintain a testable system at each step:

### Step 1: IM Command Parser & Bridge (Core)

**Files**: `packages/core/src/command/command-parser.ts`, `packages/core/src/bridge/openclaw-bridge.ts`

1. Update `CommandParser` to remove the `/topichub` prefix stripping. If input starts with `/topichub`, return `{ action: 'topichub', error: 'prefix no longer supported' }`.
2. Update `normalizeImCommandMessage` to detect any `/`-prefixed command after stripping @-mentions (not just `/topichub` and `/answer`).
3. Update `GLOBAL_COMMANDS` and `TOPIC_COMMANDS` in `command-router.ts` if the `use` command needs routing.

### Step 2: Webhook Handler — Binding Exemption & New Flow (Core)

**Files**: `packages/core/src/webhook/webhook-handler.ts`

1. Add `/help` bypass before the identity resolution gate.
2. Replace `/topichub register` check with `/register <code>` parsing.
3. Replace `/topichub unregister` check with `/unregister`.
4. Add executor busy rejection (FR-022) after binding resolution.
5. Update `formatOpenClawCommandReply` help text to use short-form commands.

### Step 3: Pairing Flow Reversal (Core + Server + CLI)

**Files**: `packages/core/src/identity/identity.service.ts`, `packages/core/src/identity/pairing-code.entity.ts`, `packages/server/src/api.controller.ts`, `packages/cli/src/commands/serve/index.ts`

1. Update `pairing_codes` entity: make `platform`/`platformUserId` optional; add `topichubUserId` and `executorClaimToken`.
2. Add `POST /api/v1/executors/pairing-code` endpoint — executor calls this after registration.
3. Update `IdentityService.claimPairingCode` to work with executor-originated codes.
4. Update `serve` command to generate and display a pairing code after executor registration.
5. Remove `POST /api/v1/identity/link` and `POST /api/v1/identity/unlink` endpoints.

### Step 4: CLI Command Surface Cleanup (CLI)

**Files**: `packages/cli/src/index.tsx`, various command handlers

1. Remove switch cases: `stats`, `health`, `skill-repo`, `group`, `link`, `unlink`, `auth`.
2. Add `topic` case routing to a new `topic create` handler.
3. Restrict `skill` to only the `create` subcommand.
4. Add `identity me` subcommand.
5. Update default usage output.
6. Delete dead files: `commands/health.ts`, `commands/stats.ts`, `commands/skill-repo/`, `commands/group/`, `commands/link/`, `commands/unlink/`.

### Step 5: Identity API — Self Endpoint & Access Control (Server)

**Files**: `packages/server/src/api.controller.ts`, `packages/core/src/identity/identity.service.ts`

1. Add `GET /api/v1/identity/me` endpoint returning caller's own identity details.
2. Verify all `admin/identities` endpoints enforce `requireSuperadmin`.
3. Add `getIdentityDetails(topichubUserId)` to IdentityService if not present.

### Step 6: Skill Lifecycle Simplification (CLI + Core)

**Files**: `packages/cli/src/commands/skill/index.ts`, `packages/core/src/skill/registry/skill-registry.ts`, `packages/core/src/skill/config/skill-config.service.ts`

1. Remove `list`, `install`, `enable`, `disable`, `setup`, `config`, `uninstall` from skill command handler.
2. Simplify `SkillRegistry.isTypeAvailable` — remove `tenant_skill_configs` enabled check.
3. Update `publish` command to work with simplified skill format (no category requirement).

## Testing Strategy

Each step should have tests before moving to the next:

1. **Parser tests**: Verify prefix rejection, short-form parsing, all 13 IM commands recognized.
2. **Webhook tests**: Verify `/help` works unbound, `/register <code>` works, other commands rejected when unbound.
3. **Pairing tests**: Verify executor generates code, IM claims code, binding created/replaced.
4. **CLI tests**: Verify retained commands work, removed commands rejected, usage output correct.
5. **Identity API tests**: Verify `identity me` returns own details, superadmin gates enforced.
6. **Skill tests**: Verify `skill create` works, removed subcommands rejected, published skills accessible.

## Key Dependencies

- Spec 011 (Superadmin Identity Model) must be implemented for identity/executor token infrastructure.
- Spec 012 (Unified Skill Center) must be implemented for skill publishing and Skill Center web UI.
- This spec (013) can begin implementation of Steps 1-2 independently, as they only modify existing command parsing.
