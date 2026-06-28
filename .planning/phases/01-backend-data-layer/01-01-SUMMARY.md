---
phase: 01-backend-data-layer
plan: 01
subsystem: backend
tags: [agent-types, dynamodb, repository, zod, external-agentcore]
dependency_graph:
  requires: []
  provides:
    - Agent interface with agentType, externalRuntimeArn, externalRuntimeRegion, streamFormat
    - UpdateAgentPatch with four new optional fields
    - CreateAgentInput with four new optional fields
    - buildAgentUpdateExpression handling new fields
    - createAgentBody/updateAgentBody Zod schemas with new fields and superRefine refinement
  affects:
    - packages/backend/src/types/agent-types.ts
    - packages/backend/src/repositories/agents/agents-repository.ts
    - packages/backend/src/repositories/agents/dynamodb/item.ts
    - packages/backend/src/routes/agents.ts
    - packages/backend/src/services/agents-service.ts
tech_stack:
  added: []
  patterns:
    - Zod superRefine cross-field validation (not .partial() to preserve refinement)
    - DynamoDB marshall removeUndefinedValues for optional fields
    - TDD Red-Green pattern
key_files:
  created: []
  modified:
    - packages/backend/src/types/agent-types.ts
    - packages/backend/src/repositories/agents/agents-repository.ts
    - packages/backend/src/repositories/agents/dynamodb/item.ts
    - packages/backend/src/routes/agents.ts
    - packages/backend/src/services/agents-service.ts
    - packages/backend/src/repositories/agents/dynamodb/__tests__/item.test.ts
decisions:
  - "Used explicit updateAgentBody definition (not createAgentBody.partial()) because Zod v4 .partial() drops .superRefine from a refined schema"
  - "New fields carry through DynamoAgent automatically via Omit<Agent, 'isShared'> inheritance — no DynamoAgent changes needed"
  - "New fields use marshall removeUndefinedValues=true so absent optional fields are dropped on write and unmarshal as undefined"
metrics:
  duration: 5m
  completed: "2026-06-28"
  tasks_completed: 2
  files_modified: 6
---

# Phase 1 Plan 01: Extend Agent Data Layer for External AgentCore Runtimes Summary

Four optional fields added to the agent data layer to support external AgentCore runtime registration: `agentType`, `externalRuntimeArn`, `externalRuntimeRegion`, `streamFormat`. Zod create schema enforces `externalRuntimeArn` presence when `agentType` is `external_agentcore` via superRefine cross-field validation.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Extend Agent type, UpdateAgentPatch, and item.ts marshal write path | 8459d32 | agent-types.ts, agents-repository.ts, item.ts, item.test.ts |
| 2 | Extend Zod create/update schemas with new fields and external-runtime refinement | a13bd79 | agents.ts (routes), agents-service.ts |

## What Was Built

### Type Layer (`agent-types.ts`)
- Added four optional fields to `Agent` interface after `createdBy`
- Added same four fields to `CreateAgentInput` (flows to `UpdateAgentInput` via `Partial<CreateAgentInput>`)
- `DynamoAgent` unchanged — it extends `Omit<Agent, 'isShared'>` so new optional fields carry through automatically

### Repository Layer (`agents-repository.ts`)
- Added four optional fields to `UpdateAgentPatch`

### Marshal Layer (`item.ts`)
- Added four SET clauses in `buildAgentUpdateExpression` (before the `updatedAt` stamp)
- `toItemAttr`/`fromItemAttr` required no changes — `marshall({ removeUndefinedValues: true })` already handles optional fields

### Route Layer (`routes/agents.ts`)
- Replaced `createAgentBody` with explicit `z.object({...}).superRefine(...)` including the four new fields
- Replaced `updateAgentBody = createAgentBody.partial()` with explicit partial object (Zod v4 `.partial()` drops `.superRefine`)
- Cross-field refinement: `agentType === 'external_agentcore'` requires `externalRuntimeArn` or returns 400

### Service Layer (`agents-service.ts`)
- Added four new field assignments in `createAgent` method (explicit field-by-field construction)
- `updateAgent` already spreads `...rest` into the patch, so update flows through automatically

## Tests

- Item test file extended with:
  - Round-trip test: `toItemAttr(externalAgent)` → `fromItemAttr(...)` preserves all four fields
  - Round-trip test: native agent round-trip leaves new fields `undefined`, no `agentType` key in marshalled item
  - Update expression test: patch with all four fields produces correct SET clauses
  - Update expression test: empty patch does NOT include the new field SET clauses
- All 145 backend tests pass

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Created files
- `.planning/phases/01-backend-data-layer/01-01-SUMMARY.md` — this file

### Commits
- `8459d32` — feat(01-01): extend Agent type, UpdateAgentPatch, and item.ts marshal write path
- `a13bd79` — feat(01-01): extend Zod create/update schemas with new fields and external-runtime refinement

## Self-Check: PASSED
