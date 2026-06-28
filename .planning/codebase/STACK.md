# Technology Stack

*Generated: 2026-06-27*
*Codebase: sample-multi-agent-orchestration-chat-on-agentcore*

## Languages

**Primary:**
- TypeScript ~5.7.3 (root, agent, backend, cdk, trigger, session-stream-handler, libs)
- TypeScript ~5.9.3 (frontend only — slightly newer release channel)

**Note:** All packages target ES2022 (`"target": "es2022"` in tsconfig) with ESM (`"type": "module"`), except CDK which is CommonJS.

## Runtime

**Node.js:**
- Version: 22.21.1 (pinned in `.node-version`)
- Minimum: `>=22.12.0` (enforced in all `package.json` `engines` fields)
- Lambda runtime: `NODEJS_22_X` (all Lambda functions)
- Docker base image: `public.ecr.aws/docker/library/node:22-slim`

**Package Manager:**
- npm workspaces (NOT pnpm — enforced in `AGENTS.md`)
- Lockfile: `package-lock.json` present

## Monorepo Structure

8 packages, managed as npm workspaces defined in root `package.json`:

| Package | npm name | Type |
|---|---|---|
| `packages/agent` | `@moca/agent` | Docker container (AgentCore Runtime) |
| `packages/backend` | `@moca/backend` | Docker container (Lambda via LWA) |
| `packages/frontend` | `frontend` (private) | React SPA |
| `packages/cdk` | `@moca/cdk` | CDK IaC |
| `packages/session-stream-handler` | `@moca/session-stream-handler` | Lambda |
| `packages/trigger` | `@moca/trigger` | Lambda |
| `packages/lambda-tools/shared` | `@moca/lambda-tools-shared` | Library |
| `packages/lambda-tools/tools/*` | `@moca/lambda-tools-*` | Lambda (6 tools) |
| `packages/libs/core` | `@moca/core` | Shared library |
| `packages/libs/generative-ui-catalog` | `@moca/generative-ui-catalog` | Shared library |
| `packages/libs/s3-workspace-sync` | `@moca/s3-workspace-sync` | Shared library |
| `packages/libs/tool-definitions` | `@moca/tool-definitions` | Shared library |

## Frameworks

### Agent (`packages/agent`)

- **Express** ^4.18.2 — HTTP server on port 8080 (invocations endpoint + health)
- **@strands-agents/sdk** ^1.2.0 — Strands Agents TypeScript SDK (core AI agent execution)
- **@modelcontextprotocol/sdk** ^1.25.1 — MCP client transports (stdio, HTTP, SSE)
- **zod** ^4.2.1 — Runtime validation
- **pino** ^10.3.1 — Structured JSON logging
- **playwright-core** ^1.58.2 — Browser automation (for browser tool)
- **aws-jwt-verify** ^5.1.1 — Cognito JWT verification

### Backend (`packages/backend`)

- **Express** ^4.18.2 — REST API server on port 8080
- **Lambda Web Adapter** (from `public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0`) — Bridges Express to Lambda invocation model
- **@strands-agents/sdk** ^1.2.0 — Used for agent invocation
- **@modelcontextprotocol/sdk** ^1.25.1 — MCP client
- **zod** ^4.2.1 — Request/response validation
- **pino** ^10.3.1 + **pino-http** ^11.0.0 — Structured logging
- **aws-jwt-verify** ^5.1.1 — Cognito JWT verification

### Frontend (`packages/frontend`)

- **React** ^19.2.0 + **react-dom** ^19.2.0 — UI framework
- **Vite** ^8.0.16 + **@vitejs/plugin-react-swc** ^4.2.2 — Build tool (SWC compiler)
- **Tailwind CSS** ^3.4.19 + **PostCSS** ^8.5.6 — Styling
- **react-router-dom** ^7.11.0 — Client-side routing
- **zustand** ^5.0.9 — State management
- **aws-amplify** ^6.16.4 — Cognito Auth integration
- **i18next** ^25.7.3 + **react-i18next** ^16.5.0 — Internationalization
- **@tanstack/react-virtual** ^3.13.13 — Virtualized lists
- **react-markdown** ^10.1.0 + **rehype-katex** + **remark-gfm** — Markdown rendering
- **mermaid** ^11.12.2 — Diagram rendering
- **katex** ^0.16.27 — Math rendering
- **recharts** ^3.7.0 — Charts
- **@json-render/core** + **@json-render/react** ^0.11.0 — JSON-based UI rendering (generative UI)
- **lucide-react** ^0.562.0 — Icons
- **cmdk** ^1.1.1 — Command palette
- **fflate** ^0.8.2 — Compression
- **vite-plugin-pwa** ^1.2.0 — PWA support

