# Research: AI-Driven Skills

## R-001: SKILL.md Frontmatter Parsing Library

**Decision**: Use `gray-matter` (npm) for YAML frontmatter extraction from markdown files.

**Rationale**: `gray-matter` is the de facto standard for parsing YAML frontmatter in markdown (used by Hugo, Jekyll, Gatsby, Astro, and Cursor's own SKILL.md system). It handles edge cases (empty body, no frontmatter, delimiter variants) and returns typed `{ data, content }`. Lightweight (~6KB), zero native dependencies, well-maintained.

**Alternatives considered**:
- Manual regex parsing: Fragile, doesn't handle YAML edge cases (multiline strings, special characters). Rejected for reliability.
- `front-matter` (npm): Similar but less popular, fewer edge case tests. Rejected — `gray-matter` has broader adoption.
- `yaml` (npm) + manual split: Requires writing delimiter detection. Unnecessary complexity when `gray-matter` exists.

## R-002: SKILL.md Event Section Extraction

**Decision**: Parse the markdown body using heading-level matching. Scan for `## onTopicCreated`, `## onTopicUpdated`, etc. headings and extract the content between them. If no event-specific headings are found, use the entire body as the system prompt.

**Rationale**: This is the simplest approach that satisfies the spec (FR-017). Markdown heading parsing doesn't require a full AST parser — a regex-based approach to find `## onXxx` headings and extract content between them is sufficient and keeps dependencies minimal.

**Alternatives considered**:
- Full markdown AST (remark/unified): Overkill for heading extraction. Adds ~50KB of dependencies for parsing we don't need. Rejected.
- YAML-only configuration (event → prompt mapping in frontmatter): Forces all instruction text into YAML strings, which is awkward for multi-paragraph NL instructions. Rejected — markdown body is the natural place for NL text.

## R-003: Volcengine Ark Responses API Integration

**Decision**: Use the existing `ArkProvider` implementation which already correctly implements the Ark Responses API format (`POST {apiUrl}/responses`).

**Rationale**: The current implementation correctly:
- Sends `Authorization: Bearer <key>` headers
- Uses `model`, `input` (array of `{role, content}` messages), `max_output_tokens` in the request body
- Parses the response (`output[]` with message/reasoning types, `usage` with token counts)
- Handles timeouts via `AbortSignal.timeout()`
- Maps errors to `AiProviderError` with retryable flag (5xx = retryable, 4xx = not)

No changes to the Ark provider are needed. The Responses API at `/api/v3/responses` accepts `instructions` (system-level) or `input` messages with `role: 'system'` — we use the latter, which is already implemented.

**Alternatives considered**:
- Switch to `instructions` field for system prompt: Would simplify the request but the `input` array with `role: 'system'` is already implemented and equivalent. No change needed.
- Use OpenAI SDK with custom `baseURL`: Adds a dependency for no gain — raw `fetch` is simpler and already working.

## R-004: Prompt Assembly Strategy

**Decision**: Construct AI requests using two messages: (1) system message with SKILL.md content, (2) user message with serialized topic snapshot + event context as JSON.

**Rationale**: This is the standard pattern for instruction-following LLM calls. The system message contains the Skill's NL instructions (what to do), and the user message contains the data (what to work with). JSON serialization of the topic snapshot is unambiguous and parseable by the model.

**Format**:
```
System: <SKILL.md body or event-specific section>
User: {"event":"onTopicCreated","timestamp":"...","actor":"...","topic":{"_id":"...","tenantId":"...","type":"...","title":"...","status":"...","metadata":{...},...}}
```

**Alternatives considered**:
- Template-based prompt (mustache/handlebars): More complex authoring, harder to debug, and limits what the AI can see. Rejected.
- Multiple user messages (one per field): Increases token count without benefit. Rejected.

## R-005: Topic Timeline Integration

**Decision**: Append AI responses as `TimelineEntry` documents with `actionType: AI_RESPONSE` and a `payload` containing `{ skillName, content, model, usage }`.

**Rationale**: `TimelineEntry` already supports arbitrary `payload` (Mixed type) and has the `tenantId`, `topicId`, `timestamp`, `actor` fields needed. Adding a new `TimelineActionType.AI_RESPONSE` enum value follows the existing pattern (9 existing action types). The actor for AI entries is set to `ai:{skillName}` to distinguish from human actors.

**Alternatives considered**:
- Separate `AiResponse` collection: Unnecessary — timeline entries already handle heterogeneous event types. Adding another collection increases query complexity. Rejected.
- Embed in topic document directly: Would make topic documents grow unboundedly. Rejected — timeline entries are the established pattern for topic event history.

## R-006: SKILL.md Caching Strategy

**Decision**: Parse SKILL.md at skill registration time (server startup) and cache the parsed result (frontmatter + event section map) in-memory within `SkillRegistry`. No runtime file I/O on each AI call.

**Rationale**: Skills are loaded once at startup via `SkillLoader.scanDirectory()` → `SkillRegistry.loadAll()`. Adding SKILL.md parsing to this existing flow is natural. The parsed content is small (a few KB per skill) and doesn't change at runtime (server restart required for config changes, per spec).

**Alternatives considered**:
- File watch + hot reload: Out of scope per spec ("server must be restarted to pick up new env var values"). Rejected.
- Database-stored SKILL.md: Adds unnecessary complexity. Skills are filesystem-based (loaded from `SKILLS_DIR`). Rejected.

## R-007: Circuit Breaker and Failure Handling

**Decision**: Reuse the existing `CircuitBreaker` in `AiService`. No changes needed — the SKILL.md runtime calls `AiService.complete()` which already handles circuit breaker, tenant enablement, and rate limiting.

**Rationale**: The `AiService` already returns `null` for all failure/disabled/rate-limited scenarios. The `SkillAiRuntime` simply checks the return value and skips timeline/metadata updates when `null`.

**Alternatives considered**:
- Per-skill circuit breaker: Unnecessary complexity for the initial version. A global circuit breaker per AI provider is sufficient. Rejected.

## R-008: Backward Compatibility

**Decision**: Skills without SKILL.md continue to work exactly as before. Skills with `manifest.ai: true` that call `AiService.complete()` directly in code hooks also continue to work. The SKILL.md runtime is additive — it runs after code hooks if SKILL.md is present.

**Rationale**: Zero breaking changes to existing skills. The pipeline adds a new step (`runSkillAi`) that only activates when a skill has parsed SKILL.md content. Skills can have code hooks AND SKILL.md (both run), or just one.

**Alternatives considered**:
- Replace code-based AI calls entirely: Would break the existing `TestAiSkill` fixture and any skills using the code-based pattern. Rejected — both models coexist.
