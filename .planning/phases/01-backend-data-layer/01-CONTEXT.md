# Phase 1: Backend & Data Layer - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the backend to support external AgentCore runtimes: add optional fields to the DynamoDB agent schema, create a SigV4-signed proxy route `POST /agents/:agentId/invoke`, and grant `bedrock-agentcore:InvokeRuntime` to the backend Lambda execution role in CDK. Deliverable is a `curl`-testable proxy endpoint — no frontend changes.

</domain>

<decisions>
## Implementation Decisions

### DynamoDB Schema Extension
- **D-01:** Add four optional fields to the `Agent` interface in `packages/backend/src/types/agent-types.ts`: `agentType?: 'moca' | 'external_agentcore'`, `externalRuntimeArn?: string`, `externalRuntimeRegion?: string`, `streamFormat?: 'strands' | 'other'`
- **D-02:** Existing agents without `agentType` default to `'moca'` behavior — no migration needed (DynamoDB is schemaless)
- **D-03:** Same fields added to `UpdateAgentPatch` in `packages/backend/src/repositories/agents/agents-repository.ts`
- **D-04:** Zod schemas `createAgentBody` and `updateAgentBody` in `packages/backend/src/routes/agents.ts` extended with the four optional fields; refinement added requiring `externalRuntimeArn` when `agentType === 'external_agentcore'`

### Proxy Route
- **D-05:** New route `POST /agents/:agentId/invoke` added to `packages/backend/src/routes/agents.ts`; the route looks up the agent record, validates it is `external_agentcore`, then proxies to the external runtime
- **D-06:** **Request body**: full passthrough — the proxy forwards the complete client request body to the external runtime as-is; no re-shaping at the backend for v1
- **D-07:** **`externalRuntimeRegion` default**: when `externalRuntimeRegion` is absent on the agent record, the proxy falls back to the deployment region (from `AWS_REGION` env var) at invocation time; the field is optional in both schema and storage

### SigV4 Signing
- **D-08:** Use `@aws-sdk/signature-v4` (or the equivalent AWS SDK v3 `SignatureV4` class) to sign requests to the external AgentCore Runtime endpoint: `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{arn}/invocations`
- **D-09:** The backend Lambda execution role already exists — add `bedrock-agentcore:InvokeRuntime` to it via the existing `grantPermissions()` helper in `packages/cdk/lib/constructs/api/backend-api.ts:364`

### Stream Handling
- **D-10:** **Strands format (`streamFormat === 'strands'`)**: pass the response stream through transparently — pipe bytes directly back to the frontend; no buffering
- **D-11:** **Non-Strands format (`streamFormat === 'other'` or unset for external)**: buffer the complete response, then emit a single SSE `content_block_delta` event in Moca format so the existing chat renderer can display it without modification; progressive streaming deferred to v2

### IAM
- **D-12:** Resource scope for `bedrock-agentcore:InvokeRuntime`: account-scoped — `arn:aws:bedrock-agentcore:{region}:{account}:runtime/*`; tight enough without requiring policy updates per new registration

### Claude's Discretion
- SigV4 signing implementation details (which SDK class, credential provider chain)
- Error wrapping for non-2xx responses from external runtime (v1: surface HTTP error as-is)
- Exact SSE event envelope for the buffered plain-text delta

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & ADRs
- `docs/adr/aws-data-access-control.md` — userId vs identityId model; IAM policy variable patterns. Read before changing IAM policies or DynamoDB access patterns.
- `docs/adr/build-design-rationale.md` — tsconfig composite placement, CDK outside the Solution. Read before touching CDK or build scripts.

### Backend Data Layer
- `packages/backend/src/types/agent-types.ts` — `Agent` interface and `DynamoAgent` — extend these for the new fields
- `packages/backend/src/repositories/agents/agents-repository.ts` — `UpdateAgentPatch` interface — add new optional fields here
- `packages/backend/src/routes/agents.ts` — `createAgentBody` / `updateAgentBody` Zod schemas and existing CRUD routes — extend and add proxy route here
- `packages/backend/src/services/agents-service.ts` — service layer between routes and repository

### CDK Infrastructure
- `packages/cdk/lib/constructs/api/backend-api.ts` — `grantPermissions()` at line 364 — use this to add IAM policy to backend Lambda role
- `packages/cdk/lib/agentcore-stack.ts` — main stack where IAM grants are wired
- `packages/cdk/config/environments.ts` — environment config; check `bedrockModels` and `corsAllowedOrigins` patterns for how env-specific values are structured

### External AgentCore Runtime API
- `packages/cdk/lib/constructs/agentcore/agentcore-runtime.ts` — invocation endpoint pattern: `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{runtimeArn}/invocations?qualifier=DEFAULT`
- `packages/backend/src/index.ts` — Express app entry point; check how routes are registered

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — full architecture overview including backend Lambda role setup
- `.planning/codebase/INTEGRATIONS.md` — AgentCore Runtime integration details and SDK references

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `asyncHandler` middleware (`packages/backend/src/middleware/async-handler.ts`): wraps all route handlers — use for the proxy route
- `validate` middleware with Zod schemas: existing pattern for request body validation — extend `createAgentBody`/`updateAgentBody`
- `grantPermissions(statement)` in `backend-api.ts:364`: existing helper to add IAM policies to backend Lambda role
- `AppError` / `ErrorCode` from `packages/backend/src/libs/http/`: existing error types for consistent HTTP error responses

### Established Patterns
- Repository pattern: routes → service → repository; new proxy route should call `agentsService.getAgent()` to look up the agent record
- Zod validation: all request bodies go through `validate({ body: schema })` middleware before handler
- Branded types: `AgentId` from `@moca/core` — use `parseAgentId()` for the `:agentId` path param

### Integration Points
- The proxy route wires into `packages/backend/src/routes/agents.ts` — add after existing GET/POST/PUT/DELETE routes
- CDK IAM addition goes in `packages/cdk/lib/agentcore-stack.ts` where `backendApi.grantPermissions()` is already called for other permissions
- Streaming response: backend uses standard Node.js HTTP response streaming (Express `res` object) — pipe the upstream response stream for Strands passthrough

</code_context>

<specifics>
## Specific Ideas

- The external runtime invocation endpoint follows the same URL pattern as the internal runtime: `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{externalRuntimeArn}/invocations?qualifier=DEFAULT`
- For non-Strands buffering, the single emitted event should match Moca's existing SSE format: `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"<buffered text>"}}`
- The `curl` test mentioned in the phase goal: create an agent record with `agentType: 'external_agentcore'` via `POST /agents`, then `curl -X POST /agents/{id}/invoke -d '{"prompt":"hello"}'`

</specifics>

<deferred>
## Deferred Ideas

- Progressive streaming for non-Strands runtimes (chunk-by-chunk wrapping) — v2
- Connection validation / test-before-save — already out of scope per REQUIREMENTS.md
- ARN format validation — v2 per REQUIREMENTS.md
- Session context forwarding to external runtime — v2 (SESS-01)
- Per-registered-ARN IAM scoping — impractical for v1; account-scoped is sufficient

</deferred>

---

*Phase: 01-backend-data-layer*
*Context gathered: 2026-06-28*
