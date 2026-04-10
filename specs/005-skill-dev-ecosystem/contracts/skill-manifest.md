# Skill Manifest Contract

**Feature**: 005-skill-dev-ecosystem | **Date**: 2026-04-10

## Manifest Location

Each skill has a `package.json` that serves as its manifest. The manifest is the source of truth for skill metadata.

## Common Fields (all categories)

```json
{
  "name": "my-skill-name",
  "version": "1.0.0",
  "main": "src/index.ts",
  "topichub": {
    "category": "type | platform | adapter"
  }
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` |
| `version` | string | no | Semver format (informational; not enforced server-side) |
| `main` | string | yes | Relative path to entry point |
| `topichub.category` | string | yes | One of: `type`, `platform`, `adapter` |

## Category-Specific Fields

### Topic Skill (`category: "type"`)

```json
{
  "topichub": {
    "category": "type",
    "topicType": "bug-report",
    "hooks": ["created", "updated", "deleted"],
    "schema": {
      "severity": "string",
      "priority": "string"
    }
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topichub.topicType` | string | yes | The topic type this skill handles |
| `topichub.hooks` | string[] | no | Lifecycle hooks to subscribe to |
| `topichub.schema` | object | no | Custom metadata schema for this topic type |

### Platform Skill (`category: "platform"`)

```json
{
  "topichub": {
    "category": "platform",
    "platform": "feishu",
    "capabilities": ["push", "commands", "group_management"],
    "webhookPath": "/webhooks/feishu"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topichub.platform` | string | yes | Platform identifier (e.g., `feishu`, `slack`) |
| `topichub.capabilities` | string[] | no | Supported capabilities |
| `topichub.webhookPath` | string | no | Custom webhook path |

### Adapter Skill (`category: "adapter"`)

```json
{
  "topichub": {
    "category": "adapter",
    "sourceSystem": "github",
    "auth": {
      "type": "oauth2 | api_key | none",
      "scopes": ["repo", "read:user"]
    },
    "supportedEvents": ["push", "pull_request"]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topichub.sourceSystem` | string | yes | External system identifier |
| `topichub.auth.type` | string | no | Auth requirement: `oauth2`, `api_key`, `none` |
| `topichub.auth.scopes` | string[] | no | Required OAuth scopes |
| `topichub.supportedEvents` | string[] | no | Webhook event types accepted |

## SKILL.md Contract

Each skill includes a `SKILL.md` with gray-matter YAML frontmatter.

```markdown
---
executor: claude-code
maxTurns: 10
allowedTools:
  - mcp__topichub__get_topic
  - mcp__topichub__update_topic
  - mcp__topichub__add_timeline_entry
---

# Skill Name

You are an agent that handles [purpose].

## Instructions

[Agent instructions for processing topics of this type]
```

| Frontmatter Field | Type | Required | Description |
|-------------------|------|----------|-------------|
| `executor` | string | no | Preferred executor: `claude-code`, `codex`, `none` |
| `maxTurns` | number | no | Max agent conversation turns (default: 10) |
| `allowedTools` | string[] | no | MCP tools the agent may use (default: all) |

## Validation Schema (zod)

```typescript
const SkillManifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/),
  version: z.string().optional(),
  main: z.string(),
  topichub: z.object({
    category: z.enum(['type', 'platform', 'adapter']),
    topicType: z.string().optional(),
    platform: z.string().optional(),
    sourceSystem: z.string().optional(),
    hooks: z.array(z.string()).optional(),
    schema: z.record(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    webhookPath: z.string().optional(),
    auth: z.object({
      type: z.enum(['oauth2', 'api_key', 'none']),
      scopes: z.array(z.string()).optional(),
    }).optional(),
    supportedEvents: z.array(z.string()).optional(),
  }),
});
```

## Repo Metadata File (`.topichub-repo.json`)

Located at the skill repo root. Identifies the directory as a Topic Hub skill repo.

```json
{
  "tenantId": "string",
  "serverUrl": "string",
  "createdAt": "ISO 8601 date string",
  "cliVersion": "string"
}
```
