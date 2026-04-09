# Skill SDK Contracts

**Branch**: `001-topic-hub-app` | **Date**: 2026-04-09

Contracts use TypeScript-style interfaces. `ZodSchema` refers to `zod`'s schema type (`import type { ZodSchema } from "zod"`).

## Skill categories

### TypeSkill

```typescript
interface TypeSkillManifest {
  name: string;
  topicType: string;
  version: string;
  fieldSchema: ZodSchema;
  statusTransitions?: StatusTransitionMap;
  groupNamingTemplate: string;
  invitationRules?: InvitationRule[];
  customArgs?: CustomArgDefinition[];
  cardTemplate: CardTemplate;
}

interface TypeSkill {
  manifest: TypeSkillManifest;

  // Lifecycle hooks (all optional)
  onTopicCreated?(ctx: TopicContext): Promise<void> | void;
  onTopicUpdated?(ctx: TopicContext): Promise<void> | void;
  onTopicStatusChanged?(
    ctx: TopicContext & { from: TopicStatus; to: TopicStatus }
  ): Promise<void> | void;
  onTopicAssigned?(ctx: TopicContext & { userId: string }): Promise<void> | void;
  onTopicClosed?(ctx: TopicContext): Promise<void> | void;
  onTopicReopened?(ctx: TopicContext): Promise<void> | void;
  onSignalAttached?(ctx: TopicContext & { signal: SignalData }): Promise<void> | void;
  onTagChanged?(
    ctx: TopicContext & { added?: string[]; removed?: string[] }
  ): Promise<void> | void;

  renderCard(topic: TopicData): CardData;
  validateMetadata(metadata: unknown): ValidationResult;
}
```

### PlatformSkill

```typescript
type PlatformCapability = "group_management" | "push" | "commands";

interface PlatformSkillManifest {
  name: string;
  platform: string;
  version: string;
  capabilities: PlatformCapability[];
  webhookPath?: string;
}

interface PlatformSkill {
  manifest: PlatformSkillManifest;

  createGroup?(params: CreateGroupParams): Promise<GroupResult>;
  archiveGroup?(params: ArchiveGroupParams): Promise<void>;
  inviteToGroup?(params: InviteParams): Promise<void>;

  postCard?(params: PostCardParams): Promise<PostCardResult>;
  updateCard?(params: UpdateCardParams): Promise<void>;
  pinCard?(params: PinCardParams): Promise<void>;

  /** Returns a command for the hub to execute, or null if the webhook is ignored. */
  handleWebhook?(payload: unknown): CommandResult | null | Promise<CommandResult | null>;
  sendMessage?(params: SendMessageParams): Promise<void>;

  /** Resolve tenant id from an incoming webhook payload when not implicit in the route. */
  resolvetenantId?(webhookPayload: unknown): string | Promise<string>;
}
```

> **Note**: `CreateGroupParams`, `ArchiveGroupParams`, `InviteParams`, `PostCardParams`, `UpdateCardParams`, `PinCardParams`, `SendMessageParams`, `GroupResult`, and `PostCardResult` are implementation-defined parameter/result shapes per platform; they are not expanded in this contract.

### AuthSkill

```typescript
interface AuthSkillManifest {
  name: string;
  version: string;
}

interface AuthorizeParams {
  /** Verified via JWKS — not a raw token. */
  user: UserIdentity;
  action: string;
  tenantId: string;
  topicContext?: any;
}

interface AuthResult {
  allowed: boolean;
  reason?: string;
  /** Ready-to-copy CLI command shown to the user when access is denied. */
  suggestedCommand?: string;
}

interface AuthSkill {
  manifest: AuthSkillManifest;
  authorize(params: AuthorizeParams): AuthResult | Promise<AuthResult>;
  getCommands?(): SkillCommand[];
  runSetup?(ctx: SetupContext): Promise<void> | void;
}
```

### AdapterSkill

