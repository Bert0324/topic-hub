# Implementation Plan: Streamline Commands & Skills

**Branch**: `spec/013-streamline-commands-skills` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/013-streamline-commands-skills/spec.md`

## Summary

Streamline the Topic Hub command surface across IM and CLI: remove the `/topichub` prefix for IM commands, reverse the pairing flow (executor generates code → IM registers), restrict identity management to superadmin, reduce skill lifecycle to create+publish, replace `group` with `topic`, and remove monitoring/dead commands. This is a subtractive refactor — most work is removing code and updating routing, with the pairing flow reversal being the main new logic.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Typegoose + Mongoose 8 (ODM), zod (validation), @modelcontextprotocol/sdk (MCP), eventsource (SSE client), gray-matter (SKILL.md parsing)  
**Storage**: MongoDB 7 (existing collections: `pairing_codes`, `user_identity_bindings`, `executor_heartbeats`, `skill_registrations`, `tenant_skill_configs`)  
**Testing**: Jest 29 + ts-jest  
**Target Platform**: Linux server + local CLI  
**Project Type**: Monorepo — `packages/core` (shared logic), `packages/server` (NestJS API), `packages/cli` (CLI tool)  
**Performance Goals**: API p50 < 200ms, p95 < 500ms per constitution  
**Constraints**: No backward compatibility for `/topichub` prefix; clean break  
**Scale/Scope**: Single-instance deployment, ~50 concurrent users, ~500 skills

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Removing dead code improves quality. New pairing logic follows single-responsibility. |
| II. Testing Standards | ✅ Pass | Each implementation step includes test requirements. Parser, webhook, pairing, CLI, identity, skill tests planned. |
| III. UX Consistency | ✅ Pass | Error messages for removed commands give actionable guidance. IM help works without binding. |
| IV. Performance | ✅ Pass | No new performance-sensitive paths. Pairing code lookup is indexed O(1). |
| V. Simplicity | ✅ Pass | Net removal of code and concepts. Skill lifecycle radically simplified. CLI surface reduced by ~40%. |
| Security | ✅ Pass | HMAC verification, one-time codes, unique binding index, executor token chain preserved. No new attack surface. |
| Dev Workflow | ✅ Pass | Breaking change documented; migration notes in data-model.md. |

**Post-Phase-1 re-check**: Still passes. Data model changes are minimal (pairing code entity update). No new abstractions — reusing existing patterns.

## Project Structure

### Documentation (this feature)

```text
specs/013-streamline-commands-skills/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 implementation guide
├── contracts/
│   ├── im-commands.md   # IM command surface contract
│   ├── cli-commands.md  # CLI command surface contract
│   └── pairing-flow.md  # Pairing sequence & security
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
packages/
├── core/
│   └── src/
│       ├── command/
│       │   ├── command-parser.ts        # Remove /topichub prefix, add rejection
│       │   └── command-router.ts        # Add 'use' to command routing
│       ├── bridge/
│       │   └── openclaw-bridge.ts       # Update normalizeImCommandMessage
│       ├── webhook/
│       │   └── webhook-handler.ts       # /help bypass, /register <code>, busy rejection
│       ├── identity/
│       │   ├── identity.service.ts      # Pairing reversal, self-details method
│       │   └── pairing-code.entity.ts   # Add topichubUserId, executorClaimToken
│       ├── entities/
│       │   └── user-identity-binding.entity.ts  # Unchanged schema
│       └── skill/
│           ├── registry/skill-registry.ts       # Remove enabled check
│           └── config/skill-config.service.ts   # Deprecate
├── server/
│   └── src/
│       └── api.controller.ts            # Add /identity/me, /executors/pairing-code; remove link/unlink
└── cli/
    └── src/
        ├── index.tsx                    # Remove dead cases, add topic
        ├── commands/
        │   ├── identity/index.ts        # Add 'me' subcommand
        │   ├── skill/index.ts           # Keep only 'create'
        │   ├── serve/index.ts           # Display pairing code
        │   ├── health.ts               # DELETE
        │   ├── stats.ts                # DELETE
        │   ├── skill-repo/             # DELETE directory
        │   ├── group/                  # DELETE directory
        │   ├── link/                   # DELETE directory
        │   └── unlink/                 # DELETE directory
        └── (new)
            └── topic/index.ts           # New: topic create handler
