import {
  createServer,
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type ServerResponse,
  type Server,
  type IncomingHttpHeaders,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { WORLD_MODEL_VERSION } from '@econmind/core';
import { AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA } from '@econmind/core/authenticated-financial-intake-contract';
import {
  createNonactivatedRuntimeApiHost,
  type NonactivatedRuntimeApiHostInput,
} from '../../apps/world-api/src/integration/nonactivated-runtime-api-host.js';
import {
  G_HOST_TEST_ORIGIN as origin,
  runtimeApiHostTestOnlyFixture,
} from '../support/g-runtime-api-host-test-only-fixture.js';

// TEST_ONLY loopback HTTP, never TLS or an external registered Host/Worker.
const servers: Server[] = [],
  clients: ClientRequest[] = [];
afterEach(async () => {
  for (const c of clients.splice(0)) c.destroy();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      s.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
async function host(
  input: NonactivatedRuntimeApiHostInput | null = null,
  duplicate = false,
) {
  const api = createNonactivatedRuntimeApiHost(input);
  const incoming: IncomingMessage[] = [],
    outgoing: ServerResponse[] = [];
  const handled: boolean[] = [],
    finishes: number[] = [],
    reused: boolean[] = [],
    errors: unknown[] = [];
  const server = createServer((req, res) => {
    const index = incoming.length;
    incoming.push(req);
    outgoing.push(res);
    finishes.push(0);
    res.on('finish', () => {
      finishes[index] = finishes[index]! + 1;
    });
    const pending = api.handle(req, res);
    if (duplicate) reused.push(api.handle(req, res) === pending);
    void pending
      .then((result) => {
        handled.push(result);
        // Public-router sentinel only; it is not private authority or a source.
        if (!result) {
          res.writeHead(req.url === '/healthz' ? 200 : 404);
          res.end();
        }
      })
      .catch((e: unknown) => {
        errors.push(e);
        res.destroy();
      });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    api,
    port: (server.address() as AddressInfo).port,
    incoming,
    outgoing,
    handled,
    finishes,
    reused,
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
  path: string,
  body: unknown = {},
  authorization = 'Bearer TEST_ONLY',
  options: {
    method?: string;
    origin?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        agent: false,
        path,
        method: options.method ?? 'POST',
        headers: {
          origin: options.origin ?? origin,
          authorization,
          'content-type': 'application/json',
          ...options.headers,
        },
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
    clients.push(req);
    req.once('error', reject);
    req.setTimeout(15000, () =>
      req.destroy(new Error('TEST_ONLY_SOCKET_TIMEOUT')),
    );
    req.end(JSON.stringify(body));
  });
}
function parsed(reply: Reply) {
  return JSON.parse(reply.body) as Record<string, unknown>;
}
function privateReply(reply: Reply) {
  expect(reply.headers['cache-control']).toBe('private, no-store');
  expect(reply.headers['access-control-allow-credentials']).toBeUndefined();
}
function rejected(reply: Reply, status: number, code: string) {
  expect(reply.status).toBe(status);
  expect(parsed(reply)).toMatchObject({ ok: false, error: { code } });
  privateReply(reply);
}
function changed(f: Awaited<ReturnType<typeof runtimeApiHostTestOnlyFixture>>) {
  const input = f.input;
  return {
    ...input,
    read: {
      ...input.read,
      endpointPins: { ...input.read.endpointPins },
      admittedWorldPins: { ...input.read.admittedWorldPins },
      auth: { ...input.read.auth },
      routeOptions: {
        ...input.read.routeOptions,
        allowedOrigins: [...input.read.routeOptions.allowedOrigins],
      },
    },
    financial: {
      ...input.financial!,
      composition: {
        ...input.financial!.composition!,
        admittedWorldPins: {
          ...input.financial!.composition!.admittedWorldPins,
        },
        auth: { ...input.financial!.composition!.auth },
      },
    },
    office: {
      ...input.office!,
      composition: {
        ...input.office!.composition!,
        admittedWorldPins: { ...input.office!.composition!.admittedWorldPins },
        auth: { ...input.office!.composition!.auth },
      },
    },
  };
}
async function drain() {
  await nextTurn();
  await nextTurn();
  await nextTurn();
}
function gate() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

describe('source-only nonactivated aggregate: actual constructors/socket/service', () => {
  it('real signed JWT/current SQL classified read -> real source/private Office runtime queues once -> current SQL re-read, with no receipt/activation', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      h = await host(f.input, true);
    const auth = `Bearer ${f.token()}`;
    const read = await send(h.port, '/v1/world-read', f.readRequest, auth);
    expect(read.status).toBe(200);
    privateReply(read);
    expect(parsed(read)).toMatchObject({
      ok: true,
      authority: {
        identity: { modelVersion: WORLD_MODEL_VERSION },
        readback: { worldVersion: '0', eventSequence: '0' },
      },
      result: {
        ok: true,
        data: {
          payload: {
            officeId: 'CAPTAIN',
            ledger: {
              visibility: {
                financialDetail: 'NOT_AUTHORIZED',
                inventoryDetail: 'NOT_AUTHORIZED',
              },
            },
          },
        },
      },
    });
    const queued = await send(
      h.port,
      '/v1/office-command',
      f.envelope(f.request),
      auth,
    );
    expect(queued.status).toBe(202);
    privateReply(queued);
    expect(parsed(queued)).toMatchObject({
      ok: true,
      state: { status: 'QUEUED', source: 'NEW', submitted: true },
    });
    f.server.simTime = '32000';
    const retry = await send(
      h.port,
      '/v1/office-command',
      f.envelope(f.request),
      auth,
    );
    expect(retry.status).toBe(200);
    expect(parsed(retry)).toMatchObject({
      state: { status: 'QUEUED', source: 'EXISTING', submitted: false },
    });
    const refreshed = await send(h.port, '/v1/world-read', f.readRequest, auth);
    expect(refreshed.status).toBe(200);
    expect(parsed(refreshed)).toMatchObject({ ok: true, result: { ok: true } });
    const financial = await send(
      h.port,
      '/v1/financial-intake',
      {
        schemaVersion: AUTHENTICATED_FINANCIAL_INTAKE_SCHEMA,
        requestId: f.envelope().requestId,
        request: {
          schemaVersion: 'world-staged-transfer-v1',
          action: 'INSPECT',
          worldId: f.request.worldId,
          countryId: f.request.countryId,
          officeId: 'CAPTAIN',
          commandId: f.request.commandId,
          idempotencyKey: f.request.idempotencyKey,
        },
      },
      auth,
    );
    rejected(financial, 400, 'OFFICE_COMMAND_FAMILY_UNSUPPORTED');
    const final = await send(
      h.port,
      '/v1/world-final',
      {
        schemaVersion: 'world-final-receipt-read-v1',
        operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
        requestId: f.envelope().requestId,
        payload: {
          worldId: f.request.worldId,
          commandId: f.request.commandId,
          idempotencyKey: f.request.idempotencyKey,
        },
      },
      auth,
    );
    expect(final.body).not.toContain('COMMITTED');
    expect(parsed(final)).not.toHaveProperty('receipt');
    for (const reply of [queued, retry]) {
      expect(parsed(reply)).not.toHaveProperty('receipt');
      expect(reply.body).not.toContain('COMMITTED');
    }
    expect(await f.counts()).toEqual({
      command_submission: 1,
      command_queue: 1,
      authoritative_event: 0,
      command_receipt: 0,
      financial_posting_batch: 0,
      inventory_posting: 0,
    });
    expect(f.runtime.consumer.state()).toBe('PREPARED');
    expect(f.server.clockCalls).toBe(1);
    expect(h.api).toMatchObject({
      simulationEnabled: false,
      workerActivationAllowed: false,
      clockActivationAllowed: false,
    });
    await drain();
    expect(h.reused.every(Boolean)).toBe(true);
    expect(h.finishes.every((n) => n === 1)).toBe(true);
    expect(h.errors).toEqual([]);
  });
  it('null default claims no path, and explicit null command compositions stay disconnected', async () => {
    const disabled = await host();
    expect(disabled.api.configuration).toBeNull();
    for (const path of [
      '/v1/world-read',
      '/v1/world-final',
      '/v1/financial-intake',
      '/v1/office-command',
    ])
      expect((await send(disabled.port, path)).status).toBe(404);
    expect(disabled.handled).toEqual([false, false, false, false]);
    const f = await runtimeApiHostTestOnlyFixture();
    const h = await host({ ...f.input, financial: null, office: null });
    for (const path of ['/v1/financial-intake', '/v1/office-command'])
      rejected(await send(h.port, path), 503, 'NOT_CONNECTED');
    await f.noEffects();
  });
  it('genuine default service without runtime or a copied private runtime cannot enable intake', async () => {
    const f = await runtimeApiHostTestOnlyFixture();
    for (const runtime of [null, { ...f.runtime }]) {
      const input = changed(f);
      input.office.composition.runtime = runtime;
      const h = await host(input);
      rejected(
        await send(
          h.port,
          '/v1/office-command',
          f.envelope(f.request),
          `Bearer ${f.token()}`,
        ),
        503,
        'SOURCE_RUNTIME_UNAVAILABLE',
      );
    }
    await f.noEffects();
  });
  it('actual current SQL revocation denies read and command independently; no cached binding supplies authority', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      h = await host(f.input);
    expect(
      (
        await send(
          h.port,
          '/v1/world-read',
          f.readRequest,
          `Bearer ${f.token()}`,
        )
      ).status,
    ).toBe(200);
    await f.admin(
      'update world_v2.current_commit_authorization set active=false',
    );
    rejected(
      await send(
        h.port,
        '/v1/world-read',
        f.readRequest,
        `Bearer ${f.token()}`,
      ),
      200,
      'NOT_CONNECTED',
    );
    rejected(
      await send(
        h.port,
        '/v1/office-command',
        f.envelope(f.request),
        `Bearer ${f.token()}`,
      ),
      403,
      'CURRENT_SEAT_OR_ADMISSION_REQUIRED',
    );
    await f.noEffects();
  });
  it('COMMIT ack loss remains nonretryable UNKNOWN through duplicate mount calls; only explicit retry reads existing queue', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      h = await host(f.input, true);
    f.hooks.loseCommit = true;
    const unknown = await send(
      h.port,
      '/v1/office-command',
      f.envelope(f.request),
      `Bearer ${f.token()}`,
    );
    rejected(unknown, 503, 'WRITE_OUTCOME_UNKNOWN');
    expect(parsed(unknown)).toMatchObject({ error: { retryable: false } });
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
    f.hooks.loseCommit = false;
    expect(
      parsed(
        await send(
          h.port,
          '/v1/office-command',
          f.envelope(f.request),
          `Bearer ${f.token()}`,
        ),
      ),
    ).toMatchObject({ state: { source: 'EXISTING', submitted: false } });
    expect(
      f.queries.filter((q) =>
        /insert into world_v2.command_submission/iu.test(q.sql),
      ),
    ).toHaveLength(1);
    await drain();
    expect(h.finishes).toEqual([1, 1]);
    expect(h.reused).toEqual([true, true]);
    expect(h.errors).toEqual([]);
  });
  it('snapshots metadata and preserves the owner-provided immutable clock identity; reassignment cannot redirect or switch authority', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      h = await host(f.input);
    Reflect.set(f.input.read.endpointPins, 'projectionPath', '/v1/changed');
    Reflect.set(f.input.read.admittedWorldPins, 'worldId', 'WORLD_OTHER');
    Reflect.set(
      f.input.read.auth,
      'expectedIssuer',
      'https://changed.example.invalid',
    );
    Reflect.set(
      f.input.office!.composition!.admittedWorldPins,
      'admissionRef',
      'ADMISSION_OTHER',
    );
    Reflect.set(
      f.input.office!.composition!.auth,
      'expectedIssuer',
      'https://changed.example.invalid',
    );
    Reflect.set(f.input.office!.composition!, 'runtime', null);
    Reflect.set(f.input.office!.composition!, 'writerPool', null);
    (f.input.read.routeOptions.allowedOrigins as string[]).splice(
      0,
      1,
      'https://changed.example.invalid',
    );
    expect(Reflect.set(f.config.clock, 'simTime', async () => '999999')).toBe(
      false,
    );
    expect(
      Reflect.set(
        h.api.configuration!.endpointPins,
        'projectionPath',
        '/v1/changed',
      ),
    ).toBe(false);
    expect(Object.isFrozen(h.api.configuration!.admittedWorldPins)).toBe(true);
    expect(
      (
        await send(
          h.port,
          '/v1/world-read',
          f.readRequest,
          `Bearer ${f.token()}`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          h.port,
          '/v1/office-command',
          f.envelope(f.request),
          `Bearer ${f.token()}`,
        )
      ).status,
    ).toBe(202);
    expect((await send(h.port, '/v1/changed')).status).toBe(404);
    expect(f.server.simTime).toBe('16000');
  });
  it('real client disconnect aborts the actual intake, cleans transport and suppresses late SQL/responses', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      entered = gate(),
      held = gate();
    f.hooks.beforeIntake = async () => {
      entered.resolve();
      await held.promise;
    };
    const h = await host(f.input, true);
    const req = httpRequest({
      host: '127.0.0.1',
      port: h.port,
      path: '/v1/office-command',
      method: 'POST',
      agent: false,
      headers: {
        origin,
        authorization: `Bearer ${f.token()}`,
        'content-type': 'application/json',
      },
    });
    clients.push(req);
    req.on('error', () => undefined);
    req.end(JSON.stringify(f.envelope(f.request)));
    try {
      await entered.promise;
      req.destroy();
      await expect.poll(() => h.handled.length).toBe(1);
    } finally {
      held.resolve();
    }
    await drain();
    await f.noEffects();
    expect(h.finishes).toEqual([0]);
    expect(h.reused).toEqual([true]);
    expect(h.errors).toEqual([]);
    expect(h.incoming[0]!.listenerCount('data')).toBe(0);
    expect(h.incoming[0]!.listenerCount('aborted')).toBe(0);
    expect(h.outgoing[0]!.listenerCount('close')).toBe(0);
  });
});

