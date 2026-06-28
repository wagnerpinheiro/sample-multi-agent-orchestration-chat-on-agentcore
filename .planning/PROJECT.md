# External AgentCore Runtime Integration

## What This Is

Feature extension for Moca that allows users to register AgentCore Runtime instances already deployed in their AWS account and invoke them directly through the Moca chat interface. Registered external runtimes appear alongside native Moca agents in a dedicated Integrations screen, using the same ownership and sharing model.

## Core Value

A user can connect any AgentCore Runtime they own and talk to it through Moca without re-implementing it as a native agent.

## Requirements

### Validated

- [x] Backend proxies invocations to external runtimes with SigV4 signing — Validated in Phase 1: Backend & Data Layer
- [x] Strands-based runtimes use stream pass-through; non-Strands runtimes fall back to plain text — Validated in Phase 1
- [x] External runtimes follow the same owner + org-sharing model as native Moca agents — Validated in Phase 1
- [x] DynamoDB agent schema extended with optional fields only (no new table, no breaking change) — Validated in Phase 1
- [x] IAM: `bedrock-agentcore:InvokeRuntime` added to backend Lambda role — Validated in Phase 1

### Active

- [ ] User can register an external runtime via a dedicated Integrations screen (ARN, region, name, description, stream type)
- [ ] Registered external runtimes appear in the agent list alongside native Moca agents
- [ ] User can open a chat session with an external runtime agent

### Out of Scope

- Auto-discovery of runtimes via AWS API — deferred; adds IAM complexity and scope
- Cross-account runtime access — deferred; requires cross-account role assumption design
- Full stream normalization for arbitrary non-Strands formats — v1 falls back to plain text
- Connection validation / test-before-save — v1 happy path only; errors surface in chat
- Dedicated session history schema for external runtimes — reuses existing session infra

## Context

**Existing architecture**: Moca has a single AgentCore Runtime instance (Docker + Express on port 8080) that handles all invocations. "Agents" are DynamoDB records with `systemPrompt`, `enabledTools`, `modelId`, `mcpConfig`. The frontend calls `VITE_AGENT_ENDPOINT` (the runtime's URL) directly, forwarding Cognito JWT via custom headers.

**Auth gap**: The frontend cannot directly call external runtimes because they require AWS SigV4 signing, not just Cognito JWT. The backend Lambda (which already holds an IAM execution role) is the right signing proxy.

**Stream format**: Moca's frontend parses a Strands SDK streaming format (events: `content_block_delta`, `before_tools`, `server_completion`, etc.). External runtimes built with Strands will be natively compatible. Others need to be treated as raw text to avoid parse errors.

**Codebase map**: `.planning/codebase/` has full analysis (ARCHITECTURE.md, INTEGRATIONS.md, etc.)

## Constraints

- **Schema**: No structural DynamoDB table changes — add optional fields (`agentType`, `externalRuntimeArn`, `externalRuntimeRegion`, `streamFormat`) to existing agent records
- **IAM**: Use existing backend Lambda execution role; only add the new permission
- **Scope**: v1 = happy path. First invocation working end-to-end takes priority over error handling polish

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Backend as SigV4 proxy (not frontend) | Frontend cannot hold AWS credentials safely | ✓ Implemented |
| Strands pass-through + plain text fallback | Avoids implementing a generic stream parser for v1 | ✓ Implemented |
| Optional fields on existing agent table | User constraint: no DynamoDB schema breaking changes | ✓ Implemented |
| Dedicated Integrations screen (not Agent Builder) | User preference; keeps external runtime registration separate from prompt-based agent creation | — Phase 2 |

---
*Last updated: 2026-06-28 — Phase 1 complete*
