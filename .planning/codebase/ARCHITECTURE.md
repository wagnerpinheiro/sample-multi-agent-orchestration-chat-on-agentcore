# Architecture
*Generated: 2026-06-27*
*Codebase: sample-multi-agent-orchestration-chat-on-agentcore*

## Pattern Overview

**Overall:** Event-driven, serverless multi-agent platform on Amazon Bedrock AgentCore.

**Key Characteristics:**
- Fully serverless: Lambda (backend), Docker on AgentCore Runtime (agent), S3 + CloudFront (frontend)
- Real-time streaming via AppSync Events (WebSocket) — not WebSocket on the API itself
- Agents execute inside Amazon Bedrock AgentCore Runtime (managed container service), not Lambda
- All user data (S3, DynamoDB) is keyed on `identityId` (Cognito Identity Pool sub, format `REGION:UUID`), not User Pool sub
- Tool execution happens inside the AgentCore Runtime container via the Strands Agents SDK (TypeScript)

---

## Layers

**Frontend (React SPA):**
- Purpose: User interface for chatting with agents, managing agents/sessions/triggers, file storage
- Location: `packages/frontend/src/`
- Runtime: React + Vite, hosted on CloudFront + S3
- Talks to: Backend API (REST), AgentCore Runtime (HTTP streaming `/invocations`), AppSync Events (WebSocket)
- Key stores (Zustand): `src/stores/chatStore.ts`, `src/stores/agentStore.ts`, `src/stores/sessionStore.ts`, `src/stores/triggerStore.ts`

**Backend API (Express + Lambda Web Adapter):**
- Purpose: Agent management, session persistence, file operations, trigger/scheduler CRUD
- Location: `packages/backend/src/`
- Runtime: Express.js on port 8080 behind Lambda Web Adapter + API Gateway HTTP API
- Entry point: `packages/backend/src/index.ts`
- Routes: `src/routes/agents.ts`, `src/routes/sessions.ts`, `src/routes/triggers.ts`, `src/routes/storage.ts`, `src/routes/tools.ts`, `src/routes/webhooks.ts`, `src/routes/memory.ts`, `src/routes/events.ts`
- Depends on: `@moca/core` (branded types), DynamoDB (agents/sessions/triggers tables), Secrets Manager, SSM Parameter Store, EventBridge Scheduler

**AgentCore Runtime (Docker container):**
- Purpose: Executes AI agents using Strands Agents SDK; handles tool invocations including MCP, file ops, code execution, browser
- Location: `packages/agent/src/`
- Runtime: Express.js on port 8080, deployed as ARM64 Docker container on Amazon Bedrock AgentCore Runtime
- Entry point: `packages/agent/src/index.ts` → `packages/agent/src/app.ts`
- Agent factory: `packages/agent/src/agent.ts`
- Request handler: `packages/agent/src/handlers/invocations.ts`
- Tools: `packages/agent/src/runtime/tools/` (execute-command, s3-list-files, call-agent, browser, code-interpreter, generate-ui, manage-agent, manage-trigger, memory-search, file-editor, think, image-to-text, mcp-converter)
- Depends on: Strands Agents SDK, AgentCore Memory, AgentCore Gateway (MCP tools), Cognito Identity Pool (per-user credentials), DynamoDB (sessions), S3 (user files), AppSync Events (publish streaming messages)

**Session Stream Handler (Lambda):**
- Purpose: Bridge DynamoDB Streams → AppSync Events for real-time session updates in the frontend
- Location: `packages/session-stream-handler/src/index.ts`
- Trigger: DynamoDB Stream on the Sessions table
- Action: Reads `channelUserId` from the stream record, publishes to AppSync channel `/sessions/{channelUserId}` via SigV4-signed HTTP POST

**Trigger Lambda (Lambda):**
- Purpose: Event-driven agent invocations — triggered by EventBridge Scheduler (cron/one-time) and EventBridge Rules (webhook events)
- Location: `packages/trigger/src/`
- Handlers: `src/handlers/schedule-handler.ts`, `src/handlers/custom-event-handler.ts`
- Action: Obtains per-user Identity Pool credentials via Developer Authenticated Identities, calls AgentCore Runtime `/invocations`

**Lambda Tools (individual Lambdas):**
- Purpose: Tool functions registered with the AgentCore Gateway (MCP protocol), called by the agent via Gateway
- Location: `packages/lambda-tools/tools/` (tavily-tools, nova-canvas-tools, nova-reel-tools, athena-tools, kb-tools, utility-tools)
- Shared utilities: `packages/lambda-tools/shared/src/`

