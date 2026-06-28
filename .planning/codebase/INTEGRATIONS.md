# External Integrations

*Generated: 2026-06-27*
*Codebase: sample-multi-agent-orchestration-chat-on-agentcore*

## Amazon Bedrock AgentCore

The central AWS service this project is built around. Two primary primitives are used:

### AgentCore Runtime
- **What:** Managed container hosting for AI agents. Runs the `packages/agent` Docker image.
- **Architecture:** ARM64 container built by CodeBuild at CDK deploy time.
- **CDK construct:** `packages/cdk/lib/constructs/agentcore/agentcore-runtime.ts`
- **CDK L2:** `aws-cdk-lib/aws-bedrockagentcore` (`agentcore.Runtime`)
- **Invocation endpoint:** `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{runtimeArn}/invocations?qualifier=DEFAULT`
- **Auth:** JWT (Cognito User Pool, both frontend and machine user clients accepted)
- **Idle timeout:** 300 seconds (defense-in-depth; event-driven sessions self-terminate earlier)
- **Forwarded headers:** `Authorization`, `X-Amzn-Bedrock-AgentCore-Runtime-Custom-Id-Token`
- **Client SDK:** `@aws-sdk/client-bedrock-agentcore` ^3.956.0
- **Self-termination:** Event-driven sessions call `bedrock-agentcore:StopRuntimeSession` after responding (`packages/agent/src/services/session`)

### AgentCore Gateway (MCP Gateway)
- **What:** MCP protocol gateway that routes tool calls to Lambda targets.
- **CDK construct:** `packages/cdk/lib/constructs/agentcore/agentcore-gateway.ts`
- **CDK L2:** `agentcore.Gateway`, `agentcore.McpProtocolConfiguration`
- **Auth:** Cognito JWT (using OIDC discovery URL from Cognito User Pool)
- **Search type:** Semantic (`McpGatewaySearchType.SEMANTIC`)
- **Protocol:** MCP 2025-03-26
- **MCP endpoint:** `https://{gatewayId}.gateway.bedrock-agentcore.{region}.amazonaws.com/mcp`
- **Request Interceptor:** A Lambda (`packages/cdk/lambda/gateway-interceptor/index.ts`) runs before every tool call to inject `_context` (userId, identityId, storagePath). Enabled via `enableInterceptor: true`.

### AgentCore Memory
- **What:** Conversation history persistence with short-term and long-term (semantic) strategies.
- **CDK construct:** `packages/cdk/lib/constructs/agentcore/agentcore-memory.ts`
- **CDK L2:** `agentcore.Memory`, `agentcore.MemoryStrategy.usingSemantic()`
- **Semantic strategy:** Extracts facts/concepts using vector embeddings for similarity search
- **Expiration:** 30 days (default), 60 days (stg), 365 days (prd)
- **Strategy ID resolution:** AwsCustomResource calling `GetMemoryCommand` at deploy time (deploy-time resolved, passed as env var `AGENTCORE_SEMANTIC_STRATEGY_ID`)
- **Access model:** Per-user isolation via Cognito Identity Pool credentials (`bedrock-agentcore:actorId` / `bedrock-agentcore:namespace` IAM condition keys). Neither the Runtime execution role nor the Backend execution role has direct Memory permissions — they use per-user credentials from `GetCredentialsForIdentity`.
- **Client SDK:** `@aws-sdk/client-bedrock-agentcore` (agent, backend)

### AgentCore Code Interpreter
- **What:** Managed sandboxed code execution environment.
- **IAM resource:** `arn:aws:bedrock-agentcore:{region}:aws:code-interpreter/aws.codeinterpreter.v1`
- **Actions granted:** `StartCodeInterpreterSession`, `InvokeCodeInterpreter`, `StopCodeInterpreterSession`, `GetCodeInterpreterSession`
- **Implementation:** `packages/agent/src/runtime/tools/code-interpreter/`

### AgentCore Browser
- **What:** Managed browser sessions for web automation.
- **IAM resources:** `bedrock-agentcore:{region}:{account}:browser/*` and `bedrock-agentcore:{region}:aws:browser/*`
- **Implementation:** `packages/agent/src/runtime/tools/browser/`
- **Client library:** `playwright-core` ^1.58.2

## Amazon Bedrock (Foundation Models)

