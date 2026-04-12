# MCP Tools: Topic Hub Agent Tools

MCP server exposed by the local CLI to agents during task execution. Communicates with the remote server via REST API.

Server name: `topichub`
Tool name format: `mcp__topichub__<tool_name>`

---

## get_topic

Retrieve full details of a topic.

**Input**:
```json
{
  "type": "object",
  "properties": {
    "topicId": { "type": "string", "description": "The topic ID to retrieve" }
  },
  "required": ["topicId"]
}
```

**Output**: Full topic object (type, title, status, metadata, groups, assignees, tags, signals, timestamps).

**Errors**: `Topic not found` if ID doesn't exist or belongs to a different tenant.

---

## search_topics

Search for topics matching criteria.

**Input**:
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Free-text search query" },
    "type": { "type": "string", "description": "Filter by topic type" },
    "status": { "type": "string", "description": "Filter by status (open, in_progress, resolved, closed)" },
    "tags": { "type": "array", "items": { "type": "string" }, "description": "Filter by tags (all must match)" },
    "limit": { "type": "number", "description": "Max results (default: 10, max: 50)" }
  }
}
```

**Output**: Array of matching topics with id, type, title, status, tags, createdAt.

---

## update_topic

Update fields on a topic.

**Input**:
```json
{
  "type": "object",
  "properties": {
    "topicId": { "type": "string", "description": "The topic ID to update" },
    "status": { "type": "string", "description": "New status" },
    "metadata": { "type": "object", "description": "Metadata fields to merge (shallow merge)" },
    "tags": { "type": "array", "items": { "type": "string" }, "description": "Replace tags array" }
  },
  "required": ["topicId"]
}
```

**Output**: Updated topic object.

**Errors**: `Topic not found`, `Invalid status transition`.

---

## add_timeline_entry

Append an entry to a topic's timeline.

**Input**:
```json
{
  "type": "object",
  "properties": {
    "topicId": { "type": "string", "description": "The topic ID" },
    "actionType": { "type": "string", "description": "Entry type: COMMENT, METADATA_UPDATED, AI_RESPONSE" },
    "payload": { "type": "object", "description": "Entry payload (content, notes, analysis results, etc.)" }
  },
  "required": ["topicId", "actionType", "payload"]
}
```

**Output**: Created timeline entry with id, timestamp, actor.

---

## list_signals

List signals (external evidence links) attached to a topic.

**Input**:
```json
{
  "type": "object",
  "properties": {
    "topicId": { "type": "string", "description": "The topic ID" }
  },
  "required": ["topicId"]
}
```

**Output**: Array of signals with label, url, description.
