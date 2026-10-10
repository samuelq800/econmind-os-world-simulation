import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createExecutorCommandForwarder } from '../../apps/world-api/src/runtime-preparation/executor-command-forwarder.js';
import { createInternalExecutorCommandHandler } from '../../apps/world-api/src/runtime-preparation/internal-executor-command-handler.js';
import { createAuthenticatedCurrentSeatService } from '../../apps/world-api/src/integration/authenticated-current-seat-service.js';
import { RequestCompletion } from '../../apps/world-api/src/runtime-preparation/request-completion.js';
import {
  EXECUTOR_PATHS,
  TRANSPORT_VERSION,
} from '../../apps/world-api/src/runtime-preparation/bounded-executor-transport.js';
import { fixture } from '../support/g-manual-office-api-test-only-fixture.js';
import {
  deferred,
  readConfig,
  jsonRequest,
} from '../support/G-executor-slices-fixture.js';
describe('G actual promise completion and cleanup failure', () => {
  it('invalid upstream headers and declared oversize still drain actual response body cancellation', async () => {
    const f = await fixture();
    for (const oversized of [false, true]) {
      const entered = deferred(),
        settled = deferred();
      let returned = false;
      const forward = createExecutorCommandForwarder({
        ...readConfig(f.config),
        executor: {
          fetch: async () =>
            new Response(
              new ReadableStream<Uint8Array>({
                cancel() {
                  entered.resolve();
                  return settled.promise;
                },
              }),
              {
                headers: oversized
                  ? {
                      'content-type': 'application/json',
                      'content-length': '1048577',
                    }
                  : { 'content-type': 'text/plain' },
              },
            ),
        },
      });
      const operation = forward(
        jsonRequest('/v1/office-command', f.envelope(), f.token()),
      ).then((r) => {
        returned = true;
        return r;
      });
      await entered.promise;
      expect(returned).toBe(false);
      settled.resolve();
      expect(await (await operation)?.json()).toMatchObject({
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      });
    }
  });
  it('late JWKS fetch and asynchronous body cancel settle before return, zero dispatch', async () => {
    const f = await fixture(),
      fetchEntered = deferred(),
      lateFetch = deferred<Response>(),
      cancelEntered = deferred(),
      cancelSettled = deferred(),
      abort = new AbortController();
    let returned = false,
      dispatches = 0;
    const read = {
      ...readConfig(f.config),
      auth: {
        ...f.config.auth,
        fetch: (async () => {
          fetchEntered.resolve();
          return lateFetch.promise;
        }) as typeof fetch,
      },
    };
    const forward = createExecutorCommandForwarder({
      ...read,
      executor: {
        fetch: async () => {
          dispatches++;
          throw new Error('UNREACHABLE');
        },
      },
    });
    const task = forward(
      jsonRequest('/v1/office-command', f.envelope(), f.token(), abort.signal),
    ).then((r) => {
      returned = true;
      return r;
    });
    await fetchEntered.promise;
    abort.abort();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(returned).toBe(false);
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelEntered.resolve();
          return cancelSettled.promise;
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
    Object.defineProperty(response, 'url', { value: f.config.auth.jwksUrl });
    lateFetch.resolve(response);
    await cancelEntered.promise;
    expect(returned).toBe(false);
    cancelSettled.resolve();
    const r = await task;
    expect(r?.status).toBe(499);
    expect(dispatches).toBe(0);
    expect(f.queries).toHaveLength(0);
  });
  it('JWKS pending body read and cancel are tracked, without orphan rejection', async () => {
    const f = await fixture(),
      entered = deferred(),
      cancelEntered = deferred(),
      cancelSettled = deferred(),
      abort = new AbortController();
    const auth = {
      ...f.config.auth,
      fetch: (async () => {
        const response = new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              entered.resolve();
            },
            cancel() {
              cancelEntered.resolve();
              return cancelSettled.promise;
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
        Object.defineProperty(response, 'url', {
          value: f.config.auth.jwksUrl,
        });
        return response;
      }) as typeof fetch,
    };
    const completion = new RequestCompletion();
    const service = createAuthenticatedCurrentSeatService({
      ...readConfig(f.config),
      auth,
    });
    const task = completion.run(() =>
      service.handle({
        authorization: 'Bearer ' + f.token(),
        request: {
          schemaVersion: 'world-current-seat-v1',
          requestId: f.envelope().requestId,
        },
        signal: abort.signal,
      }),
    );
    await entered.promise;
    abort.abort();
    await task;
    await cancelEntered.promise;
    let drained = false;
    const drain = completion.drain().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(drained).toBe(false);
    cancelSettled.resolve();
    await drain;
    expect(completion.pending()).toBe(0);
    expect(f.queries).toHaveLength(0);
  });
  it('late pool.connect acquisition is destroyed and observed before owned Pool.end and handler return', async () => {
    const f = await fixture(),
      entered = deferred(),
      late = deferred<Awaited<ReturnType<Pool['connect']>>>(),
      abort = new AbortController();
    let returned = false,
      released = false,
      ended = false;
    const pool = {
      connect: async () => {
        entered.resolve();
        return late.promise;
      },
      end: async () => {
        expect(released).toBe(true);
        ended = true;
      },
    } as unknown as Pool;
    const read = { ...readConfig(f.config), pool };
    const internal = createInternalExecutorCommandHandler({
      read,
      office: null,
      financial: null,
      ownedPools: [pool],
    });
    const original = f.envelope();
    const recovery = {
      schemaVersion: 'world-command-recovery-v1',
      requestId: original.requestId,
      request: {
        worldId: f.request.worldId,
        commandId: f.request.commandId,
        idempotencyKey: f.request.idempotencyKey,
        originalRequest: original,
      },
    };
    const req = new Request(EXECUTOR_PATHS['/v1/command-recovery'], {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + f.token(),
        'content-type': 'application/json',
        'x-econmind-forward-version': TRANSPORT_VERSION,
        'x-econmind-deadline-ms': String(Date.now() + 10000),
      },
      body: JSON.stringify(recovery),
      signal: abort.signal,
    });
    const task = internal(req).then((r) => {
      returned = true;
      return r;
    });
    await entered.promise;
    abort.abort();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(returned).toBe(false);
    expect(ended).toBe(false);
    late.resolve({
      release: (destroy: boolean) => {
        expect(destroy).toBe(true);
        released = true;
      },
      query: () => {
        throw new Error('NO_LATE_SQL');
      },
    } as unknown as Awaited<ReturnType<Pool['connect']>>);
    const response = await task;
    expect(response.status).toBe(499);
    expect(ended).toBe(true);
    expect(released).toBe(true);
  });
  it('actual rollback completion and Pool.end rejection are observed; cleanup failure cannot return a definite write result', async () => {
    const f = await fixture(),
      rollback = deferred(),
      entered = deferred();
    Object.freeze(f.config.clock);
    let release = false,
      end = false,
      returned = false;
    const readPool = {
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.startsWith('begin')) return { rows: [], rowCount: 0 };
          if (sql === 'rollback') {
            entered.resolve();
            await rollback.promise;
            return { rows: [], rowCount: 0 };
          }
          throw new Error('TEST_ONLY_SQL_FAILURE');
        },
        release: () => {
          release = true;
        },
      }),
      end: async () => {
        expect(release).toBe(true);
        end = true;
        throw new Error('TEST_ONLY_END_FAILURE');
      },
    } as unknown as Pool;
    const writer = {
      connect: () => {
        throw new Error('NO_WRITER_IO');
      },
      end: async () => undefined,
    } as unknown as Pool;
    const office = { ...f.config, readPool, writerPool: writer },
      read = readConfig(office);
    const internal = createInternalExecutorCommandHandler({
      read,
      office,
      financial: null,
      ownedPools: [readPool, writer],
    });
    const req = new Request(EXECUTOR_PATHS['/v1/office-command'], {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + f.token(),
        'content-type': 'application/json',
        'x-econmind-forward-version': TRANSPORT_VERSION,
        'x-econmind-deadline-ms': String(Date.now() + 10000),
      },
      body: JSON.stringify(f.envelope()),
    });
    const task = internal(req).then((r) => {
      returned = true;
      return r;
    });
    await entered.promise;
    expect(returned).toBe(false);
    expect(end).toBe(false);
    rollback.resolve();
    const r = await task;
    expect(await r.json()).toMatchObject({
      error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
    });
    expect(end).toBe(true);
  });
  it('cleanup exceeding5s is a failed budget, never a fake successful drain', async () => {
    const f = await fixture(),
      endEntered = deferred(),
      finishEnd = deferred();
    const pool = {
      connect: () => {
        throw new Error('NO_SQL');
      },
      end: async () => {
        endEntered.resolve();
        await finishEnd.promise;
      },
    } as unknown as Pool;
    const internal = createInternalExecutorCommandHandler({
      read: { ...readConfig(f.config), pool },
      office: null,
      financial: null,
      ownedPools: [pool],
    });
    vi.useFakeTimers();
    try {
      let returned = false;
      const request = new Request(EXECUTOR_PATHS['/v1/office-command'], {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + f.token(),
          'content-type': 'application/json',
          'x-econmind-forward-version': TRANSPORT_VERSION,
          'x-econmind-deadline-ms': String(Date.now() + 10000),
        },
        body: JSON.stringify(f.envelope()),
      });
      const result = internal(request).then((r) => {
        returned = true;
        return r;
      });
      await endEntered.promise;
      await vi.advanceTimersByTimeAsync(5001);
      expect(returned).toBe(false);
      finishEnd.resolve();
      expect(await (await result).json()).toMatchObject({
        error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
