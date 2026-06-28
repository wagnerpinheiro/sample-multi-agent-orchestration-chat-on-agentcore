# Coding Conventions
*Generated: 2026-06-27*
*Codebase: sample-multi-agent-orchestration-chat-on-agentcore*

## TypeScript Configuration

**Runtime:** Node.js 22.21.1 (pinned in `.node-version`)
**TypeScript version:** ~5.7
**Module system:** ESM throughout (agent, s3-workspace-sync); CommonJS for backend unit test transforms

**Build:** Solution Style (`tsc -b tsconfig.build.json`). `tsconfig.build.json` at the root lists all packages as `references`. Each package has its own `tsconfig.json` and `tsconfig.build.json`. `composite: true` is set per-package so incremental builds work. Frontend is built separately via `vite build`.

**Key tsconfig compiler options used in test transforms:**
- `isolatedModules: true` — ts-jest uses this for performance
- `esModuleInterop: true` — required for CJS interop in ts-jest backend tests
- Agent tests use `module: ESNext` + `useESM: true` for ESM preset

## Naming Conventions

**Files:**
- TypeScript source: `kebab-case.ts` — e.g., `agents-service.ts`, `session-terminator.ts`
- Test files: `kebab-case.test.ts` — e.g., `title-generator.test.ts`
- Integration test files: `kebab-case.integration.test.ts` — e.g., `repository.integration.test.ts`
- Reasoning/extended test variants: `kebab-case.reasoning.test.ts` — e.g., `item.reasoning.test.ts`
- Repository factory files: `<noun>-repository.factory.ts` — e.g., `agents-repository.factory.ts`
- Config root: `index.ts` inside a `config/` directory
- Logger: `index.ts` inside `src/libs/logger/`

**Classes:** `PascalCase` — e.g., `TitleGenerator`, `AgentsService`, `DynamoDBSessionsRepository`

**Functions:** `camelCase` — e.g., `makeLocalClient`, `parseUserId`, `createLogger`

**Variables and constants:** `camelCase` for locals; `UPPER_SNAKE_CASE` for exported constants — e.g., `USER_ID_PATTERN`, `DDB_LOCAL_IMAGE`

**Types and interfaces:** `PascalCase` — e.g., `AgentsRepository`, `UpdateAgentPatch`, `SharedAgentsPage`

**Test helper/factory functions:** `make<Entity>` prefix convention — e.g., `makeAgent()`, `makeFakeRepo()`, `makeFakeSsm()`, `makeLocalClient()`

**Branded types:** `PascalCase` matching the concept — e.g., `UserId`, `AgentId`, `SessionId`, `TriggerId`, `IdentityId`. All defined in `packages/libs/core/src/`.

## Branded Type Pattern

Branded types use a unique symbol brand to achieve nominal typing in TypeScript's structural type system. Pattern from `packages/libs/core/src/branded.ts`:

```typescript
declare const __brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// Usage in packages/libs/core/src/user-id.ts:
export type UserId = Brand<string, 'UserId'>;
export function isUserId(value: string): value is UserId { ... }
export function parseUserId(value: string): UserId { ... }
```

Each branded type exports: the `type`, a type guard (`isX`), and a parser (`parseX`). In test files, cast strings with `as UserId` rather than calling the parser — e.g., `'user-123' as UserId`.

## Import / Module Organization Rules

**ESM import extensions (agent + s3-workspace-sync only):** ESLint rule `import/extensions` requires `.js` extension for all local relative imports in `packages/agent/**/*.ts` and `packages/shared/s3-workspace-sync/**/*.ts`. This is enforced by `eslint-config-mjs` sections for those packages. TypeScript source files use `.js` extensions in import paths (the TypeScript ESM convention).

**moduleNameMapper in Jest:** Both agent and backend Jest configs map `'^(\\.{1,2}/.*)\\.js$': '$1'` so that `.js`-suffixed imports resolve to `.ts` files at test time.