- **Client SDK:** `@aws-sdk/client-bedrock-runtime` (indirectly via Strands SDK)
- **Default model:** `global.anthropic.claude-sonnet-4-6` (cross-region inference profile, set in `agentcore-runtime.ts`)
- **Supported providers:** Anthropic, Amazon, Qwen (defined in `packages/libs/core/src/bedrock-models.ts`)
- **Model selection:** Frontend model selector populated from `VITE_BEDROCK_MODELS` (build-time env)
- **IAM scoping:** `deriveBedrockIamResources()` in `packages/cdk/config/environment-utils.ts` derives exact ARNs from `bedrockModels` config — no wildcard `Resource: *`
- **Cross-region inference:** Supported via `global.`, `us.`, `jp.`, `eu.`, `apac.` prefixed model IDs
- **Nova Canvas** (`amazon.nova-canvas-v1:0`): Image generation, via `packages/lambda-tools/tools/nova-canvas-tools`
- **Nova Reel** (`amazon.nova-reel-v1:1`): Async video generation, via `packages/lambda-tools/tools/nova-reel-tools`
- **Knowledge Base Retrieve** (`bedrock:Retrieve`): Via `packages/lambda-tools/tools/kb-tools` (opt-in)

## Amazon Cognito

### User Pool
- **CDK construct:** `packages/cdk/lib/constructs/auth/cognito-auth.ts`
- **CDK L2:** `cognito.UserPool`
- **Self sign-up:** Disabled by default; optional email domain allowlist via `PreSignUp` Lambda trigger (`packages/cdk/lambda/cognito-pre-signup/index.ts`)
- **Security:** PLUS tier (Threat Protection), enforced via `addPropertyOverride('UserPoolTier', 'PLUS')`
- **Auth flows:** `USER_PASSWORD_AUTH`, `USER_SRP_AUTH`, `ADMIN_USER_PASSWORD_AUTH`
- **Frontend app client:** Public client (no secret), 1-hour access/ID tokens, 30-day refresh
- **Machine user app client:** Confidential client (Client Credentials Flow), scopes `agent/invoke agent/tools`
- **OIDC Discovery URL:** `https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/openid-configuration`
- **JWT verification library:** `aws-jwt-verify` ^5.1.1 (agent and backend both verify JWTs independently)
- **JWKS pre-warm:** Both agent and backend call `hydrateJwtVerifiers()` / `hydrateJWKS()` at startup to cache JWKS before first request

### Identity Pool
- **CDK construct:** `packages/cdk/lib/constructs/auth/cognito-identity-pool.ts`
- **Purpose:** Per-user scoped credentials for S3 and DynamoDB access
- **Access pattern:** Frontend and agent call `GetCredentialsForIdentity` with the Cognito ID Token to get temporary credentials scoped to the Authenticated Role; the Authenticated Role's IAM policies use `${cognito-idp.REGION.amazonaws.com/POOL_ID:sub}` policy variables to restrict access to each user's S3 prefix and DynamoDB partition key
- **Developer Authenticated Identities:** Trigger Lambda calls `GetOpenIdTokenForDeveloperIdentity` to issue per-user OpenID tokens so event-driven invocations resolve to the same `identityId` as frontend sessions (see `docs/adr/event-driven-identity-pool-credentials.md`)
- **Developer provider name:** `{resourcePrefix}.trigger` (e.g., `moca.trigger`)

### Frontend Auth (AWS Amplify v6)
- **Configuration:** `packages/frontend/src/lib/auth/configure.ts`
- **Library:** `aws-amplify` ^6.16.4 (`Auth.Cognito` module)
- **Configured at startup:** `main.tsx` imports `configure.ts` before any auth call
- **Session refresh:** `fetchAuthSession({ forceRefresh: true })` used by API error handlers for 401 recovery

## Amazon DynamoDB

Three tables, all using PAY_PER_REQUEST billing, AWS-managed encryption, point-in-time recovery:

### Agents Table
- **CDK construct:** `packages/cdk/lib/constructs/storage/agents-table.ts`
- **Table name:** `{resourcePrefix}-agents`
- **Schema:** Partition key `userId` (S), sort key `agentId` (S)
- **Accessed by:** Backend API (read/write), Trigger Lambda (read-only)

