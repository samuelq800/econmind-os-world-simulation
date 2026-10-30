import { createServer, type Server } from 'node:http';
import {
  WORLD_MODEL_VERSION,
  AUTHENTICATED_CURRENT_SEAT_PATH,
} from '@econmind/core';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createTradeContractRuntimeFetchHandler,
  TRADE_CONTRACT_RUNTIME_READ_PATH,
} from '../../apps/world-api/src/runtime-preparation/trade-contract-runtime-fetch-handler.js';
import { createNonactivatedRuntimeReadFetchHost } from '../../apps/world-api/src/integration/nonactivated-runtime-read-fetch-host.js';
import {
  TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
  TRADE_CONTRACT_RUNTIME_QUERY_OPERATION,
} from '../../apps/world-api/src/integration/trade-contract-runtime-read-service.js';
import {
  TRADE_CONTRACT_RUNTIME_READ_SCHEMA,
  TRADE_CONTRACT_RUNTIME_READ_COVERAGE,
} from '../../apps/world-api/src/read-models/trade-contract-runtime-reader.js';
import type { ExplicitReadPreparationConfig } from '../../apps/world-api/src/runtime-preparation/explicit-read-preparation-config.js';
import { trackRequestCleanup } from '../../apps/world-api/src/runtime-preparation/request-completion.js';

// TEST_ONLY HTTP transport/service-port fixtures. The loopback HTTP server and
// real Fetch mux, limits, cancellation and RequestCompletion lifecycle execute.
// JWT/current-seat/SQL are exercised separately by the service and native suites;
// these fixture rows do not claim admitted economic execution or live data.
const h = vi.hoisted(() => ({ factory: vi.fn(), handle: vi.fn() }));
vi.mock(
  '../../apps/world-api/src/integration/trade-contract-runtime-read-service.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../apps/world-api/src/integration/trade-contract-runtime-read-service.js')
    >()),
    createTradeContractRuntimeReadService: h.factory,
  }),
);
const fingerprint = `sha256:${'a'.repeat(64)}`;
const origin = 'https://pages.example',
  requestId = '123e4567-e89b-42d3-a456-426614174000';
const config: ExplicitReadPreparationConfig = {
  pool: {
    connect: vi.fn(),
  } as unknown as ExplicitReadPreparationConfig['pool'],
  readerRole: 'test_only_read_role',
  authorizationPublisherRole: 'test_only_publisher',
  modelVersion: WORLD_MODEL_VERSION,
  endpointPins: {
    origin: 'https://read.example',
    projectionPath: '/v1/projection',
    finalLookupPath: '/v1/final-receipt',
    deploymentRef: 'DEPLOYMENT_TEST_ONLY',
  },
  admittedWorldPins: {
    worldId: 'WORLD_TEST_ONLY',
    seedRef: 'SEED_TEST_ONLY',
    contentHash: fingerprint,
    admissionRef: 'ADMISSION_TEST_ONLY',
    minimumWorldVersion: '0',
  },
  auth: {
    projectRef: 'abcdefghijklmnopqrst',
    expectedIssuer: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
    jwksUrl:
      'https://abcdefghijklmnopqrst.supabase.co/auth/v1/.well-known/jwks.json',
    audience: 'authenticated',
  },
  routeOptions: { allowedOrigins: [origin] },
};
const query = () => ({
  schemaVersion: TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
  requestId,
  operation: TRADE_CONTRACT_RUNTIME_QUERY_OPERATION,
  page: { limit: 1 },
});
const success = () => ({
  httpStatus: 200,
  body: {
    schemaVersion: TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
    requestId,
    ok: true,
    page: {
      schemaVersion: TRADE_CONTRACT_RUNTIME_READ_SCHEMA,
      coverage: TRADE_CONTRACT_RUNTIME_READ_COVERAGE,
      status: 'PAGE',
      watermark: { worldVersion: '1', eventSequence: '1' },
      nextCursor: null,
      rows: [
        {
          worldId: 'WORLD_TEST_ONLY',
          commandId: 'COMMAND_TEST_ONLY',
          commandFingerprint: fingerprint,
          idempotencyKey: 'KEY_TEST_ONLY',
          outcome: 'COMMITTED',
          worldVersionBefore: '0',
          worldVersionAfter: '1',
          events: [
            {
              eventId: 'EVENT_TEST_ONLY',
              eventSequence: '1',
              eventFingerprint: fingerprint,
            },
          ],
          ledger: { status: 'UNAVAILABLE_NO_POSTINGS', postings: [] },
        },
      ],
    },
  },
});
const enabled = () =>
  createNonactivatedRuntimeReadFetchHost({
    read: config,
    tradeEvidenceEnabled: true,
  });
