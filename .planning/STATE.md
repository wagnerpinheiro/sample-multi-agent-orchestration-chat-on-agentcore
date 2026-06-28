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
| 2026-06-28 | cloneAgent auto-fixed to map four new external runtime fields | Rule 1 bug exposed by tests — fields were silently dropped on clone |
| 2026-06-28 | TESTCONTAINERS_RYUK_DISABLED required for Podman on macOS | Ryuk needs Docker socket volume mount which Podman does not support |

---

## Phase 1 Completed Plans

| Plan | Name | Status | Commit(s) |
|------|------|--------|-----------|
| 01-01 | Extend agent data layer | Done | 8459d32, a13bd79 |
| 01-02 | IAM InvokeRuntime permission | Done | 3f74cad |
| 01-03 | SigV4 invoke proxy route | Done | fa6ce5e, 93c77bb |
| 01-04 | Sharing/clone + integration tests | Done | 9cc9388, 492ea1e |

---

*Last updated: 2026-06-28 — completed plan 01-04 (REG-04, DISC-02)*

---

## Quick Tasks Completed

| Date | Task | Outcome |
|------|------|---------|
| 2026-06-28 | Fix frontend em branco no CloudFront (dev) | `cloudFrontGeoRestriction` adicionado `'BR'` em `environments.ts`; RCA salvo em `docs/rcas/2026-06-28-cloudfront-blank-page.md` |
