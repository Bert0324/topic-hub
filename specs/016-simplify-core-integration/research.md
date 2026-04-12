# Research: 016 Simplify Core Integration

## 1. Native gateway envelope shape

**Decision**: Use **versioned JSON POST** body `{ "v": 1, "op": "<snake_case>", "idempotencyKey"?: string, "payload": { … } }` with **per-op Zod schema** in `@topichub/core`, routed by a small registry (map `op` → handler).

**Rationale**:

- One URL can multiplex all CLI operations without ambiguous HTTP method semantics.
- Zod matches existing codebase patterns (`OpenClawWebhookPayloadSchema`, dispatch schemas).
- Idempotency key optional hook for safe retries on flaky networks.

**Alternatives considered**:

- GraphQL single endpoint — heavier dependency and learning curve; rejected.
- Raw REST with single `/rpc/:op` path param — workable but worse cache/logging ergonomics than body `op`.
- tRPC — extra stack coupling; rejected for this pass.

## 2. Where gateway logic lives

**Decision**: Implement **`NativeIntegrationGateway`** (name TBD) in `packages/core/src/gateway/` (or `native-gateway/`) as **pure functions + service injection**; `packages/server` handler only parses body, calls `hub.getHub().nativeGateway.handle(envelope)`, maps errors to HTTP.

**Rationale**: Keeps Nest layer thin (constitution: single responsibility); tests run without Nest.

**Alternatives considered**:

- All logic in Nest controller — rejected (bloated file, harder unit tests).

## 3. Global path prefix

**Decision**: Read `TOPICHUB_HTTP_PREFIX` (example name) from env; if set, `app.setGlobalPrefix(prefix)` in `main.ts` **without** leading/trailing slash ambiguity documented in `quickstart.md`. CLI `serverUrl` includes full path prefix (e.g. `https://localhost/th`).

**Rationale**: Native Nest feature; one knob for all routes including `/webhooks/openclaw`.

**Alternatives considered**:

- Manual prefix in every controller — error-prone; rejected.

## 4. OpenClaw bridge route

**Decision**: Keep **dedicated** `POST /webhooks/openclaw` (under global prefix when configured) as the **sole** bridge integration ingress; continue using `TopicHubService` → `webhook.handleOpenClaw`.

**Rationale**: IM platforms and OpenClaw relay already target this shape (`start-local.sh`); changing path would churn external configs unnecessarily—still “one route” in spec terms.

## 5. IM → identity → executor safety

**Decision**: Preserve and **test** the chain: verified inbound payload → `resolveUserByPlatform` → `topichubUserId` → dispatch / reply paths. Add **explicit** tests for: (a) spoofed platform string, (b) userId mismatch after binding, (c) claim with wrong executor token, (d) replay without idempotency where dangerous.

**Rationale**: Planning input requires “不能发错消息”; strongest lever is binding + token checks at claim/send boundaries.

**Alternatives considered**:

- Cryptographic per-message user attestation from IM providers — not uniformly available; deferred.

## 6. Deprecation of public `/api/v1/*` for CLI

**Decision**: Per spec (“无需兼容旧版”), remove CLI dependence on `/api/v1/...` in the same change series once gateway parity is reached; server routes deleted or return **410** with message pointing to gateway—pick one in implementation tasks.

**Rationale**: Avoid dual maintenance and security foot-guns (forgotten old path).