**Cross-package imports:** npm workspace package references use `@moca/<package>` scope:
- `@moca/core` — branded types and shared utilities
- `@moca/tool-definitions` — tool definition types
- `@moca/generative-ui-catalog` — UI component catalog
- `@moca/agent`, `@moca/backend`, `@moca/cdk` — application packages

Backend Jest config maps `'^@moca/core$': '<rootDir>/../libs/core/src/index.ts'` to resolve workspace packages without needing compiled `dist/`.

## Layer Boundary Rules (ESLint `boundaries` plugin)

Layer boundaries are enforced by `eslint-plugin-boundaries` in `eslint.config.mjs`. Violations are errors, not warnings.

**Agent layer order (lowest → highest):**
```
types(0) → config(1) → services(2) → runtime(3) → handlers(4)
libs(-1): cross-cutting — importable from any layer, but only depends on types and config
```
Located in `packages/agent/src/{types,config,services,runtime,handlers,libs}/`.

**Backend layer order (lowest → highest):**
```
types(0) → config(1) → middleware(2) → services(3) → routes(4)
libs(-1): same provider rules as agent
```
Located in `packages/backend/src/{types,config,middleware,services,routes,libs}/`.

**Frontend layer order (lowest → highest):**
```
foundation(0) → utils(1) → state(2) → components(3) → features(4) → pages(5)
```
Where:
- `foundation`: `src/types/`, `src/config/`, `src/schemas/`, `src/locales/`, `src/i18n/`
- `utils`: `src/utils/`, `src/lib/`
- `state`: `src/stores/`, `src/api/`, `src/hooks/`
- `components`: `src/components/`, `src/layouts/`
- `features`: `src/features/`
- `pages`: `src/pages/`

Higher layers may import from any lower layer. Lower layers must not import from higher layers. The `default: 'disallow'` setting means any unlisted cross-layer import is an error.

## DynamoDB Access Confinement Rule

