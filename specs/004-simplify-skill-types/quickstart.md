# Quickstart: Simplify Skill Types

**Feature**: 004-simplify-skill-types | **Date**: 2026-04-10

## What Changed

The Skill system has been simplified from **4 categories** to **3 categories**:

| Before | After | Change |
|--------|-------|--------|
| Type | Type | Unchanged |
| Platform | Platform | Unchanged |
| Auth | *(removed)* | Access control handled by infrastructure (admin tokens, tenant scoping) |
| Adapter | Adapter | Now also handles external platform authentication |

The `runAuthCheck()` step has been removed from the Skill pipeline. Topic operations execute faster with one fewer async step.

## For Skill Authors

### Nothing changes for Type, Platform, and Adapter skills

Existing skills in these categories work exactly as before. No code changes needed.

### If you had an Auth Skill (unlikely)

No Auth Skills were deployed in production. If you had a development/prototype Auth Skill:

1. **External platform auth** (API keys, OAuth with CI/CD tools) → Move this logic into an **Adapter Skill** using `runSetup()` + `SetupContext`
2. **User-level permission checks** → These are now handled at the infrastructure layer (admin tokens, tenant scoping)

## For Server Operators

### Upgrading

No migration needed. The server handles the transition automatically:

1. Deploy the updated server
2. On startup, `loadAll()` scans the `skills/` directory and registers skills
3. Since no Auth Skills exist on disk, no `"auth"` category records are created
4. Any legacy `"auth"` records in MongoDB from development/testing remain but are ignored
5. A deprecation warning is logged if legacy records are detected

### Verifying the upgrade

```bash
# Check that the server started cleanly
topichub-admin health

# List registered skills — should show only type, platform, adapter categories
topichub-admin skill list
```

## Pipeline Execution Order (after change)

```
Topic Operation → Topic Skill hooks → Skill AI (if applicable) → Platform Skills
```

The previous `Auth Skill check` step between the operation and Topic Skill hooks has been removed.
