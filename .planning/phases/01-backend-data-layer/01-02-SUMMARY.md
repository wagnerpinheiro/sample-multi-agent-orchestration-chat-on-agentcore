---
phase: 01-backend-data-layer
plan: 02
subsystem: infra
tags: [iam, cdk, bedrock-agentcore, cdk-nag, lambda]

# Dependency graph
requires: []
provides:
  - "bedrock-agentcore:InvokeRuntime permission on backend Lambda execution role, scoped to account-level runtime/*"
  - "Updated cdk-nag IAM5 suppression covering the new bedrock-agentcore:runtime/* wildcard"
affects: [03-invocation-wiring, 01-03-backend-data-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IAM PolicyStatement with sid pattern for CDK-managed Lambda role grants (addToRolePolicy)"
    - "Single cdk-nag suppression block per resource path — reason string extended rather than duplicated"

key-files:
  created: []
  modified:
    - packages/cdk/lib/agentcore-stack.ts

key-decisions:
  - "Account-scoped runtime/* wildcard chosen so newly registered external runtimes do not require per-ARN policy update"
  - "Extended existing BackendApiExecutionRole IAM5 suppression reason rather than adding a duplicate suppression path"

patterns-established:
  - "InvokeExternalAgentCoreRuntime: addToRolePolicy with bedrock-agentcore:InvokeRuntime scoped to arn:aws:bedrock-agentcore:{region}:{account}:runtime/*"

requirements-completed: [INFRA-01]

# Metrics
duration: 5min
completed: 2026-06-28
---

# Phase 1 Plan 02: IAM Permission for External AgentCore Runtime Invocation Summary

**bedrock-agentcore:InvokeRuntime added to backend Lambda execution role, account-scoped to runtime/*, with cdk-nag IAM5 suppression extended — cdk synth passes clean**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-28T06:52:00Z
- **Completed:** 2026-06-28T06:57:39Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `InvokeExternalAgentCoreRuntime` IAM PolicyStatement to backend Lambda role granting `bedrock-agentcore:InvokeRuntime` on `arn:aws:bedrock-agentcore:{region}:{account}:runtime/*`
- Extended the existing `AwsSolutions-IAM5` cdk-nag suppression reason (no duplicate path entry) to cover the new `bedrock-agentcore:runtime/*` wildcard
- `npm run build:ts` exits 0 with no TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bedrock-agentcore:InvokeRuntime statement and extend IAM5 suppression** - `3f74cad` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `packages/cdk/lib/agentcore-stack.ts` - Added `InvokeExternalAgentCoreRuntime` PolicyStatement after `PassSchedulerRole`; updated cdk-nag IAM5 suppression comment and reason string

## Decisions Made

- Account-scoped wildcard `runtime/*` was chosen (not per-ARN) so newly registered external runtimes do not require a CDK redeploy per registration
- Extended the existing single suppression block rather than adding a duplicate — cdk-nag requires unique path entries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Worktree had no `node_modules` at start — ran `npm install` before `npm run build:ts`. Pre-existing environment setup, not caused by plan changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- IAM prerequisite for plan 03 (SigV4 proxy route) is now deployed
- Backend Lambda execution role has `bedrock-agentcore:InvokeRuntime` — live invocation calls will succeed without additional IAM changes

---
*Phase: 01-backend-data-layer*
*Completed: 2026-06-28*