let host = createNonactivatedRuntimeReadFetchHost();
let server: Server, base: string;
const body = () => JSON.stringify(query());
function direct(signal?: AbortSignal) {
  return new Request(
    'https://read.example' + TRADE_CONTRACT_RUNTIME_READ_PATH,
    {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        authorization: 'Bearer TEST_ONLY_TOKEN',
      },
      body: body(),
      ...(signal ? { signal } : {}),
    },
  );
}
async function post(payload = body(), headers: Record<string, string> = {}) {
  return fetch(base + TRADE_CONTRACT_RUNTIME_READ_PATH, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      authorization: 'Bearer TEST_ONLY_TOKEN',
      ...headers,
    },
    body: payload,
  });
}
beforeAll(async () => {
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(',') : value);
      const controller = new AbortController();
      outgoing.once('close', () => {
        if (!outgoing.writableEnded) controller.abort();
      });
      const request = new Request(base + incoming.url, {
        method: incoming.method!,
        headers,
        ...(!['GET', 'HEAD'].includes(incoming.method!)
          ? { body: Buffer.concat(chunks).toString('utf8') }
          : {}),
        signal: controller.signal,
      });
      const response = await host.fetch(request);
      if (!response) {
        outgoing.writeHead(404);
        outgoing.end();
        return;
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.destroyed) {
        outgoing.writeHead(500);
        outgoing.end();
      }
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw Error('TEST_LOOPBACK_UNAVAILABLE');
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  vi.clearAllMocks();
  h.factory.mockReturnValue({ handle: h.handle });
  h.handle.mockResolvedValue(success());
  host = createNonactivatedRuntimeReadFetchHost();
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('explicit nonactivated Trade Fetch mount', () => {
  it('is closed by default on both fixed read paths and never opens a pool or service', async () => {
    for (const path of [
      TRADE_CONTRACT_RUNTIME_READ_PATH,
      AUTHENTICATED_CURRENT_SEAT_PATH,
    ]) {
      const response = await fetch(base + path, {
        method: 'POST',
        body: body(),
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'NOT_CONNECTED' },
      });
    }
    expect(h.factory).not.toHaveBeenCalled();
    expect(config.pool.connect).not.toHaveBeenCalled();
    expect(host.simulationEnabled).toBe(false);
    expect(host.workerActivationAllowed).toBe(false);
    expect(host.clockActivationAllowed).toBe(false);
  });
  it('requires explicit opt-in even with a valid borrowed read configuration', async () => {
    host = createNonactivatedRuntimeReadFetchHost({ read: config });
    expect((await post()).status).toBe(503);
    expect(h.factory).not.toHaveBeenCalled();
    expect(config.pool.connect).not.toHaveBeenCalled();
  });
  it('executes the mounted HTTP read and passes original bearer/page with one cancellation signal', async () => {
    host = enabled();
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      page: { status: 'PAGE', rows: [{ commandId: 'COMMAND_TEST_ONLY' }] },
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(h.handle).toHaveBeenCalledOnce();
    expect(h.handle).toHaveBeenCalledWith({
      authorization: 'Bearer TEST_ONLY_TOKEN',
      request: query(),
      signal: expect.any(AbortSignal),
    });
    expect(h.handle.mock.calls[0]![0].signal.aborted).toBe(true);
    expect(config.pool.connect).not.toHaveBeenCalled();
  });
  it.each([403, 409, 503])(
    'preserves a service failure HTTP %i without a fabricated empty page',
    async (httpStatus) => {
      host = enabled();
      h.handle.mockResolvedValue({
        httpStatus,
        body: {
          schemaVersion: TRADE_CONTRACT_RUNTIME_QUERY_SCHEMA,
          requestId,
          ok: false,
          error: { code: 'TEST_ONLY_UNAVAILABLE', retryable: false },
        },
      });
      const response = await post();
      expect(response.status).toBe(httpStatus);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'TEST_ONLY_UNAVAILABLE' },
      });
    },
  );
  it('rejects path/query aliases and leaves unknown routing to the caller', async () => {
    host = enabled();
    for (const path of [
      '/v1/unknown',
      TRADE_CONTRACT_RUNTIME_READ_PATH + '/',
      TRADE_CONTRACT_RUNTIME_READ_PATH + '?team=CALLER',
    ]) {
      expect(
        (await fetch(base + path, { method: 'POST', body: body() })).status,
      ).toBe(404);
    }
    expect(h.handle).not.toHaveBeenCalled();
  });
  it('denies an unapproved Origin and accepts only the bounded POST preflight', async () => {
    host = enabled();
    const denied = await post(body(), { origin: 'https://wrong.example' });
    expect(denied.status).toBe(403);
    expect(denied.headers.has('access-control-allow-origin')).toBe(false);
    const response = await fetch(base + TRADE_CONTRACT_RUNTIME_READ_PATH, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST');
    expect(h.handle).not.toHaveBeenCalled();
    expect(
      (
        await fetch(base + TRADE_CONTRACT_RUNTIME_READ_PATH, {
          method: 'OPTIONS',
          headers: {
            origin,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'x-tenant',
          },
        })
      ).status,
    ).toBe(403);
  });
  it('rejects methods, encoded bodies, invalid JSON and missing bearer before service dispatch', async () => {
    host = enabled();
    expect((await fetch(base + TRADE_CONTRACT_RUNTIME_READ_PATH)).status).toBe(
      405,
    );
    expect((await post(body(), { 'content-type': 'text/plain' })).status).toBe(
      415,
    );
    expect((await post(body(), { 'content-encoding': 'gzip' })).status).toBe(
      415,
    );
    expect((await post('{invalid')).status).toBe(400);
    expect((await post(body(), { authorization: '' })).status).toBe(401);
    expect(h.handle).not.toHaveBeenCalled();
  });
  it('rejects a body beyond 16KiB without dispatching a read', async () => {
    host = enabled();
    expect(
      (await post(JSON.stringify({ ...query(), padding: 'x'.repeat(16384) })))
        .status,
    ).toBe(413);
    expect(h.handle).not.toHaveBeenCalled();
  });
  it.each(['projectionPath', 'finalLookupPath'] as const)(
    'rejects a collision with configured %s before IO',
    async (key) => {
      const collision = {
        ...config,
        endpointPins: {
          ...config.endpointPins,
          [key]: TRADE_CONTRACT_RUNTIME_READ_PATH,
        },
      };
      expect(() => createTradeContractRuntimeFetchHandler(collision)).toThrow(
        'TRADE_READ_ROUTE_COLLISION',
      );
      expect(() =>
        createNonactivatedRuntimeReadFetchHost({
          read: collision,
          tradeEvidenceEnabled: true,
        }),
      ).toThrow('TRADE_READ_ROUTE_COLLISION');
      expect(config.pool.connect).not.toHaveBeenCalled();
    },
  );
  it('drains actual tracked cleanup after cancellation before returning', async () => {
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cleaned = false;
    h.handle.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      let finish: () => void = () => undefined;
      trackRequestCleanup(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            queueMicrotask(() =>
              resolve({ httpStatus: 499, body: { ok: false } }),
            );
            setTimeout(() => {
              cleaned = true;
              finish();
            }, 20);
          },
          { once: true },
        );
        started();
      });
    });
    const controller = new AbortController(),
      pending = enabled().fetch(direct(controller.signal));
    await ready;
    controller.abort();
    const response = await pending;
    expect(response?.status).toBe(499);
    expect(cleaned).toBe(true);
    expect(config.pool.connect).not.toHaveBeenCalled();
  });
  it('uses one ten-second deadline and drains tracked work after it expires', async () => {
    vi.useFakeTimers();
    let cleaned = false;
    h.handle.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      let finish: () => void = () => undefined;
      trackRequestCleanup(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      return new Promise((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            queueMicrotask(() =>
              resolve({ httpStatus: 499, body: { ok: false } }),
            );
            setTimeout(() => {
              cleaned = true;
              finish();
            }, 20);
          },
          { once: true },
        ),
      );
    });
    const pending = enabled().fetch(direct());
    await vi.advanceTimersByTimeAsync(9999);
    expect(cleaned).toBe(false);
    await vi.advanceTimersByTimeAsync(21);
    expect((await pending)?.status).toBe(504);
    expect(cleaned).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not return a successful result after tracked cleanup failed', async () => {
    h.handle.mockImplementation(async () => {
      trackRequestCleanup(
        Promise.reject(Error('TEST_ONLY_CLEANUP_FAILED')),
      ).catch(() => undefined);
      return success();
    });
    const response = await enabled().fetch(direct());
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({
      ok: false,
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });
});
