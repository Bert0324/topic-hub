# Contract: Q&A Exchange API

**Date**: 2026-04-10 | **Feature**: 008-secure-im-dispatch

## Post Question (CLI → Server)

```
POST /api/v1/dispatches/:dispatchId/question
Content-Type: application/json
Authorization: Bearer <admin-token>
```

### Request

```json
{
  "questionText": "Should I delete these 15 stale branches?",
  "questionContext": {
    "skillName": "branch-cleanup",
    "topicTitle": "Repository Maintenance Q4"
  }
}
```

### Processing

1. Validate the dispatch exists and is claimed by the caller.
2. Create a `qa_exchanges` record: status `pending`, `questionedAt: now()`.
3. Resolve the dispatch's `sourceChannel` and `sourcePlatform`.
4. Send the question to IM via OpenClaw:

```
🔔 **Agent Question** (branch-cleanup / Repository Maintenance Q4)

Should I delete these 15 stale branches?

Reply with: /answer <your response>
```

### Response

```json
HTTP 201
{
  "qaId": "663abc...",
  "status": "pending"
}
```

## Poll for Answers (CLI → Server)

```
GET /api/v1/dispatches/:dispatchId/qa?status=answered
Authorization: Bearer <admin-token>
```

### Response

```json
HTTP 200
{
  "exchanges": [
    {
      "qaId": "663abc...",
      "questionText": "Should I delete these 15 stale branches?",
      "answerText": "Yes, delete all except main and develop",
      "status": "answered",
      "answeredAt": "2026-04-10T10:35:00Z"
    }
  ]
}
```

Returns only exchanges matching the requested status. Empty array if none.

## Submit Answer (IM → Server)

Handled by the OpenClaw webhook handler when an `/answer <text>` message is received.

### Processing

1. Resolve the user's `topichubUserId` from the webhook's `platform` + `platformUserId`.
2. Find the most recent `pending` Q&A exchange for that user.
3. If no pending exchange: reply "No pending questions to answer."
4. If multiple pending exchanges: route to the most recent one. If the user includes a reference (`/answer #2 yes`), route by sequence number.
5. Update the exchange: `answerText = <text>`, `status = answered`, `answeredAt = now()`.
6. Reply in IM: "Answer received. Your agent will continue."

### Answer with reference

```
/answer yes                    → routes to most recent pending question
/answer #2 yes, proceed        → routes to question #2 (sequence within dispatch)
```

## Q&A Timeout (Server background job)

### Processing (runs every 60 seconds)

1. Find `qa_exchanges` where `status = pending` and `questionedAt < now() - 5 minutes` and `reminderSentAt` is null.
   - Send IM reminder: "Reminder: your agent is waiting for an answer."
   - Set `reminderSentAt = now()`.

2. Find `qa_exchanges` where `status = pending` and `questionedAt < now() - 10 minutes`.
   - Set `status = timed_out`.
   - Update parent dispatch `status = SUSPENDED`.
   - Send IM: "Your agent task has been suspended due to no response. Re-trigger with `/topichub run <skill>`."
