import {
  classifiedActivityWireFixture,
  classifiedOfficeScope,
} from '../support/classified-activity-wire-fixture.js';
import {
  createServer,
  request as httpRequest,
  type Server,
  type IncomingMessage,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpsAuthenticatedReadRoute,
  type HttpsAuthenticatedReadRouteOptions,
} from '../../apps/world-api/src/integration/https-authenticated-read-route.js';
import type {
  HttpsReadCompositionConfig,
  ServerReadBindingPort,
  ServerVerifiedReadBinding,
} from '../../apps/world-api/src/integration/https-authenticated-read-composition.js';
import {
  parseSupabaseAuthSubject,
  type JwtSignatureVerifier,
} from '../../apps/world-api/src/integration/identity.js';
import {
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import { WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY } from '../../apps/world-api/src/integration/postgres-final-receipt-reader.js';

// TEST_ONLY: real loopback HTTP, fake JWT signature port, in-memory query rows,
// invented bindings. NOT HTTPS/provider/auth/DB/RLS/admission/deployment evidence.
const origin = 'https://test-only-ui.example.invalid';
const subject = parseSupabaseAuthSubject(
  '22222222-2222-4222-8222-222222222222',
);
const requestId = '11111111-1111-4111-8111-111111111111';
const hash = `sha256:${'a'.repeat(64)}`;
const authorization = 'Bearer TEST_ONLY_OPAQUE_TOKEN';
const projectionRequest = {
  schemaVersion: 'world-read-api-v1',
  requestId,
  operation: 'READ_WORLD_PROJECTION',
  payload: {
    worldId: 'TEST_WORLD',
    classification: 'OFFICE_PRIVATE',
    scopeKey: classifiedOfficeScope('TEST_COUNTRY', 'TRADE'),
  },
};
const finalRequest = {
  schemaVersion: 'world-final-receipt-read-v1',
  requestId,
  operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
  payload: {
    worldId: 'TEST_WORLD',
    commandId: 'TEST_COMMAND',
    idempotencyKey: 'TEST_KEY',
  },
};
function fixture(office = 'TRADE') {
  let binding: ServerVerifiedReadBinding | null = {
    source: 'SERVER_VERIFIED_READ_BINDING',
    capability: 'READ_AUTHORIZED_PROJECTION_AND_FINAL',
    seatRef: 'TEST_SEAT',
    seatState: 'ACTIVE',
    identity: {
      authSubjectId: subject,
      worldId: 'TEST_WORLD',
      countryId: 'TEST_COUNTRY',
      officeId: office,
      scopeKey: classifiedOfficeScope('TEST_COUNTRY', office),
      classification: 'OFFICE_PRIVATE',
      authorizationRevision: 'TEST_REVISION',
      modelVersion: 'TEST_MODEL',
      projectionVersion: 'TEST_PROJECTION',
    },
    seed: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: hash,
      admissionRef: 'TEST_ADMISSION',
    },
    readback: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: hash,
      admissionRef: 'TEST_ADMISSION',
      worldVersion: '2',
      eventSequence: '2',
      readbackRef: 'TEST_READBACK',
    },
  };
  const projectionRow = {
    world_id: 'TEST_WORLD',
    classification: 'OFFICE_PRIVATE',
    scope_key: classifiedOfficeScope('TEST_COUNTRY', office),
    schema_version: 'world-projection-read-v1',
    world_version: '2',
    event_sequence: '2',
    generated_at: '2026-10-07T00:00:00.000Z',
    payload: classifiedActivityWireFixture('TEST_COUNTRY', office),
  };
  const receiptRow = {
    receipt_world_id: 'TEST_WORLD',
    receipt_command_id: 'TEST_COMMAND',
    receipt_idempotency_key: 'TEST_KEY',
    receipt_schema_version: 'command-receipt-v2',
    receipt_command_fingerprint: hash,
    outcome: 'COMMITTED',
    reason_code: null,
    transition_id: 'TEST_COMMAND',
    world_version_before: '1',
    world_version_after: '2',
    sim_time: '0',
    event_ids: ['TEST_EVENT'],
    recorded_at_real: '2026-10-07T00:00:00.000Z',
    submission_world_id: 'TEST_WORLD',
    submission_command_id: 'TEST_COMMAND',
    submission_idempotency_key: 'TEST_KEY',
    submission_command_fingerprint: hash,
    submission_auth_subject: subject,
    submission_country_id: 'TEST_COUNTRY',
    submission_office_id: 'TRADE',
  };
  const verifier = {
    verify: vi.fn<JwtSignatureVerifier['verify']>(async () => ({
      sub: subject,
      iss: 'https://test-only-auth.example.invalid',
      aud: 'TEST_ONLY',
      iat: 500,
      exp: 2000,
    })),
  };
  const bindingReader = {
    resolve: vi.fn<ServerReadBindingPort['resolve']>(async () => binding),
  };
  const executor = {
    query: vi.fn<ParameterizedPgReadExecutor['query']>(async (input) => {
      if (input.text === WORLD_V2_ENTITLED_PROJECTION_QUERY)
        return { rows: [projectionRow] };
      if (input.text === WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY)
        return { rows: [receiptRow] };
      throw new Error('TEST_ONLY unexpected query/mutation');
    }),
  };
  const config: HttpsReadCompositionConfig = {
    endpointPins: {
      origin: 'https://test-only-runtime.example.invalid',
      projectionPath: '/v1/world-read',
      finalLookupPath: '/v1/final-receipt',
      deploymentRef: 'TEST_DEPLOYMENT',
    },
    admittedWorldPins: {
      worldId: 'TEST_WORLD',
      seedRef: 'TEST_SEED',
      contentHash: hash,
      admissionRef: 'TEST_ADMISSION',
      minimumWorldVersion: '1',
    },
    verifier,
    currentJwtPolicy: () => ({
      expectedIssuer: 'https://test-only-auth.example.invalid',
      expectedAudience: 'TEST_ONLY',
      nowEpochSeconds: 1000,
    }),
    executor,
    bindingReader,
  };
  return {
    config,
    verifier,
    bindingReader,
    executor,
    projectionRow,
    binding: () => binding,
    setBinding: (next: ServerVerifiedReadBinding | null) => {
      binding = next;
    },
  };
}
const servers: Server[] = [];
const clientRequests: ReturnType<typeof httpRequest>[] = [];
async function host(
  config: HttpsReadCompositionConfig | null,
  options: HttpsAuthenticatedReadRouteOptions = { allowedOrigins: [origin] },
) {
  const route = createHttpsAuthenticatedReadRoute(config, options);
  const handled: boolean[] = [];
  const incoming: IncomingMessage[] = [];
  const server = createServer((request, response) => {
    incoming.push(request);
    void route(request, response)
      .then((result) => {
        handled.push(result);
        if (!result) {
          response.writeHead(request.url === '/healthz' ? 200 : 404);
          response.end(request.url === '/healthz' ? 'TEST_ONLY_HEALTH' : '404');
        }
      })
      .catch(() => {
        response.writeHead(500);
        response.end('TEST_ONLY_UNEXPECTED_ROUTE_REJECTION');
      });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { port: (server.address() as AddressInfo).port, handled, incoming };
}
interface Reply {
  status: number;
  headers: import('node:http').IncomingHttpHeaders;
  body: string;
}
function send(
  port: number,
  input: {
    path?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
    body?: string | Buffer;
    /** Send one incomplete upload, leaving the server deadline to end it. */
    incomplete?: boolean;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: input.method ?? 'POST',
        path: input.path ?? '/v1/world-read',
        headers: input.headers ?? {
          origin,
          authorization,
          'content-type': 'application/json',
        },
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('end', () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.once('error', reject);
      },
    );
    clientRequests.push(request);
    request.once('error', reject);
    request.setTimeout(2_000, () =>
      request.destroy(new Error('TEST_ONLY timeout')),
    );
    const body = input.body ?? JSON.stringify(projectionRequest);
    if (input.incomplete) request.write(body);
    else request.end(body);
  });
}
function expectError(reply: Reply, status: number, code: string) {
  expect(reply.status).toBe(status);
  expect(JSON.parse(reply.body)).toMatchObject({
    schemaVersion: 'world-authorized-read-binding-v1',
    ok: false,
    error: { code, retryable: false },
  });
  expect(reply.headers['cache-control']).toBe('private, no-store');
  expect(reply.headers['x-content-type-options']).toBe('nosniff');
  expect(reply.headers['access-control-allow-credentials']).toBeUndefined();
}
afterEach(async () => {
  for (const request of clientRequests.splice(0)) request.destroy();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  vi.restoreAllMocks();
});

