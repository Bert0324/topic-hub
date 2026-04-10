# CLI Commands: Local Agent Executor

New and modified commands for `topichub-admin`.

---

## topichub-admin init

Interactive setup wizard. Configures local environment for server communication and agent execution.

**Flow** (linear with validation gates):

```
$ topichub-admin init

  Topic Hub — Local Environment Setup

  Step 1/5: Remote Server URL
  > Enter server URL [https://topichub.example.com]: _
  ✓ Connected (healthy, v0.1.0)

  Step 2/5: Admin Token
  > Paste your admin token: ****
  ✓ Token valid

  Step 3/5: Select Tenant
  > Choose a tenant:
    1. my-team (id: abc123)
    2. staging (id: def456)
  > Selection [1]: _
  ✓ Tenant: my-team

  Step 4/5: AI Agent Executor
  > Detected agents:
    1. claude-code (claude v4.x found at /usr/local/bin/claude)
    2. codex (codex v1.x found at /usr/local/bin/codex)
    3. none (disable AI execution)
  > Selection [1]: _
  ✓ Executor: claude-code

  Step 5/5: Skills Directory
  > Skills directory [~/.topichub/skills/]: _
  ✓ Directory exists

  ✓ Configuration saved to ~/.topichub/config.json
```

**Re-run behavior**: Shows current values as defaults. User presses Enter to keep, or enters new value.

**Flags**: None. Purely interactive.

---

## topichub-admin serve

Start persistent serve process that consumes task dispatches and executes them via the configured agent.

**Usage**:
```
topichub-admin serve [--executor <type>]
```

**Options**:

| Flag | Description | Default |
|------|-------------|---------|
| `--executor` | Override executor for this session | From config |

**Behavior**:
1. Load config from `~/.topichub/config.json`
2. Validate config completeness (exit with message if init not run)
3. Connect to remote server SSE stream (`/api/v1/dispatches/stream`)
4. On startup, poll for any unclaimed dispatches (catch-up)
5. For each dispatch: claim → load local SKILL.md → invoke agent → write result back
6. Display real-time status in terminal (Ink UI)

**Terminal display**:
```
  Topic Hub Serve — connected to https://topichub.example.com
  Tenant: my-team | Executor: claude-code | Skills: ~/.topichub/skills/

  Events:
  12:01:05  ✓  bug-triage on "Login fails on Safari" — completed (12.3s)
  12:01:18  ⋯  incident-analysis on "API 500 errors" — running...
  12:01:20  ✗  code-review on "PR #142" — failed (agent timeout)

  Status: 2 completed, 1 running, 1 failed | Uptime: 5m
```

**Exit**: Ctrl+C gracefully stops (waits for in-flight agent to finish, up to 30s).

---

## topichub-admin ai run

One-off agent execution against a specific topic.

**Usage**:
```
topichub-admin ai run <topic-id> --skill <skill-name> [--executor <type>]
```

**Options**:

| Flag | Description | Required |
|------|-------------|----------|
| `--skill` | Skill name (must have local SKILL.md) | Yes |
| `--executor` | Override executor for this run | No |

**Behavior**:
1. Load config, fetch topic from remote server
2. Load local SKILL.md for the named skill
3. Invoke agent with SKILL.md instructions + topic data
4. Write result to remote server timeline
5. Print result summary and exit

**Example**:
```
$ topichub-admin ai run 6610b... --skill bug-triage
  Executing bug-triage on "Login fails on Safari"...
  Agent: claude-code | Duration: 8.2s

  Result:
  Classification: High severity browser compatibility bug
  Component: Authentication
  Suggested action: Investigate Safari-specific cookie handling

  ✓ Timeline entry written (id: 6612c...)
```