```

**Structure Decision**: Existing monorepo structure (core/server/cli) is maintained. Changes are predominantly modifications to existing files with some deletions and one new file (topic command handler).

## Implementation Phases

### Phase A: Core Command Parsing (Low risk, no external dependencies)

**Scope**: `packages/core` only — parser, bridge, router.

1. `CommandParser`: Remove prefix stripping. Detect and reject `/topichub` input with dedicated error.
2. `normalizeImCommandMessage`: Generalize to find any `/`-prefixed command after mention stripping.
3. `CommandRouter`: Add `use` to recognized commands. Add `topichub` to rejection list.
4. Tests: Parser unit tests for all 13 commands, prefix rejection, edge cases.

**Risk**: Low — self-contained in core, no DB or API changes.

### Phase B: Webhook Handler Updates (Medium risk, depends on Phase A)

**Scope**: `packages/core/src/webhook/webhook-handler.ts`

1. Add `/help` handler before identity resolution gate (FR-028).
2. Replace `/topichub register` → `/register <code>` parsing. Extract code from command.
3. Replace `/topichub unregister` → `/unregister`.
4. Add executor busy check after binding resolution (FR-022) — query heartbeat for capacity.
5. Update all help text and error messages to short-form syntax.
6. Tests: Webhook handler tests for unbound `/help`, `/register` flow, busy rejection, prefix rejection.

**Risk**: Medium — changes the IM command flow; thorough testing needed.

### Phase C: Pairing Flow Reversal (High risk, cross-cutting)

**Scope**: `packages/core` (entity + service) + `packages/server` (API) + `packages/cli` (serve)

1. Update `pairing_codes` entity — `platform`/`platformUserId` optional; add `topichubUserId`, `executorClaimToken`.
2. Add `POST /api/v1/executors/pairing-code` — executor generates code via server API.
3. Update `IdentityService` — new method for executor-originated code creation; update `claimPairingCode` for IM-side claim.
4. Update `serve` command — call pairing-code API after executor registration; display code.
5. Add `POST /api/v1/identity/register` — IM-side code claim (called by webhook handler).
6. Remove `POST /api/v1/identity/link` and `POST /api/v1/identity/unlink`.
7. Tests: Full pairing flow integration test (executor → code → IM claim → binding).

**Risk**: High — changes the core security binding mechanism. Must preserve HMAC verification, unique indexes, and atomic claim semantics.

### Phase D: CLI Surface Cleanup (Low risk, deletion-heavy)

**Scope**: `packages/cli` only

1. Remove switch cases in `index.tsx`: `stats`, `health`, `skill-repo`, `group`, `link`, `unlink`, `auth`.
2. Add `topic` case → new `commands/topic/index.ts`.
3. Restrict `skill` to `create` only.
4. Add `identity me` subcommand.
5. Update default usage output (FR-021).
6. Delete dead files.
7. Tests: CLI command routing tests — retained commands work, removed commands rejected.

**Risk**: Low — mostly removing code.

### Phase E: Identity API & Access Control (Medium risk)

**Scope**: `packages/server` + `packages/core`

1. Add `GET /api/v1/identity/me` — returns caller's own identity details, executor count.
2. Verify `requireSuperadmin` on all admin identity endpoints.
3. CLI `identity me` calls the new endpoint.
4. Tests: API tests for self endpoint, superadmin enforcement.

**Risk**: Medium — new API endpoint with auth logic.

### Phase F: Skill Lifecycle Simplification (Low risk)

**Scope**: `packages/core` + `packages/cli`

1. Remove `list`, `install`, `enable`, `disable`, `setup`, `config`, `uninstall` from `commands/skill/index.ts`.
2. Simplify `SkillRegistry.isTypeAvailable` — remove `tenant_skill_configs` lookup.
3. Update `publish` command for simplified skill format.
4. Tests: Verify removed commands rejected, publish works, skills available without enable step.

**Risk**: Low — mostly removing code and simplifying existing logic.

## Complexity Tracking

No constitution violations. Net complexity reduction:
- CLI commands: 16+ → 10 (FR-021)
- Skill lifecycle states: 6 → 2 (local, published)
- IM command typing: ~30 chars → ~15 chars average
- Dead code removed: ~8 files deleted
