---
phase: 01-backend-data-layer
plan: 04
subsystem: backend
tags: [testing, agents, sharing, clone, external-agentcore, dynamodb, integration-tests]
dependency_graph:
  requires:
    - phase: 01-backend-data-layer
      plan: 01
      provides: Agent type, CreateAgentInput, UpdateAgentPatch with four new optional fields (agentType, externalRuntimeArn, externalRuntimeRegion, streamFormat)
  provides:
    - Service unit tests asserting external_agentcore agents appear in listSharedAgents (DISC-02)
    - Service unit tests asserting cloneAgent preserves all four new fields (REG-04)
    - Integration tests proving four new fields round-trip through real DynamoDB create/get/update
    - Bug fix: cloneAgent now maps agentType, externalRuntimeArn, externalRuntimeRegion, streamFormat
  affects:
    - packages/backend/src/services/agents-service.ts (cloneAgent fix)
tech_stack:
  added: []
  patterns:
    - Jest mock-repo harness for service-layer isolation
    - Testcontainers DynamoDB Local with TESTCONTAINERS_RYUK_DISABLED for Podman compatibility
key_files:
  created: []
  modified:
    - packages/backend/src/services/__tests__/agents-service.test.ts
    - packages/backend/src/services/agents-service.ts
    - packages/backend/src/repositories/agents/dynamodb/repository.integration.test.ts
key_decisions:
  - "Auto-fixed cloneAgent to map agentType/externalRuntimeArn/externalRuntimeRegion/streamFormat (Rule 1 bug)"
  - "Integration tests require TESTCONTAINERS_RYUK_DISABLED=true with Podman (volume mount limitation on macOS)"
  - "Merged gsd/v1.0-milestone into worktree branch before running tests to get plan 01-01 type definitions"
patterns-established:
  - "Service tests: add new describe block per feature area (DISC-02, REG-04) to keep concerns organized"
  - "Integration tests: nest new tests in nested describe block to clarify what behavior they prove"
requirements-completed: [REG-04, DISC-02]
duration: 45m
completed: "2026-06-28"
tasks_completed: 2
files_modified: 3
---

# Phase 1 Plan 04: External Runtime Sharing and Clone Verification Summary

**Verified external_agentcore agents flow through listSharedAgents and cloneAgent identically to native agents, fixed cloneAgent field-drop bug, and proved four new DynamoDB fields round-trip through real DynamoDB Local.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-06-28T20:57:18Z
- **Completed:** 2026-06-28T21:42:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added listSharedAgents unit tests asserting external_agentcore agents (with ARN fields) are returned unchanged (DISC-02)
- Added cloneAgent unit tests asserting all four fields are preserved when cloning an external runtime agent (REG-04)
- Fixed production bug in cloneAgent: the four new fields were silently dropped from the cloned agent
- Added DynamoDB Local integration tests proving create/get/update round-trips for the four new fields
- Confirmed native agents (without the four new fields) return undefined for all four on get (D-02 schemaless default)

## Task Commits

1. **Task 1: Assert external_agentcore sharing/clone (service unit test + cloneAgent fix)** - `9cc9388` (feat)
2. **Task 2: Integration round-trip for four new fields** - `492ea1e` (feat)

## Files Created/Modified

- `packages/backend/src/services/__tests__/agents-service.test.ts` - Added DISC-02 and REG-04 describe blocks with 4 new tests
- `packages/backend/src/services/agents-service.ts` - Fixed cloneAgent to propagate agentType/externalRuntimeArn/externalRuntimeRegion/streamFormat
- `packages/backend/src/repositories/agents/dynamodb/repository.integration.test.ts` - Added D-02 describe block with 3 integration tests

## Decisions Made

- Merged `gsd/v1.0-milestone` into the worktree branch before executing tests, as plan 01-01's type definitions were required for TypeScript to recognize the four new fields
- Required `TESTCONTAINERS_RYUK_DISABLED=true` and `DOCKER_HOST` env vars to run Testcontainers with Podman on macOS (Ryuk needs Docker socket volume mount which Podman doesn't support on macOS)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cloneAgent dropping agentType, externalRuntimeArn, externalRuntimeRegion, streamFormat**
- **Found during:** Task 1 (service unit test — cloneAgent REG-04)
- **Issue:** cloneAgent's CreateAgentInput construction listed only: name, description, icon, systemPrompt, enabledTools, scenarios, mcpConfig, defaultStoragePath. The four new fields were not mapped, so cloned external_agentcore agents lost all runtime configuration.
- **Fix:** Added four field mappings to the input object in cloneAgent: `agentType: sourceAgent.agentType`, `externalRuntimeArn: sourceAgent.externalRuntimeArn`, `externalRuntimeRegion: sourceAgent.externalRuntimeRegion`, `streamFormat: sourceAgent.streamFormat`
- **Files modified:** packages/backend/src/services/agents-service.ts
- **Verification:** `npm run test -w @moca/backend` passes — all 149 unit tests pass
- **Committed in:** 9cc9388 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** The plan explicitly anticipated this fix and instructs to apply it if the test exposed a drop. No scope creep.

## Issues Encountered

- Worktree branch (`worktree-agent-aee3601c203e5ba97`) was behind `gsd/v1.0-milestone` and did not have the plan 01-01 type additions. Running tests without merging first caused TypeScript to not recognize agentType/externalRuntimeArn/externalRuntimeRegion/streamFormat fields on Agent and CreateAgentInput, making all new test assertions receive `undefined`. Fixed by merging `gsd/v1.0-milestone` into the worktree branch before execution.
- Testcontainers with Podman on macOS requires `TESTCONTAINERS_RYUK_DISABLED=true` and explicit `DOCKER_HOST` pointing to the Podman API socket. The standard `/var/run/docker.sock` symlink approach doesn't work because Podman cannot mount the socket file as a volume inside the container. The `-api.sock` path works with RYUK disabled.

## Self-Check

### Created files
- `.planning/phases/01-backend-data-layer/01-04-SUMMARY.md` — this file

### Commits
- `9cc9388` — feat(01-04): assert external_agentcore sharing/clone and fix cloneAgent field preservation
- `492ea1e` — feat(01-04): add integration round-trip tests for four new external runtime fields

## Next Phase Readiness

- REG-04 and DISC-02 are fully verified: external_agentcore agents are discoverable when shared and survive cloneAgent with all fields intact
- All four new DynamoDB fields are confirmed to round-trip through real DynamoDB
- Backend data layer is complete; Phase 2 (Frontend UI) can proceed with confidence in the data contracts

---
*Phase: 01-backend-data-layer*
*Completed: 2026-06-28*
