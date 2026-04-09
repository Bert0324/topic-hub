# Data Model: AI-Driven Skills

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10
**Database**: MongoDB 7 | **ODM**: Typegoose + Mongoose

## Entity Relationship Diagram

```text
┌─────────────────────┐
│       Tenant        │
│  (from 001)         │
└──────────┬──────────┘
           │ 1
           │ N
           ▼
┌────────────────────────┐
│    AiUsageRecord       │
│  tenantId (FK)         │
│  skillName             │
│  periodStart (hourly)  │
│  count, totalTokens    │
└────────────────────────┘
```

**Legend**: `AiUsageRecord` is the only new entity. Tracks per-tenant, per-Skill AI usage in hourly time buckets. No modifications to existing entities.

---

## 1. `ai_usage_records` collection

```typescript
@index({ tenantId: 1, skillName: 1, periodStart: 1 }, { unique: true })
@index({ tenantId: 1, periodStart: -1 })
@modelOptions({
  schemaOptions: {
    collection: 'ai_usage_records',
    timestamps: false,
  },
})
class AiUsageRecord {
  @prop({ required: true, index: true })
  tenantId!: string;

  @prop({ required: true })
  skillName!: string;

  @prop({ required: true })
  periodStart!: Date;

  @prop({ required: true, default: 0 })
  count!: number;

  @prop({ default: 0 })
  totalTokens!: number;
}
```

---

## Query Patterns

| Operation | Query | Index used |
|-----------|--------|------------|
| Rate limit check | `AiUsageRecord.aggregate([{ $match: { tenantId, periodStart } }, { $group: { _id: null, total: { $sum: '$count' } } }])` | `{ tenantId: 1, skillName: 1, periodStart: 1 }` |
| Increment usage | `AiUsageRecord.findOneAndUpdate({ tenantId, skillName, periodStart }, { $inc: { count: 1, totalTokens: N } }, { upsert: true })` | `{ tenantId: 1, skillName: 1, periodStart: 1 }` unique |
| Usage report | `AiUsageRecord.find({ tenantId, periodStart: { $gte: since } }).sort({ periodStart: -1 })` | `{ tenantId: 1, periodStart: -1 }` |
| Usage by Skill | `AiUsageRecord.aggregate([{ $match: { tenantId, periodStart: { $gte: since } } }, { $group: { _id: '$skillName', total: { $sum: '$count' }, tokens: { $sum: '$totalTokens' } } }])` | `{ tenantId: 1, skillName: 1, periodStart: 1 }` |

---

## Concurrency Handling

**Usage tracking**: `findOneAndUpdate` with `$inc` on hourly bucket. Unique compound index ensures one document per bucket. `$inc` is atomic — no read-before-write race.

## Per-Tenant AI Configuration

Per-tenant AI settings (enabled, rate limit) are stored in the existing `tenant_skill_configs` collection using a reserved skill name `__ai__`:

```typescript
// Stored as TenantSkillConfig with skillName = '__ai__'
{
  tenantId: 'ten_01',
  skillName: '__ai__',
  enabled: true,
  config: {
    rateLimit: 100  // requests per hour
  }
}
```

No new collection needed for tenant AI config — reuses the existing per-tenant config mechanism.
