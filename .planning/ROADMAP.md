# Roadmap: External AgentCore Runtime Integration

**Created:** 2026-06-28
**Core Value:** A user can connect any AgentCore Runtime they own and talk to it through Moca without re-implementing it as a native agent.
**Status:** Phase 1 of 3

---

## Phase 1: Backend & Data Layer

**Goal:** The DynamoDB agent schema supports external runtimes, the backend can proxy invocations to them with SigV4 signing, and the CDK IAM policy grants the permission needed at runtime. A `curl` against the new invoke route with a valid external agent record returns a streamed response — no frontend changes required yet.

**Why first:** Everything downstream (UI, invocation wiring) depends on the data model being stable and the proxy route existing. Frontend can be built against a contract that is already deployed and testable. CDK changes must precede any live invocation because the Lambda execution role needs `bedrock-agentcore:InvokeRuntime` before the proxy handler can call the service.

**Plans:** 0/4 plans executed

Plans:
- [ ] 01-01-PLAN.md — Extend agent schema: types, UpdateAgentPatch, item.ts marshal, Zod schemas (REG-03, INFRA-03) [wave 1]
- [ ] 01-02-PLAN.md — CDK: grant bedrock-agentcore:InvokeRuntime to backend Lambda role (INFRA-01) [wave 1]
- [ ] 01-03-PLAN.md — Add POST /agents/:agentId/invoke SigV4 proxy route + signing deps (INFRA-02) [wave 2]
- [ ] 01-04-PLAN.md — Verify sharing/clone + integration round-trip for external agents (REG-04, DISC-02) [wave 2]

### Tasks

