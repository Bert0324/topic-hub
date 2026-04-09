# CLI Command Reference: AI-Driven Skills

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10

## Platform Admin

### `topichub-admin ai status`

```text
$ topichub-admin ai status

AI Provider
  Provider:  ark (Volcengine)
  Model:     doubao-seed-2-0-pro-260215
  Endpoint:  https://ark.cn-beijing.volces.com/api/v3
  Status:    ✓ available
  Circuit:   closed
  Global:    234/1000 requests this hour
```

## Tenant Admin

### `topichub-admin ai enable` / `disable`

```text
$ topichub-admin ai enable
✓ AI enabled for tenant ten_01

$ topichub-admin ai disable
✓ AI disabled for tenant ten_01
```

### `topichub-admin ai config --show`

```text
$ topichub-admin ai config --show

Tenant: Acme Corp (ten_01)
  AI Enabled:   ✓ yes
  Rate Limit:   100 requests/hour
  Used (hour):  42/100
```

### `topichub-admin ai config --set rate-limit=<N>`

```text
$ topichub-admin ai config --set rate-limit=50
✓ Rate limit updated: 50 requests/hour
```

### `topichub-admin ai usage`

```text
$ topichub-admin ai usage

Tenant: Acme Corp (ten_01)

AI Usage (last 24 hours)
┌──────────────┬───────┬────────────┐
│ Skill        │ Count │ Tokens     │
├──────────────┼───────┼────────────┤
│ alert-type   │    45 │    32,000  │
│ deploy-type  │    32 │    33,400  │
├──────────────┼───────┼────────────┤
│ Total        │    77 │    65,400  │
└──────────────┴───────┴────────────┘

Rate Limit: 42/100 requests this hour (58 remaining)
```

## Summary

| Command | Platform Admin | Tenant Admin |
|---------|----------------|--------------|
| `ai status` | ✓ | — |
| `ai enable/disable` | — | ✓ |
| `ai config` | — | ✓ |
| `ai usage` | platform-wide | tenant-scoped |