### Sessions Table
- **CDK construct:** `packages/cdk/lib/constructs/storage/sessions-table.ts`
- **Table name:** `{resourcePrefix}-sessions`
- **Schema:** Partition key `userId` (S), sort key `sessionId` (S)
- **GSI:** `userId-updatedAt-index` (partition: `userId`, sort: `updatedAt`) for ordered session listing
- **DynamoDB Streams:** Enabled (`NEW_AND_OLD_IMAGES`) — triggers `session-stream-handler` Lambda
- **Per-user isolation:** Identity Pool Authenticated Role restricts access via `dynamodb:LeadingKeys` condition + GSI `index/*`
- **Accessed by:** Backend API (read/write), Agent Runtime (via Identity Pool credentials)

### Triggers Table
- **CDK construct:** `packages/cdk/lib/constructs/storage/triggers-table.ts`
- **Table name:** `{resourcePrefix}-triggers`
- **Accessed by:** Backend API (read/write), Trigger Lambda (read/write)

**DynamoDB access confinement:** ESLint rule (`eslint.config.mjs`) enforces that DynamoDB SDK imports are confined to `repositories/` layer in both agent and backend packages.

## Amazon S3

### User Storage Bucket
- **CDK construct:** `packages/cdk/lib/constructs/storage/user-storage.ts`
- **Bucket name:** `{resourcePrefix}-user-storage-{account}-{region}`
- **Purpose:** Per-user file storage for agent workspaces
- **Per-user isolation:** S3 key prefix scoped to `users/{cognitoSub}/` enforced by Identity Pool Authenticated Role IAM policy variables
- **Access:** Backend via STS `AssumeRole` with per-user session policy; Agent via Identity Pool credentials; Frontend direct uploads (via pre-signed URLs from backend)
- **S3 sync library:** `packages/libs/s3-workspace-sync` — bidirectional sync with hash-based diff, `.syncignore` support, concurrent transfers

### Frontend Bucket
- **CDK construct:** `packages/cdk/lib/constructs/frontend/frontend.ts`
- **Bucket name:** `{resourcePrefix}-frontend-{account}-{region}`
- **Purpose:** Static website hosting, accessed exclusively via CloudFront OAC
- **Public access:** Blocked; served through CloudFront only

### Access Logs Bucket
- **Bucket name:** `{resourcePrefix}-access-logs-{account}-{region}`
- **Purpose:** Centralized S3 server access logs and CloudFront access logs
- **Lifecycle:** 90-day expiration

### Athena Output Bucket (opt-in)
- **Bucket name:** `{resourcePrefix}-athena-output-{account}-{region}`
- **Created when:** `envConfig.athenaSourceBuckets` is configured
- **Lifecycle:** 7-day expiration

## Amazon AppSync Events (WebSocket Real-Time)

- **CDK construct:** `packages/cdk/lib/constructs/api/appsync-events.ts`
- **CDK L1:** `appsync.CfnApi` (Events API, not GraphQL)
- **API name:** `{resourcePrefix}-events`
- **Channel namespaces:** `sessions` and `messages`
- **Auth:**
  - Connections: Cognito User Pool (`AMAZON_COGNITO_USER_POOLS`)
  - Publishing: IAM (`AWS_IAM`) — only Lambda functions publish
  - Subscriptions: Cognito User Pool
- **HTTP endpoint:** `https://{dns}/event` — Lambda publishes events here (SigV4 signed)
- **WebSocket endpoint:** `wss://{dns}/event/realtime` — Frontend subscribes here via `VITE_APPSYNC_EVENTS_ENDPOINT`
- **Flow:** `Sessions Table → DynamoDB Streams → session-stream-handler Lambda → AppSync Events → Frontend WebSocket`
- **Publishing:** `packages/session-stream-handler/src/` — uses manual SigV4 signing (`@smithy/signature-v4` + `@aws-crypto/sha256-js`) to call AppSync HTTP endpoint; also agent runtime publishes directly to AppSync for streaming messages

## Amazon API Gateway (HTTP API v2)

- **CDK construct:** `packages/cdk/lib/constructs/api/backend-api.ts`
- **Type:** HTTP API (API Gateway v2), not REST API
- **Integration:** Lambda proxy (`PayloadFormatVersion.VERSION_2_0`)
- **Routing:** `/{proxy+}` catch-all forwarded to Lambda (Lambda Web Adapter handles Express routing internally)
- **Auth:** None at API Gateway level — JWT verification is done inside the Express app
- **CORS:** Configured at API Gateway level (`corsPreflight`) plus Express-level CORS middleware
- **Access logging:** CloudWatch Logs, JSON-structured format
- **Allowed headers:** `Content-Type`, `Authorization`, `X-Amzn-Bedrock-AgentCore-Runtime-Custom-Id-Token`

