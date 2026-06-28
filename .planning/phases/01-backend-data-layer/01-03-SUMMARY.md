---
phase: 01-backend-data-layer
plan: 03
subsystem: api
tags: [sigv4, aws-signing, proxy, sse, streaming, bedrock-agentcore, express, jest]

# Dependency graph
requires:
  - phase: 01-backend-data-layer
    plan: 01
    provides: "Agent type fields (agentType, externalRuntimeArn, externalRuntimeRegion, streamFormat) on Agent model and DynamoDB marshal layer"
provides:
  - "POST /agents/:agentId/invoke — SigV4-signed proxy endpoint to external AgentCore Runtime"
  - "Strands stream pass-through (upstreamRes.pipe to client)"
  - "Other-format stream buffering emitting single content_block_delta SSE event"
  - "Guard: 404 for unknown agents, 400 for native moca agents"
  - "Unit test coverage for all invoke route behaviours"
affects:
  - "03-invocation-wiring — frontend wires to this endpoint"
  - "backend integration tests — agents-invoke test covers new route"

# Tech tracking
tech-stack:
  added:
    - "@smithy/signature-v4@^4.0.0 — SigV4 request signing"
    - "@aws-crypto/sha256-js@^5.2.0 — SHA256 hash for SigV4"
    - "@aws-sdk/credential-provider-node@^3.972.0 — Lambda execution role credentials"
  patterns:
    - "SigV4-signed HTTPS proxy via node:https.request with streams wrapped in Promise"
    - "Stream forking: Strands -> pipe, other -> buffer then single SSE event"
    - "asyncHandler wraps Promise<void> so Express holds connection until stream completes"
    - "Jest moduleNameMapper maps all @moca/* workspace packages to TS source"

key-files:
  created:
    - "packages/backend/src/routes/__tests__/agents-invoke.test.ts — Unit tests for invoke route (404, 400, SigV4 header, both stream formats)"
  modified:
    - "packages/backend/src/routes/agents.ts — New POST /:agentId/invoke route with SigV4 signing and stream relay"
    - "packages/backend/package.json — Three new SigV4 signing dependencies"
    - "packages/backend/jest.config.js — Added moduleNameMapper for @moca/tool-definitions and @moca/generative-ui-catalog"

key-decisions:
  - "Use node:https.request (not fetch or axios) to match session-stream-handler signing reference and avoid adding another HTTP client dependency"
  - "Wrap stream in Promise<void> so asyncHandler keeps the connection alive until upstream stream finishes (avoids premature socket close)"
  - "strands stream: pipe directly for zero-copy efficiency; other: buffer entire response into single content_block_delta SSE event"
  - "Mocked resolveTargetUser in tests via jest.mock to avoid full Cognito JWT setup in unit tests"

patterns-established:
  - "SigV4 for bedrock-agentcore: service name must be 'bedrock-agentcore' (matches IAM namespace)"
  - "Endpoint URL pattern: https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encodeURIComponent(arn)}/invocations?qualifier=DEFAULT"
  - "All agent IDs in tests must be valid UUIDs (enforced by zAgentId validator)"

requirements-completed: [INFRA-02]

# Metrics
duration: 30min
completed: 2026-06-28
---

# Phase 1 Plan 03: SigV4 Invoke Proxy Summary

**SigV4-signed proxy route `POST /agents/:agentId/invoke` using @smithy/signature-v4, with Strands stream pass-through and single-event buffering for other formats**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-28T20:40:00Z
- **Completed:** 2026-06-28T21:10:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Installed three SigV4 signing dependencies (@smithy/signature-v4, @aws-crypto/sha256-js, @aws-sdk/credential-provider-node) into @moca/backend
- Implemented `POST /agents/:agentId/invoke` with proper guards (404 for unknown agents, 400 for native moca agents) and SigV4-signed outbound HTTPS request to external AgentCore Runtime
- Created agents-invoke.test.ts covering all four required cases (404, 400, SigV4 Authorization header presence, content_block_delta SSE output); all 150 backend tests pass

## Task Commits

1. **Task 1: Install SigV4 deps and scaffold agents-invoke test** - `fa6ce5e` (feat)
2. **Task 2: Implement POST /agents/:agentId/invoke SigV4 proxy handler** - `93c77bb` (feat)

