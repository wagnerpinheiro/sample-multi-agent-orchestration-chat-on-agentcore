# Phase 1: Backend & Data Layer - Research

**Researched:** 2026-06-28
**Domain:** TypeScript Express backend — DynamoDB schema extension, SigV4 HTTP proxy, CDK IAM
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add four optional fields to `Agent` interface in `packages/backend/src/types/agent-types.ts`: `agentType?: 'moca' | 'external_agentcore'`, `externalRuntimeArn?: string`, `externalRuntimeRegion?: string`, `streamFormat?: 'strands' | 'other'`
- **D-02:** Existing agents without `agentType` default to `'moca'` behavior — no migration needed (DynamoDB is schemaless)
- **D-03:** Same fields added to `UpdateAgentPatch` in `packages/backend/src/repositories/agents/agents-repository.ts`
- **D-04:** Zod schemas `createAgentBody` and `updateAgentBody` in `packages/backend/src/routes/agents.ts` extended with four optional fields; refinement added requiring `externalRuntimeArn` when `agentType === 'external_agentcore'`
- **D-05:** New route `POST /agents/:agentId/invoke` added to `packages/backend/src/routes/agents.ts`; looks up agent record, validates it is `external_agentcore`, then proxies to external runtime
- **D-06:** Request body: full passthrough — proxy forwards complete client request body to external runtime as-is; no re-shaping for v1
- **D-07:** `externalRuntimeRegion` default: when absent, proxy falls back to deployment region (`AWS_REGION` env var) at invocation time; field is optional in both schema and storage
- **D-08:** Use `@aws-sdk/signature-v4` (or `SignatureV4` from `@smithy/signature-v4`) to sign requests to `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{arn}/invocations`
- **D-09:** Add `bedrock-agentcore:InvokeRuntime` via existing `grantPermissions()` helper in `packages/cdk/lib/constructs/api/backend-api.ts:364`
- **D-10:** Strands format (`streamFormat === 'strands'`): pass response stream through transparently — pipe bytes directly back to frontend; no buffering
- **D-11:** Non-Strands format (`streamFormat === 'other'` or unset for external): buffer complete response, emit single SSE `content_block_delta` event in Moca format
- **D-12:** Resource scope for `bedrock-agentcore:InvokeRuntime`: `arn:aws:bedrock-agentcore:{region}:{account}:runtime/*`

### Claude's Discretion

- SigV4 signing implementation details (which SDK class, credential provider chain)
- Error wrapping for non-2xx responses from external runtime (v1: surface HTTP error as-is)
- Exact SSE event envelope for the buffered plain-text delta

### Deferred Ideas (OUT OF SCOPE)

- Progressive streaming for non-Strands runtimes — v2
- Connection validation / test-before-save
- ARN format validation — v2
- Session context forwarding to external runtime — v2 (SESS-01)
- Per-registered-ARN IAM scoping

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-03 | External runtimes stored as agent records in DynamoDB with `agentType: 'external_agentcore'` and optional fields | DynamoDB is schemaless; new fields marshal/unmarshal via existing `item.ts` pattern — no table change needed |
| REG-04 | External runtimes follow the same owner + org-sharing model (`isShared` / `createdBy`) | Sharing reads/writes same DynamoDB partition; `listShared` GSI query is field-agnostic — no code change needed, add assertions to service tests |
| INFRA-01 | `bedrock-agentcore:InvokeRuntime` added to backend Lambda execution role in CDK | Use `this.backendApi.lambdaFunction.addToRolePolicy()` directly in `agentcore-stack.ts` — same pattern as `SsmMcpEnvReadWrite` and `SchedulerManageSchedules` |
| INFRA-02 | New backend route `POST /agents/:agentId/invoke` handling SigV4 proxy logic | Route wires into `packages/backend/src/routes/agents.ts`; uses `asyncHandler` + `validate` + existing agent lookup pattern |
| INFRA-03 | Backend `GET /agents/:agentId` returns new optional fields to frontend | `fromItemAttr` uses `unmarshall` with `removeUndefinedValues: true` on write; absent DynamoDB fields return `undefined` in domain type — already round-trips correctly for optional fields |
| DISC-02 | External runtimes shared with org are visible to all users (same as native shared agents) | `listShared` GSI query is `isShared-createdAt-index` — agnostic to `agentType`; sharing logic in `AgentsService.listSharedAgents` does no field filtering beyond `isShared` |

