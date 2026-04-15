# Quickstart: 014 Published skill IM routing

## Prereqs

- MongoDB with Topic Hub collections.
- API + OpenClaw bridge configured as today.
- One skill **published** via CLI (`publish`) but **not** placed on server `SKILLS_DIR`.

## Verify published routing

1. Publish `example-skill` to Skill Center.
2. Ensure API process restarted after code deploy (cache cold start OK).
3. In a topic group (active topic), send: `/example-skill hello`
4. **Expect**: Dispatch `skillName=example-skill` (not topic default type); executor receives skill invocation payload.

## Verify unknown-token hint

1. Send `/no-such-published-name do work` where name is absent from catalog.
2. **Expect**: Dispatch is relay class; payload includes `publishedSkillRouting: { status: 'miss', token: 'no-such-published-name' }`; executor still runs.

## Verify IM→executor isolation

1. User A binds with pairing code from `serve` session **Alpha**.
2. User B binds with pairing code from session **Beta** (different machine or token).
3. Trigger work from A’s IM context.
4. **Expect**: Only **Alpha**’s executor claims the dispatch; Beta sees empty poll for that `targetExecutorToken` scope.

## skill-repo (after CLI work lands)

```bash
topichub-admin skill-repo --help
```

(Exact verbs to be filled when tasks implement FR-008.)