## Amazon CloudFront

- **CDK construct:** `packages/cdk/lib/constructs/frontend/frontend.ts`
- **Origin:** S3 bucket via Origin Access Control (OAC, SigV4 signing)
- **Price class:** `PRICE_CLASS_100` (US, Canada, Europe)
- **Geo restriction:** Allowlist (`cloudFrontGeoRestriction` in `environments.ts`, default `['JP', 'US']`)
- **WAF:** Optional WebACL from `WafStack` (us-east-1, cross-region reference)
- **Security headers:** Custom ResponseHeadersPolicy (X-Frame-Options DENY, HSTS, XSS protection, referrer policy)
- **Static asset caching:** 365-day TTL for `/assets/*` (content-hashed filenames)
- **SPA routing:** 404/403 → `index.html` (30-minute TTL)
- **Custom domain:** Optional Route53 A record + ACM certificate (DnsValidatedCertificate in us-east-1)

## AWS WAF

- **CDK stack:** `packages/cdk/lib/waf-stack.ts` (must deploy to `us-east-1`)
- **Scope:** `CLOUDFRONT`
- **Managed rules:**
  - `AWSManagedRulesCommonRuleSet` (priority 1)
  - `AWSManagedRulesAmazonIpReputationList` (priority 2)
- **Passed to:** `AgentCoreStack` via CDK cross-region references as `webAclArn`

## Amazon EventBridge

### EventBridge Scheduler
- **Used by:** Backend API to create scheduled triggers (cron/rate expressions)
- **Schedule group:** `default`
- **Target:** Trigger Lambda (`{resourcePrefix}-trigger-executor`)
- **Backend permissions:** `scheduler:CreateSchedule`, `UpdateSchedule`, `DeleteSchedule`, `GetSchedule`, `ListSchedules` scoped to `schedule/default/*`
- **IAM role:** `SchedulerRole` (assumed by `scheduler.amazonaws.com`, granted `lambda:InvokeFunction` on Trigger Lambda)

### EventBridge Rules (opt-in)
- **CDK construct:** `packages/cdk/lib/constructs/triggers/trigger-event-sources.ts`
- **Created when:** `envConfig.eventRules` is configured
- **Purpose:** Predefined event patterns (e.g., S3 uploads, GitHub pushes) that fire Trigger Lambda
- **Webhook support:** Backend `/webhooks` route handles GitHub webhooks (HMAC-SHA256 verification via `GITHUB_WEBHOOK_SECRET_NAME`), then calls `events:PutEvents` to default event bus

## AWS Lambda

All Lambda functions run on `NODEJS_22_X` runtime, `ARM64` architecture (Graviton2):

| Function | Package | Purpose |
|---|---|---|
| Backend API | `packages/backend` | Express REST API via Lambda Web Adapter |
| Gateway Interceptor | `packages/cdk/lambda/gateway-interceptor/index.ts` | Injects `_context` into MCP tool calls |
| Cognito Pre-Signup | `packages/cdk/lambda/cognito-pre-signup/index.ts` | Email domain allowlist enforcement |
| Session Stream Handler | `packages/session-stream-handler` | DynamoDB Streams → AppSync Events relay |
| Trigger Executor | `packages/trigger` | EventBridge Scheduler → AgentCore Runtime invocation |
| GitHub Token Broker | `packages/github-token-broker` | Retrieves GitHub PAT from Secrets Manager; invoked by Runtime |
| Utility Tools | `packages/lambda-tools/tools/utility-tools` | Echo/ping tools (always deployed) |
| Knowledge Base Tools | `packages/lambda-tools/tools/kb-tools` | Bedrock Knowledge Base search (opt-in) |
| Athena Tools | `packages/lambda-tools/tools/athena-tools` | Athena S3 query tools (opt-in) |
| Tavily Tools | `packages/lambda-tools/tools/tavily-tools` | Web search via Tavily API (opt-in) |
| Nova Canvas Tools | `packages/lambda-tools/tools/nova-canvas-tools` | Image generation |
| Nova Reel Tools | `packages/lambda-tools/tools/nova-reel-tools` | Async video generation |

All Lambda-tool functions are bundled by CDK `NodejsFunction` (esbuild, minified, ARM64). The Backend API uses a Docker image function (Lambda Web Adapter).

