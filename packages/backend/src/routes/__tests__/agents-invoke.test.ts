/**
 * agents-invoke.test.ts
 *
 * Unit tests for POST /agents/:agentId/invoke
 *
 * Covers:
 * - 404 when the agent does not exist
 * - 400 when the agent is a native moca agent (not external_agentcore)
 * - SigV4 Authorization header present for external_agentcore with streamFormat 'strands'
 * - Single content_block_delta SSE event for streamFormat 'other'
 *
 * The outbound https.request is stubbed in-memory; no real AWS calls are made.
 * createAgentsService is fully mocked so no DynamoDB is needed.
 *
 * Uses Node.js built-in http module to drive the Express app — no supertest
 * dependency required.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import express, { Request, Response, NextFunction } from 'express';
import { Readable } from 'stream';
import http from 'http';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before importing the module under test.
// ---------------------------------------------------------------------------

// Mock the agents service so no DynamoDB is needed.
const mockGetAgent = jest.fn<() => Promise<unknown>>();
jest.mock('../../services/agents-service.js', () => ({
  createAgentsService: () => ({ getAgent: mockGetAgent }),
  UpdateAgentInput: {},
}));

// Mock @aws-sdk/credential-provider-node so no real credential lookup happens.
jest.mock('@aws-sdk/credential-provider-node', () => ({
  defaultProvider: () => async () => ({
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    sessionToken: 'test-session-token',
  }),
}));

// Mock the config to control AWS_REGION.
jest.mock('../../config/index.js', () => ({
  config: { AWS_REGION: 'us-east-1' },
  isDevelopment: false,
}));

// Mock the auth middleware so resolveTargetUser just calls next() after setting
// targetUserId — avoiding real JWT / Cognito verification in unit tests.
const STUB_USER_ID = 'us-east-1:00000000-0000-0000-0000-000000000001';
jest.mock('../../middleware/auth.js', () => {
  const original = jest.requireActual<typeof import('../../middleware/auth.js')>(
    '../../middleware/auth.js'
  );
  return {
    ...original,
    resolveTargetUser: (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { targetUserId: string }).targetUserId = STUB_USER_ID;
      next();
    },
  };
});

// ---------------------------------------------------------------------------
// Capture outbound https.request calls so we can assert on signed headers.
// ---------------------------------------------------------------------------

type FakeUpstreamFactory = () => Readable & { statusCode: number };
let fakeUpstreamFactory: FakeUpstreamFactory = () => {
  const r = new Readable({ read() {} }) as Readable & { statusCode: number };
  r.statusCode = 200;
  process.nextTick(() => {
    r.push('hello');
    r.push(null);
  });
  return r;
};

const capturedRequests: Array<{
  hostname: string;
  path: string;
  headers: Record<string, string>;
}> = [];

jest.mock('node:https', () => {
  const originalHttps = jest.requireActual<typeof import('https')>('https');
  return {
    ...originalHttps,
    request: jest.fn(
      (
        options: { hostname: string; path: string; headers: Record<string, string> },
        callback: (res: Readable & { statusCode: number }) => void
      ) => {
        capturedRequests.push({
          hostname: options.hostname,
          path: options.path,
          headers: options.headers,
        });
        const fakeRes = fakeUpstreamFactory();
        callback(fakeRes);

        // Return a writable-like stub
        return {
          write: jest.fn(),
          end: jest.fn(),
          on: jest.fn(),
        };
      }
    ),
  };
});

// ---------------------------------------------------------------------------
// Import the router AFTER mocks are set up.
// ---------------------------------------------------------------------------
import agentsRouter from '../agents.js';
import { errorHandlerMiddleware } from '../../middleware/error-handler.js';

// ---------------------------------------------------------------------------
// Minimal Express app + test server helper
// ---------------------------------------------------------------------------

function buildApp() {
  const app = express();
  app.use(express.json());

  // Inject a log stub into every request (req.log is used by route handlers
  // and the error handler middleware).
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { log: unknown }).log = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    next();
  });

  app.use('/', agentsRouter);
  app.use(errorHandlerMiddleware);
  return app;
}

/** Make an HTTP POST request to the test server; resolves with { status, body, text }. */
function postJson(
  server: http.Server,
  path: string,
  body: unknown
): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const payload = JSON.stringify(body);

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(data);
          } catch {
            // not JSON (e.g. SSE stream)
          }
          resolve({ status: res.statusCode ?? 0, body: parsed, text: data });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test agent fixtures
// ---------------------------------------------------------------------------

// Agent IDs must be valid UUIDs (enforced by zAgentId / isAgentId in @moca/core).
const EXTERNAL_AGENT_STRANDS_ID = '11111111-1111-1111-1111-111111111111';
const EXTERNAL_AGENT_OTHER_ID = '22222222-2222-2222-2222-222222222222';
const MOCA_AGENT_ID = '33333333-3333-3333-3333-333333333333';
const LEGACY_AGENT_ID = '44444444-4444-4444-4444-444444444444';
const NOT_FOUND_AGENT_ID = '55555555-5555-5555-5555-555555555555';