describe('aggregate exact paths and immutable consistency inputs', () => {
  it('public/health/lobby and aliases remain caller fallthrough; all four canonical paths enforce private CORS/methods', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      h = await host(f.input);
    for (const path of [
      '/healthz',
      '/readyz',
      '/auth',
      '/storage',
      '/v1/season1/my-team',
      '/v1/world-data/countries',
      '/v1/world-read/',
      '/v1/world-read?x=1',
      '/v1/%77orld-read',
      '/v1/world-final?x=1',
      '/v1/financial-intake/',
      '/v1/office-command?x=1',
      '/v1/%6fffice-command',
    ]) {
      const reply = await send(h.port, path);
      expect(reply.status).toBe(path === '/healthz' ? 200 : 404);
      expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    }
    for (const path of [
      '/v1/world-read',
      '/v1/world-final',
      '/v1/financial-intake',
      '/v1/office-command',
    ]) {
      const denied = await send(h.port, path, {}, 'Bearer TEST_ONLY', {
        origin: 'https://elsewhere.example.invalid',
      });
      rejected(denied, 403, 'ORIGIN_DENIED');
      const preflight = await send(h.port, path, {}, 'Bearer TEST_ONLY', {
        method: 'OPTIONS',
        headers: {
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Authorization, Content-Type',
        },
      });
      expect(preflight.status).toBe(204);
      privateReply(preflight);
    }
    await f.noEffects();
  });
  it('rejects collisions, noncanonical aliases and public shadowing before any pool query', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      before = f.queries.length;
    for (const path of [
      '/v1/financial-intake',
      '/v1/office-command',
      '/v1/world-final',
    ]) {
      const input = changed(f);
      input.read.endpointPins.projectionPath = path;
      expect(() => createNonactivatedRuntimeApiHost(input)).toThrow(
        'RUNTIME_API_PATH_CONFLICT',
      );
    }
    for (const path of [
      '/healthz',
      '/v1/season1/my-team',
      '/v1/world-data/countries',
      '/local/read',
      '/v1/read?x=1',
      '/v1/%72ead',
      '/v1/read/',
      'https://api-test-only.example.invalid/v1/read',
    ]) {
      const input = changed(f);
      input.read.endpointPins.projectionPath = path;
      expect(() => createNonactivatedRuntimeApiHost(input)).toThrow(
        'RUNTIME_API_ENDPOINTS_INVALID',
      );
    }
    const financial = changed(f);
    financial.financial.path = '/v1/office-command';
    expect(() => createNonactivatedRuntimeApiHost(financial)).toThrow(
      'RUNTIME_API_ENDPOINTS_INVALID',
    );
    expect(f.queries.length).toBe(before);
  });
  it('rejects inconsistent model, every world pin, auth and origins; no equal labels substitute another read port', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      before = f.queries.length;
    expect(() =>
      createNonactivatedRuntimeApiHost({
        ...f.input,
        modelVersion: 'OTHER' as typeof WORLD_MODEL_VERSION,
      }),
    ).toThrow('RUNTIME_API_MODEL_MISMATCH');
    for (const key of [
      'worldId',
      'seedRef',
      'contentHash',
      'admissionRef',
      'minimumWorldVersion',
    ] as const) {
      const input = changed(f);
      Reflect.set(input.office.composition.admittedWorldPins, key, 'OTHER');
      expect(() => createNonactivatedRuntimeApiHost(input)).toThrow(
        'RUNTIME_API_WORLD_PINS_MISMATCH',
      );
    }
    for (const key of [
      'projectRef',
      'expectedIssuer',
      'jwksUrl',
      'audience',
    ] as const) {
      const input = changed(f);
      Reflect.set(input.financial.composition.auth, key, 'OTHER');
      expect(() => createNonactivatedRuntimeApiHost(input)).toThrow(
        'RUNTIME_API_AUTH_MISMATCH',
      );
    }
    const wrongOrigin = changed(f);
    wrongOrigin.office.allowedOrigins = ['https://elsewhere.example.invalid'];
    expect(() => createNonactivatedRuntimeApiHost(wrongOrigin)).toThrow(
      'RUNTIME_API_ORIGINS_MISMATCH',
    );
    const aliasOrigin = changed(f);
    aliasOrigin.read.routeOptions.allowedOrigins = [origin + '/'];
    expect(() => createNonactivatedRuntimeApiHost(aliasOrigin)).toThrow(
      'RUNTIME_API_ORIGINS_INVALID',
    );
    const otherPool = changed(f);
    const otherFetch = changed(f);
    otherFetch.office.composition.auth.fetch = globalThis.fetch;
    expect(() => createNonactivatedRuntimeApiHost(otherFetch)).toThrow(
      'RUNTIME_API_AUTH_MISMATCH',
    );
    otherPool.financial.composition.readPool = f.config.writerPool;
    expect(() => createNonactivatedRuntimeApiHost(otherPool)).toThrow(
      'RUNTIME_API_READ_PORT_MISMATCH',
    );
    expect(f.queries.length).toBe(before);
  });
  it('rejects a mutable borrowed clock without freezing it, and never mutates caller authority ports', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      input = changed(f);
    const borrowed = { ...f.config.clock };
    input.financial.composition.clock = borrowed;
    expect(Object.isFrozen(borrowed)).toBe(false);
    let accessorReads = 0;
    const accessor = Object.freeze({
      get simTime() {
        accessorReads++;
        return f.config.clock.simTime;
      },
      nowReal: f.config.clock.nowReal,
    });
    input.financial.composition.clock = accessor;
    expect(() => createNonactivatedRuntimeApiHost(input)).toThrow(
      'RUNTIME_API_CLOCK_PORT_MUTABLE',
    );
    input.financial.composition.clock = borrowed;
    expect(accessorReads).toBe(0);
    expect(() => createNonactivatedRuntimeApiHost(input)).toThrow(
      'RUNTIME_API_CLOCK_PORT_MUTABLE',
    );
    expect(Object.isFrozen(borrowed)).toBe(false);
    expect(Object.isFrozen(f.config.readPool)).toBe(false);
    expect(Object.isFrozen(f.config.writerPool)).toBe(false);
    expect(borrowed.simTime).toBe(f.config.clock.simTime);
    expect(input.financial.composition.clock).toBe(borrowed);
    await f.noEffects();
  });
});
