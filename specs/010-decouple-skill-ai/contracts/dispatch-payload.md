# Contract: Enriched Dispatch Payload

## Current Schema

```typescript
interface EnrichedPayload {
  topic: TopicSnapshot;
  event: EventContext;
  aiClassification?: AiClassification;
}
```

## Updated Schema

```typescript
interface EnrichedPayload {
  topic: TopicSnapshot;
  event: EventContext;
  aiClassification?: AiClassification;  // retained, unused
  skillInstructions?: SkillInstructions; // NEW
}

interface SkillInstructions {
  primaryInstruction: string;   // event-specific section or full body
  fullBody: string;             // entire SKILL.md body
  eventName?: string;           // e.g., 'onTopicCreated' if matched
  frontmatter: {
    name: string;
    description: string;
    executor?: string;
    maxTurns?: number;
    allowedTools?: string[];
    topicType?: string;
  };
}
```

## How SkillInstructions is populated

In `SkillPipeline.createTaskDispatch()`:

1. Get the type skill's parsed SKILL.md from `SkillRegistry.getSkillMd(skillName)`
2. If parsed MD exists and `hasAiInstructions`:
   - Map `operation` to `eventName` via `OPERATION_TO_EVENT`
   - Resolve `primaryInstruction`: `eventPrompts.get(eventName) ?? systemPrompt`
   - Set `fullBody` = `systemPrompt` (complete body)
   - Set `eventName` if an event-specific section was matched
   - Copy relevant `frontmatter` fields
3. If no parsed MD or no AI instructions: `skillInstructions` is omitted (field absent)

## How local agents consume SkillInstructions

In `TaskProcessor.buildPrompt()`:

```
[if skillInstructions.primaryInstruction present]
  ## Skill Instructions
  <primaryInstruction>

  ## Full Skill Context
  <fullBody>  (only if different from primaryInstruction)

[always]
  ## Topic
  <topic JSON>

  ## Event
  <event JSON>
```

The local executor passes `skillInstructions.primaryInstruction` as the system prompt file content (or inline), and the topic+event as the user prompt — mirroring the previous `SkillAiRuntime` behavior but executed locally.

## Backward Compatibility

- Old dispatches (without `skillInstructions`): `TaskProcessor` falls back to current behavior (topic+event only)
- `aiClassification` field: Retained in schema, never populated by the pipeline. No change needed.
