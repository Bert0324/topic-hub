# Feature Specification: Published skill IM routing (no server disk copy)

**Feature Branch**: `014-published-skill-im-routing`  
**Created**: 2026-04-11  
**Status**: Draft  
**Input**: User description: "只要 publish，不拷磁盘，IM /名字 就能匹配"

## Clarifications

### Session 2026-04-11

- Q: When the first slash token is not a built-in command and not a published Skill Center name, what should happen? → A: Still forward the line to the bound local executor (relay-style path), and attach a clear, user-visible hint that **no published (remote) skill** matched that name so the local agent can adjust expectations.
- Q: How are skills managed from the CLI? → A: Use the **`skill-repo`** command family for repository-style skill management (exact subcommands defined at planning time).
- Q: Must legacy `/topichub` command prefixes remain supported? → A: **No** — no compatibility requirement for old `/topichub` style entry points.
- Q: Where do pairing codes come from, and how many IM contexts can attach? → A: **Local executor** generates pairing material; users complete binding in IM; relationship is **one local executor session to many IM bindings**; multi-process and credential-switch scenarios must preserve execution security (only the intended executor receives work for a binding).
- Q: Should `/help` require prior IM↔executor binding? → A: **No** — `/help` stays an explicit exception: fixed or templated help content available **without** prior binding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - IM slash uses published skill name (Priority: P1)

A skill author publishes a skill to the Skill Center using the normal publish flow. Without anyone copying that skill onto the API host’s skill filesystem, a user in an active topic group sends a message whose first token is that published skill’s canonical name (for example `/my-skill …` or the product’s equivalent slash form). The product treats that line as an invocation of **that** skill (not as generic freeform chat bound to the topic’s default skill).

**Why this priority**: Today, slash routing only recognizes skills loaded from the server disk; published catalog entries are invisible to routing, which breaks the mental model “I published it, so `/name` should work.”

**Independent Test**: Publish a skill that exists only in the catalog (not on server disk); from a bound IM client, send `/published_skill_name` with trailing text; observe that the work item is attributed to that skill name rather than the topic’s default skill.

**Acceptance Scenarios**:

1. **Given** a skill exists in the Skill Center under a stable canonical name and **does not** exist on the API host’s on-disk skill tree, **When** a user in a topic group sends `/canonical-name` with optional arguments, **Then** the system routes the interaction as a skill invocation for `canonical-name` (same outcome class as today when the name is present on disk).
2. **Given** the first slash token matches a built-in topic/global command (for example create), **When** the user sends that command, **Then** published-skill routing does not override the built-in command behavior.

---

### User Story 2 - Name resolution stays predictable (Priority: P2)

When the same token could match both a published catalog skill and another routing rule, the product applies a single, documented precedence so operators and authors know which handler wins.

**Why this priority**: Prevents ambiguous behavior and support churn.

**Independent Test**: Documented matrix of cases (published only, built-in only, collision) with expected route for each.

**Acceptance Scenarios**:

1. **Given** a published skill name collides only with a non-command token pattern, **When** routing runs, **Then** the published skill rule applies only where the product’s slash-command grammar says a skill name is allowed (same places as today’s disk-backed skill names).

---

### User Story 3 - Unknown slash token still reaches local executor (Priority: P3)

A user types `/made-up-skill do something` where `made-up-skill` is **not** in the Skill Center and not a built-in command. The message still reaches their **bound local executor** as executable work (so experimentation and local-only skills keep working), and the payload makes it obvious that **no published remote skill** matched the first token.

**Why this priority**: Avoids dead-end errors for typos and local-only names while keeping published routing honest.

**Independent Test**: Send `/unknown-token help me`; executor receives content plus the “no remote skill matched” hint; user can complete a short task.

**Acceptance Scenarios**:

1. **Given** no published skill exists for a slash token and it is not a reserved command, **When** a user sends `/that-token` with trailing text in a bound topic group, **Then** the product forwards the full line to the local executor path and includes the standardized hint about no published match.
2. **Given** `/help` is sent **before** any IM binding exists, **When** the product handles it, **Then** the user still receives help content (exception path; no binding prerequisite).

