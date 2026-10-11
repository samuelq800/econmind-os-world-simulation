import type { Pool as PgPool, PoolConfig } from 'pg';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCloudflareExecutorRoutePools } from '../../apps/world-api/dist/runtime-preparation/cloudflare-postgres-pools.js';

const observed = vi.hoisted(() => ({ pools: [] as PgPool[] }));
vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg')>();
  return {
    ...actual,
    // Observe every constructor invocation while returning real lazy pg Pools.
    Pool: vi.fn(function (options?: PoolConfig) {
      const pool = new actual.Pool(options);
      observed.pools.push(pool);
      return pool;
    }),
  };
});
const connectionString = 'postgres://TEST_ONLY@127.0.0.1/TEST_ONLY';
type RouteOperation = Parameters<typeof withCloudflareExecutorRoutePools>[2];
const ended = (pool: PgPool) => (pool as unknown as { ended: boolean }).ended;
const max = (pool: PgPool) =>
  (pool as unknown as { options: { max: number } }).options.max;
beforeEach(() => {
  vi.clearAllMocks();
  observed.pools.length = 0;
});
afterEach(async () => {
  // Also close any real lazy pool if an assertion fails.
  await Promise.all(
    observed.pools.filter((pool) => !ended(pool)).map((pool) => pool.end()),
  );
});

describe.each([
  ['/v1/office-command', 'MANUAL'],
  ['/v1/financial-intake', 'FINANCIAL'],
] as const)('F-G3A-01 %s required source', (route, kind) => {
  it.each([
    ['empty', '', 'CLOUDFLARE_POSTGRES_CONNECTION_INVALID'],
    [
      'nonempty-invalid',
      'not a credential URL',
      'CLOUDFLARE_POSTGRES_CONNECTION_INVALID',
    ],
    ['null', null, 'EXECUTOR_ROUTE_POOL_MISMATCH'],
  ] as const)(
    'rejects %s before every allocation and callback',
    async (_partition, sourceConnectionString, message) => {
      const operation = vi.fn(async () => undefined);
      await expect(
        withCloudflareExecutorRoutePools(
          route,
          {
            readerConnectionString: connectionString,
            intake: { kind, connectionString },
            sourceConnectionString,
          },
          operation,
        ),
      ).rejects.toThrow(message);
      expect(Pool).not.toHaveBeenCalled();
      expect(observed.pools).toHaveLength(0);
      expect(operation).not.toHaveBeenCalled();
    },
  );
  it('valid source allocates exactly 2+2+1 and closes without connections', async () => {
    const operation = vi.fn<RouteOperation>(async (pools, scope) => {
      expect(pools.source).not.toBeNull();
      expect(scope.inventory()).toEqual(observed.pools);
      expect(observed.pools.map(max)).toEqual([2, 2, 1]);
      expect(observed.pools.every((pool) => pool.totalCount === 0)).toBe(true);
    });
    await withCloudflareExecutorRoutePools(
      route,
      {
        readerConnectionString: connectionString,
        intake: { kind, connectionString },
        sourceConnectionString: connectionString,
      },
      operation,
    );
    expect(Pool).toHaveBeenCalledTimes(3);
    expect(operation).toHaveBeenCalledOnce();
    expect(
      observed.pools.every((pool) => pool.totalCount === 0 && ended(pool)),
    ).toBe(true);
  });
});

it.each(['/v1/command-recovery', '/v1/current-seat'] as const)(
  'F-G3A-01 preserves reader-only %s',
  async (route) => {
    const operation = vi.fn<RouteOperation>(async (pools) => {
      expect(pools.intake).toBeNull();
      expect(pools.source).toBeNull();
      expect(observed.pools.map(max)).toEqual([2]);
    });
    await withCloudflareExecutorRoutePools(
      route,
      {
        readerConnectionString: connectionString,
        intake: null,
        sourceConnectionString: null,
      },
      operation,
    );
    expect(Pool).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledOnce();
    expect(
      observed.pools.every((pool) => pool.totalCount === 0 && ended(pool)),
    ).toBe(true);
  },
);
