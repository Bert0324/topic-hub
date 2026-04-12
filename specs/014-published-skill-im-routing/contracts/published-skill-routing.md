# Contract: Published skill routing (IM slash)

## Router precedence (first match wins)

1. **Global / topic built-ins** — unchanged list (`create`, `help`, `search`, `update`, …).
2. **Published Skill Center name** — token equals a catalog-published skill `name` (case-insensitive).
3. **Disk-loaded SkillRegistry name** — token matches locally loaded skill on API host (current behavior).
4. **Otherwise** — if message is slash-shaped inside topic group: **`relay`** handler with routing hint (see im-dispatch-payload.md).

## Inputs

- Normalized IM command string (`imChatLine`) after bridge purification.
- `ParsedCommand.action` — first token without leading `/`.

## Outputs

| Route | `handler` | `skillInvocationName` |
|-------|-----------|------------------------|
| Published match | `skill_invoke` | Canonical `name` from DB |
| Disk match | `skill_invoke` | Registry canonical name |
| No match, slash in topic | `relay` | _unset_ |

## Errors

- Unknown built-in: unchanged `Unknown command` path for slash without topic.

## Freshness

- Published set cache **default TTL 60s**; **must** invalidate on successful publish, delete, or rename affecting `name`.