## AWS Secrets Manager

- **Naming convention:** `agentcore/{env}/{secret-name}` (e.g., `agentcore/stg/tavily-api-key`)
- **Secrets used:**
  - `tavilyApiKeySecretName` — Tavily API key, read by Tavily Tools Lambda (opt-in)
  - `githubTokenSecretName` — GitHub PAT, read exclusively by GitHub Token Broker Lambda (never by Runtime execution role directly)
  - `githubWebhookSecretName` — GitHub webhook HMAC secret, read by Backend API for webhook verification
  - `microsoftGraphOAuthSecretArn` — Microsoft Graph OAuth2 secret (opt-in, for OneDrive target)
- **Access isolation:** GitHub PAT is a key design constraint — Runtime cannot call `secretsmanager:GetSecretValue` directly. It invokes the GitHub Token Broker Lambda via `lambda:InvokeFunction` instead (see `docs/adr/github-token-broker-lambda.md`)

## AWS Systems Manager Parameter Store

- **Parameter prefix:** `/agentcore/{resourcePrefix}` (e.g., `/agentcore/moca`)
- **Used for:** Storing per-agent MCP server configurations (env values from frontend)
- **Backend:** Reads/writes `ssm:PutParameter`, `ssm:GetParameter`, `ssm:DeleteParameter` scoped to `/agentcore/{prefix}/agents/*`
- **Trigger Lambda:** Reads `ssm:GetParameter` scoped to `/agentcore/{prefix}/agents/*`

## AWS STS (Security Token Service)

- **Used by:** Backend API for per-user S3 access via `sts:AssumeRole`
- **Role assumed:** `BackendUserScopedS3Role` — grants S3 object operations on user storage bucket, further restricted by per-user session policy passed at AssumeRole time
- **Identity Pool:** `GetCredentialsForIdentity` called by Agent Runtime and Backend to exchange Cognito ID Tokens for per-user temporary credentials

## AWS X-Ray

- **Backend:** Active tracing (`lambda.Tracing.ACTIVE` on Backend Lambda)
- **Agent:** X-Ray SDK via ADOT auto-instrumentation (`--require @aws/aws-distro-opentelemetry-node-autoinstrumentation/register` in `startup.sh`)
- **Permissions:** `xray:PutTraceSegments`, `xray:PutTelemetryRecords`, `xray:GetSamplingRules`, `xray:GetSamplingTargets` on AgentCore Runtime execution role
- **Note:** `OTEL_NODE_DISABLED_INSTRUMENTATIONS=aws-sdk` is set to prevent ADOT's AWS SDK instrumentation from breaking SigV4 signing (documented in `agentcore-runtime.ts`)

## AWS CloudWatch

- **Logs:** All Lambda functions write structured JSON (pino NDJSON) to CloudWatch Logs
- **Agent logs:** `/aws/bedrock-agentcore/runtimes/*`
- **Backend logs:** `/aws/lambda/{apiName}-function`
- **Metrics:** Agent Runtime calls `cloudwatch:PutMetricData` scoped to `bedrock-agentcore` namespace
- **Dashboard:** `OperationsDashboard` construct (`packages/cdk/lib/constructs/monitoring/operations-dashboard.ts`) creates a CloudWatch dashboard covering Backend Lambda, Session Stream Handler, Trigger Lambda, Gateway Interceptor, HTTP API, DynamoDB tables, CloudFront, and User Storage

## AWS Athena and AWS Glue (opt-in)

- **Activated when:** `envConfig.athenaSourceBuckets` is configured
- **Athena Tools Lambda:** `packages/lambda-tools/tools/athena-tools`
- **Client SDKs:** `@aws-sdk/client-athena`, `@aws-sdk/client-glue`
- **Workgroup:** `primary`
- **Glue catalog:** Read-only access to `database/*` and `table/*/*`

## Model Context Protocol (MCP)

- **SDK:** `@modelcontextprotocol/sdk` ^1.25.1 (both agent and backend)
- **Strands SDK integration:** `McpClient` from `@strands-agents/sdk` wraps MCP transports

### Transports supported (agent MCP client):
- **stdio** — Spawns a subprocess (e.g., Python MCP servers via `uvx`). Lambda/container environment sets `HOME=/tmp`, `NPM_CONFIG_CACHE=/tmp/.npm`
- **Streamable HTTP** (`StreamableHTTPClientTransport`) — Connects to HTTP-based MCP servers
- **SSE** (`SSEClientTransport`) — Server-Sent Events based MCP servers

