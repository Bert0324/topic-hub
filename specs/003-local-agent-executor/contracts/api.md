# API Contracts: Task Dispatch

All endpoints are under the remote server. Authentication via `Authorization: Bearer <admin-token>` (existing pattern).

## POST /api/v1/dispatches

Create a task dispatch (called internally by the skill pipeline after server-side AI classification).

**Request**: Not externally called — created by `DispatchService` within the server.

---

## GET /api/v1/dispatches

List pending dispatches for the authenticated tenant.

**Query Parameters**:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | `unclaimed` | Filter by status |
| `limit` | number | `20` | Max results |
| `since` | ISO date | — | Only dispatches created after this timestamp |

**Response** `200`:
```json
{
  "dispatches": [
    {
      "id": "6612a...",
      "topicId": "6610b...",
      "eventType": "created",
      "skillName": "bug-triage",
      "status": "unclaimed",
      "retryCount": 0,
      "enrichedPayload": {
        "topic": { "id": "...", "type": "bug", "title": "Login fails on Safari", "status": "open", "metadata": {}, "groups": [], "assignees": [], "tags": ["browser"], "signals": [], "createdAt": "...", "updatedAt": "..." },
        "event": { "type": "created", "actor": "system:ingestion", "timestamp": "...", "payload": {} },
        "aiClassification": { "topicType": "bug", "severity": "high", "matchedSkill": "bug-triage", "reasoning": "Login failure affecting specific browser", "confidence": 0.92 }
      },
      "createdAt": "2026-04-10T12:00:00Z"
    }
  ],
  "total": 1
}
```

---

## POST /api/v1/dispatches/:id/claim

Claim a dispatch for processing. Atomic operation — returns 409 if already claimed.

**Request**:
```json
{
  "claimedBy": "cli:macbook-pro:12345"
}
```

**Response** `200`:
```json
{
  "id": "6612a...",
  "status": "claimed",
  "claimedBy": "cli:macbook-pro:12345",
  "claimExpiry": "2026-04-10T12:05:00Z"
}
```

**Response** `409` (already claimed):
```json
{
  "message": "Dispatch already claimed",
  "claimedBy": "cli:other-host:67890"
}
```

---

## POST /api/v1/dispatches/:id/complete

Mark a dispatch as completed with the agent's result.

**Request**:
```json
{
  "result": {
    "text": "Analysis complete. This is a high-severity browser compatibility bug...",
    "executorType": "claude-code",
    "tokenUsage": { "input": 1500, "output": 800 },
    "durationMs": 12000
  }
}
```

**Response** `200`:
```json
{
  "id": "6612a...",
  "status": "completed",
  "completedAt": "2026-04-10T12:01:12Z"
}
```

---

## POST /api/v1/dispatches/:id/fail

Mark a dispatch as failed.

**Request**:
```json
{
  "error": "Agent subprocess timed out after 300000ms",
  "retryable": true
}
```

**Response** `200`:
```json
{
  "id": "6612a...",
  "status": "failed",
  "retryCount": 1,
  "error": "Agent subprocess timed out after 300000ms"
}
```

---

## GET /api/v1/dispatches/stream

Server-Sent Events endpoint for real-time dispatch notifications.

**Headers**: `Accept: text/event-stream`

**Event format**:
```
event: dispatch
data: {"id":"6612a...","topicId":"6610b...","eventType":"created","skillName":"bug-triage"}

event: heartbeat
data: {"timestamp":"2026-04-10T12:00:30Z"}
```

**Events**:
- `dispatch`: New dispatch available for claiming
- `heartbeat`: Sent every 30 seconds to keep connection alive

The client connects with `?tenantId=<id>` query parameter. Server filters events by tenant.
