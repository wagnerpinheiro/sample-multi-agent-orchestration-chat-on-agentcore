# Codebase Structure
*Generated: 2026-06-27*
*Codebase: sample-multi-agent-orchestration-chat-on-agentcore*

## Monorepo Organization

npm workspaces monorepo. Workspaces defined in root `package.json`:
- `packages/*` — top-level packages
- `packages/libs/*` — shared libraries
- `packages/lambda-tools/shared` — Lambda tools shared utilities
- `packages/lambda-tools/tools/*` — individual Lambda tool packages
- `scripts` — deployment/seed scripts

Build: `npm run build` → `tsc -b tsconfig.build.json` (TypeScript Solution Build, single dependency-ordered pass) + `vite build` (frontend only). CDK synth/deploy requires a prior `npm run build` so `@moca/*` lib `dist/` directories exist.

---

## Directory Layout

```
project-root/
├── packages/
│   ├── agent/                # AgentCore Runtime container (Express + Strands SDK)
│   ├── backend/              # REST API (Express + Lambda Web Adapter)
│   ├── cdk/                  # CDK infrastructure (all AWS resources)
│   ├── frontend/             # React SPA (Vite + Tailwind)
│   ├── session-stream-handler/ # DynamoDB Streams → AppSync Events Lambda
│   ├── trigger/              # EventBridge → agent invocation Lambda
│   ├── github-token-broker/  # GitHub PAT broker Lambda (Secrets Manager isolation)
│   ├── lambda-tools/
│   │   ├── shared/           # Shared utilities for Lambda tool packages
│   │   └── tools/
│   │       ├── tavily-tools/       # Web search
│   │       ├── nova-canvas-tools/  # Image generation
│   │       ├── nova-reel-tools/    # Video generation
│   │       ├── athena-tools/       # Athena SQL query
│   │       ├── kb-tools/           # Bedrock Knowledge Base
│   │       └── utility-tools/      # Echo/Ping utilities
│   └── libs/
│       ├── core/                   # Branded types, shared utilities
│       ├── tool-definitions/       # Tool definition types (Zod + JSON Schema)
│       ├── generative-ui-catalog/  # Generative UI component catalog
│       └── s3-workspace-sync/      # S3 workspace synchronization
├── scripts/
│   ├── src/setup-env.ts      # Reads CDK outputs → writes .env files for local dev
│   └── src/seed-system-agents.ts  # Seeds default agents to DynamoDB
├── docker/                   # Dockerfiles for agent and backend
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   └── guides/               # User-facing deployment/development guides
├── tsconfig.build.json       # TypeScript Solution Build (root, orders all packages)
├── tsconfig.json             # Base tsconfig (extended by all packages)
├── jest.config.cjs           # Root Jest config
├── eslint.config.mjs         # Root ESLint config
└── package.json              # Root workspace + scripts
```

---

## Package Details

### `packages/agent/`

AgentCore Runtime container. Express server on port 8080, deployed as ARM64 Docker image.

