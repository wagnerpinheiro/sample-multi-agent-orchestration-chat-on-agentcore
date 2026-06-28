---
phase: 1
slug: backend-data-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ^30.2.0 + ts-jest ^29.4.6 |
| **Config file** | `packages/backend/jest.config.js` |
| **Quick run command** | `npm run test -w @moca/backend` |
| **Full suite command** | `npm run test -w @moca/backend && npm run test:integration -w @moca/backend` |
| **Estimated runtime** | ~30 seconds (unit), ~90 seconds (with integration) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w @moca/backend`
- **After every plan wave:** Run `npm run test -w @moca/backend && npm run lint -w @moca/backend`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Req | Test Type | Automated Command | File Exists | Status |
|---------|-----|-----------|-------------------|-------------|--------|
| 1-agent-types | REG-03, INFRA-03 | Unit | `npm run test -w @moca/backend` | ✅ `item.test.ts` (extend) | ⬜ pending |
| 1-zod-schemas | REG-03 | Unit | `npm run test -w @moca/backend` | ✅ extend route tests | ⬜ pending |
| 1-repository | REG-03 | Unit + Integration | `npm run test:integration -w @moca/backend` | ✅ extend repository test | ⬜ pending |
| 1-invoke-route | INFRA-02 | Unit | `npm run test -w @moca/backend` | ❌ Wave 0 | ⬜ pending |
| 1-iam-cdk | INFRA-01 | CDK unit | `npm run test -w @moca/cdk` | ✅ snapshot (extend) | ⬜ pending |
| 1-sharing | REG-04, DISC-02 | Unit | `npm run test -w @moca/backend` | ✅ `agents-service.test.ts` (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/backend/src/routes/__tests__/agents-invoke.test.ts` — new test file for `POST /agents/:agentId/invoke`; mock upstream runtime; cover 400 (native agent), 404 (unknown agent), SigV4 `Authorization` header presence, stream passthrough shape
- [ ] Extend `packages/backend/src/repositories/agents/dynamodb/__tests__/item.test.ts` — add round-trip assertions for `agentType`, `externalRuntimeArn`, `externalRuntimeRegion`, `streamFormat` and `buildAgentUpdateExpression` with new fields
- [ ] Extend `packages/backend/src/services/__tests__/agents-service.test.ts` — add assertions that `external_agentcore` agents flow through `listSharedAgents` and `cloneAgent` unchanged

*Wave 0 stubs must pass (not fail) before Wave 1 execution begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SigV4-signed request reaches a real external runtime | INFRA-02 | Requires live AWS credentials and a real AgentCore Runtime ARN | `curl -X POST /agents/:agentId/invoke -H "Authorization: Bearer <token>" -d '{"prompt":"hello"}'` against deployed backend; verify streamed response |
| CDK IAM diff shows new permission | INFRA-01 | CDK snapshot tests may not cover exact policy text | Run `npm run build && npm run cdk diff` before deploy; confirm `bedrock-agentcore:InvokeRuntime` appears in diff |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (agents-invoke.test.ts)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
