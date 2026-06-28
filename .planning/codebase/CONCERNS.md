# CONCERNS
*Generated: 2026-06-27*
*Codebase: sample-multi-agent-orchestration-chat-on-agentcore*

---

## Security

### Explicit PoC Disclaimer — Not Production-Ready
The README and security section explicitly state this is a proof-of-concept not designed for production. AWS holds no responsibility for applications built from this tool. The deployer must implement their own controls.
- Files: `README.md` (Disclaimer and Security sections)
- Impact: Several of the items below are accepted PoC trade-offs, not bugs, but they block production adoption without remediation.

### MFA Disabled by Default
`cognito.Mfa.OFF` is the default in `CognitoAuth` and is suppressed in cdk-nag with the reason "Will be enabled for production." The CDK-nag rule `AwsSolutions-COG2` is suppressed stack-wide.
- Files: `packages/cdk/lib/constructs/auth/cognito-auth.ts:178`, `packages/cdk/lib/agentcore-stack.ts:984-986`
- Risk: No second factor; stolen credentials give full account access.
- Fix: Set `mfa: cognito.Mfa.OPTIONAL` or `REQUIRED` per environment in `packages/cdk/config/environments.ts`.

### CORS Wildcard Default
`DEFAULT_CONFIG.corsAllowedOrigins` is `['*']` and is applied to the Backend API Gateway, the AgentCore Runtime env var, and the S3 user-storage bucket CORS policy.
- Files: `packages/cdk/config/environment-utils.ts:67`, `packages/cdk/lib/agentcore-stack.ts:729` ("Allowed origins=`*` (development)")
- Risk: Any origin can make credentialed cross-origin requests to the API in a default deployment.
- Fix: Override `corsAllowedOrigins` per environment (non-default envs already do so via the Frontend URL).

### CloudFront TLS Minimum Protocol
CloudFront uses the default `*.cloudfront.net` certificate; cdk-nag rule `AwsSolutions-CFR4` is suppressed with reason "Custom domain with TLSv1.2 certificate will be configured for production."
- Files: `packages/cdk/lib/agentcore-stack.ts:988-991`
- Risk: Older TLS protocol versions are permitted on the default CloudFront domain.
- Fix: Attach a custom ACM certificate and set `minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021`.

### API Gateway Auth at Application Layer Only
API Gateway (HTTP API v2) has no native authorizer. JWT authentication is implemented entirely in the Express.js middleware. The cdk-nag rule `AwsSolutions-APIG4` is suppressed.
- Files: `packages/cdk/lib/agentcore-stack.ts:972-975`, `packages/backend/src/middleware/auth.ts`
- Risk: Any misconfiguration in the middleware layer bypasses authentication with no gateway-level backstop.
- Fix: Add a Cognito JWT authorizer at the HTTP API stage for defence-in-depth.

### Deletion Protection Disabled by Default
`DEFAULT_CONFIG.deletionProtection` is `false`, and `s3RemovalPolicy` defaults to `cdk.RemovalPolicy.DESTROY` with `autoDeleteObjects: true`. Only `prd` and `stg` environments override to `RETAIN`.
- Files: `packages/cdk/config/environment-utils.ts:66-70`
- Risk: Accidental `cdk destroy` in the `default` environment permanently deletes all S3 user data and DynamoDB tables.

### Shell Command Execution via AI (execute-command Tool)
The agent has a shell execution tool (`execute_command`) that runs arbitrary commands inside the container. Mitigations are present (IMDS blocking, user-scoped credentials, directory allow-list, DANGEROUS_COMMANDS blocklist), but the blocklist is a simple substring match on the lowercased command string and could be bypassed with creative encoding or command substitution.
- Files: `packages/agent/src/runtime/tools/execute-command.ts:29-77`
- Risk: Prompt injection in LLM conversation could cause execution of harmful commands.
- Existing mitigations: `AWS_EC2_METADATA_DISABLED=true`, credential scoping to user identity, directory restrictions. These are layered and meaningful but substring matching is not sandbox-level isolation.