- [ ] **Extend agent type definitions** — add `agentType: 'moca' | 'external_agentcore'`, `externalRuntimeArn?: string`, `externalRuntimeRegion?: string`, and `streamFormat?: 'strands' | 'other'` to the shared `Agent` interface in `packages/backend/src/types/agent-types.ts` and the mirrored frontend type in `packages/frontend/src/types/agent.ts`
- [ ] **Update Zod validation schemas** — extend `createAgentBody` and `updateAgentBody` in `packages/backend/src/routes/agents.ts` to accept the four new optional fields; add a refinement that requires `externalRuntimeArn` and `externalRuntimeRegion` when `agentType === 'external_agentcore'`
- [ ] **Update `AgentsRepository` interface** — add the four new optional fields to `UpdateAgentPatch` in `packages/backend/src/repositories/agents/agents-repository.ts` so the DynamoDB implementation persists them
- [ ] **Update DynamoDB write path** — ensure the repository `create` and `update` implementations marshal/unmarshal the new fields (no schema migration needed — DynamoDB is schemaless, existing rows will simply lack the fields and default to `'moca'` behavior)
- [ ] **Update `GET /agents/:agentId` response** — confirm the existing `getAgent` handler already returns all stored fields; verify by integration test that new fields round-trip correctly (REG-03, INFRA-03)
- [ ] **Add `POST /agents/:agentId/invoke` route** — new handler in `packages/backend/src/routes/agents.ts`:
  - Fetch the agent record; 404 if not found or caller lacks access
  - If `agentType !== 'external_agentcore'`, return 400 (wrong route for native agents)
  - Build the AgentCore Runtime invocation URL: `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encodedArn}/invocations?qualifier=DEFAULT`
  - Sign the outbound request with AWS SigV4 using `@aws-sdk/signature-v4` + `@aws-crypto/sha256-js` (or the SDK's built-in signing) against the caller's region; use the Lambda execution role credentials from the environment
  - Pipe the response body stream directly back to the Express response with `Content-Type: text/event-stream`
  - Handle non-2xx responses from the upstream runtime by forwarding the error (INFRA-02, INV-03, INV-04)
- [ ] **Add `bedrock-agentcore:InvokeRuntime` to backend Lambda IAM role** — in `packages/cdk/lib/agentcore-stack.ts`, add a new `addToRolePolicy` statement on `this.backendApi.lambdaFunction` scoped to `arn:aws:bedrock-agentcore:{region}:{account}:runtime/*`; add a matching cdk-nag suppression (INFRA-01)
- [ ] **Preserve sharing model** — confirm `listSharedAgents` and `cloneAgent` in `AgentsService` treat `external_agentcore` agents identically to `moca` agents (they read/write the same DynamoDB partition, so no code change should be needed; add assertions to existing service tests) (REG-04, DISC-02)
- [ ] **Write unit + integration tests** — cover: new fields round-trip through create/update/get; invoke route returns 400 for native agents; invoke route returns 404 for unknown agent; SigV4 signing header is present on the outbound request (mock the upstream)

### Verification

- [ ] `POST /agents` with `agentType: 'external_agentcore'`, a fake ARN, region, and `streamFormat: 'strands'` returns 201 and the stored record includes all four new fields
- [ ] `GET /agents/:agentId` for the same record returns the four new fields in the response body
- [ ] `POST /agents/:agentId/invoke` with a live external runtime ARN in the same account returns a streamed SSE response (test with a known-good runtime endpoint)
- [ ] `POST /agents/:agentId/invoke` where `agentType === 'moca'` returns 400
- [ ] `cdk diff` shows the new `bedrock-agentcore:InvokeRuntime` statement on the Backend API Lambda execution role
- [ ] Existing agent tests (`packages/backend/src/services/__tests__/`) still pass without modification

**Requirements:** REG-03, REG-04, DISC-02, INFRA-01, INFRA-02, INFRA-03

---

## Phase 2: Frontend UI

**Goal:** A user can open the Integrations screen, register an external runtime by entering its ARN, region, name, description, and stream format, edit or delete registrations, and see external runtime agents visually distinguished in the existing agent list. All management operations hit the existing backend CRUD routes extended in Phase 1 — no new backend work required.

**Why second:** The UI is a consumer of the Phase 1 schema contract. Building it second lets the form submit real payloads against the already-deployed backend. External runtime agents must appear in the list (DISC-01) and be chat-openable (INV-01) before Phase 3 wires the correct invocation path — the chat button can exist in Phase 2 even if it initially falls back to the native runtime path (users won't be able to chat meaningfully yet, but the flow is visible and testable end-to-end in Phase 3).

### Tasks

- [ ] **Add Integrations route** — register a new route (e.g. `/integrations`) in `packages/frontend/src/config/routes.ts` and add it to the sidebar/navigation; guard with existing auth middleware (REG-01)
- [ ] **Create `IntegrationsPage` component** — lists the user's `external_agentcore` agents filtered from `useAgentStore`; includes an "Add Integration" button that opens the registration form; shows empty-state when none exist
- [ ] **Create `ExternalRuntimeForm` component** — fields: Name (text), Description (text), ARN (`externalRuntimeArn`, text with basic ARN format hint), Region (`externalRuntimeRegion`, text or select of AWS regions), Stream Format (`streamFormat`, radio: `strands` | `other`); on submit calls `createAgent` from `packages/frontend/src/api/agents.ts` with `agentType: 'external_agentcore'` and the form values; client-side validation mirrors the backend Zod refinement (REG-02)
- [ ] **Create `EditExternalRuntimeModal` / inline edit** — pre-populates form with existing values; on submit calls `updateAgent`; includes a Delete button that calls `deleteAgent` with a confirmation dialog (REG-05)
- [ ] **Add visual distinction to agent list** — in the existing agent list component, detect `agentType === 'external_agentcore'` and render a badge (e.g. "External" chip in a distinct color) or a different icon alongside the agent name (DISC-01)
- [ ] **Enable chat entry point** — ensure the "Open chat" / "Start session" action for external runtime agents is accessible from both the agent list and the Integrations page; for Phase 2 the button can navigate to the existing chat view with the selected agent — Phase 3 will intercept the invocation path (INV-01)
- [ ] **Update `Agent` TypeScript type in frontend** — add the four new fields to `packages/frontend/src/types/agent.ts` (mirrors the backend change from Phase 1; likely already done if Phase 1 tasks were completed together)
- [ ] **Update `agentStore`** — no structural changes needed; confirm `createAgent` / `updateAgent` / `deleteAgent` actions already dispatch to the correct backend endpoints with the full body; extend store selectors if needed to filter external vs. native agents
- [ ] **Write component tests** — cover: form validation rejects missing ARN/region when agentType is external; successful submit creates the agent and adds it to the list; delete confirmation removes the agent; badge renders for external agents in the list

### Verification

- [ ] Navigating to `/integrations` renders the Integrations screen without errors
- [ ] Submitting the registration form with a valid ARN, region, name, description, and stream format creates the agent (verify via `GET /agents` that it appears with correct `agentType`)
- [ ] The created external runtime agent appears in the main agent list with a visible badge or icon differentiating it from native agents
- [ ] Editing the registration updates the stored values; deleting it removes the agent from both the list and the backend
- [ ] Clicking the chat/start-session button on an external runtime agent opens the chat view with that agent selected

**Requirements:** REG-01, REG-02, REG-05, DISC-01, INV-01

---

## Phase 3: Invocation Wiring

**Goal:** A user can send a message to an external runtime agent in the Moca chat view and receive a real streamed response from that runtime. The frontend routes invocations through the backend proxy (`POST /agents/:agentId/invoke`) rather than calling `VITE_AGENT_ENDPOINT` directly. Strands-format streams pass through transparently; non-Strands streams are buffered and emitted as plain-text delta events so the existing chat renderer handles both cases without modification.

**Why third:** This phase depends on both the proxy route (Phase 1) and the UI surface that selects an external agent and initiates a chat (Phase 2). Separating it avoids making the backend and frontend simultaneously depend on each other's unreleased behavior — the detection logic in the frontend and the stream normalization in the backend can be developed and tested against the stable contracts from Phases 1 and 2.

### Tasks

- [ ] **Detect agent type before invocation in `streamAgentResponse`** — in `packages/frontend/src/api/agent.ts`, before constructing the request, check if the currently selected agent (readable from `useAgentStore`) has `agentType === 'external_agentcore'`; if so, call the backend proxy instead of `agentClient.invoke` (INV-02)
- [ ] **Add `invokeExternalAgent` helper** — new function in `packages/frontend/src/api/agent.ts` (or a new `packages/frontend/src/api/external-agent.ts`) that calls `backendClient` with `POST /agents/:agentId/invoke`, forwarding the `prompt`, `sessionId`, and any other relevant fields; returns a `Response` with a readable stream so the existing SSE parsing loop in `streamAgentResponse` can process it unchanged
- [ ] **Implement stream pass-through for `streamFormat === 'strands'`** — in the `POST /agents/:agentId/invoke` backend handler, when `streamFormat === 'strands'`, pipe the upstream `Response.body` directly to the Express response without buffering; set `Transfer-Encoding: chunked` and `Content-Type: text/event-stream` to match what the frontend SSE parser expects (INV-05)
- [ ] **Implement stream normalization for `streamFormat === 'other'`** — in the same handler, when `streamFormat === 'other'`, collect the full upstream response body as a string, then emit a single SSE `data:` event in the shape the frontend renderer expects for a plain text delta (e.g. `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"<full response>"}}`) followed by a `data: [DONE]` sentinel; this allows the existing renderer to display the response without any frontend-side changes (INV-06)
- [ ] **Propagate `sessionId` and `agentId` through the proxy** — ensure the backend invoke handler forwards `sessionId` in the request body to the external runtime so session continuity works; the external runtime is responsible for its own memory but Moca should at minimum pass through the same session identifier it uses for native agents
- [ ] **Handle streaming errors gracefully** — if the upstream runtime returns a non-2xx status or the stream is interrupted, the backend should emit an SSE error event (matching the existing `server_error` event shape the frontend already handles) and close the response; the frontend should surface this as a chat error message (INV-03, INV-04)
- [ ] **Remove or guard the agentType check on the invoke route** — now that the frontend correctly routes external agents to `POST /agents/:agentId/invoke` and native agents to `VITE_AGENT_ENDPOINT`, ensure the backend handler accepts any authenticated request regardless of `agentType` (remove the 400 guard added in Phase 1 for the "wrong route for native agents" case, or keep it as a safety rail — document the decision)
- [ ] **Write end-to-end invocation tests** — use a mock upstream server (e.g. `nock` or an in-process Express server in the test) that returns a Strands-format stream and verify: the backend pipes bytes through without modification; the frontend SSE parser produces the expected `onTextDelta` callbacks; for `streamFormat === 'other'`, the buffered response is emitted as a single text delta event

### Verification

- [ ] Opening a chat with an external runtime agent and sending a message triggers `POST /agents/:agentId/invoke` on the backend (visible in browser DevTools Network tab) rather than a direct call to `VITE_AGENT_ENDPOINT`
- [ ] The response streams into the chat view the same way a native agent response does — text appears progressively (for Strands format) or appears at once as a complete message (for `other` format)
- [ ] Sending a second message in the same session re-uses the same `sessionId` in the proxy request body
- [ ] If the external runtime is unreachable, the chat view shows an error message rather than hanging or crashing
- [ ] A native `moca` agent chat session is unaffected — it still calls `VITE_AGENT_ENDPOINT` directly, not the proxy route

**Requirements:** INV-02, INV-03, INV-04, INV-05, INV-06
