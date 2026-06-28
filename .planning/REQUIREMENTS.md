# Requirements: External AgentCore Runtime Integration

**Defined:** 2026-06-28
**Core Value:** A user can connect any AgentCore Runtime they own and talk to it through Moca without re-implementing it as a native agent.

## v1 Requirements

### Registration

- [ ] **REG-01**: User can navigate to a dedicated Integrations screen in the Moca UI
- [ ] **REG-02**: User can create an external runtime integration by providing: Runtime ARN (required), AWS region (optional, defaults to deployment region), display name, description, and stream format (`strands` | `other`)
- [ ] **REG-03**: Registered external runtimes are stored as agent records in DynamoDB with `agentType: 'external_agentcore'` and optional fields `externalRuntimeArn`, `externalRuntimeRegion`, `streamFormat`
- [ ] **REG-04**: External runtimes follow the same owner + org-sharing model as native agents (same `isShared` / `createdBy` fields)
- [ ] **REG-05**: User can edit and delete their registered external runtimes

### Discovery

- [ ] **DISC-01**: External runtime agents appear in the main agent list alongside native Moca agents, visually distinguished (e.g., badge or icon)
- [ ] **DISC-02**: External runtimes shared with the org are visible to all users (same as native shared agents)

### Invocation

- [ ] **INV-01**: User can open a chat session with an external runtime agent from the agent list
- [ ] **INV-02**: When a message is sent to an external runtime agent, the frontend calls a backend proxy endpoint instead of calling `VITE_AGENT_ENDPOINT` directly
- [ ] **INV-03**: Backend proxy endpoint signs requests to the external AgentCore Runtime using SigV4 with the Lambda execution role
- [ ] **INV-04**: Backend proxy streams the response back to the frontend
- [ ] **INV-05**: If `streamFormat === 'strands'`, the proxy passes through the stream raw (frontend parses natively)
- [ ] **INV-06**: If `streamFormat === 'other'`, the backend buffers the response and sends it as a plain text `content_block_delta` event in Moca format

### Infrastructure

- [ ] **INFRA-01**: `bedrock-agentcore:InvokeRuntime` permission added to the backend Lambda execution role in CDK
- [x] **INFRA-02**: New backend route `POST /agents/:agentId/invoke` (or similar) that handles the SigV4 proxy logic
- [ ] **INFRA-03**: Backend agent API (`GET /agents/:agentId`) returns the new optional fields to the frontend

## v2 Requirements

### Validation

- **VAL-01**: Connection test before saving — backend pings the runtime and surfaces errors in the UI
- **VAL-02**: ARN format validation on the frontend before submission
- **VAL-03**: Friendly error messages when the runtime returns non-200 or is unreachable

### Discovery

- **DISC-03**: Auto-discovery — list available AgentCore Runtimes in the user's AWS account via AWS API
- **DISC-04**: Cross-account runtime access via role assumption

### Session

- **SESS-01**: Full session history for external runtimes (pass session context headers to external runtime)
- **SESS-02**: Long-term memory integration for external runtime conversations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-discovery of runtimes via AWS API | Adds IAM complexity and scope; manual ARN input sufficient for v1 |
| Cross-account runtime access | Requires cross-account role assumption design — deferred |
| Generic stream normalization for arbitrary formats | No standard format exists; plain text fallback is safe for v1 |
| Full Moca session persistence for external runtimes | External runtime manages its own state; passing session headers is v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REG-01 | Phase 2 | Pending |
| REG-02 | Phase 2 | Pending |
| REG-03 | Phase 1 | Pending |
| REG-04 | Phase 1 | Pending |
| REG-05 | Phase 2 | Pending |
| DISC-01 | Phase 2 | Pending |
| DISC-02 | Phase 1 | Pending |
| INV-01 | Phase 2 | Pending |
| INV-02 | Phase 3 | Pending |
| INV-03 | Phase 3 | Pending |
| INV-04 | Phase 3 | Pending |
| INV-05 | Phase 3 | Pending |
| INV-06 | Phase 3 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-28*
*Last updated: 2026-06-28 — initial definition*
