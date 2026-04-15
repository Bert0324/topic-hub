# Feature Specification: Superadmin Identity Model

**Feature Branch**: `011-superadmin-identity`  
**Created**: 2026-04-11  
**Status**: Draft  
**Input**: User description: "彻底去掉租户的概念，仅保留超管这个角色。然后第一次init的时候，就是没有任何租户的时候，会自动创建一个超管，第一个 init 的人会变成超管，然后持有一个 TOKEN，然后那个 TOKEN 就是超管的凭证。同时需要考虑到身份这个概念。比如说一个用户在多个 IM 平台进行操作的时候，他应该是有一个唯一的身份标识，那个身份标识应该是以他本地执行为主。举个例子，他一看到本地执行 COI 的时候，token，超管提前创建赋予身份。"

## Clarifications

### Session 2026-04-11

- Q: Can a single identity run multiple local executor processes simultaneously, and should they share one token or each have a separate token? → A: Each executor process gets its own sub-token scoped under the identity, allowing independent revocation and per-executor audit trails.
- Q: What does "execution security" mean for IM-triggered local tasks — user-level confirmation or technical security? → A: Technical security only (token integrity, channel authentication, anti-spoofing). Local execution permissions are out of scope for topic-hub; they are the local execution engine's responsibility.
- Q: How does the system map an IM platform action to the correct identity/executor? → A: A `register` command binds the current IM account to an identity credential. Once registered, all subsequent commands use that binding automatically. Users run `register` again to switch credentials.
- Q: Should regular identities have differentiated permission levels? → A: No. All identities are equal once provisioned. Superadmin creates users via a CLI command by providing a name and unique ID; the system outputs a token that the superadmin distributes to the user out-of-band.
- Q: How does an executor process obtain its sub-token, and how does the user use it? → A: Auto-registration on startup — the executor presents the identity token, the server issues an executor token, and it is printed to the console. The user copies this executor token and uses it with the IM `register` command to bind their IM account to that specific executor process.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-Time System Initialization (Priority: P1)

The very first person to run the system initialization command becomes the superadmin. The system detects that no superadmin exists, automatically creates a superadmin record, and returns a token that serves as the superadmin's permanent credential. This token is the sole proof of superadmin authority and must be stored securely by the operator.

**Why this priority**: This is the foundational bootstrapping flow. Without a superadmin, no other operations (identity creation, system configuration) can proceed. It is the entry point for the entire system.

**Independent Test**: Can be fully tested by running the init command on a fresh system and verifying that a superadmin record is created and a valid token is returned.

**Acceptance Scenarios**:

1. **Given** a freshly deployed system with no existing superadmin, **When** a user runs the init command, **Then** the system creates a superadmin record, generates a unique token, and returns it to the user.
2. **Given** a system that already has a superadmin, **When** another user attempts to run the init command, **Then** the system rejects the request and informs the user that the system is already initialized.
3. **Given** the init command completes successfully, **When** the superadmin uses the returned token for subsequent operations, **Then** the system recognizes the token as valid superadmin credentials.

---

### User Story 2 - Superadmin Creates User Identities (Priority: P1)

The superadmin creates user identities via a CLI command by providing a display name and a unique ID for the new user. The system creates the identity record, generates a token, and outputs it to the superadmin. The superadmin then distributes this token to the user out-of-band (e.g., via secure message). All provisioned identities have equal capabilities — there are no permission tiers.

**Why this priority**: Identities are the core concept replacing tenants. Users cannot interact with the system until the superadmin provisions their identity and hands them a token.

**Independent Test**: Can be fully tested by authenticating as superadmin, running the create-identity CLI command with a name and unique ID, and verifying that a token is generated and returned.

**Acceptance Scenarios**:

1. **Given** an authenticated superadmin, **When** the superadmin runs the create-identity command with a display name and unique ID, **Then** the system creates the identity record, generates a token, and outputs it.
2. **Given** an authenticated superadmin, **When** the superadmin provides a unique ID that already exists, **Then** the system rejects the request with a clear error.
3. **Given** an authenticated superadmin, **When** the superadmin lists all identities, **Then** the system returns all provisioned identities with their name and unique ID (but not their raw tokens).
4. **Given** a user who received their token from the superadmin, **When** they configure it in their local CLI executor, **Then** the system associates all subsequent operations from that executor with the corresponding identity.

---

### User Story 3 - Unified Identity Across Multiple IM Platforms (Priority: P2)

