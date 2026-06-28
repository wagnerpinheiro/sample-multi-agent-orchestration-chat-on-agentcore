# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Moca** — Multi-agent Orchestration Chat on AgentCore. A multi-agent platform built on Amazon Bedrock AgentCore using the Strands Agents SDK (TypeScript).

## Commands

```bash
# Development
npm run dev               # Concurrent: frontend (5173), backend (3000), agent (8080)
npm run setup-env         # Auto-populate .env from CloudFormation outputs

# Build
npm run build             # TypeScript (solution build) + Vite frontend
npm run build:ts          # TypeScript only: tsc -b tsconfig.build.json
npm run build:frontend    # Vite only

# Test
npm run test              # Full test suite (build TS first, then all workspace tests)
npm run test -w @moca/agent            # Tests for a single workspace
npm run test:integration -w @moca/backend   # Integration tests (DynamoDB Local via Testcontainers)
npm run test:ddb -w @moca/agent        # DynamoDB Local tests
npm run test:coverage -w @moca/agent   # Coverage report

# Code quality
npm run lint              # ESLint across all workspaces
npm run lint:fix          # ESLint + Prettier fix
npm run typecheck         # Type-check without emit

# Deploy (requires `npm run build` first)
npm run deploy            # CDK deploy (default environment)
npm run deploy:dev        # Environment-specific deploy
npm run seed-system-agents  # Seed default agents to DynamoDB
```

**Frontend tests use Vitest**, not Jest (`npm run test -w frontend`).

## Architecture

npm workspaces monorepo. All packages live under `packages/`.

### Core Packages

| Package | Runtime | Role |
|---|---|---|
| `packages/agent` | Docker on AgentCore Runtime (Express :8080) | Strands Agents SDK agent. NOT a Lambda function. |
| `packages/backend` | Lambda via Lambda Web Adapter (Express :8080) | REST API — agent/session/trigger/file management |
| `packages/frontend` | CloudFront + S3 (React + Vite) | SPA with real-time AppSync Events WebSocket |
| `packages/cdk` | CDK (ts-node) | All AWS infrastructure. Environment config: `config/environments.ts` |
| `packages/trigger` | Lambda | EventBridge → automatic agent execution |
| `packages/session-stream-handler` | Lambda | DynamoDB Streams → AppSync Events relay |
| `packages/lambda-tools` | Lambda (per-tool) | Extensible tool functions (tavily, athena, kb, etc.) |

### Shared Libraries (`packages/libs/`)

| Library | Role |
|---|---|
| `@moca/core` | Branded IDs (SessionId, UserId, AgentId, TriggerId, SYSTEM_USER_ID) |
| `@moca/tool-definitions` | Tool definition types (Zod + JSON Schema) — **interface layer between agent and backend** |
| `@moca/generative-ui-catalog` | Generative UI component catalog — referenced by agent and frontend |
| `@moca/s3-workspace-sync` | Bidirectional S3 workspace sync — used by agent |

## Critical Rules

**Build order**: `cdk synth` / `cdk deploy` requires `npm run build` first — CDK's `ts-node` resolves `@moca/*` imports from compiled `dist/`. Lambda tool packages are bundled via esbuild from `src/handler.ts` at deploy time, so their `dist/` is not pre-generated.

**`libs/` has wide blast radius**: Changing `tool-definitions` affects agent + backend. Changing `generative-ui-catalog` affects agent, frontend, and backend (via dependency chain). Run tests for all dependent packages before merging.

**agent is NOT a Lambda**: It's a Docker container deployed to AgentCore Runtime. Implement as a plain Express server — it also runs locally as-is with `npm run dev`.

**backend is NOT Lambda-specific**: Lambda Web Adapter handles HTTP translation. Write it as a standard Express server with `app.listen(8080)`.

**Environment config**: Edit `packages/cdk/config/environments.ts` (types in `environment-types.ts`, utilities in `environment-utils.ts`). Environments: `default`, `dev`, `stg`, `prd`.

**Secrets**: Stored in Secrets Manager with naming convention `agentcore/{env}/{secret-name}`.

**Real-time**: AppSync Events WebSocket. `session-stream-handler` relays DynamoDB Streams → AppSync.

## Architecture Decision Records

Read these ADRs before touching the areas they cover — they document rejected alternatives and non-obvious constraints:

- `docs/adr/build-design-rationale.md` — tsconfig composite placement, CDK outside the Solution, Dockerfile `COPY --parents`. Read before changing `tsconfig.*`, root build scripts, or Dockerfiles.
- `docs/adr/aws-data-access-control.md` — `userId` vs `identityId` model, per-user S3/DynamoDB isolation. Read before changing IAM policies, S3 prefixes, DynamoDB partition keys, or AppSync channel paths.
- `docs/adr/event-driven-identity-pool-credentials.md` — How Trigger Lambda resolves the same `identityId` as frontend sessions. Read before changing Cognito Developer Authenticated Identities or trigger credential flow.
- `docs/adr/github-token-broker-lambda.md` — GitHub Token Broker design and residual-risk discussion.

## Key Technical Choices

- **TypeScript 5.7 strict mode**, Node.js 22, targeting ES2022
- **Jest** for agent/backend/libs; **Vitest** for frontend and `s3-workspace-sync`
- **Integration tests** use Testcontainers (DynamoDB Local) — requires Docker
- **ESLint boundaries plugin** enforces import rules between packages — check `eslint.config.mjs` when adding cross-package imports
- **Prettier**: single quotes, 2-space indent, 100-char line width, trailing commas (ES5)
- Default Bedrock model: Claude Sonnet 4.6; also supports Opus 4.8 and Fable 5 (configured in CDK environments)
