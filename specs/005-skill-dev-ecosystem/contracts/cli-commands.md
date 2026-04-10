# CLI Command Contracts

**Feature**: 005-skill-dev-ecosystem | **Date**: 2026-04-10

## New Commands

### `topichub skill-repo create`

Creates a new skill repository project.

**Prerequisites**: Authenticated admin (`cli init` completed)

```text
topichub skill-repo create <repo-name> [options]

Arguments:
  repo-name              Name of the skill repository (used as directory name)

Options:
  --path <dir>           Parent directory (default: current working directory)

Output:
  - Creates directory <repo-name>/ with full project scaffold
  - Initializes git repo
  - Prints success message with next steps
```

**Exit codes**: 0 = success, 1 = not authenticated, 2 = directory exists, 3 = invalid name

**Generated structure**:
```text
<repo-name>/
├── package.json           # topichub.tenantId, topichub.serverUrl from config
├── tsconfig.json
├── .gitignore
├── .cursor/rules/writing-topic-hub.mdc
├── AGENTS.md
├── CLAUDE.md
├── skills/                # Empty, ready for skill creation
├── README.md
└── .topichub-repo.json    # Repo metadata: { tenantId, serverUrl, createdAt }
```

---

### `topichub skill create`

Creates a new skill inside the current skill repo via interactive Q&A.

**Prerequisites**: Must be run inside a skill repo (detected via `.topichub-repo.json`)

```text
topichub skill create [skill-name] [options]

Arguments:
  skill-name             Optional skill name (prompted if not provided)

Options:
  --category <cat>       Pre-select category: topic | platform | adapter
  --non-interactive      Use defaults for all prompts (requires --category)

Q&A Flow:
  1. Skill name (if not provided as argument)
  2. Category selection: topic / platform / adapter
  3. Category-specific questions:
     - topic: topic type name, lifecycle hooks (created/updated/deleted)
     - platform: target IM platform name, supported capabilities
     - adapter: external system name, auth requirement (none/oauth/api-key)
  4. Confirmation and scaffold

Output:
  - Creates skills/<skill-name>/ directory with category-specific scaffold
  - Prints success message
```

**Exit codes**: 0 = success, 1 = not in a skill repo, 2 = name conflict, 3 = invalid input

---

### `topichub publish`

Publishes all skills in the current repo to the server.

**Prerequisites**: Must be run inside a skill repo; authenticated admin

```text
topichub publish [options]

Options:
  --dry-run              Validate and show what would be published without sending
  --public               Publish as public skills (visible to all tenants; requires super-admin)
  --server <url>         Override server URL from repo config

Flow:
  1. Detect repo root (find .topichub-repo.json)
  2. Scan skills/ directory for all skills
  3. Validate each skill manifest
  4. Build skill content payloads
  5. POST /admin/skills/publish (batch, with isPublic flag if --public)
  6. Report results per skill

Output:
  - Lists all skills published with status
  - Reports any validation errors
  - If --public used by non-super-admin: "Permission denied. Only super-admins can publish public skills."
```

**Exit codes**: 0 = success, 1 = not authenticated, 2 = validation errors, 3 = server error, 4 = permission denied (non-super-admin with --public)

---

### `topichub group create`

Creates an IM group via the platform skill.

**Prerequisites**: Authenticated admin; platform skill installed and configured

```text
topichub group create <group-name> [options]

Arguments:
  group-name             Display name for the group

Options:
  --platform <name>      Target IM platform (required if multiple platforms configured)
  --members <ids...>     Comma-separated member identifiers
  --topic-type <type>    Associate with a topic type

Output:
  - Creates group on the IM platform
  - Registers group in Topic Hub
  - Prints group ID and invite link (if available)
```

**Exit codes**: 0 = success, 1 = not authenticated, 2 = platform skill not found, 3 = platform API error

## Modified Commands

### `topichub skill list` (enhanced)

Adds visibility into public vs private skills.

```text
topichub skill list [options]

Options:
  --scope <scope>        Filter: all (default) | public | private
  --category <cat>       Filter by category: topic | platform | adapter

Output columns:
  NAME | CATEGORY | SCOPE | STATUS | VERSION
```

### `topichub serve` (enhanced)

Enhanced debug output and SKILL.md hot-reload.

```text
topichub serve [options]

Options (existing):
  --executor <type>      claude-code | codex | none

Enhanced behavior:
  - Re-reads SKILL.md from disk on each new dispatch (hot-reload)
  - Displays richer terminal output:
    [DISPATCH] Received: <topicId> / <skillName> / <eventType>
    [CLAIM]    Claimed dispatch <id>
    [AGENT]    Running <executor> with <skillName>...
    [RESULT]   Completed in <duration>ms
    [ERROR]    Failed: <message> (dispatch <id>)
```
