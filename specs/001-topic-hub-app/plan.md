# Implementation Plan: Topic Hub App

**Branch**: `001-topic-hub-app` | **Date**: 2026-04-09 | **Spec**: [spec.md](./spec.md)

## Summary

Multi-tenant event topic hub with NestJS server and Ink admin CLI. Four Skill categories (Type / Platform / Auth / Adapter). Each topic maps 1:1 to an IM group chat (sequential reuse supported). End users interact via `/topichub` in IM; admins via CLI. Zero core auth — delegated to Auth Skills. User credentials stay local (OAuth2 PKCE + ID Token + JWKS verification). No SDK package — Skill interfaces live in the server. Skills directory starts empty; Skills added via CLI.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 LTS  
**Primary Dependencies**: NestJS 10 (server), Ink 5 + React 18 (CLI), Typegoose + Mongoose (ODM), zod (validation), jsonwebtoken + jwks-rsa (JWT/JWKS verification)  
**Storage**: MongoDB 7  
**Testing**: Jest (unit + integration), supertest (API e2e), @inkjs/testing-library (CLI), mongodb-memory-server  
**Target Platform**: Linux/macOS server (Docker), CLI on any Node.js 20+  
**Project Type**: TypeScript monorepo (pnpm workspaces) — server + CLI, no SDK package  
**Performance Goals**: API p50 < 200ms, p95 < 500ms; topic creation < 3s  
**Constraints**: Multi-tenant, 1K concurrent topics/tenant, 10K total searchable in < 3s  
**Scale/Scope**: Multi-tenant SaaS, tenant onboarding < 5 minutes  
**Auth Model**: OAuth2 PKCE + ID Token (JWT) + JWKS verification. User credentials local-only (OS keychain). Server never stores raw user credentials.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality First | PASS | TypeScript strict, ESLint, composition-based Skills, no inheritance |
| II. Testing Standards | PASS | Jest pyramid: unit 80%+ -> integration (mongodb-memory-server) -> e2e. TDD for core. Critical paths: auth pipeline, dedup, tenant isolation, group binding. |
| III. User Experience Consistency | PASS | IM cards (Skill-defined) + CLI (Ink). Auth denial includes CLI command. i18n via Skills. |
| IV. Performance Requirements | PASS | API p50<200ms p95<500ms. Mongoose indexes. No N+1. |
| V. Simplicity & Maintainability | PASS | 2 packages (server+CLI), no SDK. Zero core auth. YAGNI enforced. |
| Security & Data Integrity | PASS | OAuth2 PKCE + JWKS (provably secure). AES-256 for tenant bot secrets. Write-only credentials. OS keychain for local tokens. Input validation via zod. |

## Project Structure

### Source Code

```text
packages/
├── server/                    # NestJS server
│   └── src/
│       ├── core/              # Topic, Timeline entities & services
│       │   ├── entities/      # topic.entity.ts, timeline-entry.entity.ts
│       │   ├── services/      # topic.service.ts, timeline.service.ts
│       │   ├── topic-detail.controller.ts
│       │   └── core.module.ts
│       ├── tenant/            # Multi-tenancy
│       │   ├── entities/      # tenant.entity.ts
│       │   ├── tenant.service.ts
│       │   ├── tenant.guard.ts
│       │   └── tenant.module.ts
│       ├── skill/             # Skill plugin system
│       │   ├── interfaces/    # TypeSkill, PlatformSkill, AuthSkill, AdapterSkill, SetupContext
│       │   ├── entities/      # skill-registration.entity.ts, tenant-skill-config.entity.ts
│       │   ├── registry/      # skill-loader.ts, skill-registry.ts
│       │   ├── pipeline/      # skill-pipeline.ts
│       │   ├── config/        # skill-config.service.ts
│       │   └── skill.module.ts
│       ├── command/           # IM command system
│       │   ├── parser/        # command-parser.ts
│       │   ├── router/        # command-router.ts
│       │   ├── handlers/      # create, update, assign, help, reopen, show, timeline, history
│       │   ├── command.controller.ts
│       │   ├── webhook.controller.ts
│       │   └── command.module.ts
│       ├── ingestion/         # Event ingestion API
│       │   ├── dto/           # event-payload.dto.ts (zod)
│       │   ├── ingestion.service.ts
│       │   ├── ingestion.controller.ts
│       │   ├── adapter-webhook.controller.ts
│       │   └── ingestion.module.ts
│       ├── search/            # Topic search
│       ├── admin/             # Admin API (for CLI)
│       ├── auth/              # CLI auth (OAuth2 PKCE + JWKS verification)
│       ├── crypto/            # AES-256 for tenant bot secrets
│       ├── database/          # MongoDB connection
│       ├── common/            # Logger, exception filter, enums
│       ├── health.controller.ts
│       ├── app.module.ts
│       └── main.ts
├── cli/                       # Ink admin CLI
│   └── src/
│       ├── commands/          # skill/, tenant/, stats, health
│       ├── api-client/        # HTTP client to server
│       ├── auth/              # OAuth2 PKCE flow, OS keychain storage
│       └── index.tsx
├── skills/                    # Installed Skills (starts empty, auto-discovered)
└── docker-compose.yml         # One-command deployment
```