describe('opt-in authenticated Node route / TEST_ONLY loopback HTTP', () => {
  it.each([
    ['/v1/world-read', projectionRequest, WORLD_V2_ENTITLED_PROJECTION_QUERY],
    [
      '/v1/final-receipt',
      finalRequest,
      WORLD_V2_AUTHENTICATED_FINAL_RECEIPT_QUERY,
    ],
  ])(
    'transports the existing %s contract, authorization and binding',
    async (path, body, query) => {
      const f = fixture();
      const h = await host(f.config);
      const reply = await send(h.port, { path, body: JSON.stringify(body) });
      expect(reply.status).toBe(200);
      expect(reply.headers['access-control-allow-origin']).toBe(origin);
      expect(reply.headers.vary).toBe('Origin');
      expect(reply.headers['access-control-allow-credentials']).toBeUndefined();
      expect(JSON.parse(reply.body)).toMatchObject({
        schemaVersion: 'world-authorized-read-binding-v1',
        requestId,
        ok: true,
        authority: f.binding(),
        result: { requestId, ok: true },
      });
      expect(f.verifier.verify.mock.calls[0]?.[0]).toBe(
        'TEST_ONLY_OPAQUE_TOKEN',
      );
      expect(f.bindingReader.resolve).toHaveBeenCalledTimes(2);
      expect(f.executor.query).toHaveBeenCalledTimes(1);
      expect(f.executor.query.mock.calls[0]?.[0]).toMatchObject({
        text: query,
        verifiedAuthSubject: subject,
      });
      expect(h.handled).toEqual([true]);
    },
  );

  it('preflights exact Origin/POST/header allowlist without authenticating', async () => {
    const f = fixture();
    const h = await host(f.config);
    const reply = await send(h.port, {
      method: 'OPTIONS',
      body: '',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, CONTENT-TYPE',
      },
    });
    expect(reply.status).toBe(204);
    expect(reply.body).toBe('');
    expect(reply.headers['access-control-allow-origin']).toBe(origin);
    expect(reply.headers['access-control-allow-methods']).toBe('POST');
    expect(reply.headers['access-control-allow-headers']).toBe(
      'Authorization, Content-Type',
    );
    expect(reply.headers['access-control-allow-credentials']).toBeUndefined();
    expect(reply.headers.vary).toContain('Access-Control-Request-Headers');
    expect(f.verifier.verify).not.toHaveBeenCalled();
    expect(f.executor.query).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { origin: 'https://test-only-ui.example.invalid.evil.invalid' },
    { origin: 'http://test-only-ui.example.invalid' },
    { origin: 'null' },
    { origin: [origin, origin] },
  ])('rejects missing, nonexact or duplicated Origin %j', async (headers) => {
    const f = fixture();
    const h = await host(f.config);
    const reply = await send(h.port, { headers });
    expectError(reply, 403, 'ORIGIN_DENIED');
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    expect(f.verifier.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', 'authorization'],
    ['POST', 'authorization, cookie'],
    ['POST', 'x-forwarded-proto'],
    ['POST', ''],
  ])('rejects invalid preflight %s/%s', async (method, headers) => {
    const f = fixture();
    const h = await host(f.config);
    expectError(
      await send(h.port, {
        method: 'OPTIONS',
        body: '',
        headers: {
          origin,
          'access-control-request-method': method,
          'access-control-request-headers': headers,
        },
      }),
      403,
      'PREFLIGHT_DENIED',
    );
    expect(f.verifier.verify).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD', 'PUT', 'DELETE'])(
    'rejects matched %s without running ports',
    async (method) => {
      const f = fixture();
      const h = await host(f.config);
      const reply = await send(h.port, { method, body: '' });
      expect(reply.status).toBe(405);
      expect(reply.headers.allow).toBe('POST, OPTIONS');
      // HEAD legitimately has no response body.
      if (method !== 'HEAD') expectError(reply, 405, 'METHOD_NOT_ALLOWED');
      expect(f.verifier.verify).not.toHaveBeenCalled();
    },
  );

  it.each([
    {},
    { authorization: 'Basic TEST_ONLY' },
    { authorization: 'Bearer bad token' },
    { authorization: [authorization, authorization] },
  ])(
    'fails closed for absent/malformed/duplicate Authorization %j',
    async (headers) => {
      const f = fixture();
      const h = await host(f.config);
      expectError(
        await send(h.port, {
          headers: {
            origin,
            'content-type': 'application/json',
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'test-only-runtime.example.invalid',
            ...headers,
          },
        }),
        401,
        'AUTHORIZATION_DENIED',
      );
      expect(f.verifier.verify).not.toHaveBeenCalled();
    },
  );

  it('verifier rejection fails closed and leaks no thrown internals', async () => {
    const f = fixture();
    f.verifier.verify.mockRejectedValue(
      new Error('TEST_ONLY_PRIVATE_PROVIDER_DETAILS'),
    );
    const h = await host(f.config);
    const reply = await send(h.port);
    expectError(reply, 403, 'AUTHORIZATION_DENIED');
    expect(reply.body).not.toContain('PRIVATE_PROVIDER');
    expect(f.bindingReader.resolve).not.toHaveBeenCalled();
    expect(f.executor.query).not.toHaveBeenCalled();
  });

  it('rejects cookies rather than using them for identity', async () => {
    const f = fixture();
    const h = await host(f.config);
    expectError(
      await send(h.port, {
        headers: {
          origin,
          authorization,
          'content-type': 'application/json',
          cookie: 'TEST_ONLY=1',
        },
      }),
      403,
      'COOKIE_NOT_SUPPORTED',
    );
    expect(f.verifier.verify).not.toHaveBeenCalled();
  });

  it.each(['text/plain', 'application/json; charset=latin1', ''])(
    'rejects unsupported MIME %s',
    async (mime) => {
      const f = fixture();
      const h = await host(f.config);
      expectError(
        await send(h.port, {
          headers: {
            origin,
            authorization,
            ...(mime ? { 'content-type': mime } : {}),
          },
        }),
        415,
        'UNSUPPORTED_MEDIA_TYPE',
      );
      expect(f.verifier.verify).not.toHaveBeenCalled();
    },
  );

  it('rejects compressed uploads and accepts UTF-8 JSON MIME', async () => {
    const f = fixture();
    const h = await host(f.config);
    expectError(
      await send(h.port, {
        headers: {
          origin,
          authorization,
          'content-type': 'application/json',
          'content-encoding': 'gzip',
        },
      }),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
    expect(
      (
        await send(h.port, {
          headers: {
            origin,
            authorization,
            'content-type': 'Application/JSON; charset=UTF-8',
          },
        })
      ).status,
    ).toBe(200);
  });

  it.each(['', '{', Buffer.from([0xff])])(
    'rejects empty/malformed/nonUTF8 JSON',
    async (body) => {
      const f = fixture();
      const h = await host(f.config);
      expectError(await send(h.port, { body }), 400, 'INVALID_JSON');
      expect(f.verifier.verify).not.toHaveBeenCalled();
    },
  );

  it('bounds both declared and streamed/chunked upload bytes before ports', async () => {
    const f = fixture();
    const h = await host(f.config);
    const body = 'x'.repeat(16_385);
    expectError(
      await send(h.port, {
        body,
        headers: {
          origin,
          authorization,
          'content-type': 'application/json',
          'content-length': String(body.length),
        },
      }),
      413,
      'REQUEST_TOO_LARGE',
    );
    expectError(
      await send(h.port, {
        body,
        headers: {
          origin,
          authorization,
          'content-type': 'application/json',
          'transfer-encoding': 'chunked',
        },
      }),
      413,
      'REQUEST_TOO_LARGE',
    );
    expect(f.verifier.verify).not.toHaveBeenCalled();
  });

  it('expires incomplete bodies, then serves a new request normally', async () => {
    const f = fixture();
    const h = await host(f.config, {
      allowedOrigins: [origin],
      bodyTimeoutMs: 80,
      requestTimeoutMs: 500,
    });
    expectError(
      await send(h.port, { body: '{', incomplete: true }),
      408,
      'REQUEST_TIMEOUT',
    );
    expect(f.verifier.verify).not.toHaveBeenCalled();
    expect((await send(h.port)).status).toBe(200);
  });

  it('aborted uploads settle without ports or retained body listeners', async () => {
    const f = fixture();
    const h = await host(f.config);
    const request = httpRequest({
      host: '127.0.0.1',
      port: h.port,
      method: 'POST',
      path: '/v1/world-read',
      headers: { origin, authorization, 'content-type': 'application/json' },
      agent: false,
    });
    clientRequests.push(request);
    request.on('error', () => undefined);
    request.write('{');
    await vi.waitFor(() => expect(h.incoming).toHaveLength(1), {
      interval: 5,
      timeout: 1000,
    });
    request.destroy();
    await vi.waitFor(() => expect(h.handled).toEqual([true]), {
      interval: 5,
      timeout: 1000,
    });
    expect(f.verifier.verify).not.toHaveBeenCalled();
    expect(h.incoming[0]?.listenerCount('data')).toBe(0);
    expect(h.incoming[0]?.listenerCount('end')).toBe(0);
    expect(h.incoming[0]?.listenerCount('aborted')).toBe(0);
    expect((await send(h.port)).status).toBe(200);
  });

  it('counts UTF-8 bytes, not characters, and permits an exact-limit body', async () => {
    const f = fixture();
    const size = Buffer.byteLength(JSON.stringify(projectionRequest));
    const h = await host(f.config, {
      allowedOrigins: [origin],
      maxBodyBytes: size,
    });
    expect((await send(h.port)).status).toBe(200);
    expectError(
      await send(h.port, { body: '界'.repeat(Math.ceil(size / 3) + 1) }),
      413,
      'REQUEST_TOO_LARGE',
    );
    expect(f.executor.query).toHaveBeenCalledTimes(1);
  });

  it.each([
    '/healthz',
    '/readyz',
    '/v1/public-world-source',
    '/v1/world-data/countries',
    '/v1/world-data/countries/test-country',
    '/v1/world-data/datasets',
    '/v1/world-data/map-assets',
    '/v1/season1/my-team',
    '/v1/world-read?country=TEST_COUNTRY&role=TRADE',
    '/v1/world-read/',
    '/v1/%77orld-read',
    'https://test-only-runtime.example.invalid/v1/world-read',
  ])('does not handle/normalize/shadow %s', async (path) => {
    const f = fixture();
    const h = await host(f.config);
    const reply = await send(h.port, { path });
    expect(reply.status).toBe(path === '/healthz' ? 200 : 404);
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    expect(h.handled).toEqual([false]);
    expect(f.verifier.verify).not.toHaveBeenCalled();
  });

  it('defaults disabled and an empty Origin allowlist cannot open a route', async () => {
    const f = fixture();
    const unset = await host(null);
    const empty = await host(f.config, { allowedOrigins: [] });
    expect((await send(unset.port)).status).toBe(404);
    expect((await send(empty.port)).status).toBe(404);
    expect(f.verifier.verify).not.toHaveBeenCalled();
  });

  it.each([
    '/healthz',
    '/readyz',
    '/v1/world-data/countries',
    '/v1/world-data/countries/test-country',
    '/v1/world-data/datasets',
    '/v1/world-data/datasets/test-dataset',
    '/v1/world-data/map-assets',
    '/v1/season1/my-team',
  ])(
    'misconfigured pins cannot shadow the existing %s surface',
    async (path) => {
      const f = fixture();
      const h = await host({
        ...f.config,
        endpointPins: { ...f.config.endpointPins, projectionPath: path },
      });
      expect((await send(h.port, { path })).status).toBe(
        path === '/healthz' ? 200 : 404,
      );
      expect(h.handled).toEqual([false]);
      expect(f.verifier.verify).not.toHaveBeenCalled();
    },
  );

  it('missing server binding stays NOT_CONNECTED, never opens query access', async () => {
    const f = fixture();
    f.setBinding(null);
    const h = await host(f.config);
    expectError(await send(h.port), 200, 'NOT_CONNECTED');
    expect(f.executor.query).not.toHaveBeenCalled();
  });

  it('missing current server JWT policy or invalid composition pins cannot grant access', async () => {
    const f = fixture();
    const noPolicy = await host({ ...f.config, currentJwtPolicy: () => null });
    const badPins = await host({
      ...f.config,
      admittedWorldPins: {
        ...f.config.admittedWorldPins,
        contentHash: 'TEST_INVALID',
      },
    });
    expectError(await send(noPolicy.port), 200, 'NOT_CONNECTED');
    expectError(await send(badPins.port), 200, 'NOT_CONNECTED');
    expect(f.verifier.verify).not.toHaveBeenCalled();
    expect(f.executor.query).not.toHaveBeenCalled();
  });

  it('wrong seed admission and wrong body world fail closed', async () => {
    const f = fixture();
    const binding = f.binding()!;
    f.setBinding({
      ...binding,
      seed: { ...binding.seed, admissionRef: 'TEST_UNADMITTED' },
    });
    const h = await host(f.config);
    expectError(await send(h.port), 200, 'NOT_CONNECTED');
    expectError(
      await send(h.port, {
        body: JSON.stringify({
          ...projectionRequest,
          payload: {
            ...projectionRequest.payload,
            worldId: 'TEST_WRONG_WORLD',
          },
        }),
      }),
      400,
      'INVALID_REQUEST',
    );
    expect(f.executor.query).not.toHaveBeenCalled();
  });

  it('seat/revision changes during query cannot publish stale authority', async () => {
    const f = fixture();
    const original = f.executor.query.getMockImplementation()!;
    f.executor.query.mockImplementation(async (input) => {
      const result = await original(input);
      const binding = f.binding()!;
      f.setBinding({
        ...binding,
        identity: {
          ...binding.identity,
          authorizationRevision: 'TEST_REVOKED',
        },
      });
      return result;
    });
    const h = await host(f.config);
    expectError(await send(h.port), 403, 'AUTHORIZATION_DENIED');
  });

  it('whole-request deadline cancels hung binding and suppresses late completion', async () => {
    const f = fixture();
    let signal: AbortSignal | undefined;
    let complete: (binding: ServerVerifiedReadBinding | null) => void = () =>
      undefined;
    f.bindingReader.resolve.mockImplementation(async (input) => {
      signal = input.signal;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const h = await host(f.config, {
      allowedOrigins: [origin],
      requestTimeoutMs: 100,
    });
    const reply = await send(h.port);
    expectError(reply, 504, 'UPSTREAM_UNAVAILABLE');
    expect(JSON.parse(reply.body).requestId).toBe(requestId);
    expect(signal?.aborted).toBe(true);
    complete(f.binding());
    await Promise.resolve();
    expect(f.executor.query).not.toHaveBeenCalled();
  });

  it('client disconnect cancels the actual downstream signal without a late response', async () => {
    const f = fixture();
    let entered: (signal: AbortSignal) => void = () => undefined;
    const entering = new Promise<AbortSignal>((resolve) => {
      entered = resolve;
    });
    f.bindingReader.resolve.mockImplementation(async (input) => {
      entered(input.signal);
      return new Promise((resolve) =>
        input.signal.addEventListener('abort', () => resolve(null), {
          once: true,
        }),
      );
    });
    const h = await host(f.config);
    const request = httpRequest({
      host: '127.0.0.1',
      port: h.port,
      method: 'POST',
      path: '/v1/world-read',
      headers: { origin, authorization, 'content-type': 'application/json' },
      agent: false,
    });
    clientRequests.push(request);
    request.on('error', () => undefined);
    request.end(JSON.stringify(projectionRequest));
    const signal = await entering;
    const aborted = new Promise<void>((resolve) =>
      signal.addEventListener('abort', () => resolve(), { once: true }),
    );
    request.destroy();
    await aborted;
    expect(signal.aborted).toBe(true);
    expect(f.executor.query).not.toHaveBeenCalled();
  });

  it('deadline also aborts the parameterized read executor', async () => {
    const f = fixture();
    let signal: AbortSignal | undefined;
    f.executor.query.mockImplementation(async (input) => {
      signal = input.signal;
      return new Promise((resolve) =>
        input.signal?.addEventListener('abort', () => resolve({ rows: [] }), {
          once: true,
        }),
      );
    });
    const h = await host(f.config, {
      allowedOrigins: [origin],
      requestTimeoutMs: 100,
    });
    expectError(await send(h.port), 504, 'UPSTREAM_UNAVAILABLE');
    expect(signal?.aborted).toBe(true);
    expect(f.bindingReader.resolve).toHaveBeenCalledTimes(1);
  });

  it('caps response bytes at the browser bound without leaking payloads', async () => {
    const f = fixture('FINANCE');
    f.projectionRow.payload = classifiedActivityWireFixture(
      'TEST_COUNTRY',
      'FINANCE',
      [
        {
          accountId: 'ACCOUNT_SIZE_TEST',
          accountClass: 'CASH',
          currency: 'GCU',
          netDebitBalance: '1',
        },
      ],
    );
    const h = await host(f.config);
    const body = JSON.stringify({
      ...projectionRequest,
      payload: {
        ...projectionRequest.payload,
        scopeKey: classifiedOfficeScope('TEST_COUNTRY', 'FINANCE'),
      },
    });
    const baseline = JSON.parse((await send(h.port, { body })).body);
    expect(baseline.result.ok).toBe(true);
    // Pure bounded wire-size fixture, not an account/source grant. Keep each
    // row canonical and the reader DTO just below one MiB; the authority
    // envelope must independently enforce its own one MiB bound.
    const limit = 1024 * 1024;
    const rows = f.projectionRow.payload.ledger.financialPositions;
    for (let i = 1; i < 6000; i++)
      rows.push({
        accountId: `ACCOUNT_SIZE_${i}_${'A'.repeat(96)}`,
        accountClass: 'CASH',
        currency: 'GCU',
        netDebitBalance: '1',
      });
    while (
      Buffer.byteLength(
        JSON.stringify({
          ...baseline.result.data,
          payload: f.projectionRow.payload,
        }),
      ) >= limit
    )
      rows.pop();
    let spare =
      limit -
      1 -
      Buffer.byteLength(
        JSON.stringify({
          ...baseline.result.data,
          payload: f.projectionRow.payload,
        }),
      );
    for (const row of rows) {
      const add = Math.min(spare, 128 - row.accountId.length);
      row.accountId += 'A'.repeat(add);
      spare -= add;
      if (!spare) break;
    }
    expect(spare).toBe(0);
    const reply = await send(h.port, { body });
    expectError(reply, 502, 'RESPONSE_TOO_LARGE');
    expect(reply.body).not.toContain('ACCOUNT_SIZE');
  });

  it('pins route paths at construction, never from Host/forwarded headers', async () => {
    const f = fixture();
    const h = await host(f.config);
    Object.assign(f.config.endpointPins, {
      projectionPath: '/v1/changed-read',
    });
    expect((await send(h.port, { path: '/v1/changed-read' })).status).toBe(404);
    const reply = await send(h.port, {
      headers: {
        origin,
        authorization,
        'content-type': 'application/json',
        host: 'untrusted.example.invalid',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'test-only-runtime.example.invalid',
      },
    });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body).authority).toEqual(f.binding());
  });

  it('rejects wildcard/noncanonical Origin policy and enlarged/unbounded limits', () => {
    const f = fixture();
    for (const value of ['*', 'http://localhost:3000', origin + '/', 'null'])
      expect(() =>
        createHttpsAuthenticatedReadRoute(f.config, {
          allowedOrigins: [value],
        }),
      ).toThrow('Invalid authenticated read browser origin');
    for (const value of [0, -1, NaN, Infinity, 16_385])
      expect(() =>
        createHttpsAuthenticatedReadRoute(f.config, {
          allowedOrigins: [origin],
          maxBodyBytes: value,
        }),
      ).toThrow('Invalid authenticated read transport limits');
    expect(() =>
      createHttpsAuthenticatedReadRoute(f.config, {
        allowedOrigins: [origin],
        requestTimeoutMs: 10_001,
      }),
    ).toThrow();
  });
});