`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, and `@aws-sdk/util-dynamodb` may only be imported from `repositories/` in both `packages/backend/src/` and `packages/agent/src/`. Enforced via `no-restricted-imports` in `eslint.config.mjs`.

**Exceptions (explicitly carved out):**
- `packages/backend/src/repositories/**` — owns DynamoDB access
- `packages/agent/src/repositories/**` — owns DynamoDB access
- `packages/agent/src/libs/utils/scoped-credentials.ts` — builds per-user Identity-Pool-scoped clients (a named per-file exception)
- Test files (`__tests__/`, `tests/`, `*.test.ts`, `*.spec.ts`) — integration tests build their own `DynamoDBClient` pointed at DynamoDB Local

## Repository Config-Free Rule

Repository data-access modules (`packages/backend/src/repositories/**/*.ts`, `packages/agent/src/repositories/**/*.ts`) must not import `config`. They receive `DynamoDBClient` and table name by constructor injection, keeping them testable against DynamoDB Local without triggering `process.exit(1)` from config validation.

**Only exception:** `*-repository.factory.ts` files — the composition root that reads `config` to build the client and wire up the repository. These are exempt because they need both SDK access (confined to `repositories/`) and config.

## Environment Variable Centralization Rule

Direct `process.env.X` reads are forbidden in `packages/agent/src/` and `packages/backend/src/` outside the `config/` layer, enforced by `no-restricted-syntax` in `eslint.config.mjs`.

**Correct pattern:** Declare variables in `src/config/index.ts` (Zod schema), then import `config.X`.

**Exemptions:**
- `**/config/**` — reading env is the layer's responsibility
- `**/libs/logger/**` — reads `NODE_ENV` and `LOG_LEVEL` before config is importable (avoids a logger↔config cycle)
- Test files — integration test setup mutates `process.env` to point SDKs at DynamoDB Local

## Zod Validation Pattern

Environment variables are validated at process startup using Zod in `src/config/index.ts` for both agent and backend. If validation fails, the process calls `process.exit(1)` after logging the error.

```typescript
// Pattern from packages/backend/src/config/index.ts
const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  COGNITO_USER_POOL_ID: z.string({ error: 'COGNITO_USER_POOL_ID is required ...' }),
  SOME_OPTIONAL: z.string().optional(),
});

function parseEnv(): z.infer<typeof envSchema> {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    logger.error({ err: error }, 'Invalid environment variable configuration');
    process.exit(1);
  }
}

export const config = parseEnv();
```

Field names in the schema match the underlying env var name exactly (e.g., `config.AGENTCORE_MEMORY_ID`, not `config.agentcoreMemoryId`).

## Logging Pattern (Pino)

**Logger location:** Each server-side package has its own `src/libs/logger/index.ts`. The logger uses pino and emits NDJSON to stdout (one line per event) for CloudWatch Logs compatibility.

**Development mode:** `pino-pretty` transport is activated only when `NODE_ENV === 'development'`. In all other environments (production, test, or unset) the logger writes raw NDJSON.

**Call signature rules (enforced by ESLint):**

```typescript
// CORRECT — pino-native form: merge object first, message string second
logger.info({ userId, count }, 'User created');
logger.error({ err: error, requestId }, 'Request failed');
logger.debug('Plain message with no merge object');
logger.info('Tool search: %d items (query: "%s")', n, q);  // printf style

// WRONG — these are all lint errors:
logger.info('User created', { userId });   // drops or multi-line-inspects the obj
logger.error('Request failed', error);     // pino drops trailing Error objects
logger.error('Request failed', new Error('x'));  // same issue
```

**Scoped child loggers:**
```typescript
const log = createLogger('AgentCoreMemoryService');
log.info({ actorId }, 'Retrieving all sessions');
// Output includes "scope":"AgentCoreMemoryService"
```

**Console is banned** in `packages/agent/src/`, `packages/backend/src/`, `packages/trigger/src/`, and `packages/session-stream-handler/src/` (excluding test files and `libs/logger/`). `no-console: error` is enforced.

**Emoji and CJK text are banned** in all logger and console calls. Log messages must be English ASCII.

**Auto-redacted fields:** `password`, `token`, `authorization`, `jwt`, `apiKey`, `api_key`, `accessToken`, `refreshToken`, `idToken`, `openIdToken`, `clientSecret`, `client_secret`, `secretAccessKey`, `sessionToken` and their wildcard variants. Custom headers carrying credentials are also redacted.

## Code Style (Prettier)

Configuration in `.prettierrc`:
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

- Semicolons required
- Single quotes for strings
- 2-space indentation
- Trailing commas in ES5 positions (objects, arrays, function parameters)
- Max line width 100 characters

## ESLint Rules Summary

**Global rules:**
- `@typescript-eslint/no-unused-vars: error` (args prefixed `_` are ignored)
- `@typescript-eslint/explicit-function-return-type: off`
- `@typescript-eslint/no-explicit-any: warn` (off in test files)
- `preserve-caught-error: warn`
- `no-useless-assignment: warn`

**Test files (`*.test.ts`, `*.spec.ts`):**
- `@typescript-eslint/no-explicit-any: off` — cast patterns are acceptable in tests

**CommonJS config files (`*.cjs`):**
- `@typescript-eslint/no-require-imports: off`

**Frontend files:**
- `react-hooks/rules-of-hooks` and other recommended react-hooks rules enforced
- `react-refresh/only-export-components: warn`

## Comment and Documentation Policy (from AGENTS.md)

- Do not document what can be derived from code.
- Enforce constraints with tests and linters, not prose.
- Code comments explain "why not" only — the non-obvious reason something was done a certain way.
- Before adding any comment or doc line: ask "If I remove this line, will an agent make a mistake?" — if no, omit it.
- ADRs (`docs/adr/`) exist for non-obvious architectural decisions that an engineer would predictably get wrong without context. They document rejected alternatives, not just the chosen path.
- User-facing guides go in `docs/guides/`.

## Secrets Naming Convention

Secrets stored in AWS Secrets Manager follow the pattern: `agentcore/{env}/{secret-name}`.
