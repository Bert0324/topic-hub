# CLI Command Reference

**Branch**: `001-topic-hub-app` | **Date**: 2026-04-09

The CLI binary is **`topichub-admin`**. It is built with Ink and React and talks to the REST API (`/api/v1`). Configuration defaults: `TOPICHUB_SERVER_URL` or `~/.topichub/config.json`.

## Access levels

| Level | Auth | Scope |
|-------|------|--------|
| **Platform Admin** | Platform admin token (env or `config set`) | Global skills, tenants, platform stats |
| **Tenant Admin** | `topichub-admin auth <token>` with tenant admin token | One tenant: skills, setup, tenant stats, history |
| **User** | `topichub-admin login` (OAuth2 PKCE with IM platform; tokens in OS keychain); server receives **ID token only** (`Authorization: Bearer`), verified via JWKS | IM-user actions; dynamic Skill commands from `getCommands()` |

---

## Platform Admin commands

Uses platform credentials (e.g. `TOPICHUB_PLATFORM_TOKEN` or interactive login if supported).

### `topichub-admin skill install <pkg>`

Installs a Skill package globally → **`POST /admin/skills`**.

```text
$ topichub-admin skill install @acme/topichub-deploy-type

✓ Installed deploy-type v1.0.0 (category: type, topicType: deploy)
  Tenants enable with: topichub-admin auth <tenant-token> && topichub-admin skill enable deploy-type
```

### `topichub-admin skill list`

Lists globally installed Skills.

```text
$ topichub-admin skill list

┌──────────────┬──────────┬─────────┬─────────────────────┐
│ Name         │ Category │ Version │ Installed           │
├──────────────┼──────────┼─────────┼─────────────────────┤
│ deploy-type  │ type     │ 1.0.0   │ 2026-04-09 10:00    │
│ feishu       │ platform │ 1.0.0   │ 2026-04-09 10:05    │
│ github-adapter │ adapter│ 0.2.0   │ 2026-04-09 11:00    │
└──────────────┴──────────┴─────────┴─────────────────────┘
```

### `topichub-admin skill uninstall <name>`

Removes a global Skill → **`DELETE /admin/skills/:name`**.

```text
$ topichub-admin skill uninstall legacy-type
✓ Uninstalled legacy-type
```

### `topichub-admin tenant create --name <name>`

Creates a tenant → **`POST /admin/tenants`**. Prints `tenantId`, `apiKey`, and `adminToken` once.

```text
$ topichub-admin tenant create --name "Acme Corp"

✓ Tenant created
  tenantId:   ten_01
  apiKey:     th_live_xxxxxxxx  (store for ingestion)
  adminToken: th_admin_xxxxxxxx (share with tenant admin only)
```

### `topichub-admin tenant list`

→ **`GET /admin/tenants`**

### `topichub-admin tenant disable --name <name>` (or `--id <id>`)

→ **`PATCH /admin/tenants/:id`** with `disabled: true`.

```text
$ topichub-admin tenant disable --name "Acme Corp"
✓ Tenant ten_01 disabled
```

### `topichub-admin tenant token regenerate <name>`

→ **`POST /admin/tenants/:id/token/regenerate`**

```text
$ topichub-admin tenant token regenerate "Acme Corp"

✓ New admin token (previous token invalidated):
  th_admin_yyyyyyyy
```

### `topichub-admin stats`

Platform-wide → **`GET /admin/stats`**

```text
$ topichub-admin stats

Platform
  Tenants: 12 (11 active)
  Topics:  5,000 total
  Skills installed: 8
```

### `topichub-admin health`

→ **`GET /health`**

```text
$ topichub-admin health

Server:   https://hub.example.com/api/v1
Status:   ✓ ok
Database: ✓ connected
```

### `topichub-admin config set server <url>`

Persists base URL (including `/api/v1` or bare origin per client convention).

```text
$ topichub-admin config set server http://localhost:3000/api/v1
✓ Server URL updated
```

---

## Tenant Admin commands

**Requires** `topichub-admin auth <token>` first (tenant admin token). Subsequent commands send **`Authorization: Bearer`** scoped to that tenant.

### `topichub-admin auth <token>`

Stores the tenant admin token for the session (or writes to secure local config).

```text
$ topichub-admin auth th_admin_xxxxxxxx
✓ Authenticated as tenant admin (ten_01)
```

### `topichub-admin skill list`

Shows Skills available to the tenant and **enabled** state → **`GET /admin/tenants/:tid/skills`**.