const EXTERNAL_AGENT_STRANDS = {
  agentId: EXTERNAL_AGENT_STRANDS_ID,
  name: 'External Strands Agent',
  agentType: 'external_agentcore' as const,
  externalRuntimeArn: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/test-runtime',
  externalRuntimeRegion: 'us-east-1',
  streamFormat: 'strands' as const,
};

const EXTERNAL_AGENT_OTHER = {
  agentId: EXTERNAL_AGENT_OTHER_ID,
  name: 'External Other Agent',
  agentType: 'external_agentcore' as const,
  externalRuntimeArn: 'arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/other-runtime',
  externalRuntimeRegion: 'us-east-1',
  streamFormat: 'other' as const,
};

const MOCA_AGENT = {
  agentId: MOCA_AGENT_ID,
  name: 'Native Moca Agent',
  agentType: 'moca' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /:agentId/invoke', () => {
  let server: http.Server;

  beforeEach((done) => {
    jest.clearAllMocks();
    capturedRequests.length = 0;
    server = http.createServer(buildApp());
    server.listen(0, '127.0.0.1', done);
  });

  afterEach((done) => {
    server.close(done);
  });

  // ── 404: agent not found ──────────────────────────────────────────────────

  it('returns 404 when getAgent returns null', async () => {
    mockGetAgent.mockResolvedValue(null);

    const res = await postJson(server, `/${NOT_FOUND_AGENT_ID}/invoke`, { prompt: 'hello' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  // ── 400: native moca agent ────────────────────────────────────────────────

  it('returns 400 when the agent is a native moca agent (agentType: moca)', async () => {
    mockGetAgent.mockResolvedValue(MOCA_AGENT);

    const res = await postJson(server, `/${MOCA_AGENT_ID}/invoke`, { prompt: 'hello' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns 400 when the agent has no agentType (native/legacy moca)', async () => {
    mockGetAgent.mockResolvedValue({ agentId: LEGACY_AGENT_ID, name: 'Legacy' });

    const res = await postJson(server, `/${LEGACY_AGENT_ID}/invoke`, { prompt: 'hello' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  // ── external_agentcore with streamFormat 'strands' ────────────────────────

  it('calls https.request with SigV4 Authorization header for streamFormat strands', async () => {
    mockGetAgent.mockResolvedValue(EXTERNAL_AGENT_STRANDS);

    fakeUpstreamFactory = () => {
      const r = new Readable({ read() {} }) as Readable & { statusCode: number };
      r.statusCode = 200;
      process.nextTick(() => {
        r.push('data: {"type":"ping"}\n\n');
        r.push(null);
      });
      return r;
    };

    const res = await postJson(server, `/${EXTERNAL_AGENT_STRANDS_ID}/invoke`, {
      prompt: 'hello',
    });

    // The route proxied to upstream — check that one outbound request was made.
    expect(capturedRequests).toHaveLength(1);
    const outbound = capturedRequests[0];

    // Host must be the bedrock-agentcore endpoint.
    expect(outbound.hostname).toBe('bedrock-agentcore.us-east-1.amazonaws.com');

    // Path must embed the URL-encoded ARN.
    expect(outbound.path).toContain(
      '/runtimes/' +
        encodeURIComponent(EXTERNAL_AGENT_STRANDS.externalRuntimeArn) +
        '/invocations'
    );

    // Authorization header must be present and start with AWS4-HMAC-SHA256.
    const auth = outbound.headers['Authorization'] ?? outbound.headers['authorization'];
    expect(auth).toBeDefined();
    expect(auth).toMatch(/^AWS4-HMAC-SHA256/);

    // HTTP response must succeed (2xx).
    expect(res.status).toBeLessThan(300);
  });

  // ── external_agentcore with streamFormat 'other' ──────────────────────────

  it('emits a single content_block_delta SSE event for streamFormat other', async () => {
    mockGetAgent.mockResolvedValue(EXTERNAL_AGENT_OTHER);

    const upstreamBody = 'Plain text response from custom runtime';
    fakeUpstreamFactory = () => {
      const r = new Readable({ read() {} }) as Readable & { statusCode: number };
      r.statusCode = 200;
      process.nextTick(() => {
        r.push(upstreamBody);
        r.push(null);
      });
      return r;
    };

    const res = await postJson(server, `/${EXTERNAL_AGENT_OTHER_ID}/invoke`, {
      prompt: 'hello',
    });

    const body = res.text;

    // Must contain exactly one content_block_delta event.
    expect(body).toContain('"type":"content_block_delta"');

    // Must contain the upstream body text in the delta.
    expect(body).toContain(upstreamBody);

    // Must be terminated with the [DONE] sentinel.
    expect(body).toContain('data: [DONE]');
  });
});
