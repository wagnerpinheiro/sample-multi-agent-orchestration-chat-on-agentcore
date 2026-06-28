# Testing Patterns
*Generated: 2026-06-27*
*Codebase: sample-multi-agent-orchestration-chat-on-agentcore*

## Test Runners Per Package

| Package | Unit Tests | Integration Tests (DDB Local) | Integration Tests (real AWS) |
|---|---|---|---|
| `packages/agent` | Jest (ESM preset) | Jest (`jest.ddb.config.js`) | Jest (`jest.integration.config.js`) |
| `packages/backend` | Jest (CJS transform) | Jest (`jest.integration.config.js`) | — |
| `packages/frontend` | Vitest | — | — |
| `packages/libs/core` | Vitest | — | — |
| `packages/libs/s3-workspace-sync` | Vitest | Vitest (`vitest.integration.config.ts`) | — |
| `packages/libs/generative-ui-catalog` | Jest | — | — |
| `packages/libs/tool-definitions` | Jest | — | — |
| `packages/lambda-tools/*` | Jest (shared base config) | — | — |
| `packages/cdk` | Jest | — | — |
| `packages/session-stream-handler` | Jest | — | — |
| `packages/trigger` | Jest | — | — |
| `packages/github-token-broker` | Jest | — | — |

Root-level `jest.config.cjs` collects tests not covered by workspace package scripts (excludes `/packages/` entirely).

## Test Commands

**Run all tests (root — triggers workspace tests + root jest):**
```bash
npm run test
# Equivalent to: npm run build:ts && npm run test --workspaces --if-present && jest --config jest.config.cjs
```

**Per-package unit tests:**
```bash
npm run test -w @moca/agent       # Jest ESM unit tests
npm run test -w @moca/backend     # Jest CJS unit tests
npm run test -w packages/frontend # Vitest unit tests
```

**Per-package DynamoDB Local integration tests:**
```bash
npm run test:ddb -w @moca/agent           # agent: repositories/**/*.integration.test.ts
npm run test:integration -w @moca/backend # backend: repositories/**/*.integration.test.ts
npm run test:integration -w packages/libs/s3-workspace-sync  # vitest integration
```

**Coverage:**
```bash
npm run test:coverage -w @moca/agent    # Jest coverage for agent
# Backend coverage collected via jest --coverage
```

**Watch mode:**
```bash
npm run test:watch -w @moca/agent    # Jest watch
npm run test:watch -w packages/libs/s3-workspace-sync  # Vitest watch
```

## Test File Organization

**Naming patterns:**
- Unit tests: `*.test.ts` — e.g., `title-generator.test.ts`, `agents-service.test.ts`
- Integration tests (DynamoDB Local / AWS): `*.integration.test.ts` — e.g., `repository.integration.test.ts`
- Reasoning/extended scenario tests: `*.reasoning.test.ts` — e.g., `item.reasoning.test.ts`, `agentcore-memory.reasoning.test.ts`

**Directory patterns:**
- Co-located with source inside `__tests__/` subdirectory: `src/services/__tests__/agents-service.test.ts`
- Or flat alongside the module: `src/repositories/sessions/dynamodb/repository.integration.test.ts`
- Integration test infrastructure in `src/tests/integration/` — helpers, client factory, table provisioning, global setup/teardown
- Test setup file at `src/tests/setup.ts`

**Key infrastructure files:**
- `packages/backend/src/tests/integration/global-setup.ts` — starts DynamoDB Local container
- `packages/backend/src/tests/integration/global-teardown.ts` — stops DynamoDB Local container
- `packages/backend/src/tests/integration/client.ts` — `makeLocalClient()` factory
- `packages/backend/src/tests/integration/tables.ts` — `createSessionsTable()`, `deleteTable()`, `uniqueTableName()`
- `packages/agent/src/tests/integration/global-setup.ts` — same pattern for agent
- `packages/agent/src/tests/integration/client.ts` — same `makeLocalClient()` pattern
- `packages/backend/src/tests/integration/uuid-shim.cjs` — CJS shim for `uuid` (pure ESM) used in integration tests

## Jest Configuration Details

### Agent (`packages/agent/jest.config.js`)
```
preset: 'ts-jest/presets/default-esm'
extensionsToTreatAsEsm: ['.ts']
moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }
testMatch: ['**/*.test.ts']
testPathIgnorePatterns: ['.*\.integration\.test\.ts$']  // excludes integration tests
setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts']
testTimeout: 30000
collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/tests/**', '!src/index.ts']
```

Run via `NODE_OPTIONS='--experimental-vm-modules --no-warnings' jest`.

### Agent DDB Local (`packages/agent/jest.ddb.config.js`)
```
preset: 'ts-jest/presets/default-esm'
testMatch: ['**/repositories/**/*.integration.test.ts']
globalSetup: '<rootDir>/src/tests/integration/global-setup.ts'
globalTeardown: '<rootDir>/src/tests/integration/global-teardown.ts'
testTimeout: 60000
```