**CDK Infrastructure:**
- Purpose: Defines all AWS resources as a single CDK stack
- Location: `packages/cdk/`
- Main stack: `packages/cdk/lib/agentcore-stack.ts`
- Constructs: `packages/cdk/lib/constructs/` (agentcore/, api/, auth/, frontend/, monitoring/, storage/, triggers/)
- Config: `packages/cdk/config/environments.ts` (environments: default/dev/stg/prd)

---

## Request/Response Flow (Interactive Chat)

The primary flow for a user chatting with an agent:

```
1. Browser → POST /invocations (AgentCore Runtime endpoint)
   Headers:
     Authorization: Bearer <Cognito accessToken>
     X-Amzn-Bedrock-AgentCore-Runtime-Custom-Id-Token: <Cognito idToken>
   Body: { prompt, sessionId, agentId, modelId, ... }

2. AgentCore Runtime middleware chain (packages/agent/src/app.ts):
   cors → json
     → trackInFlightMiddleware      (busy signal for health check)
     → requestContextMiddleware     (AsyncLocalStorage, JWT parse, session headers)
     → validateInvocationMiddleware (validates prompt/images → 400 on failure)
     → authResolverMiddleware       (resolves branded UserId from JWT sub)
     → identityResolverMiddleware   (exchanges userId → identityId via GetId)
     → handleInvocation             (packages/agent/src/handlers/invocations.ts)

3. handleInvocation:
   a. initializeWorkspaceSync (S3 ↔ local workspace if storagePath provided)
   b. setupSession (load AgentCore Memory short-term history, DynamoDB session record)
   c. createAgent (packages/agent/src/agent.ts):
      - buildUserMCPClients (user-defined MCP servers from agent config)
      - [parallel] loadSessionHistory + buildToolSet + fetchLongTermMemories
      - createBedrockModel (with prompt caching)
      - buildSystemPrompt
   d. agent.stream({ prompt }) → Strands SDK invokes Bedrock model
   e. streamAgentResponse (packages/agent/src/handlers/stream-handler.ts)
      → SSE chunks streamed back to frontend

4. During streaming, agent may call tools:
   - Built-in tools: execute-command, s3-list-files, file-editor, think, call-agent, manage-agent, etc.
   - Gateway tools: via AgentCore Gateway MCP → Lambda tool functions (tavily, nova-canvas, etc.)

5. On session completion:
   - session-persistence-hook writes session record to DynamoDB (packages/agent/src/services/session/session-persistence-hook.ts)
   - DynamoDB Streams → session-stream-handler Lambda → AppSync Events → WebSocket to browser
   - Browser receives real-time session list update
```

---

## Real-Time Communication Architecture (AppSync Events + DynamoDB Streams)

AppSync Events is used exclusively for pushing session metadata updates (new session created, title updated, session ended) to the frontend. It is **not** used for agent message streaming — that happens over Server-Sent Events on the direct `/invocations` HTTP connection.

```
AgentCore Runtime container
  → writes session record to DynamoDB (Sessions table)
       ↓ DynamoDB Stream (NEW_IMAGE)
  Session Stream Handler Lambda (packages/session-stream-handler/src/index.ts)
       ↓ reads channelUserId from record (User Pool sub UUID, no colons)
       ↓ signs HTTP POST with SigV4
  AppSync Events HTTP endpoint
       ↓ publishes to channel: /sessions/{channelUserId}
  Frontend WebSocket subscription (packages/frontend/src/stores/appsyncConnectionStore.ts)
       ↓ updates sessionStore
```

**Key design constraint:** The DynamoDB sessions partition key (`userId`) is `identityId` (format `REGION:UUID`). AppSync rejects channel path segments containing colons, so a separate `channelUserId` attribute (plain UUID from User Pool sub) is stored on every session record. The stream handler reads `channelUserId` and skips records where it is absent.

Relevant files:
- `packages/session-stream-handler/src/index.ts` — Lambda handler
- `packages/agent/src/services/session/session-persistence-hook.ts` — writes `channelUserId`
- `packages/cdk/lib/constructs/api/` — AppSync Events construct
- `packages/cdk/lib/constructs/triggers/` — SessionStreamHandler construct

---

## Event-Driven Automation Flow (EventBridge → Trigger Lambda)