### curl-to-sh Pattern in Dockerfiles
Both Dockerfiles fetch and execute remote shell scripts at build time (`curl -LsSf https://astral.sh/uv/install.sh | sh`). The agent Dockerfile also uses `pip3 install awscli --break-system-packages`.
- Files: `docker/agent.Dockerfile:45,58`, `docker/backend.Dockerfile:19,51`
- Risk: Supply-chain attack if the remote script is compromised; no hash pinning.
- Fix: Pin a specific uv version, verify a checksum, or use a pre-built image.

### AgentCore Runtime Has `GetOpenIdTokenForDeveloperIdentity` Permission
The Runtime execution role holds `cognito-identity:GetOpenIdTokenForDeveloperIdentity` for the `linkDeveloperAuthToIdentity` flow. The ADR acknowledges the risk: "AgentCore Runtime has arbitrary code execution risk (execute_command tool)."
- Files: `docs/adr/event-driven-identity-pool-credentials.md`, `packages/cdk/lib/agentcore-stack.ts`
- Risk: A stolen Runtime execution role credential combined with a valid user ID Token could link a developer identity. The ADR argues exploitability is significantly limited.

### Cognito `ADMIN_USER_PASSWORD_AUTH` Flow Enabled
The App Client enables `adminUserPassword: true` which bypasses SRP and sends credentials server-side. This is the auth flow used by the Trigger Lambda via Client Credentials.
- Files: `packages/cdk/lib/constructs/auth/cognito-auth.ts:243`
- Risk: If the backend is compromised, plaintext credentials are exposed.

### Log Retention at 7 Days (Default)
Default log retention is 7 days. This is insufficient for security incident investigation in most regulated environments.
- Files: `packages/cdk/config/environment-utils.ts:72`
- Fix: Override `logRetentionDays` to at least 90 for non-development environments.

---

## Technical Debt

### Duplicated Cron Validation Logic (Frontend / Backend)
`getMinimumIntervalMinutes()` is explicitly noted as "mirrored copy" in two places with a manual keep-in-sync comment.
- Files: `packages/frontend/src/components/triggers/CronBuilder/cronUtils.ts:136-139`, `packages/backend/src/services/scheduler-service.ts`
- Risk: A change in one location without updating the other causes UI and API to disagree on valid schedule intervals.
- Fix: Extract to `packages/libs/core` or a shared lib, or use a shared `@moca/` package.

### `as any` and `_def` Internal Zod API Access
`packages/libs/tool-definitions/src/utils/schema-converter.ts` accesses Zod's internal `_def` property multiple times using `as any` casts, which is fragile against Zod version upgrades.
- Files: `packages/libs/tool-definitions/src/utils/schema-converter.ts:45,48,92,98,108,142`
- Risk: Breaking on Zod major version upgrades with no type-level warning.

### `noImplicitReturns: false` in Backend
Express handlers are allowed to have implicit void returns, bypassing a useful TypeScript safety check.
- Files: `packages/backend/tsconfig.json:8`
- Impact: Handlers that forget to call `res.send()` in some code paths compile without error.

### Gateway Interceptor Lambda Uses `eslint-disable @typescript-eslint/no-explicit-any`
The entire gateway interceptor Lambda disables the `no-explicit-any` rule at file scope.
- Files: `packages/cdk/lambda/gateway-interceptor/index.ts:23`

### Sub-Agent Task Manager State Is In-Memory Only
`SubAgentTaskManager` stores all tasks in a `Map<string, SubAgentTask>` in process memory. Tasks expire after 24 hours via a cleanup pass. If the AgentCore Runtime container restarts mid-task, all running sub-agent tasks are lost with no recovery path.
- Files: `packages/agent/src/services/sub-agent-task-manager.ts:67-69`
- Impact: Silent task loss on container restart or scale-down. MAX_TASKS_PER_SESSION=5 caps per-session tasks but there is no global cap.