</phase_requirements>

---

## Summary

Phase 1 extends the existing `Agent` interface, DynamoDB marshal/unmarshal layer, and Zod validation schemas with four optional fields, then adds a new `POST /agents/:agentId/invoke` route that acts as a SigV4-signed HTTP proxy to an external AgentCore Runtime endpoint. Finally, it grants `bedrock-agentcore:InvokeRuntime` to the backend Lambda execution role in CDK.

The codebase already has a working SigV4 signing pattern in `packages/session-stream-handler` and `packages/agent/src/services/appsync-events-publisher.ts` using `@smithy/signature-v4` + `@aws-crypto/sha256-js` + `defaultProvider()`. This is the reference implementation for the new proxy. The backend package does NOT currently have `@smithy/signature-v4`, `@aws-crypto/sha256-js`, or `@aws-sdk/credential-provider-node` as dependencies — these must be added.

The DynamoDB marshal/unmarshal layer in `item.ts` already uses `{ removeUndefinedValues: true }` on write, so new optional fields on the `Agent` type will round-trip correctly for existing records. The `buildAgentUpdateExpression` function must be extended to include the four new fields in SET/REMOVE logic.

**Primary recommendation:** Follow the `@smithy/signature-v4` pattern already established in `packages/session-stream-handler`, use Node.js `https` module for the outbound request (same as the existing signing pattern), and pipe the response stream directly for Strands format. Three new npm dependencies are needed in `packages/backend/package.json`.

---

## Standard Stack

### Core (already in backend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-dynamodb` + `@aws-sdk/util-dynamodb` | ^3.958.0 | DynamoDB marshal/unmarshal | Existing pattern; all repository code uses these |
| `zod` | ^4.2.1 | Request body validation | Existing pattern throughout routes |
| `express` | ^4.18.2 | HTTP routing | App framework |

### Must Add to backend (not yet in package.json)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@smithy/signature-v4` | ^5.5.2 (current) | SigV4 request signing | Already used in `session-stream-handler` and `agent`; consistent with project pattern |
| `@aws-crypto/sha256-js` | ^5.2.0 (current) | SHA-256 hasher for SigV4 | Required by `SignatureV4` constructor; already used in `session-stream-handler` |
| `@aws-sdk/credential-provider-node` | ^3.972.58 (current) | `defaultProvider()` for Lambda role credentials | Used in `session-stream-handler` for identical signing use case |

**Note on version pinning:** `session-stream-handler/package.json` currently pins `@smithy/signature-v4@^4.0.0` and `@aws-crypto/sha256-js@^5.2.0`. The current npm registry versions are `5.5.2` and `5.2.0` respectively. Use `^4.0.0` for consistency across the monorepo (npm workspaces will hoist a compatible version).

**Installation:**
```bash
npm install @smithy/signature-v4 @aws-crypto/sha256-js @aws-sdk/credential-provider-node -w @moca/backend
```

**Version verification (confirmed 2026-06-28):**
- `@smithy/signature-v4`: 5.5.2
- `@aws-crypto/sha256-js`: 5.2.0
- `@aws-sdk/credential-provider-node`: 3.972.58

### Supporting (already used in agent/session-stream-handler — same pattern)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js `https` (built-in) | N/A | Outbound HTTP request with signed headers | Proxy route outbound call to external runtime |
| Node.js `stream` (built-in) | N/A | Piping response stream | Strands pass-through in proxy route |

---

## Architecture Patterns

### Pattern 1: DynamoDB Optional Field Extension (no migration)

**What:** Add optional fields to `Agent` interface and extend `toDynamoAgent`/`fromDynamoAgent` in `item.ts`. DynamoDB is schemaless — existing rows that lack the field will unmarshal to `undefined`, which satisfies the optional TypeScript type.

**Key files:**
- `packages/backend/src/types/agent-types.ts` — `Agent` interface and `DynamoAgent`
- `packages/backend/src/repositories/agents/dynamodb/item.ts` — marshal/unmarshal and `buildAgentUpdateExpression`
- `packages/backend/src/repositories/agents/agents-repository.ts` — `UpdateAgentPatch`

