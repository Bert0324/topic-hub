# Research: AI-Driven Skills

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10

## 1. AI Provider: Volcengine Ark (Doubao Seed)

**Decision**: Volcengine Ark API as the primary AI provider, accessed via its Responses API format. Provider interface is pluggable for future backends.

**Rationale**: User-specified. The Ark API (`/api/v3/responses`) uses a familiar structure: `model`, `input` array with role/content messages, Bearer token auth, structured output including reasoning summaries. The Doubao Seed model (`doubao-seed-2-0-pro-260215`) supports text input/output with reasoning chains. No vendor SDK needed — Node.js 20 built-in `fetch` handles all HTTP calls, keeping the dependency footprint at zero.

**Alternatives considered**:

- **OpenAI API**: Industry standard. Viable as a future provider behind the same interface. Not the primary because the deployment target uses Volcengine Ark internally.
- **Self-hosted LLM (Ollama, vLLM)**: Full data sovereignty; significant operational complexity. Can be added as a provider implementation later.
- **Vendor SDK (`@volcengine/ark-sdk`)**: Adds a dependency; raw `fetch` with typed request/response shapes is sufficient.

---

## 2. Deployment Mode: `internal-remote`

**Decision**: Environment-variable-driven configuration. `AI_PROVIDER=ark` with `AI_API_URL` pointing to the Ark endpoint. Internal vs public is just a URL difference — no special code path.

**Rationale**: Simplest approach. The provider code is identical regardless of endpoint. Docker Compose and `.env` files handle per-environment overrides. No "modes" in code.

**Configuration**:

| Variable | Default | Notes |
|----------|---------|-------|
| `AI_ENABLED` | `false` | Master switch |
| `AI_PROVIDER` | `ark` | Provider implementation |
| `AI_API_URL` | `https://ark.cn-beijing.volces.com/api/v3` | Base URL |
| `AI_API_KEY` | — | Bearer token |
| `AI_MODEL` | `doubao-seed-2-0-pro-260215` | Model identifier |
| `AI_TIMEOUT_MS` | `10000` | Per-request timeout |
| `AI_RATE_LIMIT_GLOBAL` | `1000` | Platform-wide requests/hour |

---

## 3. `AiService` Return Pattern: `null` vs Throw

**Decision**: `AiService.complete()` returns `null` when AI is unavailable (disabled, circuit open, rate limited, tenant disabled). Only throws for programming errors (missing required parameters).

**Rationale**: The `null` return pattern makes it trivial for Skill developers to handle unavailability — a simple `if (!response) return;`. Throwing would require every Skill to wrap AI calls in try-catch. The pipeline already catches Skill exceptions, but `null` is a cleaner contract.

**Alternatives considered**:

- **Throw + catch in pipeline**: Forces Skill error handling; confuses "AI unavailable" with "Skill bug."
- **Result type (success/failure)**: More explicit; unnecessary complexity for a binary outcome.

---

## 4. Circuit Breaker

**Decision**: In-process circuit breaker in `AiService`. States: closed → open (3 failures) → half-open (30s cooldown, 1 test request).

**Rationale**: Protects against cascading failures from an unavailable AI provider. In-process is sufficient for single-server deployment.

**Alternatives considered**:

- **External circuit breaker**: Better for distributed; adds infrastructure. Deferred.
- **No circuit breaker**: Each request waits for timeout, degrading response times during outages.

---

## 5. Per-Tenant Rate Limiting

**Decision**: Token-bucket rate limiting per tenant, stored in MongoDB `ai_usage_records` with hourly time buckets. Atomic `$inc` for counting.

**Rationale**: Prevents any single tenant from exhausting the shared AI API quota. Hourly buckets are simple, atomic, and queryable.

**Default**: 100 requests/hour per tenant.

**Alternatives considered**:

- **In-memory counter**: Fast; lost on restart. Not durable.
- **Redis**: Better for distributed; adds infrastructure.

---

## 6. Making AiService Available to Skills

**Decision**: `AiModule` exports `AiService`. `SkillModule` imports `AiModule`. The `SkillRegistry` passes `AiService` to Skills during initialization via a `SkillContext` object. Skills that declare `ai: true` in their manifest receive the service; others receive `null`.

**Rationale**: Skills are loaded dynamically from the `skills/` directory, not via standard NestJS DI. The registry already initializes Skills — passing `AiService` through the same path is consistent. The `ai: true` manifest flag keeps AI opt-in.

**Alternatives considered**:

- **Global singleton**: Breaks DI principles, harder to test.
- **Pipeline-level AI step**: Heavy-handed; most Skills don't need AI.
