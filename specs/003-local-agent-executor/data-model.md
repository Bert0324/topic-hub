# Data Model: Local Agent Executor

## New Entities

### TaskDispatch (collection: `task_dispatches`)

A record on the remote server representing a task dispatched for local agent execution.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | auto | Primary key |
| `tenantId` | string | yes | Tenant scope (indexed) |
| `topicId` | ObjectId | yes | Reference to the topic (indexed) |
| `eventType` | string | yes | Lifecycle event that triggered dispatch (`created`, `updated`, `status_changed`, `assigned`, `signal_attached`, `tag_changed`, `reopened`) |
| `skillName` | string | yes | Name of the Skill to execute (indexed) |
| `status` | DispatchStatus | yes | `unclaimed` / `claimed` / `completed` / `failed` (indexed) |
| `claimedBy` | string | null | Identifier of the CLI instance that claimed this dispatch (e.g., `cli:<hostname>:<pid>`) |
| `claimExpiry` | Date | null | When the claim expires if not completed (default: 5 min after claim) |
| `retryCount` | number | yes | Number of times this dispatch has been retried (default: 0, max: 3) |
| `enrichedPayload` | object | yes | See EnrichedPayload structure below |
| `result` | object | null | Agent execution result (populated on completion) |
| `error` | string | null | Error message if failed |
| `createdAt` | Date | auto | Timestamp of dispatch creation |
| `updatedAt` | Date | auto | Timestamp of last status change |
| `completedAt` | Date | null | Timestamp of completion |

**Indexes**:
- `{ tenantId: 1, status: 1, createdAt: 1 }` — primary query for consuming unclaimed dispatches
- `{ tenantId: 1, topicId: 1 }` — find dispatches by topic
- `{ status: 1, claimExpiry: 1 }` — find expired claims for release
- `{ createdAt: 1 }` — TTL index for automatic cleanup (30 days)

**Status transitions**:
```
unclaimed → claimed (CLI claims it)
claimed → completed (agent finished successfully)
claimed → failed (agent error or timeout)
claimed → unclaimed (claim expired, released for retry)
failed → unclaimed (manual retry or auto-retry if retryCount < max)
```

### EnrichedPayload (embedded in TaskDispatch)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | TopicSnapshot | yes | Full topic data at time of dispatch |
| `event` | EventContext | yes | Triggering event details |
| `aiClassification` | AiClassification | no | Server-side AI analysis (null if AI was unavailable) |

### TopicSnapshot (embedded)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Topic ID |
| `type` | string | Topic type |
| `title` | string | Topic title |
| `status` | string | Current status |
| `metadata` | object | Type-specific metadata |
| `groups` | array | Platform groups |
| `assignees` | array | Assigned users |
| `tags` | array | Tags |
| `signals` | array | Attached signals |
| `createdAt` | Date | Creation time |
| `updatedAt` | Date | Last update time |

### EventContext (embedded)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type (matches `eventType` on dispatch) |
| `actor` | string | Who triggered the event |
| `timestamp` | Date | When the event occurred |
| `payload` | object | Event-specific data (e.g., old/new status for status_changed) |

### AiClassification (embedded, optional)

| Field | Type | Description |
|-------|------|-------------|
| `topicType` | string | AI-classified topic type |
| `severity` | string | AI-assessed severity (if applicable) |
| `matchedSkill` | string | Which Skill the AI determined should handle this |
| `reasoning` | string | Brief AI reasoning for the classification |
| `confidence` | number | Confidence score (0–1) |

### DispatchStatus (enum)

```
unclaimed | claimed | completed | failed
```

---

## Modified Entities

### SkillRegistration (existing, collection: `skill_registrations`)

No schema changes. The `skillMd` field (added in feature 002) already stores SKILL.md content. The local CLI uses the Skill name to match dispatches to local SKILL.md files.

### Topic (existing, collection: `topics`)

No schema changes. The `metadata._ai.<skillName>` convention (from feature 002) is preserved — agent execution results from the local CLI are written back via the existing timeline + metadata update pattern.

### TimelineEntry (existing, collection: `timeline_entries`)

No schema changes. The `AI_RESPONSE` action type (from feature 002) is reused. The `payload` field will include an additional `executorType` field (e.g., `"claude-code"`, `"codex"`) to indicate which agent backend produced the result.

---

## Local-Only Data (not in MongoDB)

### LocalConfig (file: `~/.topichub/config.json`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `serverUrl` | string | yes | Remote server URL |
| `tenantId` | string | yes | Active tenant ID |
| `executor` | string | yes | Preferred executor: `claude-code`, `codex`, or `none` |
| `skillsDir` | string | yes | Path to local Skills directory |

Validated with zod schema on read. Written by `topichub-admin init`.

### Credentials (file: `~/.topichub/credentials.enc`)

Existing encrypted file (from feature 001). Stores admin token used for CLI → server authentication. No changes to the encryption format — reuse existing `keychain.ts`.

---

## Entity Relationships

```
Tenant (existing)
  └── has many → TaskDispatch (new)
                    └── references → Topic (existing)
                    └── embeds → EnrichedPayload
                                    ├── TopicSnapshot
                                    ├── EventContext
                                    └── AiClassification (optional)

SkillRegistration (existing) ← matched by name → SKILL.md (local filesystem)

LocalConfig (local file) → points to → Remote Server + Tenant
```
