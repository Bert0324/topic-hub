# Contract: IM dispatch enriched payload extensions

## Location

Inside `enrichedPayload.event.payload` (alongside existing `text`, `imText`, `slashArgs`, etc.).

## Field: `publishedSkillRouting` (optional)

Present only when the server intentionally signals how the first slash token matched the **Skill Center catalog**.

| Shape | When |
|-------|------|
| `{ "status": "hit", "name": "<canonical>" }` | Optional diagnostic; may be omitted if `skillName` on dispatch suffices. |
| `{ "status": "miss", "token": "<first-token>" }` | **Required** for relay path when token was not built-in and not published (per FR-004 / SC-005). |

**Rules**:

- `token` MUST equal the parsed first command token (no `/` prefix).
- Values MUST NOT include secrets (no tokens, no pairing codes).
- UTF-8 safe strings only.

## Executor consumption

- Local `serve` / task processor SHOULD prepend a short system prefix when `status === 'miss'`, e.g. inform the model: “No published Skill Center skill matched `<token>`; proceed using local skills / general instructions.”

## Tests

- Assert JSON shape on relay-miss fixture.
- Assert field absent on normal freeform relay (no leading slash intent).