### Agent real-AWS integration (`packages/agent/jest.integration.config.js`)
```
testMatch: [
  '**/tests/developer-auth-identity.integration.test.ts',
  '**/__tests__/qwen3-model.integration.test.ts',
  '**/__tests__/fable5-reasoning.integration.test.ts',
  ...
]
testTimeout: 60000
```
These require real AWS credentials and are NOT run in CI.

### Backend (`packages/backend/jest.config.js`)
```
preset: 'ts-jest'
transform: ts-jest with { module: 'commonjs', moduleResolution: 'node', esModuleInterop: true }
moduleNameMapper: {
  '^@moca/core$': '<rootDir>/../libs/core/src/index.ts',  // resolve workspace pkg to TS source
  '^(\\.{1,2}/.*)\\.js$': '$1'
}
testMatch: ['**/*.test.ts']
testPathIgnorePatterns: ['\.integration\.test\.ts$']
setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts']
testTimeout: 30000
collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/**/*.integration.test.ts', '!src/tests/**']
```

### Backend integration (`packages/backend/jest.integration.config.js`)
```
preset: 'ts-jest'
testMatch: ['<rootDir>/src/repositories/**/*.integration.test.ts']
moduleNameMapper: { '^uuid$': '<rootDir>/src/tests/integration/uuid-shim.cjs' }
globalSetup: '<rootDir>/src/tests/integration/global-setup.ts'
globalTeardown: '<rootDir>/src/tests/integration/global-teardown.ts'
testTimeout: 60000
```

### Frontend (`packages/frontend/vitest.config.ts`)
```
globals: true
environment: 'node'
include: ['src/**/*.test.ts']
```

### libs/core (`packages/libs/core/vitest.config.ts`)
```
globals: true
exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts']
```

### libs/s3-workspace-sync — unit (`packages/libs/s3-workspace-sync/vitest.config.ts`)
```
include: ['test/**/*.test.ts']
exclude: ['test/integration/**']
environment: 'node'
```

### libs/s3-workspace-sync — integration (`packages/libs/s3-workspace-sync/vitest.integration.config.ts`)
```
include: ['test/integration/**/*.test.ts']
environment: 'node'
testTimeout: 60000
```

## Integration Test Infrastructure (DynamoDB Local via Testcontainers)