### CDK (`packages/cdk`)

- **aws-cdk-lib** 2.256.1 (pinned via `overrides`) — CDK core constructs
- **aws-cdk** ^2.1040.0 — CLI
- **@cdklabs/deploy-time-build** ^0.1.0 — CodeBuild-based Docker image builds and Node.js frontend builds at deploy time
- **cdk-nag** ^2.37.55 — Security/best-practice rule enforcement
- **constructs** ^10.0.0

### Session Stream Handler (`packages/session-stream-handler`)

- **pino** ^10.3.1 — Logging
- **@aws-crypto/sha256-js** + **@smithy/signature-v4** — SigV4 signing for AppSync HTTP calls

### Trigger (`packages/trigger`)

- **pino** ^10.3.1 — Logging
- **uuid** ^13.0.0 — ID generation

## AWS SDK Usage

All packages use **AWS SDK v3** (`@aws-sdk/*`). Key clients per package:

| Client | Packages |
|---|---|
| `@aws-sdk/client-bedrock-agentcore` | agent, backend |
| `@aws-sdk/client-bedrock-agentcore-control` | backend (via CDK custom resource) |
| `@aws-sdk/client-cognito-identity` | agent, backend |
| `@aws-sdk/client-dynamodb` + `@aws-sdk/util-dynamodb` | agent, backend, trigger |
| `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | agent, backend |
| `@aws-sdk/client-eventbridge` | backend |
| `@aws-sdk/client-scheduler` | backend |
| `@aws-sdk/client-secrets-manager` | backend |
| `@aws-sdk/client-ssm` | backend, trigger |
| `@aws-sdk/client-sts` | backend |
| `@aws-sdk/credential-provider-node` | agent, session-stream-handler |
| `@smithy/signature-v4` | agent, session-stream-handler (manual SigV4) |
| `@aws-crypto/sha256-js` | agent, session-stream-handler |

## Build Tooling

**TypeScript compilation:**
- Root `tsconfig.build.json` — Solution-style composite build. A single `tsc -b` resolves dependency order across all packages.
- `tsconfig.base.json` — Shared compiler options (`ES2022`, `module: node16`, `strict: true`)
- Run: `npm run build:ts` from root

**Frontend build:**
- Vite — `npm run build:frontend` from root
- Uses `@vitejs/plugin-react-swc` (SWC compiler, faster than Babel)

**Docker images:**
- Agent: `docker/agent.Dockerfile` (multi-stage, ARM64, includes AWS CLI, gh CLI, uv/uvx for Python MCP)
- Backend: `docker/backend.Dockerfile` (multi-stage, ARM64, includes Lambda Web Adapter, uv/uvx)
- Both built by CodeBuild via `@cdklabs/deploy-time-build` at CDK deploy time (no local Docker required)

**Development:**
- `tsx` ^4.19.2 — TypeScript execution for scripts and dev watch mode
- `concurrently` ^9.1.2 — Parallel dev server processes (`npm run dev`)

## Test Runners

| Runner | Used By |
|---|---|
| **Jest** ^30.2.0 (root) + `ts-jest` ^29.4.6 | agent, backend, cdk, trigger, session-stream-handler, libs/tool-definitions, libs/generative-ui-catalog |
| **Vitest** ^4.1.8 | frontend, libs/core, libs/s3-workspace-sync |

- Agent/backend use `NODE_OPTIONS='--experimental-vm-modules'` for ESM Jest support
- `testcontainers` ^12.0.1 — Used in agent and backend for DynamoDB Local integration tests

## Linting and Formatting

**ESLint** ^10.0.0 with:
- `typescript-eslint` ^8.57.2
- `eslint-config-prettier` ^10.1.8 (disables formatting rules)
- `eslint-plugin-import-x` ^4.16.0 (import extension enforcement for ESM)
- `eslint-plugin-react-hooks` ^7.0.1 (frontend)
- `eslint-plugin-react-refresh` ^0.4.26 (frontend)
- `eslint-plugin-boundaries` ^6.0.2 (enforces layer boundaries in agent, backend, frontend)
- `eslint-plugin-i18next` ^6.1.3 (frontend, enforces i18n usage)
- Config file: `eslint.config.mjs` (flat config format)

**Prettier** ^3.3.x — Formatting

**Key ESLint rules enforced:**
- `no-console: error` in agent, backend, trigger, session-stream-handler (must use `logger`)
- `process.env` reads forbidden outside `config/` layer (agent, backend)
- DynamoDB SDK imports confined to `repositories/` layer (agent, backend)
- Import extensions required for ESM (`.js` in imports, even for `.ts` files)
- Layer boundary rules prevent upward imports

## Infrastructure / IaC

**AWS CDK** 2.256.1 — TypeScript CDK, deployed from `packages/cdk`

**CDK stacks:**
- `AgentCoreStack` (`packages/cdk/lib/agentcore-stack.ts`) — Core stack with all primary resources
- `AgentCoreGatewayTargetStack` (`packages/cdk/lib/agentcore-gateway-target-stack.ts`) — Separately deployable Gateway tool targets
- `WafStack` (`packages/cdk/lib/waf-stack.ts`) — WAF WebACL (must be deployed in us-east-1)

**Environments:** `default` / `dev` / `stg` / `prd` — configured in `packages/cdk/config/environments.ts`

**Container architecture:** All Lambda functions and the AgentCore Runtime container target `linux/arm64` (AWS Graviton2) for cost savings.

## Observable Configuration

**Observability:**
- OpenTelemetry via `@aws/aws-distro-opentelemetry-node-autoinstrumentation` ~0.10.0 (agent)
- `@opentelemetry/sdk-metrics` ^2.6.1, `@opentelemetry/sdk-trace-base` ^2.7.0 (agent)
- X-Ray active tracing on Backend Lambda
- CloudWatch structured logs via pino NDJSON

**Key environment variables (agent):**
- `BEDROCK_MODEL_ID` — default `global.anthropic.claude-sonnet-4-6`
- `AGENTCORE_MEMORY_ID`, `AGENTCORE_SEMANTIC_STRATEGY_ID`
- `IDENTITY_POOL_ID`, `COGNITO_USER_POOL_ID`
- `USER_STORAGE_BUCKET_NAME`, `SESSIONS_TABLE_NAME`
- `APPSYNC_HTTP_ENDPOINT`, `BACKEND_API_URL`
- `GITHUB_TOKEN_BROKER_LAMBDA_ARN`

**Key environment variables (backend):**
- `COGNITO_USER_POOL_ID`, `COGNITO_USER_POOL_CLIENT_ID`, `COGNITO_MACHINE_USER_CLIENT_ID`
- `IDENTITY_POOL_ID`, `DEVELOPER_PROVIDER_NAME`
- `AGENTCORE_GATEWAY_ENDPOINT`, `AGENTCORE_MEMORY_ID`, `AGENTCORE_SEMANTIC_STRATEGY_ID`
- `AGENTS_TABLE_NAME`, `SESSIONS_TABLE_NAME`, `TRIGGERS_TABLE_NAME`
- `USER_STORAGE_BUCKET_NAME`, `USER_SCOPED_ROLE_ARN`
- `SSM_PARAMETER_PREFIX`, `TRIGGER_LAMBDA_ARN`, `SCHEDULER_ROLE_ARN`
- `GITHUB_WEBHOOK_SECRET_NAME`

**Key environment variables (frontend, Vite build-time):**
- `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`
- `VITE_AWS_REGION`, `VITE_AGENT_ENDPOINT`, `VITE_BACKEND_URL`
- `VITE_APPSYNC_EVENTS_ENDPOINT`, `VITE_BEDROCK_MODELS`
- `VITE_IDENTITY_POOL_ID`, `VITE_SELF_SIGN_UP_ENABLED`

---

*Stack analysis: 2026-06-27*
