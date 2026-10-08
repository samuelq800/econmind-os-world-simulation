import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTHENTICATED_OFFICE_COMMAND_PATH } from '@econmind/core/authenticated-office-command-contract';
import {
  createHttpsAuthenticatedOfficeCommandRoute,
  type HttpsOfficeCommandRouteConfig,
} from '../../apps/world-api/src/integration/https-authenticated-office-command-route.js';
import { officeRouteTestOnlyFixture } from '../support/g-office-route-test-only-fixture.js';

// TEST_ONLY real loopback sockets. The adapter's caller owns TLS/mounting;
// these HTTP sockets do not establish HTTPS, a deployed host or official data.
const origin = 'https://office-test-only.example.invalid';
const headers = {
  origin,
  authorization: 'Bearer TEST_ONLY',
  'content-type': 'application/json',
};
const servers: Server[] = [];
const clients: ClientRequest[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      s.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

async function host(
  composition: HttpsOfficeCommandRouteConfig['composition'] = null,
) {
  const route = createHttpsAuthenticatedOfficeCommandRoute({
    path: AUTHENTICATED_OFFICE_COMMAND_PATH,
    allowedOrigins: [origin],
    composition,
  });
  const handled: boolean[] = [];
  const incoming: IncomingMessage[] = [];
  const routeEnds: Array<readonly unknown[]> = [];
  const outgoing: ServerResponse[] = [];
  const finishes: number[] = [];
  const errors: unknown[] = [];
  const server = createServer((req, res) => {
    const index = incoming.length;
    incoming.push(req);
    outgoing.push(res);
    finishes.push(0);
    res.on('finish', () => {
      finishes[index] = finishes[index]! + 1;
    });
    const before = req.listeners('end');
    const pending = route(req, res);
    routeEnds.push(
      req.listeners('end').filter((listener) => !before.includes(listener)),
    );
    void pending
      .then((result) => {
        handled.push(result);
        if (!result) {
          res.writeHead(req.url === '/healthz' ? 200 : 404);
          res.end();
        }
      })
      .catch((error: unknown) => {
        errors.push(error);
        res.destroy();
      });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    handled,
    incoming,
    routeEnds,
    outgoing,
    finishes,
    errors,
  };
}

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}
function send(
  port: number,
  input: {
    path?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
    body?: string | Buffer;
    incomplete?: boolean;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        agent: false,
        method: input.method ?? 'POST',
        path: input.path ?? AUTHENTICATED_OFFICE_COMMAND_PATH,
        headers: input.headers ?? headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.once('end', () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.once('error', reject);
      },
    );
    clients.push(request);
    request.once('error', reject);
    request.setTimeout(15_000, () =>
      request.destroy(new Error('TEST_ONLY_SOCKET_TIMEOUT')),
    );
    if (input.incomplete) request.write(input.body ?? '{');
    else request.end(input.body ?? '{}');
  });
}
function error(reply: Reply, status: number, code: string) {
  expect(reply.status).toBe(status);
  expect(JSON.parse(reply.body)).toMatchObject({
    ok: false,
    error: { code, retryable: false },
  });
  expect(reply.headers['cache-control']).toBe('private, no-store');
  expect(reply.headers['x-content-type-options']).toBe('nosniff');
  expect(reply.headers['access-control-allow-credentials']).toBeUndefined();
}
function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function drain() {
  await nextTurn();
  await nextTurn();
  await nextTurn();
}
function clean(h: Awaited<ReturnType<typeof host>>, index = 0) {
  expect(h.incoming[index]!.listenerCount('data')).toBe(0);
  // Node installs clearIncoming after response finish for an incomplete body.
  // Check the route's actual listener identities, preserving Node's cleanup.
  expect(
    h.incoming[index]!.listeners('end').some((listener) =>
      h.routeEnds[index]!.includes(listener),
    ),
  ).toBe(false);
  expect(h.incoming[index]!.listenerCount('aborted')).toBe(0);
  expect(h.outgoing[index]!.listenerCount('close')).toBe(0);
  expect(h.errors).toEqual([]);
}