```
packages/agent/
├── src/
│   ├── index.ts              # Entry point: starts Express server, pre-warms JWKS
│   ├── app.ts                # Express app factory; middleware chain for /invocations
│   ├── agent.ts              # Strands Agent factory (createAgent function)
│   ├── config/
│   │   ├── index.ts          # Zod-validated env config + createBedrockModel factory
│   │   └── prompts/          # System prompt builders
│   ├── handlers/
│   │   ├── invocations.ts    # POST /invocations handler (main business logic)
│   │   ├── stream-handler.ts # SSE streaming to client
│   │   ├── auth-resolver.ts  # UserId resolution for regular/machine users
│   │   ├── health.ts         # GET /ping handler
│   │   └── index.ts
│   ├── libs/
│   │   ├── auth/             # JWT verifiers (Cognito access + id tokens)
│   │   ├── context/          # AsyncLocalStorage request context
│   │   ├── logger/           # Pino logger
│   │   ├── middleware/        # All Express middlewares (cors, validate, auth, identity, error)
│   │   ├── observability/    # ADOT span kind fixer
│   │   └── utils/
│   │       └── scoped-credentials.ts  # Identity Pool credential exchange + developer auth link
│   ├── repositories/         # DynamoDB repositories (agents, sessions)
│   ├── runtime/
│   │   ├── agent/            # Agent building blocks (tools-builder, memory-fetcher, session-loader, mcp-clients-builder)
│   │   └── tools/            # All built-in agent tools
│   │       ├── execute-command.ts    # Shell command execution with IMDS blocking
│   │       ├── s3-list-files.ts      # Per-user S3 file listing
│   │       ├── call-agent.ts         # Sub-agent invocation
│   │       ├── manage-agent.ts       # Agent CRUD via Backend API
│   │       ├── manage-trigger.ts     # Trigger CRUD via Backend API
│   │       ├── memory-search.ts      # Long-term memory search
│   │       ├── file-editor.ts        # File editing tool
│   │       ├── think.ts              # Chain-of-thought reasoning tool
│   │       ├── browser/              # AgentCore Browser tool
│   │       ├── code-interpreter/     # AgentCore CodeInterpreter tool
│   │       ├── generate-ui/          # Generative UI tool
│   │       ├── image-to-text/        # Image analysis tool
│   │       └── todo/                 # Todo list tool
│   ├── services/
│   │   ├── agent-registry.ts         # Agent definition registry
│   │   ├── appsync-events-publisher.ts # Publish messages to AppSync (streaming progress)
│   │   ├── session/                  # Session management services
│   │   │   ├── session-persistence-hook.ts  # Writes session + channelUserId to DynamoDB
│   │   │   ├── session-helper.ts     # Session setup orchestration
│   │   │   ├── agentcore-memory-storage.ts  # Short-term memory adapter
│   │   │   ├── memory-retriever.ts   # Long-term memory retrieval
│   │   │   ├── workspace-sync-hook.ts # S3 sync hook for session lifecycle
│   │   │   └── ...
│   │   ├── sessions-service.ts       # DynamoDB session CRUD
│   │   ├── sub-agent-task-manager.ts # Parallel sub-agent orchestration
│   │   ├── title-generator.ts        # Auto-generate session titles
│   │   ├── workspace-sync.ts         # S3 ↔ local workspace sync
│   │   └── workspace-sync-helper.ts
│   ├── tests/                        # Integration tests
│   └── types/                        # TypeScript type definitions
├── scripts/startup.sh                # Container startup: ADOT + app
└── package.json                      # @moca/agent
```

### `packages/backend/`

REST API. Express.js, deployed via Lambda Web Adapter + API Gateway HTTP API.

```
packages/backend/
├── src/
│   ├── index.ts              # Entry point: mounts routes, starts server on 8080
│   ├── config/
│   │   ├── index.ts          # Zod-validated env config
│   │   └── data/
│   │       └── default-agents.ts  # DEFAULT_AGENTS definitions (seeded to DynamoDB)
│   ├── routes/
│   │   ├── agents.ts         # GET/POST/PUT/DELETE /agents + shared agent endpoints
│   │   ├── sessions.ts       # GET/DELETE /sessions + /sessions/:id
│   │   ├── triggers.ts       # GET/POST/PUT/DELETE /triggers
│   │   ├── storage.ts        # S3 file operations (list, upload, download, delete)
│   │   ├── tools.ts          # Tool definitions listing
│   │   ├── memory.ts         # AgentCore Memory read/delete
│   │   ├── events.ts         # Event sources config endpoint
│   │   ├── webhooks.ts       # GitHub webhook receiver → EventBridge PutEvents
│   │   └── trigger-schemas.ts # Zod schemas for trigger create/update bodies
│   ├── middleware/
│   │   ├── auth.ts           # JWT validation + identityId resolution (authMiddleware)
│   │   ├── async-handler.ts  # Express async error wrapper
│   │   └── validate.ts       # Zod request validation middleware
│   ├── libs/
│   │   ├── auth/
│   │   │   └── identity-resolver.ts  # UserId → identityId exchange (both token types)
│   │   └── http/             # AppError, ErrorCode, ok(), pagination helpers
│   ├── repositories/
│   │   ├── agents/           # Agents DynamoDB repository
│   │   ├── sessions/         # Sessions DynamoDB repository
│   │   └── triggers/         # Triggers DynamoDB repository + factory
│   ├── services/
│   │   ├── agents-service.ts       # Agent business logic
│   │   ├── agentcore-memory.ts     # AgentCore Memory client factory for requests
│   │   └── scheduler-service.ts    # EventBridge Scheduler CRUD
│   ├── tests/
│   └── types/
└── package.json              # @moca/backend
```

