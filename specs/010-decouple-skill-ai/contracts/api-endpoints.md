# API Contracts: Standalone AI Endpoints

## POST /api/v1/ai/summarize

Summarize a topic using the server's configured AI provider. Assembles topic data (title, description, metadata, timeline) into a prompt, calls the AI provider, returns the summary, and records it as a timeline entry.

**Authentication**: Tenant-scoped (API key or Bearer token via `x-api-key` or `Authorization` header).

### Request

```json
{
  "topicId": "string (required — MongoDB ObjectId of the topic)"
}
```

### Response — 200 OK

```json
{
  "summary": "string (AI-generated summary text)",
  "model": "string (AI model used)",
  "usage": {
    "inputTokens": "number",
    "outputTokens": "number",
    "totalTokens": "number"
  },
  "timelineEntryId": "string (ID of the created timeline entry)"
}
```

### Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Missing or invalid `topicId` |
| 401 | Invalid or missing authentication |
| 404 | Topic not found for the authenticated tenant |
| 503 | AI service unavailable (disabled, circuit breaker open, rate limit exceeded) |

### 503 Response Body

```json
{
  "error": "string (one of: 'ai_disabled', 'ai_unavailable', 'rate_limit_exceeded', 'tenant_ai_disabled')",
  "message": "string (human-readable explanation)"
}
```

---

## POST /api/v1/ai/ask

Send a free-form question or instruction about a topic to the AI provider. The topic's data is included as context. Returns the AI response and records it as a timeline entry.

**Authentication**: Tenant-scoped (same as above).

### Request

```json
{
  "topicId": "string (required — MongoDB ObjectId of the topic)",
  "question": "string (required — free-form question or instruction, 1–4096 characters)"
}
```

### Response — 200 OK

```json
{
  "answer": "string (AI-generated response text)",
  "model": "string (AI model used)",
  "usage": {
    "inputTokens": "number",
    "outputTokens": "number",
    "totalTokens": "number"
  },
  "timelineEntryId": "string (ID of the created timeline entry)"
}
```

### Error Responses

Same as `/api/v1/ai/summarize`, plus:

| Status | Condition |
|--------|-----------|
| 400 | Missing `question` or exceeds 4096 characters |

---

## Notes

- Both endpoints use the existing `AiService` infrastructure: tenant enablement check, per-tenant rate limiting, circuit breaker, usage recording.
- Timeline entries are created with `actionType: 'ai_response'` and `actor: 'ai:summarize'` or `'ai:assistant'`, distinguishing them from Skill-driven AI entries.
- The `skillName` used for usage tracking is `'ai:summarize'` or `'ai:assistant'` — these appear in the usage report alongside Skill names.
- Topic data assembled for the AI prompt includes: title, type, status, tags, assignees, metadata, and recent timeline entries (up to configurable limit).
