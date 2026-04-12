# Contract: IM `/agent` commands

## Grammar (normative intent)

Commands are normalized per existing OpenClaw / `normalizeImCommandMessage` rules (strip `@Topic Hub`, etc.).

| Command | Behavior |
|---------|----------|
| `/agent list` | Show all local agents: `#N` + label + state. Requires IM binding (same as other `/agent` subcommands). |
| `/agent create` | Add new agent at end of roster; confirm with new `#N`. |
| `/agent delete #N` | Remove slot **N** per busy policy (default: reject if busy). |
| `/help` | **No binding** required; static content only. |

## Agent selector on execution commands

**Position:** leading token after command name where applicable, e.g.:

- Plain relay / natural language: `[#N] <body>` (exact parsing rules to mirror existing `#N` patterns for `/answer` / `/queue` to reduce user surprise).
- Slash skill: `/SkillName [#N] …` or documented alternate — **one** canonical form must appear in help.

**Default:** omitting selector ⇒ **agent `#1`**.

## Examples (non-exhaustive)

```text
/agent list
/agent create
/agent delete #2
#2 please summarize the last thread
/use my-skill #2 arg1 arg2
```

## Disambiguation copy

When both **queue** and **agent** indices could appear, bot copy MUST prefix **agent** vs **queue** per spec Out of Scope note (e.g. “agent **#2**” vs “queue **#2**”).

## Implementation keys (executor payload)

- `agentSlot` — optional 1-based index on `enrichedPayload.event.payload` (see `@topichub/core` `IM_PAYLOAD_AGENT_SLOT_KEY`).
- `topichubAgentOp` / `topichubAgentDeleteSlot` — internal agent control dispatch (see `IM_PAYLOAD_AGENT_OP_KEY`, `IM_PAYLOAD_AGENT_DELETE_SLOT_KEY`).