### `packages/cdk/`

CDK infrastructure. Single stack (`AgentCoreStack`) with all resources.

```
packages/cdk/
├── bin/
│   └── agentcore.ts          # CDK app entry point; instantiates AgentCoreStack
├── config/
│   ├── environments.ts       # Per-environment config (default/dev/stg/prd)
│   ├── environment-types.ts  # EnvironmentConfig TypeScript types
│   ├── environment-utils.ts  # DEFAULT_CONFIG, getEnvironmentConfig()
│   └── index.ts
├── lib/
│   ├── agentcore-stack.ts    # Main CDK stack (all resource orchestration)
│   └── constructs/
│       ├── agentcore/        # AgentCoreRuntime, AgentCoreGateway, AgentCoreMemory, GitHubTokenBroker
│       ├── api/              # BackendApi (Lambda Web Adapter), AppSyncEvents
│       ├── auth/             # CognitoAuth, CognitoIdentityPool
│       ├── frontend/         # CloudFront + S3 + NodejsBuild deploy-time build
│       ├── monitoring/       # OperationsDashboard (CloudWatch)
│       ├── storage/          # AgentsTable, SessionsTable, TriggersTable, UserStorage (S3)
│       └── triggers/         # TriggerLambda, TriggerEventSources, SessionStreamHandler
├── lambda/
│   ├── cognito-pre-signup/   # Pre-signup trigger: email domain allowlist
│   └── gateway-interceptor/  # Injects user context (identityId) into MCP tool calls
└── schemas/                  # JSON schemas for CDK config validation
```

**Adding a new environment:** Edit `packages/cdk/config/environments.ts`. Types in `environment-types.ts`. Utilities in `environment-utils.ts`.

### `packages/frontend/`

React SPA served from CloudFront + S3.

```
packages/frontend/
├── index.html                # Vite entry point
├── src/
│   ├── main.tsx              # React root + router setup
│   ├── api/
│   │   ├── client/
│   │   │   └── base-client.ts  # Attaches Authorization + X-...-Id-Token headers to all requests
│   │   └── ...               # Per-resource API clients (agents, sessions, triggers, storage, memory)
│   ├── components/           # Shared UI components
│   ├── config/               # Runtime config (populated from window.__MOCA_CONFIG__ injected by CloudFront)
│   ├── features/             # Feature-scoped components and hooks (auth/, etc.)
│   ├── hooks/                # React hooks
│   ├── i18n/                 # Internationalization setup
│   ├── layouts/              # Page layout components
│   ├── lib/
│   │   └── cognito.ts        # getValidIdToken(), token refresh
│   ├── locales/              # Translation files (en, ja)
│   ├── pages/                # Route-level page components
│   ├── schemas/              # Zod validation schemas
│   ├── stores/               # Zustand stores
│   │   ├── agentStore.ts
│   │   ├── chatStore.ts
│   │   ├── sessionStore.ts
│   │   ├── triggerStore.ts
│   │   ├── storageStore.ts
│   │   ├── memoryStore.ts
│   │   ├── appsyncConnectionStore.ts  # AppSync WebSocket lifecycle
│   │   ├── authStore.ts
│   │   └── ...
│   ├── types/
│   └── utils/
└── package.json              # @moca/frontend (private)
```

### `packages/session-stream-handler/`

```
packages/session-stream-handler/
├── src/
│   ├── index.ts              # Lambda handler: DynamoDB Stream → AppSync Events
│   └── libs/
│       └── logger/
└── package.json
```

### `packages/trigger/`

```
packages/trigger/
├── src/
│   ├── handlers/
│   │   ├── schedule-handler.ts       # EventBridge Scheduler event handler
│   │   └── custom-event-handler.ts   # EventBridge Rule (webhook) event handler
│   ├── services/
│   │   ├── auth-service.ts           # Cognito Client Credentials + Developer Auth token
│   │   ├── agent-invoker.ts          # POST /invocations with per-user openIdToken
│   │   ├── agents-service.ts         # Read agent config from DynamoDB
│   │   └── execution-recorder.ts     # Record trigger execution results
│   ├── libs/
│   │   └── logger/
│   ├── types/
│   └── __tests__/                    # Integration tests
└── package.json
```

