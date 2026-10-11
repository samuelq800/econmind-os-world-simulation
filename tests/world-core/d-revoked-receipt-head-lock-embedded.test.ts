// TEST_ONLY embedded serial functional checks; NOT native concurrency evidence.
// Typed with the existing repository PGlite preparation configuration.
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import { loadFrozenRenewalMigrationFixture } from '../support/renewal-frozen-migration-fixture.js';
import {
  fixture,
  footprint,
  isHeadLock,
  observe,
  repository,
  seed,
  zeroEffects,
} from '../support/d-revoked-receipt-fixture.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';

const embedded = createPGliteV09AtomicTestDatabase();
// The historical PGlite adapter uses affectedRows for SELECT too (zero even
// when rows exist). Match the production pg SELECT command-tag semantics here;
// do not change the shared adapter or treat these serial tests as native proof.
function queryPort(
  tx: import('../../apps/world-worker/src/persistence/sql-database.js').SqlExecutor,
) {
  return {
    async query<Row extends object = Record<string, unknown>>(
      sql: string,
      parameters: readonly unknown[] = [],
    ) {
      const result = await tx.query<Row>(sql, parameters);
      return /^\s*select\b/iu.test(sql)
        ? { ...result, rowCount: result.rows.length }
        : result;
    },
  };
}
const database: SqlDatabase = {
  ...queryPort(embedded),
  transaction: (operation) =>
    embedded.transaction((tx) => operation(queryPort(tx))),
};
beforeAll(async () => {
  const frozen = await loadFrozenRenewalMigrationFixture(
    path.resolve(import.meta.dirname, '../..'),
  );
  for (const sql of frozen.artifacts.slice(0, 12))
    await embedded.executeScript(sql);
});
afterAll(() => embedded.close());
describe('zero-effect revoked receipt — same-World negative predicate', () => {
  it('locks S then exact H before authority, receipt and Q; changes no economy', async () => {
    const f = fixture('ORDER');
    await seed(database, f);
    const queries: string[] = [];
    const port = observe(database, (sql, parameters, phase) => {
      if (phase === 'BEFORE') queries.push(sql);
      if (isHeadLock(sql)) expect(parameters).toEqual([f.command.worldId]);
    });
    expect(await repository(port).recordZeroEffectReceipt(f.receipt)).toEqual(
      f.receipt,
    );
    const s = queries.findIndex((sql) =>
      /from world_v2.command_submission/u.test(sql),
    );
    const h = queries.findIndex(isHeadLock);
    const a = queries.findIndex((sql) =>
      /from world_v2.current_commit_authorization/u.test(sql),
    );
    const r = queries.findIndex((sql) =>
      /insert into world_v2.command_receipt/u.test(sql),
    );
    const q = queries.findIndex((sql) =>
      /update world_v2.command_queue/u.test(sql),
    );
    expect(s).toBeGreaterThanOrEqual(0);
    expect(h).toBeGreaterThan(s);
    expect(a).toBeGreaterThan(h);
    expect(r).toBeGreaterThan(a);
    expect(q).toBeGreaterThan(r);
    expect(await footprint(database, f)).toEqual({
      ...zeroEffects,
      queue: 'FINALIZED',
      receipts: 1,
    });
  });
  it('returns the immutable existing receipt even after activation, without H or recheck', async () => {
    const f = fixture('RETRY');
    await seed(database, f);
    await repository(database).recordZeroEffectReceipt(f.receipt);
    await database.query(
      'update world_v2.current_commit_authorization set active=true where world_id=$1',
      [f.command.worldId],
    );
    const queries: string[] = [];
    const port = observe(database, (sql, _parameters, phase) => {
      if (phase === 'BEFORE') queries.push(sql);
    });
    expect(
      await repository(port).recordZeroEffectReceipt({
        ...f.receipt,
        recordedAtReal: '2026-10-10T00:00:02.000Z',
      }),
    ).toEqual(f.receipt);
    expect(queries.some(isHeadLock)).toBe(false);
    expect(
      queries.some((sql) => /current_commit_authorization/u.test(sql)),
    ).toBe(false);
    expect(await footprint(database, f)).toEqual({
      ...zeroEffects,
      queue: 'FINALIZED',
      receipts: 1,
    });
  });
  it('does not add the lock or authorization check to ordinary REJECTED receipts', async () => {
    const f = fixture('REJECTED', 'REJECTED');
    await seed(database, f, true);
    const queries: string[] = [];
    const port = observe(database, (sql, _parameters, phase) => {
      if (phase === 'BEFORE') queries.push(sql);
    });
    expect(await repository(port).recordZeroEffectReceipt(f.receipt)).toEqual(
      f.receipt,
    );
    expect(queries.some(isHeadLock)).toBe(false);
    expect(
      queries.some((sql) => /current_commit_authorization/u.test(sql)),
    ).toBe(false);
  });
  it('fails closed before authority or writes if H is missing from the lock result', async () => {
    const f = fixture('MISSING_HEAD');
    await seed(database, f);
    const queries: string[] = [];
    const port: SqlDatabase = {
      query: database.query.bind(database),
      transaction: (operation) =>
        database.transaction((tx) =>
          operation({
            async query<Row extends object = Record<string, unknown>>(
              sql: string,
              parameters: readonly unknown[] = [],
            ) {
              queries.push(sql);
              if (isHeadLock(sql)) return { rowCount: 0, rows: [] };
              return tx.query<Row>(sql, parameters);
            },
          }),
        ),
    };
    await expect(
      repository(port).recordZeroEffectReceipt(f.receipt),
    ).rejects.toMatchObject({ cause: { code: 'TRANSITION_EVIDENCE_INVALID' } });
    expect(
      queries.some((sql) =>
        /current_commit_authorization|insert into world_v2.command_receipt|update world_v2.command_queue/u.test(
          sql,
        ),
      ),
    ).toBe(false);
    expect(await footprint(database, f)).toEqual({
      ...zeroEffects,
      queue: 'CLAIMED',
      receipts: 0,
    });
  });
  it('retains current-authority rejection and atomic no-write rollback', async () => {
    const f = fixture('ACTIVE');
    await seed(database, f, true);
    await expect(
      repository(database).recordZeroEffectReceipt(f.receipt),
    ).rejects.toMatchObject({ cause: { code: 'AUTHORIZATION_DENIED' } });
    expect(await footprint(database, f)).toEqual({
      ...zeroEffects,
      queue: 'CLAIMED',
      receipts: 0,
    });
  });
  it('retains the existing lease cutoff (does not add a new lease policy)', async () => {
    const f = fixture('EXPIRED');
    await seed(database, f);
    await expect(
      repository(database).recordZeroEffectReceipt({
        ...f.receipt,
        recordedAtReal: '2026-10-10T00:06:00.000Z',
      }),
    ).rejects.toMatchObject({ cause: { code: 'WRITER_FENCE_STALE' } });
    expect(await footprint(database, f)).toEqual({
      ...zeroEffects,
      queue: 'CLAIMED',
      receipts: 0,
    });
  });
});
