# Implementation Plan: Simplify Skill Types

**Branch**: `004-simplify-skill-types` | **Date**: 2026-04-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-simplify-skill-types/spec.md`

## Summary

Remove the unused Auth Skill category and its associated pipeline step, simplifying the Skill system from four categories to three: Topic, Platform, Adapter. The auth check in the pipeline (`runAuthCheck`) is dead code — no Auth Skills are deployed, all callers pass string actors, and the `UserIdentity` type exists only to serve the auth check. This is a focused code removal: delete one interface file, strip one pipeline step, clean the registry and enum, and update the barrel export. Access control remains at the infrastructure layer (admin tokens, tenant scoping).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10, Typegoose + Mongoose 8, zod (server)  
**Storage**: MongoDB 7 (existing `skill_registrations` collection may contain `category: 'auth'` records)  
**Testing**: Jest + ts-jest + mongodb-memory-server  
**Target Platform**: Linux server (Docker) for remote; macOS/Linux/WSL for local CLI  
**Project Type**: Monorepo (pnpm 9 + Turbo): `@topichub/server` (NestJS API) + `@topichub/cli` (Node CLI)  
**Performance Goals**: N/A — this is a code removal, pipeline gets faster by removing one async step  
**Constraints**: Must not break existing skill registrations in MongoDB; deprecated `auth` category records must be silently ignored  
**Scale/Scope**: 6 files modified, 1 file deleted, ~80 lines removed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | **PASS** | Removing dead code, commented-out code, and unused interfaces. Directly aligned. |
| II. Testing Standards | **PASS** | Existing tests (none for auth skill — it was never tested). New tests required for simplified pipeline. |
| III. User Experience Consistency | **N/A** | No UI changes. CLI `skill` commands already list skills by category — will show 3 instead of 4. |
| IV. Performance Requirements | **PASS** | Removing one async step from the pipeline reduces latency. |
| V. Simplicity & Maintainability | **PASS** | Removing an abstraction that has zero concrete use cases. Directly aligned with YAGNI. |
| Security & Data Integrity | **PASS** | Access control remains at infrastructure layer (admin tokens, tenant scoping). No security regression. |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-simplify-skill-types/
├── plan.md              # This file
├── research.md          # Phase 0 output — minimal, no unknowns
├── data-model.md        # Phase 1 output — enum change + deprecation handling
├── quickstart.md        # Phase 1 output — migration guide for upgraders
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (changes)

```text
packages/server/src/
├── common/
│   └── enums.ts                          # MODIFY: Remove AUTH from SkillCategory enum
├── skill/
│   ├── interfaces/
│   │   ├── auth-skill.ts                 # DELETE: Entire file (AuthSkill, UserIdentity, AuthorizeParams, AuthResult, SkillCommand, AuthSkillManifest)
│   │   └── index.ts                      # MODIFY: Remove auth-skill re-export
│   ├── pipeline/
│   │   └── skill-pipeline.ts             # MODIFY: Remove runAuthCheck(), UserIdentity import, simplify execute() signature to actor: string
│   └── registry/
│       └── skill-registry.ts             # MODIFY: Remove AuthSkill import, getAuthSkill(), 'authorize' detection in resolveCategory(), AUTH from AnySkill union

tests/server/
└── skill/
    └── skill-pipeline.spec.ts            # NEW: Test simplified pipeline (no auth step)
    └── skill-registry.spec.ts            # NEW: Test 3-category resolution + deprecated auth handling
```

**Structure Decision**: All changes are within the existing `packages/server/src/skill/` module. No new modules or directories needed (except test files). The change is purely subtractive with respect to production code.

### Detailed File Changes

**1. `packages/server/src/common/enums.ts`** — Remove `AUTH = 'auth'` line from `SkillCategory`.

**2. `packages/server/src/skill/interfaces/auth-skill.ts`** — **DELETE** entire file. All types (`UserIdentity`, `AuthorizeParams`, `AuthResult`, `SkillCommand`, `AuthSkillManifest`, `AuthSkill`) are auth-specific and not used elsewhere.

**3. `packages/server/src/skill/interfaces/index.ts`** — Remove `export * from './auth-skill'` line.

**4. `packages/server/src/skill/pipeline/skill-pipeline.ts`** — Changes:
- Remove `import { UserIdentity } from '../interfaces/auth-skill'`
- Simplify `execute()` signature: `actor: string | UserIdentity` → `actor: string`
- Remove `userIdentity` construction block (lines 35–43)
- Remove `await this.runAuthCheck(...)` call (line 45)
- Delete entire `runAuthCheck()` private method (lines 51–78)
- Simplify `actorStr` assignment since `actor` is always a string

**5. `packages/server/src/skill/registry/skill-registry.ts`** — Changes:
- Remove `import { AuthSkill } from '../interfaces/auth-skill'`
- Change `AnySkill` union from `TypeSkill | PlatformSkill | AuthSkill | AdapterSkill` to `TypeSkill | PlatformSkill | AdapterSkill`
- Delete `getAuthSkill()` method (lines 80–85)
- Remove `if ('authorize' in skill) return SkillCategory.AUTH` from `resolveCategory()` (line 174)
- Add deprecation warning log for any loaded skills with `category === 'auth'` in `loadAll()`

**6. Test files** — New tests for the simplified pipeline and registry:
- Verify pipeline executes without auth step
- Verify `SkillCategory` has exactly 3 values
- Verify `resolveCategory()` maps correctly (no `authorize` detection)
- Verify deprecated `auth` registrations are logged but not loaded into pipeline