### `BackendUserScopedS3Role` Still Uses STS AssumeRole, Not Identity Pool
The ADR explicitly notes: "The BackendUserScopedS3Role (used by the Backend API Lambda) still uses the STS AssumeRole approach... this is lower priority but could be migrated to Cognito Identity Pool for consistency."
- Files: `docs/adr/aws-data-access-control.md` (Future Improvements section)
- Impact: Architectural inconsistency — two different credential-scoping mechanisms for the same data.

### Bedrockmodels List Must Be Kept Manually in Sync Between CDK and Core Lib
A code comment in `environment-utils.ts` warns: "CDK intentionally does not depend on @moca/core… Keep this list in sync with `BEDROCK_MODEL_DEFINITIONS`". The `region` pin especially must match or IAM grants target the wrong region.
- Files: `packages/cdk/config/environment-utils.ts:82-88`, `packages/libs/core/src/bedrock-models.ts`
- Risk: Out-of-sync `region` on a model causes `AccessDenied` at inference time.

---

## Architecture Risks

### Orphan Cognito Identity Pool Identities
If a user creates an EventBridge trigger before ever logging in through the frontend, Trigger Lambda creates a second (orphan) developer identity B that diverges from the frontend's identity A. The ADR documents a manual runbook to detect and clean these up.
- Files: `docs/adr/event-driven-identity-pool-credentials.md` (Runbook section)
- Risk: Trigger-invoked agents operate on an empty namespace (identity B) and cannot see user data.
- Prerequisite: The user must log in via the frontend before any trigger fires.

### Sub-Agent Depth Hard-Coded to 2
`maxDepth` is hard-coded to `2` directly in `call-agent.ts` rather than being configurable per agent or per request.
- Files: `packages/agent/src/runtime/tools/call-agent.ts:81`
- Impact: Legitimate multi-hop orchestration patterns are blocked; changing the limit requires a code deploy.

### Browser Client Is 1,682 Lines — Highest Complexity File
The AgentCore Browser client is the largest single file in the codebase. It manages full Playwright lifecycle, CDP reconnect, scroll fallback, screenshot capture, and session pooling.
- Files: `packages/agent/src/runtime/tools/browser/client.ts` (1,682 lines)
- Risk: High coupling; difficult to test in isolation; changes to one capability risk regressions in others.
- Test coverage: Only integration tests exist (`browser.integration.test.ts`), no unit tests.

### `GetOpenIdTokenForDeveloperIdentity` 25 TPS Hard Quota
The scheduler service comment explicitly warns that high-frequency schedules could exhaust the 25 TPS hard quota on `GetOpenIdTokenForDeveloperIdentity`, which is why a 10-minute minimum interval is enforced.
- Files: `packages/backend/src/services/scheduler-service.ts:69-75`
- Risk: At scale (many concurrent trigger fires), the quota becomes a bottleneck. No retry or circuit-breaker is present for quota errors.

### AppSync Message Deduplication Is Best-Effort Only
The frontend employs a two-stage timestamp-based deduplication guard for `MESSAGE_ADDED` events. Comments in the code explain why content-based deduplication is not used. The guard only suppresses duplicates in the tab that sent the message.
- Files: `packages/frontend/src/hooks/useMessageEventsSubscription.ts:144-217`
- Impact: Multiple open tabs can show duplicate messages. This is a known PoC limitation.

---

## Operational Gaps

### No CloudWatch Alarms Wired Up
The Backend API construct creates metric objects (`metricErrors`, `metricDuration`) but does not create `cloudwatch.Alarm` resources or SNS topics. The monitoring construct (`operations-dashboard.ts`) builds a dashboard but no alerting.
- Files: `packages/cdk/lib/constructs/api/backend-api.ts:339-346`, `packages/cdk/lib/constructs/monitoring/operations-dashboard.ts`
- Impact: Errors and latency spikes are visible on the dashboard only when someone is watching; no proactive notification.

### No Rate Limiting on Backend API
No rate-limiting middleware (e.g., `express-rate-limit`) is applied to any backend route. API Gateway has no usage plan or throttling. WAF only covers CloudFront, not the Backend API Gateway directly.
- Files: `packages/backend/src/index.ts`, `packages/cdk/lib/constructs/api/backend-api.ts`
- Impact: A single user can exhaust Lambda concurrency, Bedrock quotas, or the `GetOpenIdTokenForDeveloperIdentity` TPS limit.

