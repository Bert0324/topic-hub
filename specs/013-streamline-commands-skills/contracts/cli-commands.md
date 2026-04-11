# CLI Command Contracts

**Feature**: 013-streamline-commands-skills

## Retained Commands

| Command | Subcommand | Auth Required | Description |
|---------|------------|---------------|-------------|
| `init` | — | none | Interactive first-time setup (server URL, admin token, executor, skills dir) |
| `serve` | — | identity token | Start local executor; generate and display pairing code |
| `identity` | `me` | any identity token | View own identity details |
| `identity` | `create` | superadmin | Create a new user identity |
| `identity` | `list` | superadmin | List all identities |
| `identity` | `revoke` | superadmin | Revoke an identity |
| `identity` | `regenerate-token` | superadmin | Regenerate identity token |
| `skill` | `create` | none (local only) | Scaffold a new SKILL.md-based skill locally |
| `publish` | `<path>` | identity token | Publish a local skill directory to the Skill Center |
| `login` | — | none → PKCE | OAuth PKCE login flow |
| `logout` | — | none | Clear all local tokens |
| `topic` | `create` | identity token | Create a topic (replaces `group create`) |

## Removed Commands

| Command | Replacement |
|---------|-------------|
| `auth <token>` | Use `init` or `login` |
| `health` | Skill Center superadmin dashboard |
| `stats` | Skill Center superadmin dashboard |
| `group create` | `topic create` |
| `link <code>` | IM `/register <code>` (pairing reversed) |
| `unlink` | IM `/unregister` |
| `skill list` | Skill Center web UI |
| `skill install` | Auto-pull on invocation |
| `skill enable/disable` | All published skills are available |
| `skill setup` | Removed |
| `skill config` | Removed |
| `skill uninstall` | Removed |
| `skill-repo create` | Removed |
| `skill-repo init` | Removed |

## New API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/identity/me` | Bearer (any identity) | Returns caller's own identity details |
| `POST` | `/api/v1/executors/pairing-code` | Bearer (executor token) | Generate a new pairing code for this executor |
| `POST` | `/api/v1/identity/register` | none (code-based) | Claim a pairing code from IM (replaces `/api/v1/identity/link`) |

## Deprecated API Endpoints

| Method | Path | Reason |
|--------|------|--------|
| `POST` | `/api/v1/identity/link` | Replaced by IM `/register` flow |
| `POST` | `/api/v1/identity/unlink` | Replaced by IM `/unregister` flow |

## `serve` Command — Pairing Code Display

When `topichub-admin serve` starts:
1. Authenticates with identity token → receives executor token
2. Calls `POST /api/v1/executors/pairing-code` → receives pairing code
3. Displays:
```
  ✓ Executor registered (identity=<uniqueId>)
  ✓ Pairing code: ABC123
    Enter in IM: /register ABC123
    Code expires in 10 minutes.
```
4. Optionally regenerate code periodically or on demand.

## Error Responses

| Condition | CLI Output |
|-----------|-----------|
| Removed command invoked | "Unknown command '<cmd>'. Run `topichub-admin` for available commands." |
| Non-superadmin runs `identity create/list/revoke/regenerate-token` | "This command requires superadmin privileges." |
| `publish` with invalid path | "Skill directory not found: <path>" |
| `publish` without identity token | "Not authenticated. Run `topichub-admin login` first." |
