# Quickstart: Decouple Skill AI

## What changed

1. **Skill pipeline no longer calls AI** — The remote server's Skill pipeline removes the `runSkillAi` step. When a topic event fires, the pipeline runs type hooks, creates a task dispatch (now enriched with SKILL.md instructions), and sends bridge notifications. No AI calls happen on the server during Skill execution.

2. **Task dispatches carry Skill instructions** — The `enrichedPayload` in dispatches now includes a `skillInstructions` field with the resolved SKILL.md content. Local agents receive everything they need in a single package.

3. **Standalone AI APIs** — New server endpoints `POST /api/v1/ai/summarize` and `POST /api/v1/ai/ask` let the CLI call AI directly for management tasks. These use the same `AiService` with rate limits, circuit breaker, and usage tracking.

4. **New CLI commands** — `topichub-admin ai summarize <topic-id>` and `topichub-admin ai ask <topic-id> "<question>"` invoke the standalone APIs.

## For users

### Skill execution now requires a local agent

After this change, Skills with AI instructions no longer produce results automatically on the server. You need:

```bash
# Configure your local environment (if not done)
topichub-admin init

# Start the local serve process
topichub-admin serve
```

Your local agent (Claude Code, Codex, or OpenClaw) will pick up task dispatches and process Skill instructions.

### Topic management with AI

To summarize a topic:

```bash
topichub-admin ai summarize <topic-id>
```

To ask a question about a topic:

```bash
topichub-admin ai ask <topic-id> "What are the key action items?"
```

These commands call the server's AI directly — no local agent needed.

## For developers

### Key files changed

| File | Change |
|------|--------|
| `packages/core/src/skill/pipeline/skill-pipeline.ts` | Remove `runSkillAi` step, add `skillInstructions` to dispatch |
| `packages/core/src/skill/pipeline/skill-ai-runtime.ts` | Deleted (no longer used) |
| `packages/core/src/entities/task-dispatch.entity.ts` | Add `SkillInstructions` embedded class to `EnrichedPayload` |
| `packages/core/src/topichub.ts` | Remove `SkillAiRuntime` wiring, add `ai` operations |
| `packages/core/src/skill/registry/skill-registry.ts` | Remove `aiService` dependency |
| `packages/server/src/api.controller.ts` | Add AI endpoints |
| `packages/cli/src/commands/ai/index.ts` | Add `summarize` and `ask` subcommands |
| `packages/cli/src/commands/serve/task-processor.ts` | Update `buildPrompt` to use `skillInstructions` |

### Testing the change

```bash
# Run unit tests
cd packages/core && npm test
cd packages/cli && npm test

# Integration test: verify pipeline creates dispatch without AI call
# 1. Start server with AI_ENABLED=false
# 2. Create a topic that triggers a Skill
# 3. Verify dispatch is created with skillInstructions
# 4. Verify no AI_RESPONSE timeline entry was created server-side

# Integration test: verify standalone AI
# 1. Start server with AI_ENABLED=true, AI_API_KEY set
# 2. Create a topic
# 3. Run: topichub-admin ai summarize <topic-id>
# 4. Verify summary is returned and timeline entry is written
```
