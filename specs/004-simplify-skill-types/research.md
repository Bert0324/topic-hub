# Research: Simplify Skill Types

**Feature**: 004-simplify-skill-types | **Date**: 2026-04-10

## Summary

This feature has minimal research needs — it is a focused code removal with well-understood scope. The codebase audit confirms there are no unknowns.

---

## R1: Auth Skill Usage Audit

**Question**: Is the Auth Skill category used anywhere in production code, tests, or configuration?

**Decision**: Safe to remove entirely.

**Rationale**: Complete codebase audit shows:
- **4 files** reference `AuthSkill` or `getAuthSkill`: `auth-skill.ts` (definition), `skill-registry.ts` (registration + lookup), `skill-pipeline.ts` (execution), `interfaces/index.ts` (re-export)
- **0 test files** test auth skill behavior
- **0 skill implementations** exist with `category: 'auth'` in the `skills/` directory
- **0 callers** of `skillPipeline.execute()` pass a `UserIdentity` object — all pass plain strings (`context.userId` or `ACTOR`)
- The `runAuthCheck` method is a no-op when no auth skill is registered (returns immediately)

**Alternatives considered**:
- Deprecate but keep: Rejected — the code is dead, has no tests, and adds cognitive load
- Keep `UserIdentity` type: Rejected — it's only consumed by `AuthorizeParams`, which is only consumed by `AuthSkill.authorize()`

---

## R2: MongoDB Backward Compatibility

**Question**: Will removing `SkillCategory.AUTH` from the enum break existing database records?

**Decision**: No migration needed. Handle at the application layer.

**Rationale**:
- Typegoose/Mongoose stores enum values as strings in MongoDB (`"auth"`, `"type"`, etc.)
- Removing the TypeScript enum value does not affect existing MongoDB documents — the string `"auth"` remains valid in the database
- The `loadAll()` method reads skills from disk, not from the database. Database records are upserted during `loadAll()` based on disk content
- No skill on disk has `category: 'auth'`, so no `"auth"` records will be created
- If legacy `"auth"` records exist from development/testing, they are harmless — the registry simply won't load them into the in-memory map

**Alternatives considered**:
- Run a migration to delete `auth` records: Rejected — unnecessary since records are overwritten on each server start via `loadAll()` upsert
- Add a startup warning for legacy auth records: Accepted — low cost, helps operators understand the deprecation

---

## R3: Pipeline Signature Simplification

**Question**: Can we safely narrow `execute()` from `actor: string | UserIdentity` to `actor: string`?

**Decision**: Yes, safe to narrow.

**Rationale**:
- All 6 call sites pass strings:
  - `create.handler.ts`: `context.userId` (string)
  - `update.handler.ts`: `context.userId` (string)
  - `assign.handler.ts`: `context.userId` (string)
  - `reopen.handler.ts`: `context.userId` (string)
  - `ingestion.service.ts` (×2): `ACTOR` = `'system:ingestion'` (string)
- The `UserIdentity` object construction (lines 35–43 in pipeline) was only used to pass to `runAuthCheck()`, which is being removed
- No external consumers of the `SkillPipeline` class exist outside the monorepo

**Alternatives considered**:
- Keep `UserIdentity` as a future-proofing measure: Rejected — YAGNI. Can be reintroduced if needed; currently adds 12 lines of dead transformation code.
