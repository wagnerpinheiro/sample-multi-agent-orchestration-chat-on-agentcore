---
phase: 01-backend-data-layer
verified: 2026-06-28T22:00:00Z
status: passed
score: 12/12 must-haves verified
gaps: []
human_verification:
  - test: "curl POST /agents with agentType:'external_agentcore' against a deployed backend"
    expected: "Agent record created and returned with all four fields; GET /agents/:agentId returns them"
    why_human: "Requires deployed backend and valid Cognito JWT — cannot test in unit/static analysis"
  - test: "curl POST /agents/:agentId/invoke against a deployed backend with a real external AgentCore Runtime ARN"
    expected: "Streamed response proxied back; Authorization header is AWS4-HMAC-SHA256 signed"
    why_human: "Requires live AWS credentials, deployed Lambda, and a registered external runtime"
---

# Phase 1: Backend Data Layer Verification Report

**Phase Goal:** The DynamoDB agent schema supports external runtimes, the backend can proxy invocations to them with SigV4 signing, and the CDK IAM policy grants the permission needed at runtime. A `curl` against the new invoke route with a valid external agent record returns a streamed response — no frontend changes required yet.
**Verified:** 2026-06-28T22:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An agent record can be created with `agentType: 'external_agentcore'` and the four new fields persist | VERIFIED | `createAgentBody` accepts `agentType`, `externalRuntimeArn`, `externalRuntimeRegion`, `streamFormat`; `createAgent` service maps all four to the stored `Agent` object; `toItemAttr` uses `removeUndefinedValues:true` to persist them |
| 2 | `GET /agents/:agentId` returns the four new fields when present on the record | VERIFIED | `fromDynamoAgent` spreads `DynamoAgent` (which extends `Omit<Agent,'isShared'>` and carries the four optional fields); GET handler returns full `Agent` object via `res.json(ok(..., { agent }, ...))` |
| 3 | Creating an `external_agentcore` agent without `externalRuntimeArn` is rejected with a 400 | VERIFIED | `createAgentBody.superRefine` issues `ZodIssueCode.custom` with message `externalRuntimeArn is required when agentType is external_agentcore`; Zod middleware returns 400 |
| 4 | Existing agent records without `agentType` continue to work (default to moca behavior) | VERIFIED | `DynamoAgent` inherits optional fields; `removeUndefinedValues:true` omits absent keys on write; `fromItemAttr` unmarshals absent keys as `undefined`; item.test.ts round-trip test confirms this |
| 5 | The backend Lambda execution role grants `bedrock-agentcore:InvokeRuntime` | VERIFIED | `agentcore-stack.ts` line 512-515: `sid: 'InvokeExternalAgentCoreRuntime'`, action `'bedrock-agentcore:InvokeRuntime'`, resource `arn:aws:bedrock-agentcore:${this.region}:${this.account}:runtime/*` |
| 6 | The permission is scoped to account-level `runtime/*` in the deployment region/account | VERIFIED | Resource uses `${this.region}` and `${this.account}` CDK tokens — account-scoped, not per-ARN |
| 7 | `POST /agents/:agentId/invoke` returns 404 when the agent does not exist | VERIFIED | Handler: `if (!agent) throw new AppError(ErrorCode.NOT_FOUND, ...)`. Test: `agents-invoke.test.ts` case confirmed passing (154 tests green) |
| 8 | `POST /agents/:agentId/invoke` returns 400 when the agent is a native moca agent | VERIFIED | Handler: `if (agent.agentType !== 'external_agentcore') throw new AppError(ErrorCode.VALIDATION_ERROR, ...)`. Covers `agentType: 'moca'` and `agentType: undefined` |
| 9 | Outbound request to the runtime carries a SigV4 Authorization header | VERIFIED | `SignatureV4({ service: 'bedrock-agentcore', region, credentials: defaultProvider(), sha256: Sha256 })` produces signed headers including `Authorization: AWS4-HMAC-SHA256 ...`; asserted in test |
| 10 | For `streamFormat: 'strands'` the upstream response is piped through unmodified | VERIFIED | `upstreamRes.pipe(res)` in the `streamFormat === 'strands'` branch |
| 11 | For `streamFormat: 'other'` the upstream response is buffered and emitted as a single `content_block_delta` SSE event | VERIFIED | Buffer accumulates via `upstreamRes.on('data', ...)`, then `res.write('data: ${JSON.stringify({type: "content_block_delta", ...})}')` + `data: [DONE]` |
| 12 | `external_agentcore` agents flow through `listSharedAgents` and `cloneAgent` identically to native agents | VERIFIED | Plan 04 tests confirm this; `cloneAgent` bug fixed (was dropping the four fields); all 154 tests pass |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/backend/src/types/agent-types.ts` | `Agent` interface with four new optional fields | VERIFIED | Lines 60-63: `agentType`, `externalRuntimeArn`, `externalRuntimeRegion`, `streamFormat`; also in `CreateAgentInput` (lines 83-86) |
| `packages/backend/src/repositories/agents/agents-repository.ts` | `UpdateAgentPatch` with four new optional fields | VERIFIED | Lines 44-47: all four fields present |
| `packages/backend/src/repositories/agents/dynamodb/item.ts` | `buildAgentUpdateExpression` SET clauses for new fields | VERIFIED | Lines 93-96: conditional `set(...)` for each of the four fields |
| `packages/backend/src/routes/agents.ts` | Zod schemas with `superRefine` + `/:agentId/invoke` route | VERIFIED | `superRefine` at line 66; `'/:agentId/invoke'` at line 171; no `createAgentBody.partial()` |
| `packages/cdk/lib/agentcore-stack.ts` | `InvokeExternalAgentCoreRuntime` IAM policy statement | VERIFIED | Lines 508-516: full `addToRolePolicy` call; suppression reason updated at line 1101 |
| `packages/backend/package.json` | Three SigV4 signing dependencies | VERIFIED | `@smithy/signature-v4@^4.2.4`, `@aws-crypto/sha256-js@^5.2.0`, `@aws-sdk/credential-provider-node@^3.972.58` |
| `packages/backend/src/routes/__tests__/agents-invoke.test.ts` | Unit tests for invoke route | VERIFIED | 5 tests covering 404, 400 (moca), 400 (undefined agentType), SigV4 header, content_block_delta SSE |
| `packages/backend/src/services/__tests__/agents-service.test.ts` | Sharing/clone assertions for `external_agentcore` | VERIFIED | `listSharedAgents` DISC-02 describe block (2 tests); `cloneAgent` REG-04 describe block (2 tests) |
| `packages/backend/src/repositories/agents/dynamodb/repository.integration.test.ts` | Integration round-trip for four new fields | VERIFIED | 3 integration tests under D-02 describe block |
| `packages/backend/src/services/agents-service.ts` | `createAgent` maps four new fields; `cloneAgent` preserves them | VERIFIED | `createAgent` lines 117-120; `cloneAgent` lines 304-307 (bug fix applied in plan 04) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `routes/agents.ts` | `createAgentBody.superRefine` | Cross-field Zod refinement requiring `externalRuntimeArn` | WIRED | `superRefine` at line 66 checks `data.agentType === 'external_agentcore' && !data.externalRuntimeArn` |
| `repositories/agents/dynamodb/item.ts` | `buildAgentUpdateExpression` | SET clauses for new fields | WIRED | Lines 93-96 call `set('agentType', ...)`, `set('externalRuntimeArn', ...)`, etc. |
| `routes/agents.ts` | `bedrock-agentcore.{region}.amazonaws.com/runtimes/{arn}/invocations` | SigV4-signed `https.request` | WIRED | Line 198: endpoint URL built with `${region}` and `${encodedArn}`; `https.request(...)` at line 225 |
| `routes/agents.ts` | `agentsService.getAgent` | Agent lookup before proxying | WIRED | Line 179: `const agent = await agentsService.getAgent(userId, agentId)` in invoke handler |
| `agentcore-stack.ts` | `this.backendApi.lambdaFunction.addToRolePolicy` | PolicyStatement with `bedrock-agentcore:InvokeRuntime` | WIRED | Line 506-516: `addToRolePolicy(new cdk.aws_iam.PolicyStatement({sid: 'InvokeExternalAgentCoreRuntime', ...}))` |
| `agents-service.test.ts` | `agentsService.listSharedAgents` | Assertion that external agents appear in shared list | WIRED | Line 248: `await service.listSharedAgents(10)` with `external_agentcore` fixture in mock repo |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `routes/agents.ts` GET /:agentId | `agent` | `agentsService.getAgent(userId, agentId)` → repo `getItem` → `fromItemAttr` (DynamoDB unmarshall) | Yes — queries DynamoDB `GetItem` with `Key: {userId, agentId}` | FLOWING |
| `routes/agents.ts` POST /:agentId/invoke | `agent.externalRuntimeArn`, `agent.externalRuntimeRegion`, `agent.streamFormat` | Same `agentsService.getAgent` path | Yes — real DynamoDB item drives the proxy target URL and stream format | FLOWING |
| `routes/agents.ts` invoke response | upstream SSE stream | `https.request(...)` to external AgentCore Runtime | Real HTTP — piped or buffered from upstream | FLOWING (runtime-dependent at deploy time) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 154 backend unit tests pass | `npm run test -w @moca/backend` | `Tests: 154 passed, 154 total` | PASS |
| TypeScript full solution build | `npm run build:ts` | Exits 0, no errors | PASS |
| `routes/agents.ts` has no `process.env` | `grep -c "process.env" packages/backend/src/routes/agents.ts` | `0` | PASS |
| `routes/agents.ts` has no `console` usage | `grep -c "console." packages/backend/src/routes/agents.ts` | `0` | PASS |
| CDK IAM5 suppression has no duplicate path | `grep -c "BackendApiExecutionRole/DefaultPolicy/Resource" packages/cdk/lib/agentcore-stack.ts` | `1` | PASS |
| All 7 plan commits exist in git log | `git log --oneline \| grep <hashes>` | All 7 found: 8459d32, a13bd79, 3f74cad, fa6ce5e, 93c77bb, 9cc9388, 492ea1e | PASS |
| cdk synth / deploy build | SKIPPED — requires CDK context/credentials | N/A | SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REG-03 | 01-01-PLAN (requirements: [REG-03, INFRA-03]) | External runtimes stored as agent records with `agentType: 'external_agentcore'` and optional fields | SATISFIED (API layer) | `createAgentBody` + `createAgent` service + DynamoDB marshal all support storing the four fields. REQUIREMENTS.md checkbox is still unchecked because the *user-facing registration UI* (Phase 2) has not been built — the *storage capability* is in place. Phase 1 goal explicitly states "no frontend changes required yet." |
| REG-04 | 01-04-PLAN | External runtimes follow same owner + org-sharing model | SATISFIED | `agents-service.test.ts` DISC-02 and REG-04 describe blocks confirm via unit tests; `cloneAgent` bug fixed |
| DISC-02 | 01-04-PLAN | External runtimes shared with org are visible to all users | SATISFIED | `listSharedAgents` returns `external_agentcore` agents without filtering; 2 unit tests confirm |
| INFRA-01 | 01-02-PLAN | `bedrock-agentcore:InvokeRuntime` on backend Lambda execution role | SATISFIED | `agentcore-stack.ts` lines 508-516 |
| INFRA-02 | 01-03-PLAN | New backend route `POST /agents/:agentId/invoke` handling SigV4 proxy | SATISFIED | Route registered at line 171 of `routes/agents.ts`; SigV4 signing confirmed in code and tests |
| INFRA-03 | 01-01-PLAN (requirements: [REG-03, INFRA-03]) | `GET /agents/:agentId` returns new optional fields | SATISFIED | `fromDynamoAgent` spreads `DynamoAgent` (which extends `Omit<Agent,'isShared'>` including the four new optional fields); GET handler returns full `Agent` object. REQUIREMENTS.md checkbox unchecked — see Note below. |

**Note on REQUIREMENTS.md checkbox status:** At time of verification, REQUIREMENTS.md still shows REG-03 and INFRA-03 as `[ ]` / "Pending" while the traceability table shows them as "Pending" (not "Complete"). The implementation in the codebase satisfies the technical portion of both requirements. REG-03 requires UI (Phase 2) to be fully end-to-end; INFRA-03 is fully satisfied at the API level. The REQUIREMENTS.md tracking should be updated: INFRA-03 → Complete, REG-03 → Partial (API done, UI Phase 2).

**Orphaned requirements check:** No requirements mapped to Phase 1 in REQUIREMENTS.md that are absent from the four plan files.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

No TODOs, FIXMEs, placeholder returns, hardcoded empty data, `process.env` access, or `console` calls found in any modified file.

### Human Verification Required

#### 1. End-to-End Agent Creation and Retrieval

**Test:** `curl -X POST /agents` with `agentType: 'external_agentcore'`, valid `externalRuntimeArn`, region, and streamFormat against a deployed backend with a valid Cognito JWT. Then `curl GET /agents/:id`.
**Expected:** 201 response with all four fields; GET returns same four fields.
**Why human:** Requires deployed backend, DynamoDB table, and a valid Cognito access token.

#### 2. SigV4 Proxy Live Invocation

**Test:** Register an external AgentCore Runtime in the deployment account. `curl -X POST /agents/:agentId/invoke` with a JSON body through the deployed backend.
**Expected:** Streamed SSE response relayed from the external runtime; no 403 from AWS (confirms IAM permission is in effect).
**Why human:** Requires deployed Lambda with `bedrock-agentcore:InvokeRuntime` permission, live AgentCore Runtime ARN, and network access to `bedrock-agentcore.{region}.amazonaws.com`.

#### 3. Zod 400 Rejection via HTTP

**Test:** `curl -X POST /agents` body `{"name":"x","description":"y","systemPrompt":"z","enabledTools":[],"agentType":"external_agentcore"}` (omitting `externalRuntimeArn`).
**Expected:** HTTP 400 with validation error message `externalRuntimeArn is required when agentType is external_agentcore`.
**Why human:** Requires deployed backend — though the Zod schema is unit-verified, the HTTP response shape confirms middleware wiring end-to-end.

### Gaps Summary

No gaps. All automated checks passed. Phase goal is achieved:

1. **DynamoDB schema supports external runtimes** — four optional fields on `Agent`, `CreateAgentInput`, `UpdateAgentPatch`, and Zod route schemas; `buildAgentUpdateExpression` SETs them conditionally; `fromDynamoAgent` returns them via spread.

2. **Backend can proxy invocations with SigV4 signing** — `POST /agents/:agentId/invoke` is registered, guarded (404/400), signs outbound requests with `SignatureV4({ service: 'bedrock-agentcore' })`, and handles both stream formats.

3. **CDK IAM policy grants the permission** — `InvokeExternalAgentCoreRuntime` PolicyStatement on the backend Lambda execution role; cdk-nag IAM5 suppression updated; no duplicate suppression path.

4. **Sharing and clone work for external agents** — `listSharedAgents` returns `external_agentcore` agents; `cloneAgent` preserves all four fields (bug fixed in plan 04); DynamoDB integration round-trips confirmed.

---

_Verified: 2026-06-28T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
