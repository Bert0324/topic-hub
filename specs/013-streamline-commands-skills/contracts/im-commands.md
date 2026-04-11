# IM Command Contracts

**Feature**: 013-streamline-commands-skills

## Command Surface

All commands are issued by @-mentioning the bot. No `/topichub` prefix.

### Commands That Do NOT Require Binding

| Command | Arguments | Response |
|---------|-----------|----------|
| `/help` | none | Static list of all available commands with descriptions |
| `/register` | `<pairing-code>` | Binds this IM account to the executor that generated the code. Replaces any existing binding. |

### Commands That Require Active Executor Binding

| Command | Arguments | Response |
|---------|-----------|----------|
| `/create` | `<type> [--key value...]` | Creates a new topic in the current channel |
| `/update` | `--status <status> [--key value...]` | Updates the active topic |
| `/assign` | `--user <userId>` | Assigns a user to the active topic |
| `/show` | none | Shows active topic details |
| `/timeline` | none | Shows topic timeline |
| `/reopen` | none | Reopens a closed topic |
| `/history` | none | Shows group topic history |
| `/search` | `--type <type> --status <status>` | Searches topics |
| `/use` | `<skill-name> [args...]` | Invokes a named skill on the bound executor |
| `/unregister` | none | Unbinds this IM account from its current executor |
| `/answer` | `[#N] <text>` | Answers a pending question from the executor |

### Error Responses

| Condition | Response |
|-----------|----------|
| No @-mention | Message ignored (no response) |
| `/topichub <anything>` | "Unknown command. Commands no longer use the `/topichub` prefix. Try `/help` to see available commands." |
| Unbound user sends bound-only command | "You haven't linked a local executor yet. Run `/register <code>` to get started. Use `/help` to see all commands." |
| Invalid/expired pairing code | "Invalid or expired pairing code. Get a fresh code from your local executor (`topichub-admin serve`)." |
| Executor busy (at max capacity) | "Your executor is busy processing other tasks. Please try again shortly, or `/register` to a different executor." |
| Executor offline | "Your local executor is not running. Start it with: `topichub-admin serve`" |
| Skill not found (`/use`) | "Skill '<name>' not found in the Skill Center or locally." |
