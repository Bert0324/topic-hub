# Feature Specification: Simplify Core Integration Surfaces

**Feature Branch**: `017-simplify-core-integration`  
**Created**: 2026-04-12  
**Status**: Draft  
**Input**: User description: "简化 core 接入方式：1) 仅保留两个接口点：OpenClaw bridge 与 Topic Hub 自身；2) 可在两个被接入方的路由下被接入；3) 通过配置使其可以工作；4) CLI 可通过配置 base URL 使用，例如 `https://localhost/common-prefix`"

## Clarifications

### Session 2026-04-12

- Q: What shape must the server-side “two integration surfaces” take for acceptance? → A: **Exactly two HTTP route entry points**, both implemented in `packages/server/src/api.controller.ts`, in one-to-one correspondence with the OpenClaw bridge surface and the native Topic Hub surface. Integrators satisfy this feature by wiring **only** those routes (plus configuration such as public base address / path prefix). A separate demo directory tree or env “profile bundles” is **not** part of the acceptance contract for the dual-surface ingress itself.
- Q: How does the CLI use base URL, and how many public ingress routes does native Topic Hub expose beyond that? → A: The CLI uses **one** configured base URL for **all** native-side integration traffic (“对接”). The **native Topic Hub** surface exposes **exactly one** public HTTP ingress route; capabilities that previously looked like many separate public paths are handled **internally** behind that route (not as additional integration-class ingress). The OpenClaw bridge surface remains the **second** single-route ingress for IM/bridge traffic, also in `packages/server/src/api.controller.ts`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Host Topic Hub under a path prefix (Priority: P1)

An operator runs Topic Hub behind a reverse proxy or nested under another product’s URL space. They set a single base address (scheme, host, optional path prefix) so that all outbound references and inbound expectations line up with that deployment shape.

**Why this priority**: Without correct path-aware addressing, webhooks, links, and CLI calls fail in real deployments.

**Independent Test**: Configure a non-root base address, run a minimal documented flow from the CLI using **only** that base URL against the **single** native Topic Hub ingress route, and confirm responses match the configured prefix.

**Acceptance Scenarios**:

1. **Given** a deployment where Topic Hub is reachable only under a path prefix, **When** the operator sets the documented base-address configuration, **Then** the command-line tool can complete native-side integration using **that single base URL** (including prefix) without per-command host/path overrides and without discovering extra native **integration-class** paths beyond the one documented ingress.
2. **Given** the same configuration, **When** an external system calls the **two** core integration ingress routes using the prefix, **Then** requests are accepted consistently with the configured public base address.

---

### User Story 2 - Choose integration surface by host product (Priority: P1)

An integrator embeds Topic Hub capabilities into either an OpenClaw bridge–style deployment or a native Topic Hub deployment. They select which of the two supported integration surfaces applies, and behavior matches that choice without extra undocumented entry points.

**Why this priority**: Reduces integration ambiguity and support burden; matches the product goal of exactly two supported surfaces.

**Independent Test**: For each supported surface, follow the documented configuration checklist and confirm representative traffic succeeds through **that surface’s single ingress route** in `packages/server/src/api.controller.ts` (e.g., webhook or native ingress receipt).

**Acceptance Scenarios**:

1. **Given** configuration for the OpenClaw bridge integration surface, **When** traffic arrives through that surface’s **single** documented ingress route, **Then** core behavior works without requiring the native Topic Hub surface for the same traffic.
2. **Given** configuration for the native Topic Hub integration surface, **When** traffic arrives through that surface’s **single** documented ingress route, **Then** core behavior works without requiring the bridge surface for the same traffic.

---

### User Story 3 - Mount under either party’s routing model (Priority: P2)

A team already operates routing for OpenClaw bridge or Topic Hub. They mount the integration under their existing route tree (not necessarily at domain root) using only configuration, without forking routing rules per deployment.

**Why this priority**: Enables adoption without restructuring the host’s public URL layout.

**Independent Test**: Mount under two different example path layouts (one per host type) in a staging environment and run the same smoke scenarios.

**Acceptance Scenarios**:

1. **Given** a host that owns the URL namespace for OpenClaw bridge, **When** the operator applies the documented routing and base-address settings, **Then** inbound and outbound paths remain consistent with that host’s routes.
2. **Given** a host that owns the URL namespace for native Topic Hub, **When** the operator applies the documented routing and base-address settings, **Then** inbound and outbound paths remain consistent with that host’s routes.

---

### User Story 4 - Verify the two-file-local integration routes (Priority: P2)

A reviewer confirms that **core host integration** is exposed only as **two documented HTTP ingress routes**, both living in `packages/server/src/api.controller.ts`, and that configuration (including optional path prefix / public base address) makes both routes reachable from the integrator’s reverse proxy or host product without hunting for extra integration-only entry points.

**Why this priority**: Matches the product constraint that “simplified core integration” is literally two ingress routes in one server file, reducing drift and review surface.

**Independent Test**: From documentation alone, issue one representative inbound request per route (or equivalent documented probe) through the configured public base address.

**Acceptance Scenarios**:

1. **Given** documentation lists Route A (native Topic Hub ingress) and Route B (OpenClaw bridge ingress) in `packages/server/src/api.controller.ts`, **When** the operator applies a non-root public base address / prefix per configuration guide, **Then** both routes remain the **only** HTTP paths required to validate “integration complete” for this feature.
2. **Given** the same two-route contract, **When** an integrator searches the server module for additional **integration-class** ingress beyond these two, **Then** none are required for acceptance of this feature (other product or admin routes may exist elsewhere but are out of scope for the dual-surface ingress count).