describe('manual Office route: real socket + real service boundary', () => {
  it('actual signed JWT/current SQL/source/consumer binding queues once; retry keeps server clock; historical FINALIZED is only an ack', async () => {
    const f = await officeRouteTestOnlyFixture();
    const h = await host({ ...f.config, runtime: f.runtime });
    const input = {
      headers: { ...headers, authorization: `Bearer ${f.token()}` },
      body: JSON.stringify(f.envelope(f.request)),
    };
    const first = await send(h.port, input);
    expect(first.status).toBe(202);
    expect(JSON.parse(first.body)).toMatchObject({
      ok: true,
      state: { status: 'QUEUED', source: 'NEW', submitted: true, queued: true },
    });
    expect(first.headers['access-control-allow-origin']).toBe(origin);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(f.runtime.consumer.state()).toBe('PREPARED');
    expect(await f.counts()).toEqual({
      command_submission: 1,
      command_queue: 1,
      authoritative_event: 0,
      command_receipt: 0,
      financial_posting_batch: 0,
      inventory_posting: 0,
    });
    f.server.simTime = '32000';
    const retry = await send(h.port, input);
    expect(retry.status).toBe(200);
    expect(JSON.parse(retry.body)).toMatchObject({
      state: { status: 'QUEUED', source: 'EXISTING', submitted: false },
    });
    expect(f.server.clockCalls).toBe(1);
    expect(f.readCount()).toBe(1);
    expect(
      (await f.admin('select sim_time::text from world_v2.command_submission'))
        .rows[0],
    ).toEqual({ sim_time: '16000' });
    // TEST_ONLY explicit consumer exercise; route itself never starts it.
    f.runtime.consumer.startPreparation();
    expect(await f.runtime.consumer.consumeOnce()).toMatchObject({
      status: 'PROCESSED',
      receipt: { outcome: 'COMMITTED' },
    });
    expect(await f.runtime.consumer.consumeOnce()).toEqual({ status: 'IDLE' });
    const historical = await send(h.port, input);
    expect(historical.status).toBe(200);
    expect(JSON.parse(historical.body)).toMatchObject({
      state: { status: 'FINALIZED', source: 'EXISTING', submitted: false },
    });
    for (const reply of [first, retry, historical]) {
      expect(JSON.parse(reply.body)).not.toHaveProperty('receipt');
      expect(reply.body).not.toContain('COMMITTED');
    }
    expect(await f.counts()).toMatchObject({
      command_submission: 1,
      command_queue: 1,
      authoritative_event: 1,
      command_receipt: 1,
    });
    await f.runtime.consumer.stop();
    await drain();
    expect(h.finishes).toEqual([1, 1, 1]);
    clean(h);
    clean(h, 1);
    clean(h, 2);
  });

  it('default service without genuine runtime refuses with zero effects despite real JWT/current binding', async () => {
    const f = await officeRouteTestOnlyFixture();
    const h = await host(f.config);
    error(
      await send(h.port, {
        headers: { ...headers, authorization: `Bearer ${f.token()}` },
        body: JSON.stringify(f.envelope(f.request)),
      }),
      503,
      'SOURCE_RUNTIME_UNAVAILABLE',
    );
    await f.noEffects();
    expect(f.readCount()).toBe(0);
  });
  it('unconnected composition is a private nonretryable rejection', async () => {
    const h = await host();
    error(await send(h.port), 503, 'NOT_CONNECTED');
  });
  it('real signature/current seat and strict browser protocol remain enforced through the socket', async () => {
    const f = await officeRouteTestOnlyFixture();
    const h = await host({ ...f.config, runtime: f.runtime });
    error(
      await send(h.port, {
        headers: {
          ...headers,
          authorization: `Bearer ${f.token(undefined, true)}`,
        },
        body: JSON.stringify(f.envelope(f.request)),
      }),
      401,
      'AUTHENTICATION_INVALID',
    );
    for (const extra of [
      { ready: true },
      { simTime: '16000' },
      { actorId: 'BROWSER_ACTOR' },
    ]) {
      error(
        await send(h.port, {
          headers: { ...headers, authorization: `Bearer ${f.token()}` },
          body: JSON.stringify({ ...f.envelope(f.request), ...extra }),
        }),
        400,
        'PROTOCOL_ERROR',
      );
    }
    await f.admin(
      'update world_v2.current_commit_authorization set active=false',
    );
    error(
      await send(h.port, {
        headers: { ...headers, authorization: `Bearer ${f.token()}` },
        body: JSON.stringify(f.envelope(f.request)),
      }),
      403,
      'CURRENT_SEAT_OR_ADMISSION_REQUIRED',
    );
    await f.noEffects();
  });
  it('actual SQL COMMIT ack loss is unknown/nonretryable; explicit retry returns existing queue without reinsertion', async () => {
    const f = await officeRouteTestOnlyFixture();
    const h = await host({ ...f.config, runtime: f.runtime });
    const input = {
      headers: { ...headers, authorization: `Bearer ${f.token()}` },
      body: JSON.stringify(f.envelope(f.request)),
    };
    f.hooks.loseCommit = true;
    error(await send(h.port, input), 503, 'WRITE_OUTCOME_UNKNOWN');
    expect(await f.counts()).toMatchObject({
      command_submission: 1,
      command_queue: 1,
      authoritative_event: 0,
      command_receipt: 0,
    });
    f.hooks.loseCommit = false;
    expect(JSON.parse((await send(h.port, input)).body)).toMatchObject({
      ok: true,
      state: { status: 'QUEUED', source: 'EXISTING', submitted: false },
    });
    expect(await f.counts()).toMatchObject({
      command_submission: 1,
      command_queue: 1,
      authoritative_event: 0,
      command_receipt: 0,
    });
    expect(
      f.queries.filter((q) =>
        /insert into world_v2.command_submission/iu.test(q.sql),
      ),
    ).toHaveLength(1);
  });
});