## Files Created/Modified

- `packages/backend/src/routes/agents.ts` - New POST /:agentId/invoke route with SigV4 signing, Strands pipe, and other-format buffering
- `packages/backend/src/routes/__tests__/agents-invoke.test.ts` - Unit tests covering 404/400 guards, SigV4 Authorization header, and both stream format paths
- `packages/backend/package.json` - Added @smithy/signature-v4, @aws-crypto/sha256-js, @aws-sdk/credential-provider-node
- `packages/backend/jest.config.js` - Added @moca/tool-definitions and @moca/generative-ui-catalog to moduleNameMapper
- `package-lock.json` - Updated with new dependency tree

## Decisions Made

- Used `node:https.request` (not fetch/axios) to stay consistent with `session-stream-handler`'s established SigV4 signing pattern
- Wrapped stream lifecycle in `Promise<void>` so `asyncHandler` keeps the Express connection open until upstream stream finishes
- For `strands` format: pipe upstream response directly to client (zero-copy, lowest latency)
- For `other` format: buffer full upstream body and emit single `content_block_delta` SSE event followed by `[DONE]`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @moca/tool-definitions and @moca/generative-ui-catalog to jest.config.js moduleNameMapper**
- **Found during:** Task 2 (running agents-invoke tests)
- **Issue:** Jest could not resolve `@moca/tool-definitions` (transitively required by `default-agents.ts` imported via `agents.ts`) and `@moca/generative-ui-catalog` (required by tool-definitions). The existing config only mapped `@moca/core`.
- **Fix:** Added two entries to `moduleNameMapper` in `packages/backend/jest.config.js` pointing to their respective TypeScript source `index.ts` files
- **Files modified:** packages/backend/jest.config.js
- **Verification:** Test suite runs and all 150 tests pass
- **Committed in:** 93c77bb (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed test fixture agent IDs to be valid UUIDs**
- **Found during:** Task 2 (running agents-invoke tests)
- **Issue:** Test fixtures used slug-style IDs (e.g., `agent-external-strands`) which fail `zAgentId` UUID validation in the `validate({ params: agentIdParams })` middleware, causing 400 before the handler logic runs
- **Fix:** Replaced all fixture agent IDs with valid UUID-format strings (e.g., `11111111-1111-1111-1111-111111111111`)
- **Files modified:** packages/backend/src/routes/__tests__/agents-invoke.test.ts
- **Verification:** All 5 agents-invoke tests pass, including the 404 guard test
- **Committed in:** 93c77bb (Task 2 commit)

**3. [Rule 3 - Blocking] Mocked resolveTargetUser to bypass Cognito JWT auth in unit tests**
- **Found during:** Task 2 (first run of agents-invoke tests)
- **Issue:** The `resolveTargetUser` middleware calls `getCurrentAuth(req)` which requires `req.jwt` and `req.userId` populated by the full auth chain. Test app received 401 UNAUTHENTICATED on all routes.
- **Fix:** Added `jest.mock('../../middleware/auth.js', ...)` to override `resolveTargetUser` with a pass-through that sets `req.targetUserId` directly, leaving other exports intact via `jest.requireActual`
- **Files modified:** packages/backend/src/routes/__tests__/agents-invoke.test.ts
- **Verification:** All routes now reach the handler logic; 404 and 400 guard tests pass
- **Committed in:** 93c77bb (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All three fixes were necessary for the test suite to run correctly. No scope creep; all fixes are local to the test infrastructure.

## Issues Encountered

- Worktree did not have 01-01 changes (agentType, externalRuntimeArn, etc. on Agent model) until gsd/v1.0-milestone was merged. Merged mid-execution; resolved without conflict.

## Known Stubs

None — all fields are wired to real DynamoDB data via `agentsService.getAgent` (implemented in plan 01-01).

## Next Phase Readiness

- `POST /agents/:agentId/invoke` is fully implemented and tested; curl-testable against deployed backend
- Frontend (Phase 3) can wire the Integrations chat view to call this endpoint
- IAM permission `bedrock-agentcore:InvokeRuntime` was added to the backend Lambda role in plan 01-02

---
*Phase: 01-backend-data-layer*
*Completed: 2026-06-28*
