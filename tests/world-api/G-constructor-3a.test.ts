import type { Pool, PoolClient } from 'pg';
import { describe, it, expect, vi } from 'vitest';
import {
  CommandRequestIdentityRegistry,
  type CommandRequestIdentityBinding,
} from '../../apps/world-worker/src/runtime-preparation/private-command-request-registry.js';
import {
  createProductionWorldCommandHost,
  boundProductionManualIntakeRuntime,
  WorkerRequestCompletion,
  trackWorkerRequestCompletion,
} from '../../apps/world-worker/src/runtime-preparation/production-world-command-host.js';
import { boundManualOfficeIntakeRuntime } from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
import {
  ExecutorRequestResourceScope,
  type OwnedExecutorPool,
} from '../../apps/world-api/src/runtime-preparation/executor-request-resources.js';
import {
  withCloudflareExecutorRoutePools,
  type ExecutorPoolRoute,
} from '../../apps/world-api/src/runtime-preparation/cloudflare-postgres-pools.js';
import { createSourceOwnedExecutorComposition } from '../../apps/world-api/src/runtime-preparation/source-owned-executor-composition.js';
import { EXECUTOR_PATHS } from '../../apps/world-api/src/runtime-preparation/bounded-executor-transport.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function identity() {
  // Disjoint mechanism registry; these objects NEVER pass production binding.
  const registry = new CommandRequestIdentityRegistry(),
    host = Object.freeze({});
  registry.registerHost(host, 'WORLD_TEST_ONLY');
  const binding: CommandRequestIdentityBinding = {
    host,
    worldId: 'WORLD_TEST_ONLY',
    route: '/v1/office-command',
    intakePool: {},
    sourcePool: {},
    clock: {},
    generation: 0,
  };
  return { registry, host, binding, runtime: registry.issueRequest(binding) };
}
function poolPort(
  end: () => Promise<void>,
  connect?: () => Promise<PoolClient>,
): OwnedExecutorPool {
  // Explicit resource port only, no SQL/admission/economic service success.
  return {
    end,
    connect:
      connect ??
      (async () => {
        throw new Error('TEST_ONLY_NO_SQL');
      }),
  } as OwnedExecutorPool;
}
const turns = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('3A private identity mechanism; no formal production token', () => {
  it.each(['spread', 'json', 'prototype', 'proxy'] as const)(
    'rejects %s runtime copies',
    (kind) => {
      const f = identity();
      const copy =
        kind === 'spread'
          ? { ...f.runtime }
          : kind === 'json'
            ? (JSON.parse(JSON.stringify(f.runtime)) as object)
            : kind === 'prototype'
              ? (Object.create(f.runtime) as object)
              : new Proxy(f.runtime, {});
      expect(f.registry.bound(f.runtime, f.binding)).toBe(true);
      expect(f.registry.bound(copy, f.binding)).toBe(false);
      expect(
        boundProductionManualIntakeRuntime(f.runtime, {
          pool: f.binding.intakePool,
          clock: f.binding.clock,
          worldId: f.binding.worldId,
        }),
      ).toBe(false);
      expect(
        boundManualOfficeIntakeRuntime(f.runtime as never, {
          pool: f.binding.intakePool as Pool,
          clock: f.binding.clock as never,
          worldId: f.binding.worldId,
        }),
      ).toBe(false);
      expect('consumer' in f.runtime).toBe(false);
      expect('start' in f.runtime).toBe(false);
    },
  );
  it.each([
    'host',
    'worldId',
    'route',
    'intakePool',
    'sourcePool',
    'clock',
    'generation',
  ] as const)('rejects another %s', (key) => {
    const f = identity();
    const changes = {
      host: {},
      worldId: 'WORLD_OTHER',
      route: '/v1/financial-intake',
      intakePool: {},
      sourcePool: {},
      clock: {},
      generation: 1,
    };
    expect(
      f.registry.bound(f.runtime, { ...f.binding, [key]: changes[key] }),
    ).toBe(false);
  });
  it('retires exactly one request and stop invalidates generation without freezing borrowed ports', () => {
    const f = identity(),
      other = f.registry.issueRequest(f.binding);
    f.registry.retire(f.runtime);
    f.registry.retire(f.runtime);
    expect(f.registry.bound(f.runtime, f.binding)).toBe(false);
    expect(f.registry.bound(other, f.binding)).toBe(true);
    expect(Object.isFrozen(f.binding.clock)).toBe(false);
    f.registry.stop(f.host);
    f.registry.stop(f.host);
    expect(f.registry.generation(f.host)).toBe(1);
    expect(f.registry.bound(other, f.binding)).toBe(false);
    expect(() =>
      f.registry.issueRequest({ ...f.binding, generation: 1 }),
    ).toThrow('REQUEST_IDENTITY_NOT_BOUND');
  });
  it('has no positive binding type or runtime input bypass, including borrowed methods', async () => {
    const callback = vi.fn(() => {
      throw new Error('MUST_NOT_RUN');
    });
    const forged = new Proxy({}, { get: callback });
    const host = createProductionWorldCommandHost(forged as never);
    expect(host.diagnostics()).toMatchObject({ status: 'HOLD' });
    expect(host.openIntakeRequest(forged)).toBeNull();
    expect(callback).not.toHaveBeenCalled();
    expect('consumer' in host).toBe(false);
    expect('start' in host).toBe(false);
    const clone = { ...host };
    expect(clone.openIntakeRequest(forged)).toBeNull();
    expect(() => clone.diagnostics()).toThrow('HOST_IDENTITY_REQUIRED');
    await expect(clone.stop()).rejects.toThrow('HOST_IDENTITY_REQUIRED');
    await host.stop();
    await host.stop();
    expect(host.openIntakeRequest(forged)).toBeNull();
  });
  it('production composition stays HOLD for all fixed routes and rejects aliases, without I/O', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('NO_IO'));
    try {
      const callback = vi.fn(),
        composition = createSourceOwnedExecutorComposition({
          ready: true,
          source: callback,
          drain: callback,
        } as never);
      for (const url of Object.values(EXECUTOR_PATHS)) {
        const response = await composition.handle(
          new Request(url, { method: 'POST', body: 'ignored' }),
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
          error: { code: 'NOT_CONNECTED' },
        });
      }
      for (const suffix of ['?route=/v1/office-command', '/', '#alias'])
        expect(
          (
            await composition.handle(
              new Request(EXECUTOR_PATHS['/v1/office-command'] + suffix),
            )
          ).status,
        ).toBe(404);
      expect(callback).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      await composition.stop();
    } finally {
      fetch.mockRestore();
    }
  });
});