```
User creates trigger in UI
  → Frontend POST /triggers (Backend API)
  → Backend creates trigger record in DynamoDB (TriggersTable)
  → Backend creates EventBridge Schedule (cron/rate) or registers rule (webhook)
       ↓ At trigger time
  EventBridge Scheduler or EventBridge Rule
       ↓ invokes Trigger Lambda (packages/trigger/src/)
  Trigger Lambda:
    1. Obtains machine-user Cognito accessToken via Client Credentials flow
       (packages/trigger/src/services/auth-service.ts)
    2. Calls GetOpenIdTokenForDeveloperIdentity (no IdentityId)
       → Cognito resolves identityId A from stored developer login link
       → returns short-lived openIdToken (15 min, iss=cognito-identity.amazonaws.com)
    3. POST /invocations on AgentCore Runtime
       Authorization: Bearer <accessToken>
       X-Amzn-Bedrock-AgentCore-Runtime-Custom-Id-Token: <openIdToken>
    4. AgentCore Runtime detects developer-auth token (iss check):
       → skips GetId, reads identityId directly from JWT sub
       → calls GetCredentialsForIdentity with Logins={cognito-identity.amazonaws.com: openIdToken}
       → obtains per-user scoped credentials for the same identityId as frontend sessions
```

The trigger flow depends on the developer login link being established before the trigger fires. This link is created on every frontend login by both the AgentCore Runtime and the Backend API (fire-and-forget `GetOpenIdTokenForDeveloperIdentity` call that includes both User Pool idToken and developer login).

Relevant files:
- `packages/trigger/src/handlers/schedule-handler.ts`
- `packages/trigger/src/handlers/custom-event-handler.ts`
- `packages/trigger/src/services/auth-service.ts`
- `packages/trigger/src/services/agent-invoker.ts`
- `packages/backend/src/libs/auth/identity-resolver.ts` (link establishment on backend requests)
- `packages/agent/src/libs/utils/scoped-credentials.ts` (link establishment on agent requests)
- `docs/adr/event-driven-identity-pool-credentials.md`

---

## Authentication/Identity Flow

Two separate Cognito constructs serve different purposes:

**Cognito User Pool** — human identity:
- Authenticates frontend users via managed login (Hosted UI)
- Issues `accessToken` (used as Bearer auth) and `idToken` (used for Identity Pool exchange)
- Self-signup disabled by default; admin creates users
- Machine-user app client (no secret) used by Trigger Lambda for Client Credentials flow
- JWT validation in both Backend (`packages/backend/src/middleware/auth.ts`) and Agent (`packages/agent/src/libs/auth/jwt-verifier.ts`)

**Cognito Identity Pool** — per-user AWS credentials:
- Exchanges User Pool idToken → temporary AWS credentials scoped to the authenticated user
- Authenticated Role uses IAM policy variables (`${cognito-identity.amazonaws.com:sub}`) to scope S3 and DynamoDB access per-user
- `developerProviderName = "{prefix}.trigger"` enables Developer Authenticated Identities for event-driven flows
- CDK construct: `packages/cdk/lib/constructs/auth/cognito-identity-pool.ts`

**AgentCore Gateway** — tool access:
- Fronts Lambda tool functions via MCP protocol
- Authenticated via the same Cognito User Pool JWT
- Gateway Interceptor Lambda injects user context into tool invocations

**Two identifiers in use:**

| Identifier | Source | Format | Used for |
|---|---|---|---|
| `userId` (User Pool sub) | JWT `sub` claim | UUID | AppSync channel paths, request context, JWT auth |
| `identityId` (Identity Pool sub) | `cognito-identity:GetId` response | `REGION:UUID` | S3 prefix key, DynamoDB partition key, AgentCore Memory actorId |

The distinction matters: `identityId` cannot be used in AppSync channel paths (contains colons), and `userId` cannot be used in IAM policy variables for S3/DynamoDB with Identity Pool credentials.

Relevant files:
- `packages/agent/src/libs/utils/scoped-credentials.ts`
- `packages/agent/src/libs/middleware/request-context.ts`
- `packages/agent/src/handlers/auth-resolver.ts`
- `packages/backend/src/middleware/auth.ts`
- `packages/backend/src/libs/auth/identity-resolver.ts`
- `docs/adr/aws-data-access-control.md`

---

## Data Isolation Model

Per-user isolation is enforced at three layers (defense-in-depth):

**Layer 1 — Application:** `scoped-credentials.ts` (agent) and `identity-resolver.ts` (backend) exchange the User Pool idToken for Identity Pool credentials keyed on `identityId`. No cross-user credential sharing.

**Layer 2 — IAM (Identity Pool Authenticated Role):**
- S3 objects: `arn:aws:s3:::bucket/users/${cognito-identity.amazonaws.com:sub}/*`
- DynamoDB LeadingKeys condition: `${cognito-identity.amazonaws.com:sub}`
- AgentCore Memory actorId scoped per user