describe('Office exact transport boundary', () => {
  it.each([
    '/healthz',
    '/readyz',
    '/auth',
    '/storage',
    '/v1/world-read',
    '/v1/financial-intake',
    '/v1/office-command/',
    '/v1/office-command?x=1',
    '/v1/%6fffice-command',
    'https://office-test-only.example.invalid/v1/office-command',
  ])('never claims or normalizes %s', async (path) => {
    const h = await host();
    const reply = await send(h.port, { path });
    expect(reply.status).toBe(path === '/healthz' ? 200 : 404);
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    expect(h.handled).toEqual([false]);
  });
  it('constructor requires the unique fixed path and canonical nonlocal HTTPS origins', () => {
    for (const path of [
      '/healthz',
      '/v1/financial-intake',
      '/local/office-command',
      '/v1/office-command?x=1',
      '/v1/other',
    ])
      expect(() =>
        createHttpsAuthenticatedOfficeCommandRoute({
          path,
          allowedOrigins: [origin],
          composition: null,
        }),
      ).toThrow('OFFICE_COMMAND_ROUTE_INVALID');
    for (const allowedOrigins of [
      [],
      ['*'],
      ['null'],
      ['http://test.example.invalid'],
      ['https://localhost'],
      ['https://127.0.0.1'],
      ['https://[::1]'],
      [origin + '/'],
      ['https://user:pass@test.example.invalid'],
    ])
      expect(() =>
        createHttpsAuthenticatedOfficeCommandRoute({
          path: AUTHENTICATED_OFFICE_COMMAND_PATH,
          allowedOrigins,
          composition: null,
        }),
      ).toThrow('OFFICE_COMMAND_ORIGINS_INVALID');
  });
  it.each([
    [{ ...headers, origin: '' }, 403, 'ORIGIN_DENIED'],
    [
      { ...headers, origin: 'https://elsewhere.example.invalid' },
      403,
      'ORIGIN_DENIED',
    ],
    [{ ...headers, origin: [origin, origin] }, 403, 'ORIGIN_DENIED'],
    [{ ...headers, authorization: '' }, 401, 'AUTHENTICATION_REQUIRED'],
    [
      { ...headers, authorization: ['Bearer TEST_ONLY', 'Bearer TEST_ONLY'] },
      401,
      'AUTHENTICATION_REQUIRED',
    ],
    [
      { ...headers, authorization: 'Basic TEST_ONLY' },
      401,
      'AUTHENTICATION_REQUIRED',
    ],
    [
      { ...headers, authorization: 'Bearer ' + 'x'.repeat(8192) },
      401,
      'AUTHENTICATION_REQUIRED',
    ],
    [{ ...headers, cookie: 'session=TEST_ONLY' }, 403, 'COOKIE_NOT_SUPPORTED'],
    [{ ...headers, 'content-type': '' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [
      { ...headers, 'content-type': ['application/json', 'application/json'] },
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
    [
      { ...headers, 'content-type': 'text/plain' },
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
    [
      { ...headers, 'content-type': 'application/json; charset=latin1' },
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    ],
    [{ ...headers, 'content-encoding': 'gzip' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ] as const)(
    'rejects unsupported/duplicate header %j',
    async (input, status, code) => {
      const h = await host();
      error(
        await send(h.port, {
          headers: input as Record<string, string | string[]>,
        }),
        status,
        code,
      );
    },
  );
  it('missing Origin/auth/type are rejected and never yield credential CORS', async () => {
    const h = await host();
    error(
      await send(h.port, {
        headers: {
          authorization: headers.authorization,
          'content-type': headers['content-type'],
        },
      }),
      403,
      'ORIGIN_DENIED',
    );
    error(
      await send(h.port, {
        headers: { origin, 'content-type': headers['content-type'] },
      }),
      401,
      'AUTHENTICATION_REQUIRED',
    );
    error(
      await send(h.port, {
        headers: { origin, authorization: headers.authorization },
      }),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
  });
  it('POST/OPTIONS only, exact preflight method/header set, private no-store', async () => {
    const h = await host();
    const method = await send(h.port, { method: 'GET' });
    error(method, 405, 'METHOD_NOT_ALLOWED');
    expect(method.headers.allow).toBe('POST, OPTIONS');
    const preflight = await send(h.port, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'Authorization, Content-Type',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.body).toBe('');
    expect(preflight.headers['access-control-allow-origin']).toBe(origin);
    expect(preflight.headers['cache-control']).toBe('private, no-store');
    expect(
      preflight.headers['access-control-allow-credentials'],
    ).toBeUndefined();
    expect(preflight.headers.vary).toContain('Access-Control-Request-Headers');
    for (const bad of [
      { 'access-control-request-method': 'GET' },
      { 'access-control-request-method': ['POST', 'POST'] },
      {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'X-Actor',
      },
      {
        'access-control-request-method': 'POST',
        'access-control-request-headers': ['Authorization', 'Content-Type'],
      },
    ])
      error(
        await send(h.port, { method: 'OPTIONS', headers: { origin, ...bad } }),
        403,
        'PREFLIGHT_DENIED',
      );
  });
  it.each(['', '{', Buffer.from([0xc3, 0x28])])(
    'rejects empty/malformed/non-UTF8 JSON %j',
    async (body) => {
      const h = await host();
      error(await send(h.port, { body }), 400, 'INVALID_JSON');
      await drain();
      clean(h);
    },
  );
  it('caps declared/chunked UTF8 bytes at 16KiB and accepts an exact-limit body', async () => {
    const h = await host();
    const exact = JSON.stringify('x'.repeat(16382));
    expect(Buffer.byteLength(exact)).toBe(16384);
    error(await send(h.port, { body: exact }), 503, 'NOT_CONNECTED');
    error(
      await send(h.port, {
        headers: { ...headers, 'content-length': '16385' },
        body: ' ',
      }),
      413,
      'REQUEST_TOO_LARGE',
    );
    error(
      await send(h.port, {
        headers: { ...headers, 'transfer-encoding': 'chunked' },
        body: JSON.stringify('界'.repeat(5461)),
      }),
      413,
      'REQUEST_TOO_LARGE',
    );
    await drain();
    clean(h);
    clean(h, 1);
    clean(h, 2);
  });
  it('body deadline ends an incomplete actual socket upload and removes listeners', async () => {
    const h = await host();
    error(await send(h.port, { incomplete: true }), 408, 'BODY_TIMEOUT');
    await drain();
    expect(h.finishes).toEqual([1]);
    clean(h);
  });
});

describe('Office real service deadline/disconnect cleanup', () => {
  it('whole deadline before intake maps CANCELLED to 504 and a late real binding cannot write', async () => {
    const f = await officeRouteTestOnlyFixture();
    const entered = deferred(),
      gate = deferred();
    const h = await host({
      ...f.config,
      runtime: f.runtime,
      resolveActorId: async (subject) => {
        entered.resolve();
        await gate.promise;
        return f.config.resolveActorId(subject);
      },
    });
    try {
      const response = send(h.port, {
        headers: { ...headers, authorization: `Bearer ${f.token()}` },
        body: JSON.stringify(f.envelope(f.request)),
      });
      await entered.promise;
      error(await response, 504, 'UPSTREAM_UNAVAILABLE');
    } finally {
      gate.resolve();
    }
    await drain();
    expect(h.finishes).toEqual([1]);
    clean(h);
    await f.noEffects();
  });
  it('whole deadline after possible intake preserves nonretryable UNKNOWN, never a late success', async () => {
    const f = await officeRouteTestOnlyFixture();
    const entered = deferred(),
      gate = deferred();
    f.hooks.beforeIntake = async () => {
      entered.resolve();
      await gate.promise;
    };
    const h = await host({ ...f.config, runtime: f.runtime });
    try {
      const response = send(h.port, {
        headers: { ...headers, authorization: `Bearer ${f.token()}` },
        body: JSON.stringify(f.envelope(f.request)),
      });
      await entered.promise;
      error(await response, 503, 'WRITE_OUTCOME_UNKNOWN');
    } finally {
      gate.resolve();
    }
    await drain();
    expect(h.finishes).toEqual([1]);
    clean(h);
    await f.noEffects();
  });
  it('client disconnect settles the real service once, removes listeners and suppresses late writes/responses', async () => {
    const f = await officeRouteTestOnlyFixture();
    const entered = deferred(),
      gate = deferred();
    f.hooks.beforeIntake = async () => {
      entered.resolve();
      await gate.promise;
    };
    const h = await host({ ...f.config, runtime: f.runtime });
    const request = httpRequest({
      host: '127.0.0.1',
      port: h.port,
      agent: false,
      method: 'POST',
      path: AUTHENTICATED_OFFICE_COMMAND_PATH,
      headers: { ...headers, authorization: `Bearer ${f.token()}` },
    });
    clients.push(request);
    request.on('error', () => undefined);
    request.end(JSON.stringify(f.envelope(f.request)));
    try {
      await entered.promise;
      request.destroy();
      await expect.poll(() => h.handled.length).toBe(1);
    } finally {
      gate.resolve();
    }
    await drain();
    expect(h.finishes).toEqual([0]);
    clean(h);
    await f.noEffects();
  });
});
