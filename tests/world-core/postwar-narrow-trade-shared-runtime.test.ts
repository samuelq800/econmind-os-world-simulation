/** Genuine fixed Social instance + transport-only fixtures. No admitted source,
 * approved route, SQL authority or running consumer is manufactured. */
import { beforeAll, describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
  type OfficialLabourSocialOpeningAdoption,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarNarrowTradeSharedDatabase,
  createPostwarNarrowTradeSharedRuntime,
  isPostwarNarrowTradeSharedRuntime,
  readPostwarNarrowTradeSharedRuntime,
} from '../../apps/world-worker/src/preparation/postwar-narrow-trade-shared-runtime.js';
import {
  createPostwarNarrowTradeAuthorizationDatabase,
  NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY,
  NARROW_TRADE_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/preparation/postwar-narrow-trade-reservation-candidate.js';
import { MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY } from '../../apps/world-worker/src/persistence/manual-office-authorization-sql.js';
import { WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
let adoption: OfficialLabourSocialOpeningAdoption;
beforeAll(async () => {
  adoption = await loadPostwarSocialConnectionOpeningAdoption(process.cwd());
});
function fixture() {
  let connections = 0;
  const pool = {
    connect: async () => {
      connections++;
      throw Error('NO_DB_IN_PROTOCOL_TEST');
    },
    query: async () => {
      connections++;
      throw Error('NO_DB_IN_PROTOCOL_TEST');
    },
  } as unknown as Pool;
  const social = createPostwarSocialRuntimeConnection({
    worldId: 'WORLD_TRADE_SHARED_UNIT',
    workerId: 'WORKER_TRADE_SHARED_UNIT',
    workerPool: pool,
    workerRole: 'worker_trade_shared_unit',
    openingAdoption: adoption,
  });
  const clock = Object.freeze({
    nowReal: () => '2026-11-01T00:00:00.000Z',
    simTime: async () => '0',
  });
  return { social, clock, connections: () => connections };
}
describe('fixed internal Trade bootstrap without a pre-existing shared consumer', () => {
  it('constructs all three fixed factories over exactly one prebound DB, with no SQL, lease or consumer start', async () => {
    const f = fixture();
    try {
      const database = createPostwarNarrowTradeSharedDatabase(
        f.social.database,
        f.social.worldId,
      );
      expect(
        createPostwarNarrowTradeSharedDatabase(
          f.social.database,
          f.social.worldId,
        ),
      ).toBe(database);
      expect(
        createPostwarNarrowTradeSharedDatabase(database, f.social.worldId),
      ).toBe(database);
      const runtime = createPostwarNarrowTradeSharedRuntime({
        socialConnection: f.social,
        database,
        clock: f.clock,
        workerRole: 'worker_trade_shared_unit',
      });
      expect(runtime.database).toBe(runtime.reservation.database);
      expect(runtime.database).toBe(runtime.automatic.database);
      expect(runtime.reservation.sourceCommitProtectionPort).toBe(
        runtime.automatic.sourceCommitProtectionPort,
      );
      expect(runtime.reservation.sourceCommitProtectionPort).toBe(
        runtime.source.sourceCommitProtectionPort,
      );
      expect(isPostwarNarrowTradeSharedRuntime(runtime, f.social.worldId)).toBe(
        true,
      );
      expect(isPostwarNarrowTradeSharedRuntime({ ...runtime })).toBe(false);
      expect(() => readPostwarNarrowTradeSharedRuntime({ ...runtime })).toThrow(
        'GENUINE',
      );
      expect(Object.keys(runtime)).not.toContain('consumer');
      expect(f.connections()).toBe(0);
      await f.social.close();
      expect(isPostwarNarrowTradeSharedRuntime(runtime)).toBe(false);
      expect(() => readPostwarNarrowTradeSharedRuntime(runtime)).toThrow(
        'LIVE',
      );
      expect(f.connections()).toBe(0);
    } finally {
      await f.social.close();
    }
  });
  it('rejects structural/cross-role/unprepared database/clock substitutes before doing SQL', async () => {
    const f = fixture();
    try {
      const database = createPostwarNarrowTradeSharedDatabase(
          f.social.database,
          f.social.worldId,
        ),
        valid = {
          socialConnection: f.social,
          database,
          clock: f.clock,
          workerRole: 'worker_trade_shared_unit',
        };
      expect(() =>
        createPostwarNarrowTradeSharedRuntime({
          ...valid,
          socialConnection: { ...f.social },
        }),
      ).toThrow('GENUINE');
      expect(() =>
        createPostwarNarrowTradeSharedRuntime({
          ...valid,
          workerRole: 'worker_foreign',
        }),
      ).toThrow('EXACT_WORKER');
      expect(() =>
        createPostwarNarrowTradeSharedRuntime({
          ...valid,
          database: f.social.database,
        }),
      ).toThrow('PREBOUND');
      expect(() =>
        createPostwarNarrowTradeSharedRuntime({
          ...valid,
          clock: { ...f.clock },
        }),
      ).toThrow('immutable server clock');
      expect(() =>
        createPostwarNarrowTradeSharedDatabase(database, 'WORLD_FOREIGN'),
      ).toThrow('exact issued Trade database');
      expect(f.connections()).toBe(0);
    } finally {
      await f.social.close();
    }
  });
  it('delegates only exact Trade membership/cutoff/claim plus actual three-sign Finance lock on the current executor', async () => {
    const calls: { q: string; args: readonly unknown[]; inside: boolean }[] =
        [],
      world = 'WORLD_TRADE_BIND_UNIT';
    const executor: SqlExecutor = {
      query: async <T extends object>(
        q: string,
        args: readonly unknown[] = [],
      ) => {
        calls.push({ q, args, inside: true });
        return { rows: [] as T[], rowCount: 0 };
      },
    };
    const raw: SqlDatabase = {
      query: async <T extends object>(
        q: string,
        args: readonly unknown[] = [],
      ) => {
        calls.push({ q, args, inside: false });
        return { rows: [] as T[], rowCount: 0 };
      },
      transaction: (op) => op(executor),
    };
    const db = createPostwarNarrowTradeAuthorizationDatabase(raw, {
        worldId: world,
      }),
      args = [
        world,
        '00000000-0000-4000-8000-000000000001',
        'COUNTRY_01',
        'TRADE',
        'TRADE_CONTRACTS',
      ];
    await db.transaction(async (tx) => {
      await db.query(MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY, args);
      await tx.query(NARROW_TRADE_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY, args);
      await tx.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, args);
      await db.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, [
        ...args.slice(0, 3),
        'FINANCE',
        'FINANCE_TREASURY',
      ]);
      await tx.query(NARROW_APPROVAL_AUTHORIZATION_LOCK_QUERY, [
        ...args.slice(0, 3),
        'FINANCE',
        'FINANCE_TREASURY',
      ]);
      await tx.query(MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY, [
        'WORLD_FOREIGN',
        ...args.slice(1),
      ]);
    });
    expect(calls.every((c) => c.inside)).toBe(true);
    expect(calls).toHaveLength(6);
    expect(
      calls
        .slice(0, 3)
        .every((c) =>
          c.q.includes('lock_postwar_narrow_trade_current_authorization'),
        ),
    ).toBe(true);
    expect(calls[3]!.q).toBe(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY);
    expect(calls[4]!.q).toContain('select authorization_version from');
    expect(calls[5]!.q).toBe(MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY);
  });
  it('does not let escaped asynchronous work revive an ended SQL scope', async () => {
    let calls = 0,
      release!: () => void,
      escaped!: Promise<unknown>;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      tx: SqlExecutor = {
        query: async <T extends object>() => {
          calls++;
          return { rows: [] as T[], rowCount: 0 };
        },
      };
    const db = createPostwarNarrowTradeSharedDatabase(
      { query: tx.query, transaction: (op) => op(tx) },
      'WORLD_TRADE_RETIRED',
    );
    await db.transaction(async () => {
      escaped = (async () => {
        await gate;
        return db.query(MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY, [
          'WORLD_TRADE_RETIRED',
          'subject',
          'COUNTRY_01',
          'TRADE',
          'TRADE_CONTRACTS',
        ]);
      })();
    });
    release();
    await expect(escaped).rejects.toThrow('TRANSACTION_SCOPE_RETIRED');
    expect(calls).toBe(0);
  });
});
