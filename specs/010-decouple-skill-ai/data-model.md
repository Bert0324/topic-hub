# Data Model: Decouple Skill AI

## Modified Entities

### EnrichedPayload (embedded in TaskDispatch)

**Change**: Add `skillInstructions` field to carry SKILL.md content in dispatch payloads.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | `TopicSnapshot` | Yes | Existing — full topic snapshot |
| `event` | `EventContext` | Yes | Existing — triggering event context |
| `aiClassification` | `AiClassification` | No | Existing — unused, retained for backward compat |
| `skillInstructions` | `SkillInstructions` | No | **New** — parsed SKILL.md content for the agent |

### SkillInstructions (new embedded class)

Carries the resolved SKILL.md instruction content for local agent execution. Embedded within `EnrichedPayload`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `primaryInstruction` | `string` | Yes | Resolved instruction text — event-specific section content if matched, otherwise full SKILL.md body. This is what the agent should use as its primary system prompt. |
| `fullBody` | `string` | Yes | Complete SKILL.md body (entire markdown content after frontmatter). Provides supplementary context even when an event-specific section is the primary instruction. |
| `eventName` | `string` | No | Lifecycle event name matched (e.g., `onTopicCreated`). Absent when no event-specific section was matched (full body used as primary). |
| `frontmatter` | `object` | Yes | SKILL.md frontmatter fields: `name`, `description`, optional `executor`, `maxTurns`, `allowedTools`, `topicType`. |

**Relationships**:
- Embedded in `EnrichedPayload` → embedded in `TaskDispatch`
- Sourced from `SkillMdParser` output / `SkillRegistry.skillMdCache`

### Timeline Entries (existing — new source patterns)

No schema change. Standalone AI API endpoints will create timeline entries using:

| Field | Value |
|-------|-------|
| `actionType` | `TimelineActionType.AI_RESPONSE` (existing enum value) |
| `actor` | `ai:summarize` or `ai:assistant` (distinguishes from Skill-driven `ai:<skillName>`) |
| `payload` | `{ operation: 'summarize' | 'ask', content: string, model: string, usage: AiUsage, question?: string }` |

## Unchanged Entities

### TaskDispatch
No top-level field changes. The only modification is to the embedded `EnrichedPayload` (adding `skillInstructions`).

### AiService / AiConfig / AiUsageRecord
Fully retained. AiService continues to be instantiated on the server. Usage records are created by standalone API calls using `skillName: 'ai:summarize'` or `skillName: 'ai:assistant'`.

### SkillRegistration
No changes. The `skillMd` field (stored during registration) already contains the parsed SKILL.md data. This is the source for populating dispatch `skillInstructions`.

### TenantSkillConfig
No changes. The `__ai__` config entry continues to control per-tenant AI enablement and rate limits — now for standalone API endpoints.

## State Transitions

### Dispatch Pipeline (updated)

```
Topic Event → SkillPipeline.execute()
  ├─ runTypeSkillHook()     [unchanged]
  ├─ ██ runSkillAi() ██     [REMOVED]
  ├─ createTaskDispatch()   [enriched with skillInstructions]
  └─ runBridgeNotifications() [unchanged]
```

### Standalone AI Request Flow (new)

```
CLI ai summarize <id> → POST /api/v1/ai/summarize
  → TopicHub.ai.summarize(tenantId, topicId)
    → AiService.complete() [rate limit, circuit breaker, usage tracking]
    → TimelineEntry.create() [actionType: AI_RESPONSE, actor: ai:summarize]
  ← { summary, timelineEntryId }
```
