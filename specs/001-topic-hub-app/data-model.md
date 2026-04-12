# Data Model: Topic Hub App

**Branch**: `001-topic-hub-app` | **Date**: 2026-04-09  
**Database**: MongoDB 7 | **ODM**: Typegoose + Mongoose

## Entity Relationship Diagram

```text
                         ┌─────────────────────┐
                         │       Tenant        │
                         │  _id, name, slug    │
                         │  apiKey, adminToken │
                         └──────────┬──────────┘
                                    │ 1
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          │ N                       │ N                       │ N
          ▼                         ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐   ┌─────────────────────────┐
│     Topic        │    │  TenantSkillConfig   │   │   TimelineEntry         │
│  tenantId (FK)   │◄───│  tenantId (FK)       │   │  tenantId (FK)          │
│  + embedded      │ 1:N│  skillName ──────────────►│  topicId (FK → Topic)   │
│    groups[]      │    │  enabled, config     │   │  timestamp, actionType  │
│    assignees[]   │    └──────────────────────┘   └─────────────────────────┘
│    tags[]        │              │
│    signals[]     │              │ skillName matches
└──────────────────┘              ▼
          │              ┌──────────────────────┐
          │              │ SkillRegistration    │  GLOBAL (no tenantId)
          └──────────────│  name (unique)       │
             topicId     │  category, version   │
                         │  modulePath, metadata│
                         └──────────────────────┘
```

**Legend**: `Topic` embeds small arrays (`groups`, `assignees`, `tags`, `signals`). `TimelineEntry` is a separate collection (unbounded, paginated per topic). `SkillRegistration` is global; per-tenant enablement and secrets live in `TenantSkillConfig`.

## Key Design Decisions

- **Multi-tenancy**: Shared database. Every top-level document in tenant-scoped collections includes `tenantId`. All application queries MUST filter by `tenantId` (and use indexes that lead with `tenantId`).
- **Embedded vs referenced**: `groups`, `assignees`, `tags`, and `signals` are **embedded** in `Topic` (small arrays, always read with the topic). `TimelineEntry` is a **separate collection** (unbounded growth, independent pagination). `SkillRegistration` and `Tenant` are **separate collections**. Per-tenant skill settings use **`tenant_skill_configs`**.
- **Skill-defined fields**: `Topic.metadata` is a `Mixed` subdocument validated at the application layer with the active **Type Skill**’s Zod schema.

---

## Enums

```typescript
enum TopicStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

enum TimelineActionType {
  CREATED = 'created',
  STATUS_CHANGED = 'status_changed',
  ASSIGNED = 'assigned',
  UNASSIGNED = 'unassigned',
  TAG_ADDED = 'tag_added',
  TAG_REMOVED = 'tag_removed',
  SIGNAL_ATTACHED = 'signal_attached',
  SIGNAL_REMOVED = 'signal_removed',
  SKILL_ERROR = 'skill_error',
  COMMENT = 'comment',
  REOPENED = 'reopened',
  METADATA_UPDATED = 'metadata_updated',
}

enum SkillCategory {
  TYPE = 'type',
  PLATFORM = 'platform',
  AUTH = 'auth',
  ADAPTER = 'adapter',
}
```

**Topic status transitions** (default; Type Skills may constrain further):

```text
open → in_progress → resolved → closed
closed → open (reopen)
```

---

## 1. `topics` collection

