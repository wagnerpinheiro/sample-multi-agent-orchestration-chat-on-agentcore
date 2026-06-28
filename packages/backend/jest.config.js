/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.test\\.ts$'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          composite: false,
          incremental: false,
          declaration: false,
          declarationMap: false,
          noEmit: false,
        },
      },
    ],
  },
  moduleNameMapper: {
    // Resolve the @moca/core workspace package to its TS source so jest can
    // load its runtime values (parseUserId, isAgentId, …). Without this, the
    // package's `exports` map is not understood by jest-resolve.
    '^@moca/core$': '<rootDir>/../libs/core/src/index.ts',
    // Resolve @moca/tool-definitions similarly — needed when the backend's
    // config/data/default-agents.ts imports GATEWAY_TOOL_NAMES et al.
    '^@moca/tool-definitions$': '<rootDir>/../libs/tool-definitions/src/index.ts',
    // Resolve @moca/generative-ui-catalog — transitively required by tool-definitions.
    '^@moca/generative-ui-catalog$': '<rootDir>/../libs/generative-ui-catalog/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.integration.test.ts',
    '!src/tests/**',
  ],
};
