# REST API Contracts: AI-Driven Skills

**Branch**: `002-ai-driven-skills` | **Date**: 2026-04-10

## GET /health (MODIFIED)

Add AI provider status.

**Response `200 OK`**:
```json
{ "status": "ok", "db": "connected", "ai": "available", "version": "1.1.0" }
```

| `ai` value | Meaning |
|------------|---------|
| `"available"` | Configured, reachable, circuit closed |
| `"unavailable"` | Configured but unreachable or circuit open |
| `"disabled"` | `AI_ENABLED=false` or not configured |

Server status remains `"ok"` regardless of AI — AI is optional.

---

## GET /admin/ai/status

Platform admin. AI provider configuration and health.

**Response `200 OK`**:
```json
{
  "enabled": true,
  "provider": "ark",
  "model": "doubao-seed-2-0-pro-260215",
  "apiUrl": "https://ark.cn-beijing.volces.com/api/v3",
  "available": true,
  "circuitState": "closed",
  "globalRateLimit": 1000,
  "globalUsageThisHour": 234
}
```

---

## GET /admin/tenants/:tid/ai

Tenant AI configuration.

**Response `200 OK`**:
```json
{ "tenantId": "ten_01", "aiEnabled": true, "rateLimit": 100, "usageThisHour": 42 }
```

## PATCH /admin/tenants/:tid/ai

Enable/disable AI or update rate limit.

**Request**:
```json
{ "enabled": true, "rateLimit": 50 }
```

---

## GET /admin/tenants/:tid/ai/usage

**Query**: `hours` (default 24)

**Response `200 OK`**:
```json
{
  "tenantId": "ten_01",
  "period": "last 24 hours",
  "totalRequests": 77,
  "totalTokens": 65400,
  "bySkill": [
    { "skillName": "alert-type", "requests": 45, "tokens": 32000 },
    { "skillName": "deploy-type", "requests": 32, "tokens": 33400 }
  ],
  "limit": { "requestsPerHour": 100, "usedThisHour": 42, "remaining": 58 }
}
```