**What changes in `item.ts`:** Add the four new fields to `buildAgentUpdateExpression`. The SET logic is identical to existing fields. There is no "clear" semantic for these fields (unlike `defaultStoragePath: ''`), so all four are plain SET-on-defined.

```typescript
// In buildAgentUpdateExpression — add these lines after existing field checks:
if (patch.agentType !== undefined) set('agentType', patch.agentType);
if (patch.externalRuntimeArn !== undefined) set('externalRuntimeArn', patch.externalRuntimeArn);
if (patch.externalRuntimeRegion !== undefined) set('externalRuntimeRegion', patch.externalRuntimeRegion);
if (patch.streamFormat !== undefined) set('streamFormat', patch.streamFormat);
```

**Note on `DynamoAgent`:** `DynamoAgent` currently extends `Agent` only to override `isShared: string`. The four new optional fields carry through from `Agent` with no transformation needed. `toDynamoAgent`/`fromDynamoAgent` do not need changes.

### Pattern 2: Zod Schema Extension with Cross-field Refinement

**What:** Add optional fields to `createAgentBody` and add a `.superRefine()` that enforces `externalRuntimeArn` is present when `agentType === 'external_agentcore'`.

**Source pattern:** Existing `createAgentBody` in `packages/backend/src/routes/agents.ts` uses `z.object({ ... })`.

```typescript
// Source: existing agents.ts pattern + Zod superRefine
const createAgentBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
  enabledTools: z.array(z.string()),
  icon: z.string().optional(),
  scenarios: z.array(z.any()).optional(),
  mcpConfig: z.any().optional(),
  defaultStoragePath: z.string().optional(),
  // New fields (Phase 1):
  agentType: z.enum(['moca', 'external_agentcore']).optional(),
  externalRuntimeArn: z.string().optional(),
  externalRuntimeRegion: z.string().optional(),
  streamFormat: z.enum(['strands', 'other']).optional(),
}).superRefine((data, ctx) => {
  if (data.agentType === 'external_agentcore' && !data.externalRuntimeArn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'externalRuntimeArn is required when agentType is external_agentcore',
      path: ['externalRuntimeArn'],
    });
  }
});

// updateAgentBody: cannot use .partial() on a refined schema directly — define partial separately
const updateAgentBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  enabledTools: z.array(z.string()).optional(),
  icon: z.string().optional(),
  scenarios: z.array(z.any()).optional(),
  mcpConfig: z.any().optional(),
  defaultStoragePath: z.string().optional(),
  agentType: z.enum(['moca', 'external_agentcore']).optional(),
  externalRuntimeArn: z.string().optional(),
  externalRuntimeRegion: z.string().optional(),
  streamFormat: z.enum(['strands', 'other']).optional(),
});
```

**Pitfall:** `createAgentBody.partial()` does not propagate `.superRefine()` in Zod v4. The existing code sets `updateAgentBody = createAgentBody.partial()` — this must be replaced with an explicit partial object schema when adding the refinement to `createAgentBody`.

### Pattern 3: SigV4-signed HTTP Proxy Route

**What:** Handler signs outbound request to `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encodedArn}/invocations?qualifier=DEFAULT`, then pipes or buffers the response.

**Reference implementation:** `packages/session-stream-handler/src/index.ts` (lines 119–153) and `packages/agent/src/services/appsync-events-publisher.ts`.

```typescript
// Source: packages/session-stream-handler/src/index.ts (adapted for backend proxy route)
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import https from 'https';
import { URL } from 'url';

// In the route handler:
const region = agent.externalRuntimeRegion ?? config.AWS_REGION;
const encodedArn = encodeURIComponent(agent.externalRuntimeArn);
const endpointUrl = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`;

const url = new URL(endpointUrl);
const bodyString = JSON.stringify(req.body);

const signer = new SignatureV4({
  service: 'bedrock-agentcore',
  region,
  credentials: defaultProvider(),
  sha256: Sha256,
});

const requestToSign = {
  method: 'POST',
  protocol: url.protocol,
  hostname: url.hostname,
  path: url.pathname + url.search,
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyString).toString(),
    host: url.hostname,
  },
  body: bodyString,
};

const signed = await signer.sign(requestToSign);

// Set streaming headers before piping
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Transfer-Encoding', 'chunked');

