# Contract: IM Commands API

## Overview

Changes to IM command handling to support the unified skill system: `/use` command for explicit skill invocation, updated `/register` flow for executor binding via `ImBinding`, and the full IM → executor resolution chain.

## IM Command Changes

### /topichub register (MODIFY)

**Before**: Generates a pairing code; user runs `topichub-admin link <code>` on CLI to bind IM account to Topic Hub user via `UserIdentityBinding`.

**After**: Two-step flow using executor token:

**Step 1 — IM side**: User sends `/topichub register` in IM chat.
- Server generates a pairing code (same as before) and replies in IM: "Your pairing code is `XXXX`. Run `topichub-admin link <code>` on your CLI within 5 minutes."

**Step 2 — CLI side**: User runs `topichub-admin link <code>`.
- CLI sends `POST /api/v1/identity/link` with:
  - Bearer: executor token (from current `serve` session) or identity token
  - Body: `{ code: "XXXX" }`
- Server claims the pairing code, resolves `(platform, platformUserId)` from it
- Server upserts `ImBinding`:
  - `platform`, `platformUserId` (from pairing code)
  - `executorToken` (from Bearer, if executor token; else null — identity-only binding)
  - `identityId` (resolved from token)
  - `active: true`
- Server replies to IM: "Linked! Commands will be routed to your executor."

**Key change**: `ImBinding` replaces `UserIdentityBinding` for IM routing. If the user links with an executor token, dispatches go to that specific executor. If linked with an identity token only, dispatches go to any active executor for that identity.

---

### /topichub register <executor-token> (NEW — alternative direct binding)

For power users who want to bind directly without the pairing code flow:

**IM side**: User sends `/topichub register <executor-token>` in IM chat.
- Server validates the executor token against `ExecutorRegistration`
- Server upserts `ImBinding` for `(platform, platformUserId)` → `executorToken`
- Replies: "Bound to executor `<hostname>:<pid>`. Future commands will route here."

**Security**: The executor token acts as proof of ownership — only someone with access to the running executor process knows the token.

---

### /topichub use <skill-name> [args] (NEW)

Invoke a specific published skill from IM.

**IM side**: User sends `/topichub use summarize-notes These are my notes...`

**Server handling**:
1. Resolve `ImBinding` for `(platform, platformUserId)` → `executorToken`, `identityId`
2. Verify executor is active (check `ExecutorRegistration.lastSeenAt`)
3. Create `TaskDispatch`:
   - `skillName`: `"summarize-notes"` (from command)
   - `targetExecutorToken`: from `ImBinding`
   - `targetIdentityId`: from `ImBinding`
   - `eventType`: `skill_invocation`
   - `enrichedPayload.event.payload`: `{ args: "These are my notes..." }`
4. Reply in IM: "Dispatched skill `summarize-notes` to your executor."

**If skill not found on server**: Still creates the dispatch — the executor may have the skill locally. The executor will fail the dispatch if it can't find the skill either.

---

### /topichub unregister (MODIFY)

**Before**: Deactivates `UserIdentityBinding`.
**After**: Deactivates `ImBinding` for `(platform, platformUserId)`. Sets `active: false`.

---

### Generic commands (e.g., /topichub <topic-command>) (MODIFY)

**Before**: Resolves `UserIdentityBinding` → `topichubUserId` → sets `dispatchMeta.targetUserId`.
**After**: Resolves `ImBinding` → `executorToken`, `identityId` → sets `targetExecutorToken`, `targetIdentityId` on dispatch.

The command parsing and topic-level handling remain the same. Only the identity/executor resolution and dispatch metadata change.

---

## Updated /api/v1/identity/link Endpoint

### POST /api/v1/identity/link (MODIFY)

**Before**: Requires tenant API key auth + `claimToken` from bearer.
**After**: Accepts executor token or identity token as bearer.

**Request**:
```
POST /api/v1/identity/link
Authorization: Bearer <executorToken or identityToken>
Content-Type: application/json

{ "code": "XXXX" }
```

**Behavior**:
1. Find and claim `PairingCode` by `code` (atomic, single-use)
2. Extract `platform`, `platformUserId` from pairing code
3. Resolve identity:
   - If bearer is executor token → look up `ExecutorRegistration` → `identityId`, `executorToken`
   - If bearer is identity token → look up `Identity` → `identityId`, `executorToken = null`
4. Upsert `ImBinding`:
   - `platform`, `platformUserId`, `executorToken`, `identityId`, `active: true`
5. Send confirmation message to IM channel (from pairing code `channel`)

**Response 200**:
```json
{
  "linked": true,
  "platform": "lark",
  "platformUserId": "u_abc123",
  "identityId": "id_xxx",
  "executorToken": "exec_yyy"
}
```

**Response 400**: Invalid or expired pairing code
**Response 401**: Invalid token

---

## IM → Executor Flow Diagram

```
User sends "/topichub use my-skill hello" in Lark
    │
    ▼
OpenClaw relay → POST /webhooks/openclaw (HMAC signed)
    │
    ▼
OpenClawBridge: verify signature, extract (platform="lark", userId="u_abc")
    │
    ▼
ImBinding.findOne({ platform: "lark", platformUserId: "u_abc", active: true })
    │  → { executorToken: "exec_yyy", identityId: "id_xxx" }
    │
    ▼
ExecutorRegistration.findOne({ executorToken: "exec_yyy", status: "active" })
    │  → check lastSeenAt > staleThreshold
    │  → if stale: reply "executor offline" and STOP
    │
    ▼
Parse command: type="use", skillName="my-skill", args="hello"
    │
    ▼
DispatchService.create({
    skillName: "my-skill",
    eventType: "skill_invocation",
    targetExecutorToken: "exec_yyy",
    targetIdentityId: "id_xxx",
    enrichedPayload: { event: { type: "skill_invocation", payload: { args: "hello" } } }
})
    │
    ▼
SSE pushes dispatch to executor "exec_yyy"
    │
    ▼
Executor claims dispatch (Bearer: exec_yyy → validated)
    │
    ▼
TaskProcessor: skill "my-skill" not in local skillsDir?
    → GET /api/v1/skills/my-skill/content → write to skillsDir
    → execute SKILL.md with agent
    │
    ▼
POST /dispatches/:id/complete (Bearer: exec_yyy)
    → increment usageCount
    → reply to IM: "Skill completed: <result summary>"
```