---

### Edge Cases

- The OpenClaw bridge inbound URL may use a different public origin than the CLI’s native base URL (e.g., bridge terminates on another host); documentation states how operators configure both without implying extra native integration routes.
- Base address is missing a trailing slash where the host expects one (or the reverse): behavior is documented and stable (redirect or canonical form).
- Base address includes extra path segments beyond the documented prefix: documented error or rejection with a clear operator-facing message.
- Operator switches integration surface or base address: documented steps to avoid stale registrations or broken callbacks.
- TLS termination at a proxy differs from the internal service URL: configuration documents how the public base address relates to internal routing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST expose exactly two supported integration surfaces for “core” capabilities: one aligned with OpenClaw bridge usage patterns, and one aligned with native Topic Hub usage patterns. No additional supported integration surfaces are required for this feature.
- **FR-002**: Each integration surface MUST map to **exactly one** HTTP ingress route, and **both** ingress routes MUST be implemented in `packages/server/src/api.controller.ts`. Together they form the **complete** set of HTTP ingress routes that count toward the “two integration surfaces” contract for this feature (each surface: one route, one handler entry point in that file). For the **native Topic Hub** surface, that single route is the **only** public ingress through which CLI and similar clients integrate; all other native-side behaviors required for those flows MUST be handled **internally** (same process / private dispatch) rather than as additional public integration routes.
- **FR-003**: Operators MUST be able to configure which integration surface is active for a given deployment (or logical instance), so that behavior matches the selected surface.
- **FR-004**: Operators MUST be able to configure a single logical base address (including optional path prefix) such that clients that respect this configuration construct correct URLs for that deployment.
- **FR-005**: The command-line tool MUST accept **one** configurable base address (same conceptual shape as an example like `https://localhost/common-prefix`) and use it as the **sole** root for **all** native-side server traffic needed for integration (“对接”), without secondary base URLs, host overrides, or repeating path prefixes on every subcommand when documented otherwise. All such traffic targets the **single** native Topic Hub ingress route under that base.
- **FR-006**: The same core capabilities MUST remain reachable when the service is mounted under either host product’s route layout, provided configuration matches the actual public routing.
- **FR-007**: Documentation MUST describe how base-address and integration-surface settings interact so operators can set both without guesswork.
- **FR-008**: Documentation MUST describe how to validate the two-surface model by exercising **only** the two ingress routes in `packages/server/src/api.controller.ts` (plus required configuration). No separate demo package layout, profile bundle tree, or additional integration-only HTTP entry points are required for acceptance of the simplified dual-surface ingress.

### Key Entities *(include if feature involves data)*

- **Integration surface**: A named, supported way core capabilities are exposed to callers (bridge-oriented vs native Topic Hub); selected by configuration.
- **Base address**: The operator-configured canonical origin and optional path prefix used by clients and documentation to refer to one deployment.
- **Host routing context**: The URL layout owned by the embedding product (OpenClaw bridge host or Topic Hub host) under which inbound paths are registered.
- **Core integration ingress route**: One of the two documented HTTP paths implemented in `packages/server/src/api.controller.ts` that carries inbound traffic for exactly one integration surface (bridge vs native). The **native** ingress route acts as the **only** public entry for CLI-oriented integration; internal fan-out to domain logic is not counted as additional ingress routes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a controlled test, an operator can complete documented “first connection” steps from the CLI using **only one** configured base address (including a non-root prefix), targeting the **single** native ingress route, within one short session (under 15 minutes for a prepared operator following the guide).
- **SC-002**: For each of the two integration surfaces, a prepared integrator can run the documented smoke checklist and achieve passing results without using any third integration entry point.
- **SC-003**: At least two distinct path-prefix layouts (one per host type in the requirements) are verified in documentation or release notes as supported examples.
- **SC-004**: Misconfiguration of base address or surface selection yields an operator-recognizable outcome (clear message or documented diagnostic) in 100% of intentionally mis-set cases covered by the smoke checklist.
- **SC-005**: A reviewer who is new to the integration guide completes validation of **both** core integration ingress routes (per `packages/server/src/api.controller.ts`), including at least one non-root public base address example, in under 30 minutes using only the written checklist—without discovering a third **integration-class** HTTP ingress route required for the same contract.

## Assumptions

- “Core” refers to the shared integration boundary operators already associate with Topic Hub command routing, webhooks, and related flows; narrowing to two surfaces does not remove required safety properties from prior specs unless explicitly superseded in planning.
- OpenClaw bridge and Topic Hub native hosts may use different default path conventions; configuration compensates rather than forcing identical paths.
- Advanced or legacy integration paths outside these two surfaces are explicitly out of scope for support guarantees in this release; migration notes may point operators to the two supported options.
- Acceptance of the simplified integration model is anchored on the **two ingress routes** in `packages/server/src/api.controller.ts`; reproducing pre-change Topic Hub or third-party integration wiring is not required.
- Other HTTP controllers or routes may exist for product features (skills center, executor channels, etc.); they are **explicitly excluded** from the “two integration surfaces” ingress count unless a future feature revises that contract.
- For **native Topic Hub** integration acceptance, the CLI never depends on a matrix of public REST paths; **one** base URL plus **one** native ingress path (as joined per documentation) suffices. Any legacy-style public path sprawl is **internalized** behind that ingress for this feature’s contract.