A single user who interacts with the system from multiple IM platforms (e.g., different chat clients, messaging services) is recognized as the same identity. When the user's local CLI executor authenticates with the identity token, all dispatches and task executions from any IM platform are attributed to the same person.

**Why this priority**: Cross-platform identity unification is essential for consistent attribution of actions, but it depends on the identity creation flow (P1 stories) being in place first.

**Independent Test**: Can be fully tested by configuring a single identity token on a local executor, sending commands from two different IM platform bindings, and verifying both actions are attributed to the same identity.

**Acceptance Scenarios**:

1. **Given** a user with a single identity and token configured on their local executor, **When** the user triggers a task from IM Platform A, **Then** the task is recorded under that user's identity.
2. **Given** the same user triggers a task from IM Platform B, **When** the system processes the task, **Then** it is recorded under the same identity as the Platform A task.
3. **Given** a superadmin viewing activity logs, **When** filtering by a specific identity, **Then** all actions from all IM platforms appear under that single identity.

---

### User Story 4 - Register and Switch Credentials on IM Platform (Priority: P2)

A user on an IM platform runs a `register` command with an **executor token** to bind their IM account to a specific executor process. After registration, all subsequent commands from that IM account are automatically routed to that executor without needing to pass credentials each time. When the user wants to switch to a different executor process (e.g., running on a different machine or with a different context), they run `register` again with the other executor token, and the binding is updated. The executor token is printed to the console when the executor process starts, so the user can copy it.

**Why this priority**: This is the primary mechanism for IM-to-executor association. Without it, users would need to pass credentials with every command, which is impractical. It also enables switching between multiple running executor processes from IM.

**Independent Test**: Can be fully tested by starting an executor process, copying the printed executor token, running `register` on an IM platform, then executing a command and verifying it is routed to the correct executor.

**Acceptance Scenarios**:

1. **Given** an IM platform user who has not registered, **When** they run `register` with a valid executor token, **Then** the system binds their IM account to that executor (and its parent identity) and confirms success.
2. **Given** an IM platform user who is already registered, **When** they send a command, **Then** the system automatically routes it to the previously bound executor without requiring credentials.
3. **Given** an IM platform user bound to Executor A, **When** they run `register` with Executor B's token, **Then** the binding switches to Executor B and subsequent commands are routed to Executor B.
4. **Given** an IM platform user who registers with a revoked or invalid executor token, **When** they run `register`, **Then** the system rejects the registration and provides a clear error.

---

### User Story 5 - Remove All Tenant-Related Functionality (Priority: P1)

All existing tenant concepts, data structures, and access control logic are removed from the system. There is no multi-tenancy — the system operates as a single-instance model where the superadmin manages all identities and configurations directly.

**Why this priority**: Removing the tenant abstraction simplifies the entire authorization model and is a prerequisite for the new superadmin-only model. Existing tenant-dependent features must be migrated or removed.

**Independent Test**: Can be fully tested by verifying that no tenant-related endpoints, data models, or configuration options exist, and that all previously tenant-scoped operations now work without tenant context.

**Acceptance Scenarios**:

1. **Given** the updated system, **When** any operation is performed, **Then** no tenant identifier is required or accepted.
2. **Given** existing data that was previously scoped to tenants, **When** the system is upgraded, **Then** the data is accessible without tenant context (migration path).
3. **Given** a user attempts to reference a tenant in any API or CLI command, **Then** the system returns a clear error indicating tenants are no longer supported.

---

### Edge Cases

