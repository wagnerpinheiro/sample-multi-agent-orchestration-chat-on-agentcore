# Phase 1: Backend & Data Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-28
**Phase:** 01-backend-data-layer
**Mode:** --auto (all recommended defaults selected)
**Areas discussed:** Non-Strands stream output, Proxy request body, IAM resource scope, externalRuntimeRegion default

---

## Non-Strands Stream Output

| Option | Description | Selected |
|--------|-------------|----------|
| Single buffered event | Buffer entire response, emit as one content_block_delta | ✓ |
| Stream wrapped chunks | Forward each chunk wrapped in content_block_delta as received | |

**Auto-selected:** Single buffered event (recommended default)
**Notes:** Simpler for v1; external runtime response shapes unknown; progressive streaming deferred to v2.

---

## Proxy Request Body

| Option | Description | Selected |
|--------|-------------|----------|
| Full passthrough | Forward complete client request body to external runtime as-is | ✓ |
| Extracted prompt only | Send just `{"prompt": "..."}` to external runtime | |
| Configurable per-runtime | User defines request body shape on registration | |

**Auto-selected:** Full passthrough (recommended default)
**Notes:** Maximal flexibility; works if frontend sends compatible format; Phase 3 determines exact body shape.

---

## IAM Resource Scope

| Option | Description | Selected |
|--------|-------------|----------|
| `*` | Any runtime anywhere | |
| Account-scoped `arn:aws:bedrock-agentcore:{region}:{account}:runtime/*` | Scoped to account/region | ✓ |
| Per-registered-ARN | One policy statement per registered runtime ARN | |

**Auto-selected:** Account-scoped (recommended default)
**Notes:** Tight without needing policy updates per new registration; per-ARN is impractical for v1.

---

## externalRuntimeRegion Default

| Option | Description | Selected |
|--------|-------------|----------|
| Default to deployment region | Fallback to AWS_REGION env var at invocation time | ✓ |
| Require explicit region | Make region mandatory in schema for external_agentcore agents | |

**Auto-selected:** Default to deployment region (recommended default)
**Notes:** Less friction for same-region runtimes (most common case).

---

## Claude's Discretion

- SigV4 signing implementation details
- Error wrapping for non-2xx responses from external runtime
- Exact SSE event envelope for buffered plain-text delta

## Deferred Ideas

- Progressive streaming for non-Strands runtimes — v2
- Per-ARN IAM scoping — v2
- Session context forwarding — v2 (SESS-01)
