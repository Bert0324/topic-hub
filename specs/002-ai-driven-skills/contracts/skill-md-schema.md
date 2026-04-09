# SKILL.md File Contract

## File Format

A `SKILL.md` file follows [Cursor's SKILL.md conventions](https://docs.cursor.com/skills):

```markdown
---
name: alert-severity
description: >-
  Analyze alert topics and generate severity assessments with first-responder
  action suggestions. Use when an alert-type topic is created or updated.
---

# Alert Severity Assessment

Analyze the alert topic and produce:
1. A severity level (P0-P4) based on the alert metadata
2. A brief impact summary (1-2 sentences)
3. Suggested first-responder actions (2-3 bullet points)

Format the output as:

**Severity**: P{level}
**Impact**: {summary}
**Actions**:
- {action1}
- {action2}

## onTopicCreated

Perform full severity assessment using all available topic metadata.
Include suggested on-call escalation if severity is P0 or P1.

## onTopicUpdated

Re-assess severity if metadata has changed. Focus on what changed
and whether the severity level should be adjusted up or down.
```

## Frontmatter Schema

| Field | Type | Constraints | Required |
|-------|------|-------------|----------|
| `name` | string | Max 64 chars, pattern: `^[a-z0-9][a-z0-9-]*$` | yes |
| `description` | string | Max 1024 chars, non-empty | yes |

## Body Structure

The markdown body below the frontmatter delimiter (`---`) serves as the default system prompt for AI calls.

### Event-Specific Sections (Optional)

Level-2 headings (`##`) matching lifecycle event names override the default prompt for that event:

| Heading | Lifecycle Event |
|---------|----------------|
| `## onTopicCreated` | Topic creation |
| `## onTopicUpdated` | Topic field update |
| `## onTopicStatusChanged` | Status transition |
| `## onTopicAssigned` | User assignment |
| `## onTopicClosed` | Topic closed |
| `## onTopicReopened` | Topic reopened |
| `## onSignalAttached` | Signal attachment |
| `## onTagChanged` | Tag add/remove |

### Parsing Rules

1. Content before the first event-specific `##` heading is the **preamble** — included in the default system prompt
2. Content under an event-specific `##` heading (until the next `##` or end-of-file) is the prompt for that event
3. When an event fires:
   - If a matching `## onXxx` section exists → use **preamble + that section** as system prompt
   - If no matching section exists → use **entire body** as system prompt
4. Unknown `##` headings (not matching lifecycle events) are treated as part of the preamble/current section (not extracted)
5. If the body is empty or whitespace-only, the skill has no AI instructions (`hasAiInstructions: false`)

## File Location

`SKILL.md` must be placed at the root of the skill directory, alongside `package.json`:

```text
skills/
└── alert-severity/
    ├── package.json    # Required (existing skill loader requirement)
    ├── SKILL.md        # Optional — enables AI behavior
    ├── index.js        # Skill code (may be minimal or empty if fully NL-driven)
    └── reference.md    # Optional — progressive disclosure
```

## Validation Errors

| Condition | Behavior |
|-----------|----------|
| No `SKILL.md` in skill dir | Skill loads normally, no AI features |
| `SKILL.md` exists but no frontmatter | Warning logged, skill loads without AI |
| Frontmatter `name` missing/invalid | Warning logged, skill loads without AI |
| Frontmatter `description` missing | Warning logged, skill loads without AI |
| Empty body | `hasAiInstructions: false`, no AI calls made |
| Unknown `##` heading | Treated as regular content (not extracted as event section) |