```text
$ topichub-admin skill list

Tenant: Acme Corp (ten_01)

┌──────────────┬──────────┬─────────┬─────────┐
│ Name         │ Category │ Version │ Enabled │
├──────────────┼──────────┼─────────┼─────────┤
│ deploy-type  │ type     │ 1.0.0   │ ✓       │
│ feishu       │ platform │ 1.0.0   │ ✓       │
│ noop-auth    │ auth     │ 1.0.0   │ ✗       │
└──────────────┴──────────┴─────────┴─────────┘
```

### `topichub-admin skill enable <name>` / `disable <name>`

→ **`PATCH /admin/tenants/:tid/skills/:name`** with `enabled: true|false`.

```text
$ topichub-admin skill enable feishu --config '{"appId":"cli_xxx","appSecret":"..."}'
✓ Skill feishu enabled for tenant ten_01
```

### `topichub-admin skill setup <name>`

Runs **`Skill.runSetup(ctx)`** for that tenant (interactive prompts, browser, secrets).

```text
$ topichub-admin skill setup feishu

Feishu setup
────────────
? Enter verification token: ••••••••
Opening browser for OAuth confirmation...
✓ Credentials stored (tenant secrets)
✓ Setup complete for feishu
```

### `topichub-admin skill config <name> --show`

Prints config with secrets masked as `***` → **`GET /admin/tenants/:tid/skills`** (or dedicated config endpoint if added).

```text
$ topichub-admin skill config feishu --show

{
  "appId": "cli_xxx",
  "appSecret": "***",
  "verificationToken": "***"
}
```

### `topichub-admin stats`

Tenant-scoped → **`GET /admin/tenants/:tid/stats`**

```text
$ topichub-admin stats

Tenant: Acme Corp (ten_01)
  Topics: 340 (open: 42)
  By type: deploy 100 | bug 240
  Last 24h: 89 events, 12 commands
```

### `topichub-admin history`

Recent tenant admin audit events (installs, enable/disable, config changes).

```text
$ topichub-admin history --limit 5

2026-04-09 14:00  skill.config_updated  feishu
2026-04-09 13:30  skill.enabled         noop-auth
2026-04-09 11:00  skill.setup_completed feishu
```

---

## User commands (auth-only)

All user tokens are stored **exclusively in the OS keychain**. The Topic Hub server verifies identity via **JWT/JWKS** — it **never** receives or stores raw user credentials.

### `topichub-admin login`

Authenticates via OAuth2 PKCE with the IM platform:

1. Opens local browser to IM platform's authorization endpoint with PKCE challenge
2. User authorizes the Topic Hub CLI app
3. CLI receives auth code via local callback server (localhost:PORT)
4. Exchanges code for access token + ID token (signed JWT) using PKCE verifier
5. Stores tokens in OS keychain (macOS Keychain / Linux libsecret / Windows Credential Manager)
6. When calling server, sends **ID token only** — server verifies via JWKS, never stores it

Tokens are **NEVER** sent to the Topic Hub server for storage.

```text
$ topichub-admin login
Opening browser for authentication...
✓ Authenticated as alice@acme.com (via Feishu)
  Token stored in system keychain
```

### Skill-provided commands (`getCommands()`)

**AuthSkill** (and optionally other categories) exposes **`getCommands()`** returning **`SkillCommand[]`**. The CLI **discovers** these at runtime and registers subcommands (e.g. `topichub-admin run <skill>:<name>` or flattened namespaced commands — exact UX is implementation-defined).

**Dynamic Skill commands**:

- Each command has `name`, `description`, `args`, and `handler(args, ctx)`.
- Discovery happens after **`login`** (user token) when the server or bundled registry lists available commands for the authenticated user’s tenant and platform.

```text
$ topichub-admin help

User commands (after login)
  login                 Browser OAuth
  request-approval      [noop-auth] Submit approval request
  whoami                Show current IM identity

Run `topichub-admin <command> --help` for args.
```

---

## Summary matrix

| Command area | Platform Admin | Tenant Admin | User |
|--------------|----------------|--------------|------|
| `skill install/list/uninstall` | ✓ | — | — |
| `tenant create/list/disable`, `tenant token regenerate` | ✓ | — | — |
| `skill list/enable/disable/setup/config` | — | ✓ | — |
| `stats` | platform | tenant | — |
| `health`, `config set server` | ✓ | ✓ (same binary) | — |
| `login`, dynamic `getCommands()` | — | — | ✓ |