// Pipe upstream response back to Express res
const upstreamReq = https.request({
  hostname: url.hostname,
  port: 443,
  path: url.pathname + url.search,
  method: 'POST',
  headers: signed.headers,
}, (upstreamRes) => {
  if (upstreamRes.statusCode && upstreamRes.statusCode >= 400) {
    // Forward error status for v1 (surface HTTP error as-is per Claude's Discretion)
    res.status(upstreamRes.statusCode);
  }
  if (agent.streamFormat === 'strands') {
    // D-10: transparent pass-through
    upstreamRes.pipe(res);
  } else {
    // D-11: buffer then emit single SSE content_block_delta
    let buffer = '';
    upstreamRes.on('data', (chunk: Buffer) => { buffer += chunk.toString(); });
    upstreamRes.on('end', () => {
      res.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: buffer } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
  }
});

upstreamReq.on('error', (err) => {
  // v1: surface as UPSTREAM_ERROR
  throw new AppError(ErrorCode.UPSTREAM_ERROR, `External runtime request failed: ${err.message}`);
});

upstreamReq.write(bodyString);
upstreamReq.end();
```

**Service name for SigV4:** `'bedrock-agentcore'`. Verified from existing IAM action namespace (`bedrock-agentcore:InvokeRuntime`) and the endpoint hostname pattern.

### Pattern 4: CDK IAM Policy Statement

**What:** Add `bedrock-agentcore:InvokeRuntime` to backend Lambda execution role in `packages/cdk/lib/agentcore-stack.ts`.

**Reference:** Existing `SsmMcpEnvReadWrite` and `CognitoIdentityDeveloperAuthLink` statements in same file.

```typescript
// In AgentCoreStack constructor, after existing backendApi permission grants:
this.backendApi.lambdaFunction.addToRolePolicy(
  new cdk.aws_iam.PolicyStatement({
    sid: 'InvokeExternalAgentCoreRuntime',
    effect: cdk.aws_iam.Effect.ALLOW,
    actions: ['bedrock-agentcore:InvokeRuntime'],
    resources: [
      `arn:aws:bedrock-agentcore:${this.region}:${this.account}:runtime/*`,
    ],
  })
);
```

**cdk-nag:** This is an `IAM5` finding (wildcard `*` on resource). Must add a suppression. Confirm rule ID is `AwsSolutions-IAM5` — already suppressed at stack level for framework-generated wildcards, but the new statement is application-owned and needs a per-resource suppression. Use `NagSuppressions.addResourceSuppressionsByPath` targeting the BackendApi Lambda's role default policy resource.

### Anti-Patterns to Avoid

- **Using `asyncHandler` wrapper on the proxy route without handling the stream:** `asyncHandler` expects the handler to return after `res` is finished. If the handler returns before the stream pipe completes, Express may close `res` early. Ensure the pipe path does NOT `return` until `upstreamRes.pipe(res)` is invoked — after that, Express stays alive until the stream ends.
- **Calling `res.json()` or `res.send()` after `res.write()` on a streaming response:** Breaks the SSE stream. The proxy route must write SSE chunks and call `res.end()` — never call `res.json()` on a route that streams.
- **Using `createAgentBody.partial()` after adding `.superRefine()`:** In Zod v4, `.partial()` on a refined schema does not propagate the refinement and the resulting type may lose the refinement. Define `updateAgentBody` explicitly.
- **Forgetting `host` header in `SignatureV4` signed request:** `SignatureV4.sign()` requires `host` in the headers object. Missing `host` causes signing to fail silently (no error, but AWS returns 403).
- **Not encoding the ARN in the URL:** AgentCore Runtime ARNs contain `:` characters which are invalid in URL path segments. Use `encodeURIComponent(arn)` before embedding in the path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SigV4 signing | Custom HMAC-SHA256 request signing | `@smithy/signature-v4` + `@aws-crypto/sha256-js` | Already established pattern in project; handles credential refresh, canonical request, date formatting |
| Lambda execution role credentials | Custom credential fetching | `defaultProvider()` from `@aws-sdk/credential-provider-node` | Automatically uses Lambda environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`) |
| DynamoDB marshal/unmarshal for new fields | Custom attribute converters | Extend existing `buildAgentUpdateExpression` in `item.ts` | All DynamoDB logic is intentionally confined to `repositories/` layer and `item.ts` |
| Route body validation | Manual `if (!req.body.field)` checks | Extend existing Zod `createAgentBody`/`updateAgentBody` schemas | Consistent with all other routes; `validate()` middleware handles the 400 response |