### `packages/github-token-broker/`

Single-purpose Lambda that holds `secretsmanager:GetSecretValue` for the GitHub PAT. AgentCore Runtime invokes this via `lambda:InvokeFunction` only — it never touches Secrets Manager directly. See `docs/adr/github-token-broker-lambda.md`.

```
packages/github-token-broker/
├── src/
│   └── index.ts              # Lambda handler: GetSecretValue → return token
└── package.json
```

### `packages/libs/`

Shared libraries. All cross-package imports must go through these. Changing these has wide impact — run tests for all dependent packages.

```
packages/libs/
├── core/
│   └── src/
│       ├── index.ts
│       ├── branded.ts        # Brand<T, B> utility type
│       ├── user-id.ts        # UserId branded type + parse/assert
│       ├── identity-id.ts    # IdentityId branded type + parse/assert
│       ├── agent-id.ts       # AgentId branded type
│       ├── session-id.ts     # SessionId branded type
│       ├── trigger-id.ts     # TriggerId branded type
│       ├── system-ids.ts     # SYSTEM_USER_ID constant
│       ├── bedrock-models.ts # BEDROCK_MODEL_DEFINITIONS (model registry)
│       └── crypto.ts         # Shared crypto utilities
│   Consumers: agent, backend, frontend, trigger, cdk
│
├── tool-definitions/
│   └── src/
│       ├── index.ts
│       ├── types.ts          # ToolDefinition, ToolParameter types
│       ├── tool-names.ts     # Tool name enum/constants
│       └── definitions/      # Per-tool Zod schemas + JSON Schema outputs
│   Consumers: agent, backend (tool listing endpoint)
│
├── generative-ui-catalog/
│   └── src/                  # UI component catalog for agent-rendered UIs
│   Consumers: agent (renders components), frontend (displays them)
│
└── s3-workspace-sync/
    └── src/                  # S3 ↔ local workspace sync logic
    Consumers: agent (workspace-sync.ts)
```

### `packages/lambda-tools/`

Individual Lambda functions registered with AgentCore Gateway via MCP protocol.

```
packages/lambda-tools/
├── shared/
│   └── src/                  # Shared Lambda tool utilities (response formatting, error handling)
└── tools/
    ├── tavily-tools/         # Web search via Tavily API (reads TAVILY_API_KEY from Secrets Manager)
    ├── nova-canvas-tools/    # Image generation via Amazon Nova Canvas
    ├── nova-reel-tools/      # Video generation via Amazon Nova Reel
    ├── athena-tools/         # SQL queries via Amazon Athena
    ├── kb-tools/             # Knowledge Base retrieval via Bedrock
    └── utility-tools/        # Echo, Ping utility tools
```

Each tool is a separate npm workspace package with its own `package.json`. CDK bundles each via esbuild from `src/handler.ts` — no `dist/` is pre-built for lambda-tools.

---

## Shared Libraries and Their Consumers

| Library | npm name | Consumers |
|---|---|---|
| `packages/libs/core` | `@moca/core` | agent, backend, frontend, trigger, cdk, scripts |
| `packages/libs/tool-definitions` | `@moca/tool-definitions` | agent, backend |
| `packages/libs/generative-ui-catalog` | `@moca/generative-ui-catalog` | agent, frontend |
| `packages/libs/s3-workspace-sync` | `@moca/s3-workspace-sync` | agent |

**Dependency chain:** `generative-ui-catalog` depends on `tool-definitions` which depends on `core`. A change to `core` can affect all consumers.

---

## Entry Points

| Package | Entry Point | How Invoked |
|---|---|---|
| `packages/agent` | `src/index.ts` | Docker container startup; AgentCore Runtime HTTP invocation at POST `/invocations` |
| `packages/backend` | `src/index.ts` | Lambda Web Adapter → API Gateway HTTP API; all REST calls |
| `packages/cdk` | `bin/agentcore.ts` | `cdk synth` / `cdk deploy` |
| `packages/frontend` | `index.html` → `src/main.tsx` | Browser; served from CloudFront |
| `packages/session-stream-handler` | `src/index.ts` (handler export) | DynamoDB Stream trigger |
| `packages/trigger` | `src/index.ts` (handler export) | EventBridge Scheduler / EventBridge Rule |
| `packages/github-token-broker` | `src/index.ts` (handler export) | `lambda:InvokeFunction` from AgentCore Runtime |
| `packages/lambda-tools/tools/*/` | `src/handler.ts` per tool | AgentCore Gateway MCP invocation |

