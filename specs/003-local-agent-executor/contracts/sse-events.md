# SSE Events: Task Dispatch Stream

Endpoint: `GET /api/v1/dispatches/stream?tenantId=<id>`
Authentication: `Authorization: Bearer <admin-token>`
Content-Type: `text/event-stream`

---

## Event Types

### dispatch

Emitted when a new task dispatch is created for the tenant.

```
event: dispatch
data: {"id":"6612a...","topicId":"6610b...","eventType":"created","skillName":"bug-triage","createdAt":"2026-04-10T12:00:00Z"}
```

The client should:
1. Call `POST /api/v1/dispatches/:id/claim` to claim the dispatch
2. If claim succeeds (200), fetch full dispatch data and process
3. If claim fails (409), ignore (another client claimed it)

### heartbeat

Emitted every 30 seconds to keep the connection alive and detect stale connections.

```
event: heartbeat
data: {"timestamp":"2026-04-10T12:00:30Z","pendingCount":0}
```

`pendingCount` indicates how many unclaimed dispatches exist for the tenant (useful for displaying backlog in the serve UI).

### error

Emitted when the server encounters an error with the stream.

```
event: error
data: {"message":"Tenant not found","code":"TENANT_NOT_FOUND"}
```

---

## Connection Behavior

- **Reconnection**: Client should implement automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s). Standard `EventSource` API handles this natively.
- **Last-Event-ID**: Server supports `Last-Event-ID` header for resuming after reconnection. Each `dispatch` event includes an `id` field (the dispatch creation timestamp as Unix ms).
- **Catch-up on connect**: After establishing the SSE connection, the client should also call `GET /api/v1/dispatches?status=unclaimed&since=<last_seen>` to catch up on any dispatches that were created while disconnected.
