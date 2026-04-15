# Contract: IM identity → executor token → dispatch → reply (security)

**See also:** [im-executor-routing.md](./im-executor-routing.md) (invariants **C1–C3** and threat table — keep this file focused on the identity chain; avoid duplicating routing detail).

## Goal

**No cross-tenant / cross-user / cross-machine execution or message leakage** when:

- Multiple IM platforms feed the same Topic Hub deployment.
- One human uses **multiple IM accounts** paired to different executors (or re-pairs).
- Multiple **local agents** (`#N`) exist inside **one** executor.

## Inbound chain (IM → Topic Hub)

1. **Bridge** builds webhook payload: `platform`, `channel` (reply target), `user` (sender id), `message`, `isDm`, `sessionId`.
2. **Webhook signature** verified (existing HMAC).
3. **Identity resolution:** lookup **`im_bindings`** with `(platform, platformUserId)`:
   - **Miss** → reject execution paths with “pair first” message; **exception:** `/help` returns static text **without** reading binding.
4. **Dispatch creation:** set **`targetExecutorToken`** from binding; attach **`sourcePlatform` + `sourceChannel`** from inbound envelope; attach parsed **`agentSlot`** if present.

## Executor fan-out

5. **SSE / poll** for executor delivers only dispatches where `targetExecutorToken` matches that runner’s token.
6. **CLI** maps `agentSlot ?? 1` to local roster entry; if invalid, fail dispatch early with user reply via same `sourceChannel`.

## Outbound chain (Topic Hub → IM)

7. **Completion / error / thread reply** uses **only** dispatch-stored `sourcePlatform` + `sourceChannel` (and platform-specific DM encoding rules already in bridge).

## Forbidden patterns

- Accepting **executorToken** or **channel** overrides from unauthenticated message bodies.
- Reusing **another dispatch’s** `sourceChannel` when sending a reply.
- Listing or completing work for `executorToken` **B** while resolving binding for user **A**.

## Test matrix (acceptance drivers)

| Case | Expect |
|------|--------|
| User A (Feishu) paired token T1 | Dispatches → T1 only |
| Same phone, Slack user B paired token T2 | Dispatches → T2 only |
| A sends `/agent list` | Sees **T1** roster, never T2 |
| Unpaired user sends `/use x` | Pairing error, no local run |
| Unpaired user sends `/help` | Static help OK |