- What happens if the superadmin token is lost? The system should provide a secure recovery mechanism (e.g., a one-time recovery command accessible only from the server host).
- What happens if the init command is run concurrently by two users? Only one should succeed; the other receives an "already initialized" error.
- What happens if an identity token is compromised? The superadmin should be able to revoke and regenerate a token for that identity.
- What happens to in-flight tasks when a tenant is removed during migration? They should be preserved and attributed to the corresponding identity.
- What happens when the superadmin tries to delete their own identity? The system should prevent this to avoid an unrecoverable state.
- What happens when a user starts a new executor process while others are already running? The system should issue a new executor token independently without disrupting existing processes.
- What happens if the superadmin revokes one executor token while the executor is mid-task? The in-progress task should complete, but no new tasks should be accepted on that token.
- What happens when an IM user sends a command without having registered? The system should reject the command with a message instructing them to run `register` first.
- What happens when the credential bound via `register` is later revoked by the superadmin? The next command from that IM account should fail with a clear error, and the user must re-register with a valid credential.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect on initialization whether a superadmin already exists; if not, it MUST create one and return a unique, non-guessable token.
- **FR-002**: System MUST reject subsequent initialization attempts once a superadmin exists, returning a clear message.
- **FR-003**: System MUST authenticate all privileged operations using the superadmin token.
- **FR-004**: Superadmin MUST be able to create new user identities via a CLI command by providing a display name and a unique ID; the system MUST output a generated token.
- **FR-004a**: System MUST reject identity creation if the provided unique ID already exists.
- **FR-004b**: All provisioned identities MUST have equal capabilities; there are no permission tiers beyond superadmin vs. regular identity.
- **FR-005**: Superadmin MUST be able to list, view, revoke, and regenerate tokens for any identity.
- **FR-006**: System MUST associate all operations (task dispatches, timeline entries, etc.) with the identity derived from the authenticated token, regardless of which IM platform originated the action.
- **FR-007**: System MUST remove all tenant-related data models, access checks, and configuration options.
- **FR-008**: System MUST provide a migration path for existing tenant-scoped data to the new tenant-free model.
- **FR-009**: Each identity MUST have a unique, stable identifier that persists across token regeneration.
- **FR-010**: System MUST prevent deletion of the superadmin identity to avoid unrecoverable states.
- **FR-011**: When a local CLI executor process starts, it MUST present the identity token to the server, which MUST issue a new executor token and the executor MUST print it to the console for the user to copy.
- **FR-012**: A single identity MUST be able to have multiple active executor tokens simultaneously, one per running executor process.
- **FR-013**: Superadmin MUST be able to revoke individual executor tokens without affecting other executor tokens under the same identity.
- **FR-014**: System MUST ensure that IM-to-executor communication is authenticated — only requests carrying a valid, non-revoked executor token are accepted by the local executor.
- **FR-015**: System MUST NOT govern what a local executor process can do on the host machine; local execution permissions are the responsibility of the local execution engine, not topic-hub.
- **FR-016**: System MUST provide a `register` command on IM platforms that binds the current IM account to a specific executor token, persisting the binding for all subsequent commands.
- **FR-017**: System MUST allow re-registration with a different executor token to switch the IM account's bound executor without requiring an explicit "unregister" step.
- **FR-018**: System MUST reject `register` attempts with revoked or invalid executor tokens.

### Key Entities

- **Superadmin**: The single privileged operator who bootstraps and manages the system. Created during first initialization. Holds a master token. Can create and manage all identities.
- **Identity**: A unique, platform-independent record representing a single person. Has a stable identifier, display name, creation timestamp, and status. May have multiple active executor tokens simultaneously. All actions across any IM platform are attributed to the identity.
- **Identity Token**: The primary credential issued when the superadmin creates an identity. Serves as proof of identity ownership.
- **Executor Token**: A sub-token scoped under an identity, automatically issued when an executor process starts and presents the identity token. Printed to the console for the user to copy and use with the IM `register` command. Can be independently revoked by the superadmin without affecting other executor tokens for the same identity. Provides per-executor audit trails.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System initialization completes and returns a superadmin token within 5 seconds on a fresh deployment.
- **SC-002**: A second initialization attempt is rejected within 1 second with a clear error message.
- **SC-003**: Superadmin can create a new identity and receive its token in a single command, completing within 3 seconds.
- **SC-004**: Actions originating from different IM platforms for the same identity token are attributed to the same identity with 100% accuracy.
- **SC-005**: After migration, all previously tenant-scoped data is accessible without any tenant context.
- **SC-006**: No tenant-related concepts appear in any user-facing command, message, or output after the change.
- **SC-007**: Token revocation takes effect immediately — any subsequent request with the revoked token is rejected.
- **SC-008**: When a local executor process starts, an executor token is printed to the console within 3 seconds, and using it with `register` on an IM platform successfully binds IM commands to that executor.

## Assumptions

- The system is a single-instance deployment; there is no need for multi-tenancy or federation.
- The superadmin operates from a trusted environment and is responsible for securely distributing identity tokens to users.
- Identity tokens are long-lived by default; expiration policies may be added in a future iteration.
- The local CLI executor is the primary authentication context — the identity token is configured locally and presented with each request.
- Existing tenant-scoped data can be flattened into the global scope without data conflicts (e.g., no overlapping topic names across tenants).
- The superadmin token recovery mechanism (for lost tokens) will be designed as a server-side administrative operation, not a self-service flow.
- IM platform bindings already route commands to the local executor; this feature does not change the dispatch mechanism, only how the executing user is identified.
- Local execution permissions (filesystem access, process privileges, sandboxing) are out of scope for topic-hub and are governed by the local execution engine.
