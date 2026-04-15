# Data Model: AI-Driven Skills

## Entity Changes

### Existing Entities (No Schema Changes)

#### Topic (`topics` collection)
No schema changes. AI responses are stored in `metadata` (already `Mixed` type) under skill-namespaced keys: `metadata._ai.{skillName}`.

#### TimelineEntry (`timeline_entries` collection)
No schema changes. AI responses use existing `payload` (already `Mixed` type) with the new `AI_RESPONSE` action type.

#### AiUsageRecord (`ai_usage_records` collection)
No changes. Existing hourly-bucketed usage tracking is reused by the SKILL.md runtime.

#### TenantSkillConfig (`tenant_skill_configs` collection)
No changes. Per-tenant AI enablement (`skillName: '__ai__'`) is reused.

---

### Modified Entity

#### SkillRegistration (`skill_registrations` collection)

New optional field to cache parsed SKILL.md metadata:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Skill unique name (existing) |
| `category` | enum(type,platform,auth,adapter) | yes | Skill category (existing) |
| `version` | string | yes | Skill version (existing) |
| `modulePath` | string | yes | Path to JS entry (existing) |
| `metadata` | Mixed | no | Category-specific metadata (existing) |
| **`skillMd`** | **SkillMdData \| null** | **no** | **Parsed SKILL.md content. `null` if skill has no SKILL.md.** |

**SkillMdData** (embedded sub-document):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | From SKILL.md YAML frontmatter `name` field |
| `description` | string | yes | From SKILL.md YAML frontmatter `description` field |
| `systemPrompt` | string | yes | Full markdown body (used as fallback system prompt) |
| `eventPrompts` | Map<string, string> | no | Event-specific sections: `{ "onTopicCreated": "...", "onTopicUpdated": "..." }`. Empty if no event sections found. |
| `hasAiInstructions` | boolean | yes | `true` if the SKILL.md has a non-empty body or event prompts |

---

### New Types (In-Memory Only)

#### ParsedSkillMd

TypeScript type for the in-memory representation of a parsed SKILL.md:

```typescript
interface ParsedSkillMd {
  frontmatter: {
    name: string;
    description: string;
  };
  systemPrompt: string;              // Full markdown body
  eventPrompts: Map<string, string>; // Event-specific sections
  hasAiInstructions: boolean;
}
```

#### SkillAiRequest

Internal type for the runtime's AI call:

```typescript
interface SkillAiRequest {
  tenantId: string;
  skillName: string;
  eventType: string;              // e.g. "onTopicCreated"
  topicSnapshot: TopicSnapshot;   // Serialized topic data
  eventContext: EventContext;      // Event metadata
}
```

#### TopicSnapshot

Serialized topic data passed as user prompt context:

```typescript
interface TopicSnapshot {
  _id: string;
  tenantId: string;
  type: string;
  title: string;
  sourceUrl?: string;
  status: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  groups: Array<{ platform: string; groupId: string }>;
  assignees: Array<{ userId: string }>;
  tags: string[];
  signals: Array<{ label: string; url?: string; description?: string }>;
  createdAt: string;
  updatedAt: string;
}
```

#### EventContext

Triggering event metadata:

```typescript
interface EventContext {
  eventType: string;   // "onTopicCreated", "onTopicUpdated", etc.
  actor: string;       // User ID or system actor
  timestamp: string;   // ISO 8601
  extra?: Record<string, unknown>; // Event-specific data (e.g., { from, to } for status changes)
}
```

---

### Enum Changes

#### TimelineActionType

Add new value:

```typescript
export enum TimelineActionType {
  // ... existing values ...
  AI_RESPONSE = 'ai_response',  // NEW
}
```

---

## Data Flow

### SKILL.md Loading (Startup)

```
SkillLoader.scanDirectory()
  → for each skill dir: check SKILL.md exists
  → SkillMdParser.parse(filePath)
    → gray-matter(fileContent) → { frontmatter, body }
    → extractEventSections(body) → Map<eventName, sectionContent>
    → return ParsedSkillMd

SkillRegistry.loadAll()
  → for each skill: loader.loadSkill(mainPath) + parsedSkillMd
  → upsert SkillRegistration with skillMd field
  → cache ParsedSkillMd in memory (Map<skillName, ParsedSkillMd>)
```

### AI Invocation (Runtime)

```
SkillPipeline.execute(tenantId, operation, topicData, actor, extra)
  → runAuthCheck(...)
  → runTypeSkillHook(...)     // existing code hooks
  → runSkillAi(...)           // NEW
    → SkillAiRuntime.executeIfApplicable(tenantId, skillName, eventType, topicData, actor, extra)
      → lookup ParsedSkillMd from cache
      → select system prompt: eventPrompts.get(eventType) ?? systemPrompt
      → if no prompt content → return (no AI call)
      → build TopicSnapshot from topicData
      → build EventContext from { eventType, actor, timestamp, extra }
      → AiService.complete({ tenantId, skillName, input: [systemMsg, userMsg] })
      → if response !== null:
        → TimelineService.addEntry(topicId, AI_RESPONSE, { skillName, content, model, usage })
        → TopicService.updateMetadata(topicId, `_ai.${skillName}`, { content, model, timestamp })
```

## Indexes

No new indexes required. Existing indexes on `timeline_entries` (`tenantId + topicId + timestamp`) and `topics` are sufficient for AI response queries.

## Validation Rules

- SKILL.md `name`: max 64 chars, lowercase letters/numbers/hyphens only (matching Cursor convention)
- SKILL.md `description`: max 1024 chars, non-empty
- SKILL.md body: non-empty if skill intends to use AI (empty body = no AI instructions)
- Event section headings: must match known lifecycle event names (`onTopicCreated`, `onTopicUpdated`, `onTopicStatusChanged`, `onTopicAssigned`, `onTopicClosed`, `onTopicReopened`, `onSignalAttached`, `onTagChanged`)
