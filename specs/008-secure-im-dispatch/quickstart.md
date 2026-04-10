# Quickstart: Secure IM Dispatch

**Feature**: 008-secure-im-dispatch

## Prerequisites

- Feature 007 (OpenClaw IM Bridge) is configured and working — IM messages flow to/from Topic Hub.
- Feature 003 (Local Agent Executor) is configured — `topichub-admin init` completed, `topichub-admin serve` works.
- An IM channel is mapped to a Topic Hub tenant via OpenClaw configuration.

## Step 1: Register your IM identity

In any IM channel where the Topic Hub bot is active, send:

```
/topichub register
```

You'll receive a private message with a 6-character pairing code:

```
Your pairing code: ABC123
Enter this in your terminal: topichub-admin link ABC123
Code expires in 10 minutes.
```

## Step 2: Link your local CLI

In your terminal:

```bash
topichub-admin link ABC123
```

Output:
```
✓ Linked! Your IM identity (lark/ou_xxxxx) is now bound to this CLI.
```

## Step 3: Start your local agent

```bash
topichub-admin serve
```

The serve process will:
- Register as your exclusive executor (one per user)
- Send heartbeats every 30 seconds
- Listen for dispatches scoped to your identity

## Step 4: Send a command from IM

In any IM channel, use a `/topichub` command that creates or updates a topic so the skill pipeline emits a dispatch (with your bound `targetUserId`). For example:

```
/topichub create bug --title "Login broken"
```

(Replace `bug` with a topic type published for your tenant.)

**Note:** `/topichub run <skill>` is not registered in the command router yet; use lifecycle commands such as `create` that trigger dispatches.

You'll see status updates in IM:
1. "Task dispatched to your local agent."
2. "Task picked up by your local agent. Processing..."
3. (result summary when complete)

## Step 5: Answer agent questions (if any)

If the agent asks a question, it appears in IM:

```
🔔 Agent Question (bug-triage / Login broken)

Should I also check the auth service logs?

Reply with: /answer <your response>
```

Reply:
```
/answer Yes, check auth service and session store logs
```

## Multi-agent execution

To run multiple agent subprocesses in parallel:

```bash
topichub-admin serve --max-agents 3
```

Or set in config (`~/.topichub/config.json`):
```json
{
  "maxConcurrentAgents": 3
}
```

## Cross-platform identity

Register from additional IM platforms to bind them to the same local executor:

1. Send `/topichub register` from Slack
2. Get new pairing code
3. Run `topichub-admin link <new-code>` from the same CLI

Both Lark and Slack commands now route to your local CLI.

## Troubleshooting

**"An executor is already active for your account"**
- Your CLI crashed or is running on another machine. Wait 60 seconds for the heartbeat to expire, or use `--force`:
  ```bash
  topichub-admin serve --force
  ```

**"Your local agent is not running"**
- Start `topichub-admin serve` on your machine.

**"You haven't linked a local executor yet"**
- Run `/topichub register` in IM, then `topichub-admin link <code>` in your terminal.