**Layer 3 — S3 Bucket Policy Deny:**
- Explicit Deny on `NotResource` for any Identity Pool session trying to access outside their own `users/{identityId}/` prefix
- CDK construct: `packages/cdk/lib/constructs/storage/user-storage.ts`

**S3 layout:**
```
{bucket}/
└── users/
    ├── {identityId-user-A}/   ← User A files only
    │   └── memo.md
    └── {identityId-user-B}/   ← access denied to User A
        └── secret.md
```

**DynamoDB sessions table dual-key design:**
- `userId` (PK) = `identityId` — satisfies IAM `LeadingKeys` condition
- `channelUserId` = User Pool sub — used by session-stream-handler for AppSync channel path (no colons)
- `sessionId` (SK) = session identifier

**Backend S3 access:** Backend Lambda uses `BackendUserScopedS3Role` — assumes an IAM role via STS with a per-user session policy scoped to `users/{identityId}/`. The backend does not use Identity Pool credentials for S3 (uses STS AssumeRole approach instead).

Relevant files:
- `docs/adr/aws-data-access-control.md`
- `packages/cdk/lib/constructs/storage/user-storage.ts`
- `packages/cdk/lib/constructs/auth/cognito-identity-pool.ts`

---

## Agent Memory Architecture

**Short-term memory (session history):**
- Managed by AgentCore Runtime's `AgentCore Memory` service
- Persists conversation turns within and across sessions for a user/agent pair
- Accessed via `actorId = identityId`, `memoryId` from environment config
- `SlidingWindowConversationManager` from Strands SDK limits context window
- Loaded at session start: `packages/agent/src/runtime/agent/session-loader.ts`

**Long-term memory (semantic/summarization):**
- Also managed by AgentCore Memory with built-in strategies: Summarization, Semantic, UserPreference
- Retrieved at agent creation time via semantic search
- `packages/agent/src/runtime/agent/memory-fetcher.ts` — retrieval
- Memory expiration: configurable (default 30 days), set in `packages/cdk/config/environments.ts`
- Semantic strategy ID is resolved at deploy time and injected as environment variable (`AGENTCORE_MEMORY_SEMANTIC_STRATEGY_ID`)

**Backend memory access:**
- Backend API routes (`/sessions`) use `AgentCore Memory` service to read/delete memory entries
- `packages/backend/src/services/agentcore-memory.ts`
- Backend constructs its own user-scoped memory client by exchanging the forwarded User Pool idToken for Identity Pool credentials

---

## Error Handling

**Strategy:** Errors thrown as typed `AppError` instances (backend); caught by global `errorHandlerMiddleware`.

**Agent:** `asyncHandler` wrapper in `packages/agent/src/libs/middleware/` catches all thrown errors and maps to HTTP responses. Streaming errors are surfaced as SSE error events.

**Backend:** Same `asyncHandler` + `errorHandlerMiddleware` pattern. Typed errors (`AgentNotFoundError`, `TriggerLimitExceededError`, etc.) map to specific HTTP status codes.

**Trigger Lambda:** Non-fatal errors in per-user token acquisition do not abort invocation; invocation proceeds without per-user credentials in degraded mode.

**Session Stream Handler:** Per-record errors are caught and logged; processing continues for remaining records (no batch failure propagation).

---

## Cross-Cutting Concerns

**Logging:** `pino` logger in agent and backend (`packages/agent/src/libs/logger/`, `packages/backend/src/libs/logger/`). Structured JSON logs to CloudWatch.

**Observability:** AWS Distro for OpenTelemetry (ADOT) auto-instrumentation on the AgentCore Runtime container. Strands SDK span kind fixer applied at startup (`packages/agent/src/libs/observability/install-strands-span-kind-fixer.ts`). CloudWatch Operations Dashboard in `packages/cdk/lib/constructs/monitoring/`.

**Validation:** Zod schemas throughout — request bodies in backend routes, environment config in `packages/cdk/config/`, agent invocation payloads. Branded types from `@moca/core` for IDs (UserId, IdentityId, AgentId, SessionId, TriggerId).

**CORS:** Configured on API Gateway (backend) and directly in the agent Express app. Both accept the `X-Amzn-Bedrock-AgentCore-Runtime-Custom-Id-Token` custom header required for Identity Pool credential exchange.

**MCP integration:** Agent config supports user-defined MCP server URLs per agent. MCP env values (API keys, URLs) stored in SSM Parameter Store under `/agentcore/{prefix}/agents/{agentId}/`. Backend reads/writes SSM; Trigger Lambda reads SSM (read-only).
