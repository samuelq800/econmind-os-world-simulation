import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createExecutorCommandForwarder } from '../../apps/world-api/src/runtime-preparation/executor-command-forwarder.js';
import { createInternalExecutorCommandHandler } from '../../apps/world-api/src/runtime-preparation/internal-executor-command-handler.js';
import { fixture } from '../support/g-manual-office-api-test-only-fixture.js';
import { runtimeApiHostTestOnlyFixture } from '../support/g-runtime-api-host-test-only-fixture.js';
import {
  deferred,
  jsonRequest,
  readConfig,
} from '../support/G-executor-slices-fixture.js';

describe('G real Node timers for request and cleanup budgets', () => {
  it('an unfinished body expires at5s with zero JWT, SQL and service dispatch', async () => {
    const f = await fixture();
    let jwks = 0,
      dispatches = 0,
      cancelled = false;
    const forward = createExecutorCommandForwarder({
      ...readConfig(f.config),
      auth: {
        ...f.config.auth,
        fetch: (async () => {
          jwks++;
          throw new Error('UNREACHABLE');
        }) as typeof fetch,
      },
      executor: {
        fetch: async () => {
          dispatches++;
          throw new Error('UNREACHABLE');
        },
      },
    });
    const request = new Request(
      'https://api-test-only.example.invalid/v1/office-command',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + f.token(),
          'content-type': 'application/json',
        },
        body: new ReadableStream<Uint8Array>({
          pull() {},
          cancel() {
            cancelled = true;
          },
        }),
        duplex: 'half',
      } as RequestInit,
    );
    const start = Date.now(),
      response = await forward(request),
      elapsed = Date.now() - start;
    expect(response?.status).toBe(408);
    expect(await response?.json()).toMatchObject({
      error: { code: 'BODY_TIMEOUT' },
    });
    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThan(10000);
    expect(cancelled).toBe(true);
    expect(jwks).toBe(0);
    expect(dispatches).toBe(0);
    expect(f.queries).toHaveLength(0);
  });
  it('shared10s expires once; actual late source completion drains inside5s tail with UNKNOWN and no enqueue/replay', async () => {
    const f = await runtimeApiHostTestOnlyFixture(),
      entered = deferred();
    let settled = false,
      ends = 0,
      calls = 0,
      abortedAt = 0;
    f.sourceHooks.afterRead = async () => {
      entered.resolve();
      await new Promise((resolve) => setTimeout(resolve, 10500));
      settled = true;
    };
    for (const pool of [f.config.readPool, f.config.writerPool])
      Object.defineProperty(pool, 'end', {
        value: async () => {
          expect(settled).toBe(true);
          ends++;
        },
      });
    const read = readConfig(f.config);
    const internal = createInternalExecutorCommandHandler({
      read,
      office: { ...f.config, runtime: f.runtime },
      financial: null,
      ownedPools: [f.config.readPool, f.config.writerPool] as Pool[],
    });
    const start = Date.now();
    const forward = createExecutorCommandForwarder({
      ...read,
      executor: {
        fetch: async (request) => {
          calls++;
          request.signal.addEventListener(
            'abort',
            () => {
              abortedAt = Date.now() - start;
            },
            { once: true },
          );
          return internal(request);
        },
      },
    });
    const operation = forward(
      jsonRequest('/v1/office-command', f.envelope(f.request), f.token()),
    );
    await entered.promise;
    const response = await operation,
      elapsed = Date.now() - start;
    expect(await response?.json()).toMatchObject({
      error: { code: 'WRITE_OUTCOME_UNKNOWN', retryable: false },
    });
    expect(abortedAt).toBeGreaterThanOrEqual(9900);
    expect(abortedAt).toBeLessThan(11500);
    expect(elapsed).toBeGreaterThanOrEqual(10500);
    expect(elapsed).toBeLessThan(15000);
    expect(settled).toBe(true);
    expect(ends).toBe(2);
    expect(calls).toBe(1);
    expect((await f.counts()).command_submission).toBe(0);
    expect((await f.counts()).authoritative_event).toBe(0);
  });
});