describe('3A fixed route resources; real pg Pool allocation with zero connections', () => {
  it('ends all actual route pools after an operation fails without replay', async () => {
    const connectionString = 'postgres://TEST_ONLY@127.0.0.1/TEST_ONLY';
    let owned: Pool[] = [];
    let calls = 0;
    await expect(
      withCloudflareExecutorRoutePools(
        '/v1/office-command',
        {
          readerConnectionString: connectionString,
          intake: { kind: 'MANUAL', connectionString },
          sourceConnectionString: connectionString,
        },
        async (_pools, scope) => {
          calls++;
          owned = scope.inventory() as Pool[];
          throw new Error('TEST_ONLY_OPERATION_FAILED');
        },
      ),
    ).rejects.toThrow('TEST_ONLY_OPERATION_FAILED');
    expect(calls).toBe(1);
    expect(owned).toHaveLength(3);
    expect(
      owned.every(
        (p) => p.totalCount === 0 && (p as unknown as { ended: boolean }).ended,
      ),
    ).toBe(true);
  });
  it('clamps connect timeout to the remaining server deadline and rejects expired budget before allocation', async () => {
    const connectionString = 'postgres://TEST_ONLY@127.0.0.1/TEST_ONLY',
      signal = new AbortController().signal;
    await withCloudflareExecutorRoutePools(
      '/v1/current-seat',
      {
        readerConnectionString: connectionString,
        intake: null,
        sourceConnectionString: null,
      },
      async ({ reader }) => {
        expect(
          (
            reader as unknown as {
              options: { connectionTimeoutMillis: number };
            }
          ).options.connectionTimeoutMillis,
        ).toBeLessThanOrEqual(500);
        expect(reader.totalCount).toBe(0);
      },
      { signal, deadlineMs: Date.now() + 500 },
    );
    const operation = vi.fn(async () => undefined);
    await expect(
      withCloudflareExecutorRoutePools(
        '/v1/current-seat',
        {
          readerConnectionString: connectionString,
          intake: null,
          sourceConnectionString: null,
        },
        operation,
        { signal, deadlineMs: Date.now() - 1 },
      ),
    ).rejects.toThrow('EXECUTOR_REQUEST_EXPIRED');
    expect(operation).not.toHaveBeenCalled();
  });
  it.each([
    '/v1/office-command',
    '/v1/financial-intake',
    '/v1/command-recovery',
    '/v1/current-seat',
  ] as const)(
    '%s selects only its pools and awaits actual end',
    async (route) => {
      let observed: Pool[] = [];
      await withCloudflareExecutorRoutePools(
        route,
        {
          readerConnectionString: 'postgres://TEST_ONLY@127.0.0.1/TEST_ONLY',
          intake:
            route === '/v1/office-command'
              ? {
                  kind: 'MANUAL',
                  connectionString:
                    'postgres://MANUAL_TEST_ONLY@127.0.0.1/TEST_ONLY',
                }
              : route === '/v1/financial-intake'
                ? {
                    kind: 'FINANCIAL',
                    connectionString:
                      'postgres://FINANCIAL_TEST_ONLY@127.0.0.1/TEST_ONLY',
                  }
                : null,
          sourceConnectionString:
            route === '/v1/office-command' || route === '/v1/financial-intake'
              ? 'postgres://SOURCE_TEST_ONLY@127.0.0.1/TEST_ONLY'
              : null,
        },
        async (pools, scope) => {
          observed = scope.inventory() as Pool[];
          const max = observed.map(
            (p) => (p as unknown as { options: { max: number } }).options.max,
          );
          expect(max).toEqual(pools.intake ? [2, 2, 1] : [2]);
          expect(max.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5);
          expect(observed.every((p) => p.totalCount === 0)).toBe(true);
          expect(() => scope.own(poolPort(async () => undefined))).toThrow(
            'EXECUTOR_POOL_BUDGET_EXCEEDED',
          );
        },
      );
      expect(
        observed.every((p) => (p as unknown as { ended: boolean }).ended),
      ).toBe(true);
    },
  );
  it('rejects mismatched intake/extra recovery sources and unknown paths before callback/allocation', async () => {
    const operation = vi.fn(async () => undefined),
      connectionString = 'postgres://TEST_ONLY@127.0.0.1/TEST_ONLY';
    for (const [route, intake, source] of [
      [
        '/v1/office-command',
        { kind: 'FINANCIAL', connectionString },
        connectionString,
      ],
      [
        '/v1/financial-intake',
        { kind: 'MANUAL', connectionString },
        connectionString,
      ],
      ['/v1/command-recovery', { kind: 'MANUAL', connectionString }, null],
      ['/v1/current-seat', null, connectionString],
    ] as const)
      await expect(
        withCloudflareExecutorRoutePools(
          route,
          {
            readerConnectionString: connectionString,
            intake,
            sourceConnectionString: source,
          },
          operation,
        ),
      ).rejects.toThrow('EXECUTOR_ROUTE_POOL_MISMATCH');
    await expect(
      withCloudflareExecutorRoutePools(
        '/unknown' as ExecutorPoolRoute,
        {
          readerConnectionString: connectionString,
          intake: null,
          sourceConnectionString: null,
        },
        operation,
      ),
    ).rejects.toThrow('EXECUTOR_ROUTE_INVALID');
    expect(operation).not.toHaveBeenCalled();
  });
  it('validates all selected connection strings before creating resources', async () => {
    const operation = vi.fn(async () => undefined);
    await expect(
      withCloudflareExecutorRoutePools(
        '/v1/office-command',
        {
          readerConnectionString: 'postgres://TEST_ONLY@127.0.0.1/TEST_ONLY',
          intake: { kind: 'MANUAL', connectionString: 'not a credential URL' },
          sourceConnectionString: 'postgres://TEST_ONLY@127.0.0.1/TEST_ONLY',
        },
        operation,
      ),
    ).rejects.toThrow('CLOUDFLARE_POSTGRES_CONNECTION_INVALID');
    expect(operation).not.toHaveBeenCalled();
  });
});