---

### Edge Cases

- Skill name normalization (case, allowed character set) matches whatever the publish pipeline already guarantees for public names.
- Very large number of published skills: routing decision remains bounded in time (no full scan of megabyte payloads per message).
- Private or restricted catalog entries (if the product supports them): must not become invocable via public IM unless explicitly allowed by policy.
- **Multiple local executors / credential switching**: A user may run more than one local executor process and switch which identity or token IM uses; dispatches MUST only reach the executor session that owns the active binding, and switching credentials must not leak work across sessions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST recognize IM slash lines whose first command token equals a **published** Skill Center skill’s canonical name, without requiring that skill’s files to be present on the API host’s on-disk skill directory used today for registry scans.
- **FR-002**: For lines recognized under FR-001, the product MUST produce the same **class** of downstream work as today’s skill-invocation path for disk-loaded skills (including carrying the canonical skill name and user-provided tail text/arguments to the bound executor path).
- **FR-003**: Built-in commands and existing global/topic command tables MUST retain precedence over published-skill name matching where they apply today.
- **FR-004**: If the first slash token is **not** a built-in command and **not** a published Skill Center name, the product MUST still forward the message to the **bound local executor** (relay-style execution) and MUST include a concise, standardized hint that **no published (remote) skill** matched that token (without blocking execution).
- **FR-005**: Catalog changes (publish, update, removal) MUST be reflected in routing within a documented freshness window (eventual consistency allowed if bounded and observable).
- **FR-006**: The product MUST NOT require operators to manually sync published skills to server disk **solely** for IM name matching (executor-side retrieval of instructions may still use network/API within existing security model).
- **FR-007**: **`/help`** MUST remain callable **without** prior IM↔executor binding and MUST return stable help content (exception to binding rules).
- **FR-008**: Skill repository operations exposed to users for this feature area MUST be reachable via the **`skill-repo`** CLI surface (exact verbs documented at planning time).
- **FR-009**: There is **no** requirement to preserve legacy **`/topichub`**-style command compatibility as part of this feature.

### Key Entities

- **Published skill record**: Public catalog entry with canonical name and lifecycle (active/removed).
- **IM routing context**: Topic group, binding to executor, normalized inbound line used for slash detection.
- **Routing decision**: Choice among built-in command, published skill invoke, relay with remote-match hint, or other documented paths.
- **Local executor session**: Origin of pairing codes; may serve **many** IM bindings; subject to security rules when multiple sessions or switched credentials exist.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a fresh environment where the API host’s on-disk skill tree does **not** contain a given published skill, at least **95%** of attempted `/canonical-name` invocations in acceptance tests route as that skill (vs. default topic skill), measured over a scripted matrix of names.
- **SC-002**: **100%** of built-in commands in the regression matrix continue to behave as before (no accidental capture by published-skill routing).
- **SC-003**: After unpublish/remove, **100%** of `/former-name` attempts in acceptance tests no longer match as that published skill within the documented freshness window, and those attempts still reach the local executor with the standardized “no published match” hint unless superseded by another rule.
- **SC-004**: Authoring docs can state a single sentence: “Publishing is sufficient for `/name` routing; no server disk copy required for matching,” and that statement is true in acceptance environments.
- **SC-005**: **100%** of scripted “unknown published name” cases show both (a) local executor receipt and (b) presence of the standardized hint in the executor-facing payload or companion channel message, as defined at planning time.

## Assumptions

- Published skill names remain globally unique in the catalog (consistent with existing product rules).
- Local executor continues to run model work; this feature focuses on **server-side IM routing recognition** of published names. How the executor obtains SKILL bodies (already on disk locally, fetched via API, etc.) may reuse or extend existing mechanisms without mandating a specific storage technology here.
- Security and auth for “IM triggers local work” are tightened in planning so that **multi-executor** and **credential switching** cannot cross-deliver dispatches across unintended sessions.