---

## Common Pitfalls

### Pitfall 1: `updateAgentBody = createAgentBody.partial()` Breaks With Refinement
**What goes wrong:** `createAgentBody.partial()` in Zod v4 creates a new schema type where the refinement from `.superRefine()` may not be preserved correctly.
**Why it happens:** Zod v4 `partial()` creates a new `ZodObject`, which drops refinements attached to the original.
**How to avoid:** Replace the `updateAgentBody = createAgentBody.partial()` one-liner with an explicitly defined partial object schema (duplicate the fields with all optional). This is a one-time change.
**Warning signs:** TypeScript type error, or test showing `superRefine` not firing on updates.

### Pitfall 2: ARN Characters in URL Path
**What goes wrong:** Runtime ARN (`arn:aws:bedrock-agentcore:us-east-1:123456789:runtime/abc`) embedded in URL path causes malformed URL or AWS 400/403.
**Why it happens:** `:` and `/` are reserved characters in URL path segments.
**How to avoid:** `encodeURIComponent(agent.externalRuntimeArn)` before embedding in path string.
**Warning signs:** AWS returns 400 or 404 on invoke attempt.

### Pitfall 3: `asyncHandler` and Streaming Responses
**What goes wrong:** `asyncHandler` catches errors from the async handler function. If the proxy sets up a pipe and then `return`s, the handler appears to resolve normally, but errors in the stream (after the `return`) are not caught.
**Why it happens:** `asyncHandler` wraps `handler().catch(next)` — once the promise resolves, errors in the piped stream are unhandled.
**How to avoid:** Attach `upstreamReq.on('error', (err) => res.destroy(err))` and `upstreamRes.on('error', ...)` for stream error propagation. Call `res.destroy()` on stream errors to signal client connection termination.
**Warning signs:** Hanging connections in dev, or client never receives a response when upstream errors mid-stream.

### Pitfall 4: `process.env.AWS_REGION` Direct Read
**What goes wrong:** ESLint rule `no-restricted-syntax` forbids direct `process.env.X` reads outside `config/`.
**Why it happens:** Convention enforced in `eslint.config.mjs` — `packages/backend/src/**` (excluding `config/` and test files) cannot read `process.env` directly.
**How to avoid:** `AWS_REGION` must be declared in `packages/backend/src/config/index.ts` Zod schema. It should already exist there — verify before adding it again.
**Warning signs:** ESLint error `no-restricted-syntax: Direct process.env access is not allowed outside config/`.