---

## Important Configuration Files

| File | Purpose |
|---|---|
| `packages/cdk/config/environments.ts` | Per-environment config: Cognito domain, CORS origins, model list, retention, custom domain, event rules, secrets |
| `packages/cdk/config/environment-types.ts` | `EnvironmentConfig` TypeScript types |
| `packages/agent/src/config/index.ts` | Agent runtime env vars (Zod schema): memory IDs, Cognito config, bucket name, etc. |
| `packages/backend/src/config/index.ts` | Backend runtime env vars (Zod schema): table names, Cognito config, scheduler ARNs, etc. |
| `tsconfig.build.json` (root) | TypeScript Solution Build — orders compilation across all TS packages |
| `tsconfig.json` (root) | Base compiler options extended by all packages |
| `jest.config.cjs` (root) | Root Jest config |
| `docker/Dockerfile.agent` | Multi-stage Docker build for agent |
| `docker/Dockerfile.backend` | Multi-stage Docker build for backend |
| `.node-version` | Node.js version pin (22.x) |

---

## Where to Add New Code

**New backend REST endpoint:**
- Add route handler to `packages/backend/src/routes/` (or add to existing route file)
- Register route in `packages/backend/src/index.ts`
- Add Zod validation schema in the route file or a companion `*-schemas.ts`
- Add DynamoDB repository in `packages/backend/src/repositories/` if new table access needed

**New agent tool (built-in):**
- Add tool file to `packages/agent/src/runtime/tools/`
- Export from `packages/agent/src/runtime/tools/index.ts`
- Add tool definition (Zod schema + JSON Schema) to `packages/libs/tool-definitions/src/definitions/`
- Register tool name in `packages/libs/tool-definitions/src/tool-names.ts`

**New Lambda tool (Gateway via MCP):**
- Create new package under `packages/lambda-tools/tools/{tool-name}/` with `src/handler.ts`
- Add to root `package.json` workspaces
- Register with AgentCore Gateway target in CDK (create new construct or extend existing)

**New CDK construct:**
- Add construct file to `packages/cdk/lib/constructs/{category}/`
- Instantiate in `packages/cdk/lib/agentcore-stack.ts`

**New environment config option:**
- Add field to `EnvironmentConfig` in `packages/cdk/config/environment-types.ts`
- Set default in `DEFAULT_CONFIG` in `packages/cdk/config/environment-utils.ts`
- Override per-environment in `packages/cdk/config/environments.ts`

**New shared type/utility:**
- Add to `packages/libs/core/src/` (branded types, constants, utilities used across packages)
- Export from `packages/libs/core/src/index.ts`
- Run `npm run build:ts` before using in dependent packages

**New frontend page/feature:**
- Add page component to `packages/frontend/src/pages/`
- Add route in `packages/frontend/src/main.tsx`
- Add Zustand store to `packages/frontend/src/stores/` if new state domain needed
- Add API client to `packages/frontend/src/api/`

---

## Special Directories

**`docker/`:**
- Purpose: Dockerfiles for agent and backend (multi-stage builds)
- Not a workspace; referenced by CDK constructs during ECR image build

**`scripts/`:**
- Purpose: Operational scripts (`setup-env.ts` reads CDK outputs → `.env` files; `seed-system-agents.ts`)
- Is a workspace; uses `tsx` for direct execution

**`docs/adr/`:**
- Purpose: Architecture Decision Records for non-obvious decisions
- Files: `aws-data-access-control.md`, `build-design-rationale.md`, `event-driven-identity-pool-credentials.md`, `github-token-broker-lambda.md`
- Consult before changing IAM policies, Cognito config, build layout, or Dockerfiles

**`docs/guides/`:**
- Purpose: User-facing deployment and development guides
- Files: `deployment-options.md`, `local-development-setup.md`

**`packages/*/dist/`:**
- Generated TypeScript compilation output for all TS packages (except lambda-tools/tools — CDK bundles those from source via esbuild)
- Not committed; required before CDK synth/deploy

**`.planning/codebase/`:**
- Generated analysis documents for GSD planning tools
- Committed for reference by other GSD commands
