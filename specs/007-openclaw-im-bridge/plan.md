# Implementation Plan: OpenClaw IM Bridge

**Branch**: `007-openclaw-im-bridge` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-openclaw-im-bridge/spec.md`

## Summary

Replace the `PlatformSkill` abstraction and the `lark-bot` skill package with an OpenClaw bridge — a thin, non-AI message relay layer in `@topichub/core` that receives inbound IM commands from OpenClaw outbound webhooks and sends rich text (markdown) replies/notifications via OpenClaw's REST API. The `PlatformSkill` interface, its registry paths, pipeline integration, messaging facade, and all related types are fully removed.

## Technical Context

**Language/Version**: TypeScript 5.5, Node.js 20 LTS  
**Primary Dependencies**: Mongoose 8 + Typegoose 12 (ODM), zod (validation), NestJS 10 (server), gray-matter (YAML frontmatter)  
**Storage**: MongoDB 7 (existing collections: `topics`, `timeline_entries`, `skill_registrations`, `tenant_skill_configs`)  
**Testing**: Jest + ts-jest, mongodb-memory-server (unit/integration)  
**Target Platform**: Linux server (Docker), macOS dev  
**Project Type**: Monorepo — library (`@topichub/core`), web-service (`@topichub/server`), CLI (`@topichub/cli`), skill packages  
**Performance Goals**: Webhook processing < 500ms p95; outbound message dispatch < 1s p95  
**Constraints**: No AI/LLM at the bridge layer; OpenClaw used as pure message relay  
**Scale/Scope**: Single-digit tenants, hundreds of topics; not a high-throughput system  

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| I. Code Quality First | PASS | Removing `PlatformSkill` reduces complexity; new `OpenClawBridge` is a focused module with single responsibility |
| II. Testing Standards | PASS | Unit tests for bridge message parsing/rendering; integration tests for webhook flow; existing command pipeline tests remain valid |
| III. User Experience Consistency | N/A | No UI components — IM output is markdown text |
| IV. Performance Requirements | PASS | API response targets: p50 < 200ms, p95 < 500ms for webhook processing; outbound send is fire-and-forget with error logging |
| V. Simplicity & Maintainability | PASS | Net code deletion — removing PlatformSkill interface, lark-bot, card rendering; replacing with a single bridge module |
| Security & Data Integrity | PASS | Inbound webhook signature verification (HMAC-SHA256); outbound auth via Bearer token; no PII in logs |
| Development Workflow | PASS | Feature branch `007-openclaw-im-bridge`; atomic commits; PR review |

## Project Structure

### Documentation (this feature)

```text
specs/007-openclaw-im-bridge/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── inbound-webhook.md
│   └── outbound-send.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/core/
├── src/
│   ├── topichub.ts              # MODIFY — remove messaging facade, add OpenClaw bridge wiring
│   ├── config.ts                # MODIFY — add openclaw config section
│   ├── index.ts                 # MODIFY — remove PlatformSkill exports, add OpenClawBridge exports
│   ├── bridge/
│   │   ├── openclaw-bridge.ts   # NEW — inbound webhook parsing + outbound send + tenant resolution
│   │   ├── message-renderer.ts  # NEW — topic data → markdown rich text rendering
│   │   └── openclaw-types.ts    # NEW — zod schemas for OpenClaw webhook payloads and config
│   ├── common/enums.ts          # MODIFY — remove SkillCategory.PLATFORM or keep for AdapterSkill
│   ├── skill/
│   │   ├── interfaces/
│   │   │   ├── platform-skill.ts    # DELETE
│   │   │   └── index.ts             # MODIFY — remove platform-skill re-export
│   │   ├── registry/
│   │   │   └── skill-registry.ts    # MODIFY — remove PlatformSkill from AnySkill union, getPlatformSkills()
│   │   └── pipeline/
│   │       └── skill-pipeline.ts    # MODIFY — remove runPlatformSkills(), replace with OpenClaw notification
│   └── webhook/
│       └── webhook-handler.ts       # MODIFY — remove platform skill path, add OpenClaw inbound path

packages/server/
├── src/
│   └── api.controller.ts            # MODIFY — update WebhookController to route OpenClaw webhooks

packages/cli/
├── src/
│   ├── config/config.schema.ts      # MODIFY — add openclaw config fields
│   └── scaffold/
│       ├── templates/platform-skill.ts  # DELETE
│       ├── skill-scaffold.ts            # MODIFY — remove platform skill generation
│       └── repo-scaffold.ts             # MODIFY — update docs

packages/skills/
├── platforms/
│   └── lark-bot/                    # DELETE entire directory
```

**Structure Decision**: Existing monorepo structure preserved. New code lives in `packages/core/src/bridge/` — a focused module within the core library. No new packages.

## Complexity Tracking

No constitution violations. Net complexity reduction — removing an entire interface category (PlatformSkill) and replacing with a single-purpose bridge module.
