# Research: 015 IM multi-agent & routing security

## R-1 — IM 身份如何映射到执行令牌

**Decision**: Treat **`(platform, platformUserId)`** as the canonical IM principal. Persist **`ImBinding`** (unique on `platform + platformUserId`) storing **`topichubUserId`** and the **`claimToken`** issued at pairing time. Every webhook path that can create dispatches MUST resolve identity via **`resolveUserByPlatform(platform, userId)`** and copy **`claimToken` → `dispatchMeta.targetExecutorToken`** and **`topichubUserId` → `dispatchMeta.targetUserId`**.

**Rationale**: Matches existing `packages/core` `IdentityService` + `WebhookHandler` pattern; no cross-tenant join on display name alone; survives credential switches as a **new** `(platform, platformUserId)` row or updated binding after `/register`.

**Alternatives considered**: Server-side only “session id” without platform user id (rejected: weak for multi-account); trusting OpenClaw `channel` without user id (rejected: group messages need actor).

## R-2 — 如何保证「不能发错消息」

**Decision**: Outbound IM uses **`OpenClawBridge.sendMessage(platform, channel, text, { sessionKey })`** where **`sessionKey`** (and **`channel`**) come from the **same inbound webhook** that created the dispatch. Claim/complete notifications use **`dispatch.sourcePlatform` + `dispatch.sourceChannel`** copied at dispatch creation from that inbound context.

**Rationale**: Replies stay on the originating thread/session; avoids broadcasting completion to arbitrary chats.

**Alternatives considered**: Reply only by `channel` without `sessionKey` (rejected: breaks DMs / multi-tab OpenClaw routing).

## R-3 — 多本地进程 + IM 切账号

**Decision**: **`HeartbeatService.isBoundExecutorSessionLive(topichubUserId, boundExecutorToken)`** gates IM commands (except static `/help`): heartbeat row must be fresh **and** `claimToken` must equal the binding’s token. Starting a **new** `serve` session issues a **new** pairing code → user must **`/register`** again from that IM identity; old binding token stops matching heartbeat → executor unavailable (no silent wrong machine).

**Rationale**: Aligns with FR-010 / SC-005; explicit re-pair after executor rotation.

**Alternatives considered**: Allow any fresh heartbeat for same `topichubUserId` regardless of token (rejected: would route dispatches to wrong local process).

## R-4 — Executor API 侧强制

**Decision**: Dispatch list/claim/complete/fail endpoints require **`Authorization: Bearer <executorToken>`**; server filters/updates by **`targetExecutorToken`**. No executor may claim another user’s dispatch.

**Rationale**: Existing `api.controller` + `dispatchService` filters; keep as hard invariant in contracts/tests.

## R-5 — FR-014（多槽显式 / 单槽无感）与实现关系

**Decision**: Roster growth only in **`serve`** via **`/agent create`** path (CLI); server stores **`agentSlot`** on payload only as metadata for routing. No server-side “spawn agent per task”. UX legibility for ≥2 agents: plan adds **copy/telemetry** tasks (claim or completion line mentions **agent #N**) without changing trust model.

**Rationale**: Spec FR-014 is product/UX; security boundary unchanged (still binding + token + heartbeat).
