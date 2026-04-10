# Quickstart: Local Agent Executor

## Prerequisites

1. **Remote server** running and accessible (with webhooks configured)
2. **Admin token** for your tenant (obtained during tenant creation)
3. **Claude Code** or **Codex** installed and authenticated locally:
   - Claude Code: `npm install -g @anthropic-ai/claude-code` + `claude login`
   - Codex: `npm install -g @openai/codex` + `codex login`

## Setup

### 1. Initialize local environment

```bash
topichub-admin init
```

Follow the interactive prompts:
- Enter your remote server URL
- Paste your admin token
- Select your tenant from the list
- Choose your preferred AI agent (Claude Code or Codex)
- Confirm the Skills directory (default: `~/.topichub/skills/`)

### 2. Add Skills locally

Place SKILL.md files in your Skills directory:

```bash
mkdir -p ~/.topichub/skills/bug-triage
```

Create `~/.topichub/skills/bug-triage/SKILL.md`:

```markdown
---
name: bug-triage
description: Classify and triage bug reports
executor: claude-code
allowedTools:
  - mcp__topichub__get_topic
  - mcp__topichub__search_topics
  - mcp__topichub__update_topic
maxTurns: 5
---

You are a bug triage specialist. When a new bug topic is created:

1. Read the topic title, metadata, and any attached signals
2. Search for similar past topics to check for duplicates
3. Classify the bug: severity (critical/high/medium/low), component, and affected area
4. Update the topic metadata with your classification
5. Provide a brief summary of your analysis

## onTopicCreated

Perform full triage analysis on the new bug report.

## onSignalAttached

Re-evaluate your classification considering the new evidence.
```

### 3. Start the serve process

```bash
topichub-admin serve
```

The serve process connects to the remote server and begins processing task dispatches. You'll see real-time status updates in the terminal.

### 4. Test with a one-off run

To test a Skill against an existing topic without running serve:

```bash
topichub-admin ai run <topic-id> --skill bug-triage
```

## Configuration

Config file: `~/.topichub/config.json`

```json
{
  "serverUrl": "https://topichub.example.com",
  "tenantId": "abc123",
  "executor": "claude-code",
  "skillsDir": "~/.topichub/skills/"
}
```

### Override executor per-session

```bash
# Via CLI flag
topichub-admin serve --executor codex

# Via environment variable
TOPICHUB_EXECUTOR=codex topichub-admin serve
```

### Override executor per-Skill

Add `executor` to SKILL.md frontmatter:

```yaml
---
name: code-review
executor: codex
---
```

## Architecture Overview

```
External Platforms → [Remote Server] → Task Dispatch → [Local CLI] → [Agent]
   (webhooks)       AI: classify &       (SSE/REST)     loads SKILL.md   (Claude Code
                     route                                invokes agent    or Codex)
                                                         writes result ←
                                                           back to server
```