Both agent and backend integration tests for the repository layer spin up `amazon/dynamodb-local:2.5.2` using [Testcontainers](https://github.com/testcontainers/testcontainers-node).

**Global setup pattern** (`src/tests/integration/global-setup.ts`):
```typescript
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

export default async function globalSetup(): Promise<void> {
  const container = await new GenericContainer('amazon/dynamodb-local:2.5.2')
    .withExposedPorts(8000)
    .withCommand(['-jar', 'DynamoDBLocal.jar', '-inMemory', '-sharedDb'])
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
  globalThis.__DDB_CONTAINER__ = container;
  process.env.DYNAMODB_ENDPOINT = endpoint;
  // SDK requires some credentials value even for local
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'local';
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'local';
  process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
}
```

**Client factory** (`src/tests/integration/client.ts`):
```typescript
export function makeLocalClient(): DynamoDBClient {
  return new DynamoDBClient({
    endpoint: process.env.DYNAMODB_ENDPOINT,
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}
```

**Table isolation:** Each test run creates tables with a randomly-generated name via `uniqueTableName('sessions')`. Tables are dropped in `afterAll` via `deleteTable`. This prevents cross-test contamination and allows parallel test suites.

**Repository config-free constraint:** Integration test files directly instantiate repositories with a `DynamoDBClient` and table name; they never import `config/index.ts`. This is by design — importing config would trigger env validation and `process.exit(1)`.

**CI Docker:** The `ubuntu-latest` GitHub Actions runner has Docker preinstalled. No `services` or DIND setup is required. Testcontainers pulls the DDB Local image at test time.

## Unit Test Structure and Mock Patterns

**Test file header:** Explicit imports from `@jest/globals` rather than relying on globals:
```typescript
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
```

**Standard suite structure:**
```typescript
describe('ServiceName', () => {
  let dep: jest.Mocked<DependencyInterface>;
  let service: ServiceClass;

  beforeEach(() => {
    jest.clearAllMocks();
    dep = makeFakeDep();
    service = new ServiceClass(dep);
  });

  describe('methodName', () => {
    it('describes the expected behaviour', async () => {
      dep.someMethod.mockResolvedValueOnce(expectedValue);
      const result = await service.methodName(args);
      expect(result).toBe(expected);
    });
  });
});
```

**Factory functions for test data:**
```typescript
// Use make<Entity> naming for fixtures
function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    userId: USER_ID,
    agentId: AGENT_ID,
    name: 'Test Agent',
    // ...defaults...
    ...overrides,
  };
}
```

**Fake repositories (in-memory):**
```typescript
function makeFakeRepo(): jest.Mocked<AgentsRepository> {
  return {
    listByUser: jest.fn(async () => []),
    get: jest.fn(async () => null),
    put: jest.fn(async () => {}),
    update: jest.fn(async () => makeAgent()),
    // ...
  } as unknown as jest.Mocked<AgentsRepository>;
}
```

## Mock Patterns

**Mocking config** (to avoid `process.exit(1)` at import time):
```typescript
jest.mock('../../config/index', () => ({
  config: {
    AWS_REGION: 'us-east-1',
    AGENTS_TABLE_NAME: 'test-agents',
    // ... minimal fields needed by the module under test
  },
}));
```

**Mocking ESM modules** (agent package uses dynamic import after mock):
```typescript
jest.unstable_mockModule('../../config/index.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  config: {},
}));

// Must use dynamic import AFTER mocking in ESM context
const { TitleGenerator } = await import('../title-generator.js');
```

**Mocking third-party modules:**
```typescript
jest.mock('uuid', () => ({ v7: jest.fn(() => 'test-uuid-1234') }));

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: mockFn, hydrate: jest.fn() })),
  },
}));
```

**`mockResolvedValueOnce` / `mockRejectedValueOnce`** — always prefer `Once` variants to avoid cross-test bleed:
```typescript
repo.get.mockResolvedValueOnce(makeAgent({ isShared: true }));
repo.toggleShare.mockRejectedValueOnce(new AgentNotFoundError());
```

**Operation ordering assertion** — used to verify sequencing guarantees:
```typescript
const order: string[] = [];
ssm.save.mockImplementationOnce(async () => { order.push('ssm.save'); });
repo.update.mockImplementationOnce(async () => { order.push('repo.update'); return makeAgent(); });
await service.updateAgent(...);
expect(order).toEqual(['repo.update', 'ssm.save']);
```

## What to Mock vs. What Not to Mock

**Mock:**
- `config/index` — always mock to prevent env validation + `process.exit(1)` in unit tests
- External AWS SDK clients (Bedrock, Cognito, etc.) — replace with `jest.fn()` or module mock
- Repository interfaces — use in-memory fakes for service-layer tests
- `uuid` — deterministic test IDs

**Do not mock (use real implementations):**
- DynamoDB Local — repository integration tests hit the real DDB Local container
- `@moca/core` branded types — resolved via `moduleNameMapper` to the TS source
- Business logic under test

## Test Setup Files

**`packages/agent/src/tests/setup.ts`:**
- Loads `.env` via `dotenv`
- Sets `AGENTCORE_GATEWAY_ENDPOINT` default if missing (CI support)
- Sets `jest.setTimeout(30000)`

**`packages/backend/src/tests/setup.ts`:**
- Loads `.env` via `dotenv`
- Sets `jest.setTimeout(30000)`

Both run via `setupFilesAfterEnv` in their respective Jest configs.

## Coverage Configuration

**Agent** (`packages/agent/jest.config.js`):
```
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.test.ts',
  '!src/tests/**',
  '!src/index.ts'
]
```

**Backend** (`packages/backend/jest.config.js`):
```
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.test.ts',
  '!src/**/*.integration.test.ts',
  '!src/tests/**'
]
```

No minimum coverage threshold is enforced in either config. Coverage reports are uploaded as CI artifacts with 7-day retention.

## CI Test Pipeline (`.github/workflows/ci.yml`)

The CI pipeline has four relevant jobs:

**`test` job (unit tests only):**
```bash
npm run test    # builds TS, then runs all workspace unit tests + root jest
```
Uploads `coverage/` and `packages/*/coverage/` as artifacts (7-day retention).

**`integration-test` job (DynamoDB Local):**
```bash
npm run test:integration -w @moca/backend   # backend: repositories/**/*.integration.test.ts
npm run test:ddb -w @moca/agent             # agent:   repositories/**/*.integration.test.ts
```
Runs on `ubuntu-latest` which has Docker preinstalled. Testcontainers pulls `amazon/dynamodb-local:2.5.2` at runtime. No service containers or DIND setup required.

**`lint` job:**
```bash
npm run lint          # eslint across all workspaces
npm run format:check  # prettier check across all workspaces
```

**`security` jobs:**
- Semgrep scan (excludes `node_modules/`, `dist/`, test files)
- ASH (Automated Security Helper) scan — `continue-on-error: true`

**Real-AWS integration tests** (e.g., `jest.integration.config.js` in agent) are NOT run in CI — they require real AWS credentials and real Bedrock model access. They self-gate via env var checks and must be run manually by developers.

## Reasoning Tests (`.reasoning.test.ts`)

Tests with the `.reasoning.test.ts` suffix document non-obvious invariants or design rationale. They are structurally identical to regular unit tests but serve as executable documentation for decisions that would otherwise require an ADR. Examples:
- `packages/backend/src/repositories/triggers/dynamodb/__tests__/item.reasoning.test.ts`
- `packages/backend/src/services/__tests__/agentcore-memory.reasoning.test.ts`
- `packages/frontend/src/stores/__tests__/settingsStore.reasoning.test.ts`
- `packages/agent/src/libs/codec/__tests__/content-block-codec.reasoning.test.ts`

These are picked up by the standard `*.test.ts` glob and run with unit tests.