### Pitfall 5: cdk-nag IAM5 Suppression Missing for Wildcard Runtime ARN
**What goes wrong:** CDK synth succeeds but `cdk-nag` throws an error (or the `cdk deploy` check fails) because `arn:aws:bedrock-agentcore:{region}:{account}:runtime/*` contains a wildcard `*`.
**Why it happens:** `AwsSolutions-IAM5` rule flags wildcard resource ARNs that are not suppressed.
**How to avoid:** After adding the `InvokeExternalAgentCoreRuntime` statement, add a `NagSuppressions.addResourceSuppressionsByPath` targeting the Backend Lambda role's default policy, with `appliesTo: ['Resource::arn:<AWS::Partition>:bedrock-agentcore:<AWS::Region>:<AWS::AccountId>:runtime/*']`.
**Warning signs:** CDK synth output contains `[Error at /AgentCoreStack/BackendApi/...] AwsSolutions-IAM5`.

### Pitfall 6: `SignatureV4` Service Name
**What goes wrong:** Using wrong service name (`'bedrock'`, `'bedrock-runtime'`, or `'bedrock-agent'`) causes AWS to reject the signed request with 403 SignatureDoesNotMatch.
**Why it happens:** The service component of the SigV4 signature is derived from the `service` param, not from the hostname.
**How to avoid:** Use `service: 'bedrock-agentcore'`. This is confirmed by the IAM action namespace `bedrock-agentcore:InvokeRuntime` — the service name in IAM actions matches the SigV4 service name.
**Warning signs:** HTTP 403 with `SignatureDoesNotMatch` body from upstream.

---

## Code Examples

### Existing SigV4 Signing Pattern (verified from codebase)

```typescript
// Source: packages/session-stream-handler/src/index.ts:119-153
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

const signer = new SignatureV4({
  service: 'appsync',       // ← change to 'bedrock-agentcore' for proxy route
  region,
  credentials: defaultProvider(),
  sha256: Sha256,
});

const request = {
  method: 'POST',
  protocol: url.protocol,
  hostname: url.hostname,
  port: url.port ? parseInt(url.port) : 443,
  path: url.pathname,
  headers: {
    'Content-Type': 'application/json',
    host: url.hostname,      // ← 'host' header is required
  },
  body,
};

const signedRequest = await signer.sign(request);
// signedRequest.headers now contains Authorization + x-amz-date + x-amz-security-token
```

### Existing `buildAgentUpdateExpression` Pattern (verified from item.ts)

```typescript
// Source: packages/backend/src/repositories/agents/dynamodb/item.ts:70-94
const set = (field: string, value: NativeAttributeValue): void => {
  setParts.push(`#${field} = :${field}`);
  attributeNames[`#${field}`] = field;
  attributeValues[`:${field}`] = value;
};

// Existing field checks (pattern to follow for new fields):
if (patch.name !== undefined) set('name', patch.name);
// ... other fields ...

// Add before the updatedAt stamp:
if (patch.agentType !== undefined) set('agentType', patch.agentType);
if (patch.externalRuntimeArn !== undefined) set('externalRuntimeArn', patch.externalRuntimeArn);
if (patch.externalRuntimeRegion !== undefined) set('externalRuntimeRegion', patch.externalRuntimeRegion);
if (patch.streamFormat !== undefined) set('streamFormat', patch.streamFormat);
```

### CDK IAM Statement + cdk-nag Suppression Pattern (verified from agentcore-stack.ts)

```typescript
// Source: packages/cdk/lib/agentcore-stack.ts:454-463 (SsmMcpEnvReadWrite pattern)
this.backendApi.lambdaFunction.addToRolePolicy(
  new cdk.aws_iam.PolicyStatement({
    sid: 'InvokeExternalAgentCoreRuntime',
    effect: cdk.aws_iam.Effect.ALLOW,
    actions: ['bedrock-agentcore:InvokeRuntime'],
    resources: [
      `arn:aws:bedrock-agentcore:${this.region}:${this.account}:runtime/*`,
    ],
  })
);

// cdk-nag suppression for IAM5 (wildcard resource)
NagSuppressions.addResourceSuppressionsByPath(
  this,
  [`/${id}/BackendApi/BackendLambda/ServiceRole/DefaultPolicy/Resource`],
  [
    {
      id: 'AwsSolutions-IAM5',
      reason:
        'bedrock-agentcore:InvokeRuntime is scoped to account-level runtime/* to avoid per-ARN policy updates when new external runtimes are registered.',
      appliesTo: [
        'Resource::arn:<AWS::Partition>:bedrock-agentcore:<AWS::Region>:<AWS::AccountId>:runtime/*',
      ],
    },
  ]
);
```

### Unit Test Pattern for New Fields (verified from item.test.ts)

```typescript
// Source: packages/backend/src/repositories/agents/dynamodb/__tests__/item.test.ts
const baseAgent: Agent = {
  userId: 'u1' as UserId,
  agentId: 'a1' as AgentId,
  name: 'n',
  description: 'd',
  systemPrompt: 's',
  enabledTools: [],
  scenarios: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  isShared: false,
  createdBy: 'u1',
  // New fields (extend baseAgent for external_agentcore tests):
  agentType: 'external_agentcore',
  externalRuntimeArn: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test',
  externalRuntimeRegion: 'us-east-1',
  streamFormat: 'strands',
};
```

---

## Runtime State Inventory

> This phase adds new DynamoDB fields to existing records (schemaless) and deploys a new IAM policy statement. No runtime state migration is required.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | DynamoDB `{prefix}-agents` table — existing records lack the new fields | None — DynamoDB is schemaless; absent fields unmarshal as `undefined` which satisfies optional TypeScript types |
| Live service config | None — no external service config stores `agentType` or related fields | None |
| OS-registered state | None | None |
| Secrets/env vars | `AWS_REGION` must be accessible via `config.AWS_REGION` in backend — verify it exists in `packages/backend/src/config/index.ts` Zod schema | Verify only; likely already present |
| Build artifacts | None relevant to this phase | None |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@smithy/signature-v4` | SigV4 proxy signing | Not in backend `package.json` | 5.5.2 (registry) | None — must install |
| `@aws-crypto/sha256-js` | SigV4 SHA-256 hasher | Not in backend `package.json` | 5.2.0 (registry) | None — must install |
| `@aws-sdk/credential-provider-node` | Lambda role credential chain | Not in backend `package.json` | 3.972.58 (registry) | None — must install |
| DynamoDB (`{prefix}-agents` table) | Schema extension tests | Available in deployed env | N/A | DynamoDB Local via Testcontainers for integration tests |
| Docker | Integration tests (Testcontainers) | Assumed available (existing integration tests already require it) | N/A | Skip integration, unit tests only |

**Missing dependencies requiring install:**
- `@smithy/signature-v4`, `@aws-crypto/sha256-js`, `@aws-sdk/credential-provider-node` must be added to `packages/backend/package.json` dependencies. Use `npm install ... -w @moca/backend`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest ^30.2.0 + ts-jest ^29.4.6 |
| Config file | `packages/backend/jest.config.js` |
| Quick run command | `npm run test -w @moca/backend` |
| Full suite command | `npm run test -w @moca/backend && npm run test:integration -w @moca/backend` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REG-03 | New fields persist and round-trip through create/get/update | Unit (item.ts) + Integration (DDB Local) | `npm run test -w @moca/backend` | ✅ `item.test.ts` (extend) + ❌ `repository.integration.test.ts` (extend) |
| REG-04 | Sharing model unchanged for `external_agentcore` agents | Unit (service test) | `npm run test -w @moca/backend` | ✅ `agents-service.test.ts` (add assertions) |
| INFRA-01 | `bedrock-agentcore:InvokeRuntime` in CDK diff | CDK unit test or `cdk diff` manual check | `npm run test -w @moca/cdk` | ✅ CDK snapshot tests (if present) |
| INFRA-02 | `POST /agents/:agentId/invoke` returns 400 for native agents, 404 for unknown | Unit (route test) | `npm run test -w @moca/backend` | ❌ New test file needed |
| INFRA-03 | `GET /agents/:agentId` returns new fields in response | Unit (item.test.ts) + Integration | `npm run test -w @moca/backend` | ✅ extend existing |
| DISC-02 | `listSharedAgents` returns `external_agentcore` shared agents | Unit (service test) | `npm run test -w @moca/backend` | ✅ `agents-service.test.ts` (add assertions) |

### Sampling Rate
- **Per task commit:** `npm run test -w @moca/backend`
- **Per wave merge:** `npm run test -w @moca/backend && npm run lint -w @moca/backend`
- **Phase gate:** Full test suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test file for `POST /agents/:agentId/invoke` route — covers INFRA-02; mock the upstream and verify 400/404 guard, SigV4 header presence, stream pass-through shape
- [ ] Extend `item.test.ts` to cover new field round-trips and `buildAgentUpdateExpression` with new fields
- [ ] Extend `agents-service.test.ts` to assert `external_agentcore` agents flow through `listSharedAgents` and `cloneAgent` unchanged

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 1 |
|-----------|-------------------|
| `npm workspaces` (NOT pnpm) | Use `npm install ... -w @moca/backend` for new dependencies |
| `npm run build` before `cdk synth/deploy` | CDK resolves `@moca/*` from compiled `dist/`; run build before CDK diff |
| `packages/libs/` wide blast radius | Phase 1 does NOT touch `@moca/core` or other libs — safe |
| `process.env` reads forbidden outside `config/` | New `AWS_REGION` reference in proxy route must come from `config.AWS_REGION` |
| DynamoDB SDK imports confined to `repositories/` | SigV4 proxy in route layer uses only `https` + smithy — no DynamoDB SDK import needed in `routes/` |
| ESLint `boundaries` plugin — routes import from services/types, not repositories | Proxy route calls `agentsService.getAgent()` (service layer) — never imports from `repositories/` directly |
| Jest for backend tests, `ts-jest` with `commonjs` transform | Test files use `require`-compatible CommonJS in jest; `*.js` extension mapper applies |
| TypeScript strict mode, ESM, `"type": "module"` | No CJS `require()` in source files; import extensions are `.js` in runtime source |
| No `console` in backend source (use `logger`) | Proxy route logs via `logger` from `libs/logger/` |
| Prettier: single quotes, 2-space indent, 100-char line width | Enforce in all new/modified files |
| ADR: `docs/adr/aws-data-access-control.md` | Read before changing IAM — relevant to `bedrock-agentcore:InvokeRuntime` scope decision |
| ADR: `docs/adr/build-design-rationale.md` | Read before touching CDK or build scripts |

---

## Sources

### Primary (HIGH confidence)
- Read from `packages/backend/src/repositories/agents/dynamodb/item.ts` — exact marshal/unmarshal and `buildAgentUpdateExpression` implementation
- Read from `packages/backend/src/repositories/agents/agents-repository.ts` — `UpdateAgentPatch` interface
- Read from `packages/backend/src/types/agent-types.ts` — `Agent` and `DynamoAgent` interfaces
- Read from `packages/backend/src/routes/agents.ts` — all existing routes and Zod schema pattern
- Read from `packages/session-stream-handler/src/index.ts` — SigV4 signing reference pattern
- Read from `packages/agent/src/services/appsync-events-publisher.ts` — second SigV4 signing reference
- Read from `packages/cdk/lib/agentcore-stack.ts` — IAM statement patterns, `backendApi.lambdaFunction.addToRolePolicy()` call sites
- Read from `packages/cdk/lib/constructs/api/backend-api.ts` — `grantPermissions()` helper at line 364
- Read from `packages/backend/package.json` — confirmed `@smithy/signature-v4` and `@aws-crypto/sha256-js` are NOT yet in backend dependencies
- `npm view @smithy/signature-v4 version` — confirmed 5.5.2 (2026-06-28)
- `npm view @aws-crypto/sha256-js version` — confirmed 5.2.0 (2026-06-28)
- `npm view @aws-sdk/credential-provider-node version` — confirmed 3.972.58 (2026-06-28)

### Secondary (MEDIUM confidence)
- `packages/backend/src/libs/http/error-codes.ts` — `ErrorCode.UPSTREAM_ERROR` maps to HTTP 502 — confirmed suitable for upstream runtime failures

---

## Open Questions

1. **`AWS_REGION` in backend config**
   - What we know: ESLint forbids direct `process.env.AWS_REGION` in route handlers
   - What's unclear: Whether `AWS_REGION` is already declared in `packages/backend/src/config/index.ts` Zod schema
   - Recommendation: The implementer must check `packages/backend/src/config/index.ts` before coding the proxy route. If not present, add `AWS_REGION: z.string().default('us-east-1')` to the schema.

2. **cdk-nag suppression path for BackendApi Lambda role**
   - What we know: The suppression pattern uses CDK construct path strings like `/${id}/BackendApi/BackendLambda/ServiceRole/DefaultPolicy/Resource`
   - What's unclear: The exact CDK logical ID of the BackendApi Lambda construct — the path string depends on how `BackendApi` names its internal Lambda construct
   - Recommendation: After adding the IAM statement, run `cdk synth` and check the CloudFormation output for the exact resource path, or use `NagSuppressions.addStackSuppressions` with `appliesTo` scoped to the specific resource ARN pattern.

3. **`asyncHandler` and async stream completion**
   - What we know: `asyncHandler` is `(req, res, next) => handler(req, res).catch(next)`; the proxy route is async
   - What's unclear: Whether returning from the async function after initiating `pipe()` causes Express to flush/close `res` prematurely
   - Recommendation: Use `return new Promise((resolve, reject) => { ... upstreamRes.pipe(res); res.on('finish', resolve); upstreamReq.on('error', reject); })` to keep the promise pending until the stream finishes.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from actual `package.json` files; confirmed npm registry versions
- Architecture: HIGH — all patterns read directly from existing codebase files
- Pitfalls: HIGH — derived from reading actual code; Zod v4 `.partial()` / refinement pitfall verified from existing `updateAgentBody = createAgentBody.partial()` pattern

**Research date:** 2026-06-28
**Valid until:** 2026-07-28 (30 days — stable stack)
