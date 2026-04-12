# Implementation Tasks: Simplify Skill Types

**Feature**: 004-simplify-skill-types | **Date**: 2026-04-10

## Phase 1: Core Changes (Sequential)

- [x] **T1**: Remove `AUTH` from `SkillCategory` enum in `packages/server/src/common/enums.ts`
- [x] **T2**: Delete `packages/server/src/skill/interfaces/auth-skill.ts`
- [x] **T3**: Remove auth-skill re-export from `packages/server/src/skill/interfaces/index.ts`
- [x] **T4**: Clean up `packages/server/src/skill/registry/skill-registry.ts` — remove `AuthSkill` import, `getAuthSkill()`, `authorize` detection in `resolveCategory()`, `AUTH` from `AnySkill` union
- [x] **T5**: Clean up `packages/server/src/skill/pipeline/skill-pipeline.ts` — remove `UserIdentity` import, `runAuthCheck()`, simplify `execute()` signature to `actor: string`

## Phase 2: Tests

- [x] **T6**: Verify build passes with `tsc --noEmit` — clean, zero errors
- [x] **T7**: Run existing tests to ensure no regressions — 3 suites, 25 tests, all pass
