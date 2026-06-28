# Project State

**Project:** External AgentCore Runtime Integration
**Created:** 2026-06-28
**Mode:** YOLO (auto-commit, auto-approve)
**Status:** Ready to execute — Phase 1 of 3

---

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-06-28)

**Core value:** A user can connect any AgentCore Runtime they own and talk to it through Moca without re-implementing it as a native agent.
**Current focus:** Phase 1 — Backend & Data Layer

---

## Phase Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | Backend & Data Layer | ⏳ Not started |
| 2 | Frontend UI | ⏳ Not started |
| 3 | Invocation Wiring | ⏳ Not started |

---

## Key Artifacts

- `.planning/PROJECT.md` — project context and decisions
- `.planning/REQUIREMENTS.md` — 16 v1 requirements with traceability
- `.planning/ROADMAP.md` — 3-phase execution plan
- `.planning/codebase/` — full codebase analysis (ARCHITECTURE, STACK, INTEGRATIONS, etc.)

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-28 | Backend as SigV4 proxy | Frontend cannot hold AWS credentials |
| 2026-06-28 | Strands pass-through + plain text fallback | No generic stream format for v1 |
| 2026-06-28 | Optional fields on existing agent DynamoDB table | User constraint: no breaking schema changes |
| 2026-06-28 | Dedicated Integrations screen | Keeps external runtime registration separate from native agent creation |
| 2026-06-28 | node:https.request for SigV4 proxy | Consistent with session-stream-handler pattern; no extra HTTP client dependency |
| 2026-06-28 | Stream wrapped in Promise<void> | asyncHandler must hold connection open until upstream stream completes |

---

*Last updated: 2026-06-28 — plan 01-03 complete (SigV4 invoke proxy route)*

---

## Quick Tasks Completed

| Date | Task | Outcome |
|------|------|---------|
| 2026-06-28 | Fix frontend em branco no CloudFront (dev) | `cloudFrontGeoRestriction` adicionado `'BR'` em `environments.ts`; RCA salvo em `docs/rcas/2026-06-28-cloudfront-blank-page.md` |