### Session-Stream-Handler Lambda Has Zero Unit Tests
`packages/session-stream-handler` has no test files at all. The Lambda handles DynamoDB stream events and publishes to AppSync; bugs here cause silently lost real-time messages.
- Files: `packages/session-stream-handler/src/`
- Risk: Any change to stream processing logic has no regression coverage.

### Trigger Package Has No Unit Tests for Handlers
`packages/trigger/src` has unit tests only for `prompt-builder` and `agent-invoker`. The `schedule-handler.ts` and `custom-event-handler.ts` entrypoints (which call `getOpenIdTokenForUser` and the Backend) have no unit tests; coverage relies on the real-AWS integration tests.
- Files: `packages/trigger/src/handlers/`

### Frontend Has Minimal Unit Test Coverage
Frontend tests cover utility functions and a few stores but none of the React components, API clients, or routing logic. No component-level tests (Vitest + Testing Library or similar) exist.
- Files: `packages/frontend/src/` (only `stores/__tests__/`, `utils/__tests__/`, `config/__tests__/`)

### Backend Route Handlers Have Near-Zero Direct Test Coverage
Of 9 route files, only 2 have unit tests (`trigger-event-config-validation`, `storage-directory`). Routes for `agents`, `sessions`, `memory`, `tools`, `webhooks`, `events`, and `storage` (full surface) are covered only by real-AWS integration tests.
- Files: `packages/backend/src/routes/`

### Log Retention 7 Days by Default
Short default retention makes post-incident forensics difficult without out-of-band log archival.
- Files: `packages/cdk/config/environment-utils.ts:72`

### `aws-lambda-adapter` Pulled from Public ECR at Build Time Without Version Pinning
The backend Dockerfile pulls `public.ecr.aws/awsguru/aws-lambda-adapter:1.0.0` at image build time. If the image tag is overwritten upstream, builds become non-deterministic.
- Files: `docker/backend.Dockerfile:61`
- Fix: Pin by digest (`@sha256:...`) in addition to the tag.

---

## Missing Coverage

### No CDK / Infrastructure Tests
There are no `cdk.assertions` tests (snapshot or fine-grained) for any of the three CDK stacks. Infrastructure regressions (e.g., accidental removal of IAM conditions, removal of TTL) would not be caught before deployment.
- Files: `packages/cdk/` (no `*.test.ts` beyond `environment-utils.test.ts` and `config/environment-utils.test.ts`)

### No End-to-End Tests
The CI pipeline runs unit tests, DynamoDB-local integration tests, and real-AWS integration tests (credential-gated, not in CI). There are no browser-driven E2E tests covering the full user flow (login → chat → file upload → trigger).

### MCP Tool Configuration Untested
`packages/backend/src/libs/mcp/client-factory.ts` (197 lines) has no tests. MCP config validation, environment variable extraction/restoration from SSM, and the SSM sentinel pattern are exercised only indirectly through the agents-service integration test.
- Files: `packages/backend/src/libs/mcp/client-factory.ts`, `packages/backend/src/services/mcp-env-helpers.ts`

### GitHub Webhook Route Untested
`packages/backend/src/routes/webhooks.ts` (HMAC-SHA256 signature verification for GitHub webhooks) has no tests.
- Files: `packages/backend/src/routes/webhooks.ts`

### Memory and Summarization Routes Untested
`packages/backend/src/routes/memory.ts` and the associated `agentcore-memory.ts` service (458 lines) have no unit tests.
- Files: `packages/backend/src/routes/memory.ts`, `packages/backend/src/services/agentcore-memory.ts`

### execute-command Tool Has No Unit Tests
The `execute-command.ts` tool (shell execution with blocklist and credential scoping) has no unit tests. Its security-relevant `isDangerousCommand` and `isAllowedWorkingDirectory` functions are tested only implicitly.
- Files: `packages/agent/src/runtime/tools/execute-command.ts`
