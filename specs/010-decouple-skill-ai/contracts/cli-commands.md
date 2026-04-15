# CLI Contracts: New AI Management Commands

## topichub-admin ai summarize \<topic-id\>

Summarize a topic using the server's AI provider. Calls `POST /api/v1/ai/summarize`.

### Usage

```
topichub-admin ai summarize <topic-id>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `topic-id` | Yes | MongoDB ObjectId of the topic to summarize |

### Output (success)

```
  Summarizing topic <topic-id>...

  Summary:
  <AI-generated summary text>

  ✓ Timeline entry written (id: <entry-id>)
  Model: <model-name> | Tokens: <input>→<output>
```

### Output (error)

```
  ✗ AI unavailable: <error-message>
```

or

```
  ✗ Topic not found: <topic-id>
```

---

## topichub-admin ai ask \<topic-id\> "\<question\>"

Ask a free-form question about a topic. Calls `POST /api/v1/ai/ask`.

### Usage

```
topichub-admin ai ask <topic-id> "<question>"
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `topic-id` | Yes | MongoDB ObjectId of the topic |
| `question` | Yes | Free-form question or instruction (in quotes if contains spaces) |

### Output (success)

```
  Asking about topic <topic-id>...

  Q: <question>

  A: <AI-generated answer text>

  ✓ Timeline entry written (id: <entry-id>)
  Model: <model-name> | Tokens: <input>→<output>
```

### Output (error)

Same patterns as `summarize`.

---

## Updated command listing

The `ai` subcommand group becomes:

```
topichub-admin ai <subcommand>

Subcommands:
  status      Show AI provider status
  enable      Enable AI for current tenant
  disable     Disable AI for current tenant
  config      View/update AI configuration
  usage       Show AI usage statistics
  run         One-off agent execution on a topic
  summarize   Summarize a topic using server AI       [NEW]
  ask         Ask a question about a topic using AI   [NEW]
```