```typescript
import { prop, modelOptions, index } from '@typegoose/typegoose';
import type { ReturnModelType } from '@typegoose/typegoose';
import mongoose from 'mongoose';

@index({ tenantId: 1, type: 1 })
@index({ tenantId: 1, status: 1 })
@index({ tenantId: 1, sourceUrl: 1 }, { unique: true, sparse: true })
@index({ tenantId: 1, createdAt: -1 })
@index({ tenantId: 1, tags: 1 })
@index(
  { tenantId: 1, 'groups.platform': 1, 'groups.groupId': 1 },
  { unique: true },
)
@index({ tenantId: 1, title: 'text' })
@index({ tenantId: 1, type: 1, status: 1, createdAt: -1 })
@modelOptions({
  schemaOptions: {
    collection: 'topics',
    timestamps: true,
  },
})
class Topic {
  @prop({ required: true, index: true })
  tenantId!: string;

  @prop({ required: true, index: true })
  type!: string;

  @prop({ required: true })
  title!: string;

  /** Dedup key per tenant; sparse allows multiple null/absent values */
  @prop()
  sourceUrl?: string;

  @prop({
    required: true,
    enum: TopicStatus,
    default: TopicStatus.OPEN,
  })
  status!: TopicStatus;

  /** Validated at app layer via Type Skill Zod schema */
  @prop({ type: () => mongoose.Schema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;

  @prop({ required: true })
  createdBy!: string;

  @prop()
  closedAt?: Date;

  @prop({ type: () => [TopicGroup], _id: false, default: [] })
  groups!: TopicGroup[];

  @prop({ type: () => [TopicAssignee], _id: false, default: [] })
  assignees!: TopicAssignee[];

  @prop({ type: () => [String], default: [] })
  tags!: string[];

  @prop({ type: () => [Signal], default: [] })
  signals!: Signal[];

  // createdAt, updatedAt from timestamps: true
}

class TopicGroup {
  @prop({ required: true })
  platform!: string;

  @prop({ required: true })
  groupId!: string;

  @prop()
  groupUrl?: string;

  @prop({ default: () => new Date() })
  createdAt!: Date;
}

class TopicAssignee {
  @prop({ required: true })
  userId!: string;

  @prop({ default: () => new Date() })
  assignedAt!: Date;
}

class Signal {
  @prop({
    type: () => mongoose.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  })
  _id!: mongoose.Types.ObjectId;

  @prop({ required: true })
  label!: string;

  @prop({ required: true })
  url!: string;

  @prop()
  description?: string;

  @prop({ default: () => new Date() })
  createdAt!: Date;
}
```

---

## 2. `timeline_entries` collection

```typescript
@index({ tenantId: 1, topicId: 1, timestamp: 1 })
@modelOptions({
  schemaOptions: {
    collection: 'timeline_entries',
    timestamps: false,
  },
})
class TimelineEntry {
  @prop({ required: true, index: true })
  tenantId!: string;

  @prop({ required: true, ref: () => Topic, index: true })
  topicId!: mongoose.Types.ObjectId;

  @prop({ required: true, default: () => new Date() })
  timestamp!: Date;

  @prop({ required: true })
  actor!: string;

  @prop({ required: true, enum: TimelineActionType })
  actionType!: TimelineActionType;

  @prop({ type: () => mongoose.Schema.Types.Mixed, default: {} })
  payload!: Record<string, unknown>;
}
```

---

## 3. `skill_registrations` collection (global — no `tenantId`)

```typescript
@index({ name: 1 }, { unique: true })
@index({ category: 1 })
@modelOptions({
  schemaOptions: {
    collection: 'skill_registrations',
    timestamps: { createdAt: 'installedAt', updatedAt: 'updatedAt' },
  },
})
class SkillRegistration {
  @prop({ required: true })
  name!: string;

  @prop({ required: true, enum: SkillCategory })
  category!: SkillCategory;

  @prop({ required: true })
  version!: string;

  @prop({ required: true })
  modulePath!: string;

  /**
   * Examples: topicType for Type Skills, platform for Platform Skills,
   * supportedWebhooks for Adapter Skills — shape enforced at app/CLI layer.
   */
  @prop({ type: () => mongoose.Schema.Types.Mixed, default: {} })
  metadata!: Record<string, unknown>;

  // installedAt, updatedAt from timestamps
}
```

---

## 4. `tenant_skill_configs` collection

```typescript
@index({ tenantId: 1, skillName: 1 }, { unique: true })
@modelOptions({
  schemaOptions: {
    collection: 'tenant_skill_configs',
    timestamps: true,
  },
})
class TenantSkillConfig {
  @prop({ required: true, index: true })
  tenantId!: string;

  /** Logical ref to SkillRegistration.name */
  @prop({ required: true })
  skillName!: string;

  @prop({ required: true, default: true })
  enabled!: boolean;

  /** Includes encrypted secrets at rest — encrypt/decrypt in application code */
  @prop({ type: () => mongoose.Schema.Types.Mixed, default: {} })
  config!: Record<string, unknown>;

  // createdAt, updatedAt from timestamps: true
}
```

---

## 5. `tenants` collection

```typescript
@index({ slug: 1 }, { unique: true })
@index({ apiKey: 1 }, { unique: true })
@modelOptions({
  schemaOptions: {
    collection: 'tenants',
    timestamps: true,
  },
})
class Tenant {
  @prop({ required: true })
  name!: string;

  @prop({ required: true })
  slug!: string;

  /** Ciphertext or KMS reference — treat as opaque secret in app code */
  @prop({ required: true })
  apiKey!: string;

  @prop({ required: true })
  adminToken!: string;

  @prop()
  adminTokenExpiresAt?: Date;

  // createdAt, updatedAt from timestamps: true
}
```