```typescript
interface AdapterSkillManifest {
  name: string;
  sourceSystem: string; // e.g. "github", "jenkins"
  version: string;
  webhookPath: string;
  supportedEvents: string[];
}

interface AdapterSkill {
  manifest: AdapterSkillManifest;
  transformWebhook(
    payload: unknown,
    headers: Record<string, string | string[] | undefined>
  ): TopicEventPayload | null | Promise<TopicEventPayload | null>;
  runSetup?(ctx: SetupContext): Promise<void> | void;
}
```

### SetupContext

```typescript
interface SetupContext {
  tenantId: string;
  prompt(question: string, options?: { choices?: string[] }): Promise<string>;
  openBrowser(url: string): void;
  storeSecret(key: string, value: string): void;
  log(message: string): void;
}
```

### SkillCommand (for `getCommands()`)

```typescript
interface ArgDefinition {
  name: string;
  description: string;
  required?: boolean;
  type?: "string" | "number" | "boolean" | "user";
}

interface SkillCommandContext {
  tenantId: string;
  user: UserIdentity;
  /** CLI may pass parsed flags and positional args. */
  rawArgs: Record<string, unknown>;
}

interface SkillCommand {
  name: string;
  description: string;
  args: ArgDefinition[];
  handler(
    args: Record<string, unknown>,
    ctx: SkillCommandContext
  ): Promise<void>;
}
```

## Shared types

```typescript
interface TopicData {
  tenantId: string;
  id: string;
  type: string;
  title: string;
  sourceUrl: string | null;
  status: TopicStatus;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  assignees: string[];
  tags: string[];
  signals: SignalData[];
  groups: TopicGroupData[];
}

type TopicStatus = "open" | "in_progress" | "resolved" | "closed";

interface TopicContext {
  topic: TopicData;
  actor: UserIdentity;
  timestamp: Date;
}

interface SignalData {
  id: string;
  label: string;
  url: string;
  description?: string;
}

interface TopicGroupData {
  platform: string;
  groupId: string;
  groupUrl: string | null;
}

interface CardData {
  title: string;
  fields: CardField[];
  actions?: CardAction[];
  status: TopicStatus;
}

interface CardField {
  label: string;
  value: string;
  type: "text" | "link" | "user" | "datetime" | "badge";
}

interface CardAction {
  label: string;
  command: string;
}

interface CardFieldDefinition {
  key: string;
  label: string;
  type: CardField["type"];
}

interface CardTemplate {
  headerTemplate: string;
  fields: CardFieldDefinition[];
  actions: CardAction[];
}

interface UserIdentity {
  /** IM user ID (from verified JWT claims). */
  id: string;
  /** Which IM platform issued the identity. */
  platform: string;
  displayName: string;
  email?: string;
  /** `true` if the JWT was verified via JWKS. */
  verified: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors?: { field: string; message: string }[];
}

interface CommandResult {
  action: string;
  type?: string;
  args: Record<string, unknown>;
  groupId: string;
  platform: string;
  userId: string;
}

/** Normalized event emitted by an Adapter Skill for ingestion or internal processing. */
interface TopicEventPayload {
  tenantId?: string;
  type: string;
  title: string;
  sourceUrl?: string | null;
  status?: TopicStatus;
  metadata?: Record<string, unknown>;
  tags?: string[];
  assignees?: string[];
  externalId?: string;
  raw?: Record<string, unknown>;
}

type StatusTransitionMap = Record<TopicStatus, TopicStatus[]>;

interface InvitationRule {
  field: string;
  autoInvite: boolean;
}

interface CustomArgDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "user";
  required: boolean;
  description: string;
}
```

## Skill registration flow

1. **Platform Admin**: `topichub-admin skill install <pkg>` → server loads the package and records a global Skill installation → **`POST /admin/skills`**.
2. **Tenant Admin**: `topichub-admin skill enable <name>` → enables or configures the Skill for the current tenant → **`PATCH /admin/tenants/:tid/skills/:name`** (body includes enabled flag and optional config).
3. **Tenant Admin**: `topichub-admin skill setup <name>` → runs interactive setup for that tenant → **`Skill.runSetup(ctx)`** with `SetupContext.tenantId` set to `:tid`.

Uninstall at platform scope uses **`DELETE /admin/skills/:name`**; tenant disable uses **`PATCH /admin/tenants/:tid/skills/:name`** with `enabled: false`.
