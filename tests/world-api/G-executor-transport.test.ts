import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExecutorCommandForwarder } from '../../apps/world-api/src/runtime-preparation/executor-command-forwarder.js';
import { createInternalExecutorCommandHandler } from '../../apps/world-api/src/runtime-preparation/internal-executor-command-handler.js';
import { createCurrentSeatFetchHandler } from '../../apps/world-api/src/runtime-preparation/current-seat-fetch-handler.js';
import {
  EXECUTOR_PATHS,
  TRANSPORT_VERSION,
  boundedBytes,
  requestBudget,
} from '../../apps/world-api/src/runtime-preparation/bounded-executor-transport.js';
import {
  RequestCompletion,
  trackRequestCompletion,
} from '../../apps/world-api/src/runtime-preparation/request-completion.js';
import { runtimeApiHostTestOnlyFixture } from '../support/g-runtime-api-host-test-only-fixture.js';
import { fixture } from '../support/g-manual-office-api-test-only-fixture.js';
import {
  ORIGIN,
  readConfig,
  deferred,
  socketHost,
  jsonRequest,
} from '../support/G-executor-slices-fixture.js';
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const close of closes.splice(0)) await close();
});
function ownFakePools(f: Awaited<ReturnType<typeof fixture>>) {
  const ends: string[] = [];
  for (const [name, pool] of [
    ['read', f.config.readPool],
    ['writer', f.config.writerPool],
  ] as const)
    Object.defineProperty(pool, 'end', {
      value: async () => {
        ends.push(name);
      },
    });
  return { ends, pools: [f.config.readPool, f.config.writerPool] as Pool[] };
}
describe('G slices1/2 unmounted fixed transport', () => {
  it('default and invalid pins HOLD without body/JWKS/SQL; exact path and CORS', async () => {
    const hold = createExecutorCommandForwarder(),
      seat = createCurrentSeatFetchHandler(),
      internal = createInternalExecutorCommandHandler();
    const req = new Request(
      'https://api-test-only.example.invalid/v1/office-command',
      { method: 'POST' },
    );
    expect((await hold(req))?.status).toBe(503);
    expect(await hold(new Request(req.url + '?alias=1'))).toBeNull();
    expect(await hold(new Request(req.url + '/'))).toBeNull();
    expect(
      (
        await seat(
          new Request('https://api-test-only.example.invalid/v1/current-seat'),
        )
      )?.status,
    ).toBe(503);
    expect(
      (await internal(new Request(EXECUTOR_PATHS['/v1/office-command'])))
        ?.status,
    ).toBe(503);
    const f = await fixture(),
      fetch = vi.fn();
    const forward = createExecutorCommandForwarder({
      ...readConfig(f.config),
      executor: { fetch },
    });
    const preflight = await forward(
      new Request(req.url, {
        method: 'OPTIONS',
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
        },
      }),
    );
    expect(preflight?.status).toBe(204);
    expect(
      (
        await forward(
          new Request(req.url, {
            method: 'OPTIONS',
            headers: {
              origin: ORIGIN,
              'access-control-request-method': 'POST',
              'access-control-request-headers': 'x-actor',
            },
          }),
        )
      )?.status,
    ).toBe(403);
    expect(
      (
        await forward(
          new Request(req.url, {
            method: 'POST',
            headers: { origin: 'https://wrong.invalid' },
          }),
        )
      )?.status,
    ).toBe(403);
    expect(
      (
        await forward(
          jsonRequest(
            '/v1/office-command',
            { ...f.envelope(), actor: 'FORGED' },
            f.token(),
          ),
        )
      )?.status,
    ).toBe(400);
    expect(
      (
        await forward(
          jsonRequest(
            '/v1/office-command',
            f.envelope(),
            f.token(undefined, true),
          ),
        )
      )?.status,
    ).toBe(401);
    const invalid = createExecutorCommandForwarder({
      ...readConfig(f.config),
      admittedWorldPins: { ...f.config.admittedWorldPins, admissionRef: '' },
      executor: { fetch },
    });
    expect(
      (
        await invalid(
          jsonRequest('/v1/office-command', f.envelope(), f.token()),
        )
      )?.status,
    ).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(f.queries).toHaveLength(0);
    await f.noEffects();
  });
  it('two real socket handlers verify signed JWT independently; raw bytes, bearer and fixed headers survive', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      owned = ownFakePools(f);
    let verifications = 0;
    const original = f.config.auth.fetch!;
    const auth = {
      ...f.config.auth,
      fetch: (async (...args: Parameters<typeof fetch>) => {
        verifications++;
        return original(...args);
      }) as typeof fetch,
    };
    const read = { ...readConfig(f.config), auth };
    const office = { ...f.config, auth, runtime: f.runtime };
    const internal = createInternalExecutorCommandHandler({
      read,
      office,
      financial: null,
      ownedPools: owned.pools,
    });
    const executorSocket = await socketHost(internal, true);
    closes.push(executorSocket.close);
    let forwarded: Request | undefined,
      rawInternal: Uint8Array | undefined,
      calls = 0;
    const forward = createExecutorCommandForwarder({
      ...read,
      executor: {
        fetch: async (request) => {
          calls++;
          forwarded = request;
          rawInternal = new Uint8Array(await request.clone().arrayBuffer());
          return fetch(
            'http://127.0.0.1:' +
              executorSocket.port +
              new URL(request.url).pathname,
            {
              method: 'POST',
              headers: request.headers,
              body: rawInternal,
              signal: request.signal,
              redirect: 'manual',
            },
          );
        },
      },
    });
    const api = await socketHost(forward);
    closes.push(api.close);
    const token = f.token(),
      raw = ' \n' + JSON.stringify(f.envelope(f.request), null, 2) + '\n ';
    const start = Date.now();
    const response = await fetch(
      'http://127.0.0.1:' + api.port + '/v1/office-command',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
          origin: ORIGIN,
          cookie: 'NEVER_FORWARD',
          'x-actor': 'FORGED',
          'x-econmind-deadline-ms': '9999999999999999',
        },
        body: raw,
      },
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      ok: true,
      state: { status: 'QUEUED', submitted: true, queued: true },
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(calls).toBe(1);
    expect(verifications).toBe(2);
    expect(Buffer.from(rawInternal!).toString()).toBe(raw);
    expect(forwarded!.url).toBe(EXECUTOR_PATHS['/v1/office-command']);
    expect(forwarded!.redirect).toBe('manual');
    expect(Object.keys(Object.fromEntries(forwarded!.headers)).sort()).toEqual([
      'authorization',
      'content-type',
      'origin',
      'x-econmind-deadline-ms',
      'x-econmind-forward-version',
    ]);
    expect(forwarded!.headers.get('authorization')).toBe('Bearer ' + token);
    expect(
      Number(forwarded!.headers.get('x-econmind-deadline-ms')),
    ).toBeGreaterThanOrEqual(start + 9900);
    expect(
      Number(forwarded!.headers.get('x-econmind-deadline-ms')),
    ).toBeLessThanOrEqual(start + 10100);
    expect(owned.ends.sort()).toEqual(['read', 'writer']);
    expect((await f.counts()).command_submission).toBe(1);
    expect((await f.counts()).authoritative_event).toBe(0);
    expect(
      (await internal(new Request(EXECUTOR_PATHS['/v1/office-command'])))
        .status,
    ).toBe(503);
    expect(api.failures).toEqual([]);
    expect(executorSocket.failures).toEqual([]);
  });
  it('executor rejects a signature changed after API verification before SQL, using the second verifier', async () => {
    const f = await fixture(),
      owned = ownFakePools(f);
    Object.freeze(f.config.clock);
    const read = readConfig(f.config),
      internal = createInternalExecutorCommandHandler({
        read,
        office: f.config,
        financial: null,
        ownedPools: owned.pools,
      });
    const forward = createExecutorCommandForwarder({
      ...read,
      executor: {
        fetch: async (request) => {
          const headers = new Headers(request.headers);
          const token = headers.get('authorization')!;
          const at = token.lastIndexOf('.') + 1;
          headers.set(
            'authorization',
            token.slice(0, at) +
              (token[at] === 'A' ? 'B' : 'A') +
              token.slice(at + 1),
          );
          return internal(new Request(request, { headers }));
        },
      },
    });
    const r = await forward(
      jsonRequest('/v1/office-command', f.envelope(), f.token()),
    );
    expect(r?.status).toBe(401);
    expect(await r?.json()).toMatchObject({
      error: { code: 'AUTHENTICATION_INVALID' },
    });
    expect(f.queries).toHaveLength(0);
    expect(owned.ends).toHaveLength(2);
    await f.noEffects();
  });
  it('private runtime object identity cannot be serialized/replaced by READY', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      owned = ownFakePools(f),
      read = readConfig(f.config);
    const forged = { consumer: f.runtime.consumer } as typeof f.runtime;
    const internal = createInternalExecutorCommandHandler({
      read,
      office: { ...f.config, runtime: forged },
      financial: null,
      ownedPools: owned.pools,
    });
    const forward = createExecutorCommandForwarder({
      ...read,
      executor: { fetch: internal },
    });
    const response = await forward(
      jsonRequest('/v1/office-command', f.envelope(f.request), f.token()),
    );
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({
      ok: false,
      state: { status: 'REJECTED', submitted: false, queued: false },
    });
    expect((await f.counts()).command_submission).toBe(0);
  });
  it('after dispatch lost/truncated/mismatched/oversize replies are UNKNOWN with no replay', async () => {
    const f = await fixture(),
      read = readConfig(f.config);
    for (const kind of [
      'lost',
      'redirect',
      'truncated',
      'foreign',
      'oversize',
    ] as const) {
      let calls = 0;
      const forward = createExecutorCommandForwarder({
        ...read,
        executor: {
          fetch: async () => {
            calls++;
            if (kind === 'lost') throw new Error('TEST_ONLY_ACK_LOSS');
            if (kind === 'redirect')
              return new Response(null, {
                status: 302,
                headers: { location: 'https://forbidden.invalid' },
              });
            if (kind === 'truncated')
              return new Response('{', {
                headers: { 'content-type': 'application/json' },
              });
            if (kind === 'oversize')
              return new Response(' '.repeat(1048577), {
                headers: { 'content-type': 'application/json' },
              });
            return new Response(
              JSON.stringify({
                ...f.envelope(),
                ok: true,
                state: {
                  status: 'QUEUED',
                  queued: true,
                  submitted: true,
                  source: 'NEW',
                  commandId: 'FOREIGN',
                  commandType: f.request.commandType,
                  commandFingerprint: 'sha256:' + 'a'.repeat(64),
                },
              }),
              { headers: { 'content-type': 'application/json' } },
            );
          },
        },
      });
      const r = await forward(
        jsonRequest('/v1/office-command', f.envelope(), f.token()),
      );
      expect(r?.status).toBe(503);
      expect(await r?.json()).toMatchObject({
        ok: false,
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      });
      expect(calls).toBe(1);
    }
    expect(f.queries).toHaveLength(0);
  });
  it('actual source completion drains after Office race, no late enqueue, then owned ends', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      owned = ownFakePools(f),
      entered = deferred(),
      settle = deferred();
    const read = readConfig(f.config),
      abort = new AbortController();
    f.sourceHooks.afterRead = async () => {
      entered.resolve();
      await settle.promise;
    };
    const internal = createInternalExecutorCommandHandler({
      read,
      office: { ...f.config, runtime: f.runtime },
      financial: null,
      ownedPools: owned.pools,
    });
    const forward = createExecutorCommandForwarder({
      ...read,
      executor: { fetch: internal },
    });
    let returned = false;
    const response = forward(
      jsonRequest(
        '/v1/office-command',
        f.envelope(f.request),
        f.token(),
        abort.signal,
      ),
    ).then((r) => {
      returned = true;
      return r;
    });
    await entered.promise;
    abort.abort();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(returned).toBe(false);
    expect(owned.ends).toHaveLength(0);
    settle.resolve();
    const r = await response;
    expect(await r?.json()).toMatchObject({
      error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
    });
    expect(owned.ends).toHaveLength(2);
    expect((await f.counts()).command_submission).toBe(0);
  });
  it('body5s shares outer10s; actual cancellation settles and oversized UTF8 fails before dispatch', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(async () => undefined),
      stream = new ReadableStream<Uint8Array>({ pull() {}, cancel });
    const request = new Request(
      'https://api-test-only.example.invalid/v1/office-command',
      { method: 'POST', body: stream, duplex: 'half' } as RequestInit,
    );
    const budget = requestBudget(request.signal),
      completion = new RequestCompletion();
    const operation = completion.run(() =>
      boundedBytes(request, 16384, budget.signal, true),
    );
    const rejection = expect(operation).rejects.toMatchObject({
      code: 'BODY_TIMEOUT',
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(5001);
    await rejection;
    await completion.drain();
    budget.close();
    expect(cancel).toHaveBeenCalledOnce();
    expect(completion.pending()).toBe(0);
    vi.useRealTimers();
    const f = await fixture(),
      send = vi.fn(),
      forward = createExecutorCommandForwarder({
        ...readConfig(f.config),
        executor: { fetch: send },
      });
    const r = await forward(
      jsonRequest(
        '/v1/office-command',
        { ...f.envelope(), padding: '中'.repeat(6000) },
        f.token(),
      ),
    );
    expect(r?.status).toBe(413);
    expect(send).not.toHaveBeenCalled();
    expect(f.queries).toHaveLength(0);
  });
  it('tracker observes genuine late rejection, including work registered by pending work', async () => {
    const completion = new RequestCompletion(),
      late = deferred(),
      nested = deferred();
    completion.run(() =>
      trackRequestCompletion(
        late.promise.finally(() => {
          trackRequestCompletion(nested.promise);
        }),
      ),
    );
    let drained = false;
    const drain = completion.drain().then(() => {
      drained = true;
    });
    late.reject(new Error('TEST_ONLY_LATE_FAILURE'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(drained).toBe(false);
    nested.resolve();
    await drain;
    expect(completion.pending()).toBe(0);
    expect(completion.failures()).toBe(1);
  });
  it('executor uses earliest supplied deadline, never resetting to its own10s', async () => {
    const f = await fixture(),
      owned = ownFakePools(f);
    Object.freeze(f.config.clock);
    const internal = createInternalExecutorCommandHandler({
      read: readConfig(f.config),
      office: f.config,
      financial: null,
      ownedPools: owned.pools,
    });
    const req = new Request(EXECUTOR_PATHS['/v1/office-command'], {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + f.token(),
        'content-type': 'application/json',
        'x-econmind-forward-version': TRANSPORT_VERSION,
        'x-econmind-deadline-ms': String(Date.now() - 1),
      },
      body: JSON.stringify(f.envelope()),
    });
    expect((await internal(req)).status).toBe(504);
    expect(f.queries).toHaveLength(0);
    expect(owned.ends).toHaveLength(2);
  });
});