---

## Query Patterns

| Operation | Query | Index used |
|-----------|--------|------------|
| Resolve tenant by slug | `Tenant.findOne({ slug })` | `{ slug: 1 }` unique |
| Resolve tenant by API key | `Tenant.findOne({ apiKey })` | `{ apiKey: 1 }` unique |
| List topics by type | `Topic.find({ tenantId, type }).sort({ createdAt: -1 })` | `{ tenantId: 1, type: 1 }` + `{ tenantId: 1, createdAt: -1 }` |
| List topics by status | `Topic.find({ tenantId, status })` | `{ tenantId: 1, status: 1 }` |
| Filter type + status + recency | `Topic.find({ tenantId, type, status }).sort({ createdAt: -1 })` | `{ tenantId: 1, type: 1, status: 1, createdAt: -1 }` |
| Dedup by source URL | `Topic.findOne({ tenantId, sourceUrl })` | `{ tenantId: 1, sourceUrl: 1 }` unique sparse |
| Topics with tag | `Topic.find({ tenantId, tags: tag })` | `{ tenantId: 1, tags: 1 }` (multikey) |
| Full-text on title (scoped) | `Topic.find({ tenantId, $text: { $search: q } })` | `{ tenantId: 1, title: 'text' }` |
| Active topic for group | `Topic.findOne({ tenantId, 'groups.platform': p, 'groups.groupId': gid, status: { $ne: 'closed' } })` | `{ tenantId: 1, 'groups.platform': 1, 'groups.groupId': 1 }` |
| Group topic history | `Topic.find({ tenantId, 'groups.platform': p, 'groups.groupId': gid }).sort({ createdAt: -1 })` | `{ tenantId: 1, 'groups.platform': 1, 'groups.groupId': 1 }` |
| Timeline page | `TimelineEntry.find({ tenantId, topicId }).sort({ timestamp: 1 }).skip().limit()` | `{ tenantId: 1, topicId: 1, timestamp: 1 }` |
| List skills by category | `SkillRegistration.find({ category })` | `{ category: 1 }` |
| Get skill by name | `SkillRegistration.findOne({ name })` | `{ name: 1 }` unique |
| Tenant skill toggle / config | `TenantSkillConfig.findOne({ tenantId, skillName })` | `{ tenantId: 1, skillName: 1 }` unique |
| Insert topic | `Topic.create({ tenantId, ... })` | — |

---

## Concurrency Handling

Topic creation from webhooks or concurrent ingest must **deduplicate by tenant + `sourceUrl`** without races. Use **`findOneAndUpdate`** with **`upsert: true`** so MongoDB applies a single atomic decision per filter.

Filter must always include **`tenantId`** and **`sourceUrl`** (and any other uniqueness dimensions your upsert relies on). Example:

```typescript
const topic = await TopicModel.findOneAndUpdate(
  { tenantId, sourceUrl },
  {
    $setOnInsert: {
      tenantId,
      sourceUrl,
      type,
      title,
      status: TopicStatus.OPEN,
      createdBy,
      metadata,
      tags: [],
      groups: [],
      assignees: [],
      signals: [],
    },
    $set: { updatedAt: new Date() },
  },
  { upsert: true, new: true, runValidators: true },
);
```

On duplicate key (e.g. rare race on compound unique index), catch `MongoServerError` code **11000**, re-query with `{ tenantId, sourceUrl }`, or retry the `findOneAndUpdate` as appropriate for your handler.

The same **tenant-scoped** discipline applies to any other “at most one” logical rows (for example IM group binding) using the **`{ tenantId, 'groups.platform', 'groups.groupId' }`** unique index: use an atomic update with a filter that includes `tenantId` and the group keys.

### Group-Topic Sequential Binding

A group can host multiple topics over time, but only **one active (non-closed) topic at a time**. This constraint is enforced at the application layer before topic creation:

```typescript
const activeTopic = await TopicModel.findOne({
  tenantId,
  'groups.platform': platform,
  'groups.groupId': groupId,
  status: { $ne: TopicStatus.CLOSED },
});
if (activeTopic) {
  throw new ConflictError('Group already has an active topic');
}
```

The `{ tenantId, 'groups.platform', 'groups.groupId' }` index is **NOT unique** in the sequential model — multiple closed topics can reference the same group. The one-active-topic constraint uses an application-layer pre-creation check.

Topic history for a group (`/topichub history`):

```typescript
const history = await TopicModel.find({
  tenantId,
  'groups.platform': platform,
  'groups.groupId': groupId,
}).sort({ createdAt: -1 });
```