describe('3A actual completion/close ordering on explicit resource ports', () => {
  it('inherits external abort immediately, refuses new operations and joins the late client', async () => {
    const abort = new AbortController(),
      scope = new ExecutorRequestResourceScope(1, abort.signal),
      late = deferred<PoolClient>();
    const release = vi.fn(),
      operation = vi.fn(async () => undefined),
      end = vi.fn(async () => undefined);
    const pool = poolPort(end, () => late.promise);
    scope.own(pool);
    const pending = scope
      .withWorkerConnection(pool, operation)
      .catch((e) => e as Error);
    abort.abort();
    expect(scope.signal.aborted).toBe(true);
    expect(() => scope.run(() => operation())).toThrow('REQUEST_SCOPE_RETIRED');
    const closing = scope.close();
    await turns();
    expect(end).not.toHaveBeenCalled();
    late.resolve({ release } as unknown as PoolClient);
    expect(await pending).toMatchObject({ message: 'REQUEST_SCOPE_CANCELLED' });
    await closing;
    expect(release).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(operation).not.toHaveBeenCalled();
  });
  it('joins late connect after abort, discards client before end, retires before closing once', async () => {
    const scope = new ExecutorRequestResourceScope(),
      connection = deferred<PoolClient>(),
      api = deferred<void>(),
      events: string[] = [];
    const release = vi.fn(() => {
      events.push('release');
    });
    const pool = poolPort(
      async () => {
        expect(scope.worker.retired()).toBe(true);
        events.push('end');
      },
      () => connection.promise,
    );
    scope.own(pool);
    scope.own(pool);
    const operation = vi.fn(async () => undefined);
    const pending = scope
      .withWorkerConnection(pool, operation)
      .catch((e) => e as Error);
    scope.api.track(
      api.promise.then(() => {
        events.push('api-settled');
      }),
    );
    const closing = scope.close();
    expect(scope.close()).toBe(closing);
    await turns();
    expect(events).toEqual([]);
    api.resolve();
    await turns();
    expect(events).toEqual(['api-settled']);
    connection.resolve({ release } as unknown as PoolClient);
    expect(await pending).toMatchObject({ message: 'REQUEST_SCOPE_CANCELLED' });
    await closing;
    expect(events).toEqual(['api-settled', 'release', 'end']);
    expect(release).toHaveBeenCalledOnce();
    expect(release.mock.calls[0]?.length).toBe(1);
    expect(operation).not.toHaveBeenCalled();
    expect(scope.api.pending()).toBe(0);
    expect(scope.worker.pending()).toBe(0);
    expect(scope.cleanupFailed()).toBe(false);
    expect(scope.closed()).toBe(true);
    await expect(scope.withWorkerConnection(pool, operation)).rejects.toThrow(
      'REQUEST_SCOPE_RETIRED',
    );
  });
  it('rejoins API work registered by a finite Worker operation before ending any pool', async () => {
    const scope = new ExecutorRequestResourceScope(),
      worker = deferred<void>(),
      lateApi = deferred<void>(),
      events: string[] = [];
    scope.own(
      poolPort(async () => {
        events.push('end');
      }),
    );
    scope.worker.track(
      worker.promise.then(() => {
        scope.api.track(lateApi.promise);
        events.push('worker-settled');
      }),
    );
    const closing = scope.close();
    await turns();
    worker.resolve();
    await turns();
    expect(events).toEqual(['worker-settled']);
    lateApi.resolve();
    await closing;
    expect(events).toEqual(['worker-settled', 'end']);
  });
  it('closes an already registered resource after subsequent construction fails', async () => {
    const scope = new ExecutorRequestResourceScope(),
      end = vi.fn(async () => undefined);
    scope.own(poolPort(end));
    try {
      scope.own({
        connect: async () => {
          throw new Error('NOT_USED');
        },
      } as unknown as OwnedExecutorPool);
    } catch (error) {
      expect(error).toMatchObject({
        message: 'EXECUTOR_POOL_OWNERSHIP_REQUIRED',
      });
    }
    await scope.close();
    expect(end).toHaveBeenCalledOnce();
  });
  it.each(['release', 'end'] as const)(
    'never certifies clean completion after %s failure',
    async (failure) => {
      const scope = new ExecutorRequestResourceScope();
      const pool = poolPort(
        async () => {
          if (failure === 'end') throw new Error('TEST_ONLY_END_FAILED');
        },
        async () =>
          ({
            release() {
              if (failure === 'release')
                throw new Error('TEST_ONLY_RELEASE_FAILED');
            },
          }) as unknown as PoolClient,
      );
      scope.own(pool);
      await scope.withWorkerConnection(pool, async () => undefined);
      await scope.close();
      expect(scope.cleanupFailed()).toBe(true);
      expect(scope.worker.retired()).toBe(true);
      expect(scope.api.pending() + scope.worker.pending()).toBe(0);
    },
  );
  it('tracks real finite Worker promises within its own async context and refuses retired run', async () => {
    const completion = new WorkerRequestCompletion(),
      late = deferred<void>();
    completion.run(() => {
      trackWorkerRequestCompletion(late.promise);
    });
    expect(completion.pending()).toBe(1);
    expect(() => completion.retire()).toThrow('WORKER_REQUEST_NOT_DRAINED');
    const drained = completion.drain();
    late.resolve();
    await drained;
    completion.retire();
    expect(() => completion.run(() => undefined)).toThrow(
      'WORKER_REQUEST_RETIRED',
    );
  });
});