### MCP client caching:
- `packages/agent/src/libs/mcp/client-factory.ts` — In-memory cache keyed by normalized server config JSON
- `packages/agent/src/runtime/agent/mcp-clients-builder.ts` — Builds clients from user-provided `mcp.json`

### AgentCore Gateway as MCP server:
- The Gateway exposes Lambda tool targets as MCP tools to the agent
- Tool naming: Gateway auto-composes `{targetName}__{toolName}` (e.g., `utility-tools__echo`)
- Backend manages Gateway targets via `@aws-sdk/client-bedrock-agentcore-control`

## Third-Party APIs

### Tavily (Web Search)
- **Purpose:** Web search, extract, and crawl tools exposed via AgentCore Gateway
- **Implementation:** `packages/lambda-tools/tools/tavily-tools`
- **Auth:** API key from Secrets Manager (`tavilyApiKeySecretName`)
- **Opt-in:** Only deployed when `tavilyApiKeySecretName` is set in `environments.ts`

### GitHub
- **GitHub CLI (`gh`):** Installed in agent Docker image (`docker/agent.Dockerfile`) for repository operations
- **GitHub PAT:** Fetched at container startup from GitHub Token Broker Lambda; stored temporarily for `gh` CLI auth; env var unset after boot
- **GitHub Webhooks:** Backend `/webhooks` route (`packages/backend/src/routes/webhooks.ts`) receives GitHub events, verifies HMAC-SHA256 signature using `GITHUB_WEBHOOK_SECRET_NAME`, forwards to EventBridge default bus

### Microsoft Graph / OneDrive (opt-in)
- **What:** OpenAPI Gateway target for OneDrive file operations (list, upload, download, search, delete)
- **CDK:** `agentcore.GatewayTarget.forOpenApi()` with `GatewayCredentialProvider.fromOauthIdentityArn()`
- **Schema:** `packages/cdk/lib/schemas/microsoft-graph-onedrive.json`
- **Activated when:** `microsoftGraphOAuthProviderArn` and `microsoftGraphOAuthSecretArn` are both configured
- **OAuth:** Managed by AgentCore Gateway OAuth2 credential provider (token-vault)

## Authentication and Authorization Flow

### Frontend → AgentCore Runtime (interactive chat):
1. Frontend authenticates via Cognito User Pool (Amplify v6)
2. Frontend obtains Cognito access token + ID token
3. Frontend calls AgentCore Runtime endpoint with `Authorization: Bearer {accessToken}` and `X-Amzn-Bedrock-AgentCore-Runtime-Custom-Id-Token: {idToken}`
4. AgentCore Runtime verifies JWT (Cognito User Pool)
5. Runtime exchanges ID Token via `GetCredentialsForIdentity` for per-user temporary credentials
6. Agent uses those credentials for user-scoped S3/DynamoDB access

### Frontend → Backend API (agent/session management):
1. Same Cognito access token in `Authorization: Bearer`
2. Backend verifies JWT with `aws-jwt-verify` (checks `iss`, `aud`, `client_id`)
3. Backend calls `GetOpenIdTokenForDeveloperIdentity` to link userId to identityId (developer auth)
4. Backend uses STS `AssumeRole` with session policy for user-scoped S3 operations

### Frontend → AgentCore Gateway (MCP tools via agent):
1. Agent Runtime receives JWT from the frontend's invocation request
2. Agent propagates JWT to Gateway in `Authorization` header
3. Gateway verifies JWT and issues workload access token
4. Gateway Interceptor Lambda resolves `identityId` via `cognito-identity:GetId`
5. Gateway calls target Lambda with `_context` injected (userId, identityId, storagePath)

### Trigger Lambda → AgentCore Runtime (event-driven):
1. Trigger Lambda fetches machine user OAuth2 token from Cognito token endpoint (`client_credentials` flow)
2. Trigger calls `GetOpenIdTokenForDeveloperIdentity` to get a per-user OpenID token
3. Trigger calls AgentCore Runtime with machine user access token + per-user OpenID token (as custom ID token)
4. Runtime exchanges per-user OpenID token via `GetCredentialsForIdentity` for the same `identityId` as the human user

---

*Integration audit: 2026-06-27*
