// Guarded TEST_ONLY native oracle. No real publisher/authentic source claim.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { restoreSimulationSchedulerState } from '@econmind/core';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import {
  createTestOnlyDurableWorldClock,
  DurableClockError,
  type ClockFaultPoint,
} from '../../apps/world-worker/src/time/durable-world-clock.js';
import {
  parseClockBinding,
  type ClockHead,
  type ClockKind,
} from '../../apps/world-worker/src/time/clock-contracts.js';
import {
  fixtureBinding,
  fixtureIntent,
  fixtureObservation,
} from '../support/isolated-world-clock-fixture.js';
import {
  openClockFixture,
  faultPool,
} from '../support/isolated-world-clock-native-fixture.js';

const suite = process.env.ISOLATED_CLOCK_NATIVE_MARKER
  ? describe
  : describe.skip;
let f: Awaited<ReturnType<typeof openClockFixture>>;
let counter = 0;
async function world(duration = 60000) {
  const bindingBytes = fixtureBinding('CLOCK_ISOLATED_NATIVE_' + ++counter);
  await f.addWorld(bindingBytes, duration);
  return {
    bindingBytes,
    worldId: parseClockBinding(bindingBytes).worldId,
    clock: createTestOnlyDurableWorldClock({
      bindingBytes,
      database: f.database,
    }),
  };
}
async function operation(
  b: string,
  id: string,
  kind: ClockKind,
  at: string,
  head: ClockHead | null,
  overrides: Record<string, unknown> = {},
) {
  const intent = fixtureIntent(b, id, kind, head, overrides);
  await f.addSource(
    b,
    'SOURCE_' + id,
    fixtureObservation(b, 'SOURCE_' + id, at),
  );
  return intent;
}
async function initialize(w: Awaited<ReturnType<typeof world>>) {
  const intent = await operation(
    w.bindingBytes,
    'INIT_' + counter,
    'INIT',
    '1000',
    null,
  );
  const result = await w.clock.apply(intent);
  return { intent, ...result };
}
async function until(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error('BOUNDED_WITNESS_TIMEOUT_' + message);
}
async function waitBlocked(blocker: PoolClient) {
  const pid = (await blocker.query('select pg_backend_pid() as pid')).rows[0]
    .pid as number;
  await until(
    async () =>
      (
        await f.admin.query(
          `select 1 from pg_stat_activity
    where $1::integer=any(pg_blocking_pids(pid))`,
          [pid],
        )
      ).rowCount! > 0,
    'BLOCKING_LOCK',
  );
}
async function expired(worldId: string) {
  await until(
    async () =>
      (
        await f.admin.query(
          `select lease_expires_at_real<=clock_timestamp() as expired
    from world_v2.world_writer_lease where world_id=$1`,
          [worldId],
        )
      ).rows[0].expired === true,
    'LEASE_EXPIRY',
  );
}
async function lockAvailable(table: string, worldId: string) {
  const c = await f.admin.connect();
  try {
    await c.query('begin');
    await c.query(
      `select * from world_v2.${table} where world_id=$1 for update nowait`,
      [worldId],
    );
    return true;
  } catch {
    return false;
  } finally {
    await c.query('rollback');
    c.release();
  }
}

suite('P1/P2 native isolated Clock actual schema / nonadmin oracle', () => {
  beforeAll(async () => {
    f = await openClockFixture();
  }, 30000);
  afterAll(async () => {
    if (f) await f.close();
  });

  it('uses nonadmin fixture roles and actual 0005 guard; economic footprint stays unchanged', async () => {
    const role = (
      await f.pool
        .query(`select rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit
      from pg_roles where rolname=current_user`)
    ).rows[0];
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolinherit: false,
    });
    const w = await world();
    const before = await f.economicFootprint();
    const init = await initialize(w);
    const advance = await operation(
      w.bindingBytes,
      'ADVANCE_' + counter,
      'ADVANCE',
      '2000',
      init.record.head,
    );
    const result = await w.clock.apply(advance);
    expect(
      restoreSimulationSchedulerState(
        result.record.head.stateBytes,
      ).clock.simTime.toCanonicalValue(),
    ).toBe('10000');
    expect(await f.economicFootprint()).toEqual(before);
    expect(w.clock.status().realPublisherNonBypass).toBe('NOT_PROVEN');
    expect(
      (
        await f.admin.query(
          'select count(*)::text as n from world_v2.runtime_opening_admission',
        )
      ).rows[0].n,
    ).toBe('0');
  });

  it('exact retry returns immutable original output with no anchor refresh; conflicting/stale/H-version inputs rollback', async () => {
    const w = await world();
    const init = await initialize(w);
    const before = await f.clockFootprint(w.worldId);
    const retry = await w.clock.apply(init.intent);
    expect(retry.status).toBe('EXISTING');
    expect(retry.record).toEqual(init.record);
    expect(await f.clockFootprint(w.worldId)).toEqual(before);
    for (const overrides of [
      { holderId: 'OTHER_HOLDER' },
      { fencingToken: '2' },
      { expectedWorldVersion: '1' },
    ]) {
      const c = createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: f.database,
      });
      await expect(
        c.apply(
          fixtureIntent(
            w.bindingBytes,
            init.record.intent.operationId,
            'INIT',
            null,
            overrides,
          ),
        ),
      ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
      expect(c.status().halted).toBe(true);
    }
    const conflict = createTestOnlyDurableWorldClock({
      bindingBytes: w.bindingBytes,
      database: f.database,
    });
    const alternate = 'CONFLICT_' + counter;
    await f.addSource(
      w.bindingBytes,
      alternate,
      fixtureObservation(w.bindingBytes, alternate, '1000'),
    );
    await expect(
      conflict.apply(
        fixtureIntent(
          w.bindingBytes,
          init.record.intent.operationId,
          'INIT',
          null,
          { sourceRef: alternate },
        ),
      ),
    ).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
      cause: expect.objectContaining({
        cause: expect.objectContaining({
          message: 'CLOCK_OPERATION_INTENT_CONFLICT',
        }),
      }),
    });
    const stale = await operation(
      w.bindingBytes,
      'STALE_' + counter,
      'ADVANCE',
      '3000',
      null,
      { expectedRevision: '1', predecessorHash: '0'.repeat(64) },
    );
    await expect(
      createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: f.database,
      }).apply(stale),
    ).rejects.toMatchObject({ outcome: 'ROLLED_BACK' });
    expect(await f.clockFootprint(w.worldId)).toEqual(before);
  });

  it('two native connections at one predecessor have exactly one distinct winner', async () => {
    const w = await world();
    const init = await initialize(w);
    const a = await operation(
      w.bindingBytes,
      'CAS_A_' + counter,
      'ADVANCE',
      '1100',
      init.record.head,
    );
    const b = await operation(
      w.bindingBytes,
      'CAS_B_' + counter,
      'ADVANCE',
      '1200',
      init.record.head,
    );
    const outcomes = await Promise.allSettled([
      w.clock.apply(a),
      createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: f.database,
      }).apply(b),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
    expect(
      (
        await f.admin.query(
          'select count(*)::text as n from world_v2.isolated_clock_input where world_id=$1',
          [w.worldId],
        )
      ).rows[0].n,
    ).toBe('2');
  });

  it('witnesses L before H, H before K, and independent other-world progress in both entry orders', async () => {
    for (const held of [
      'world_writer_lease',
      'world_head',
      'isolated_clock_head',
    ]) {
      const w = await world();
      const init = await initialize(w);
      const next = await operation(
        w.bindingBytes,
        'LOCK_' + counter,
        'ADVANCE',
        '1100',
        init.record.head,
      );
      const blocker = await f.admin.connect();
      await blocker.query('begin');
      await blocker.query(
        `select * from world_v2.${held} where world_id=$1 for update`,
        [w.worldId],
      );
      const pending = w.clock.apply(next);
      const settled = pending.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      try {
        await waitBlocked(blocker);
        if (held === 'world_writer_lease')
          expect(await lockAvailable('world_head', w.worldId)).toBe(true);
        else
          expect(await lockAvailable('world_writer_lease', w.worldId)).toBe(
            false,
          );
        if (held !== 'isolated_clock_head')
          expect(await lockAvailable('isolated_clock_head', w.worldId)).toBe(
            true,
          );
        else expect(await lockAvailable('world_head', w.worldId)).toBe(false);
        const other = await world();
        expect((await initialize(other)).status).toBe('APPLIED');
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
      expect(await settled).toHaveProperty('value.status', 'APPLIED');
    }
  });

  it('rechecks fresh lease time after last K lock wait, not an earlier pre-wait observation', async () => {
    const w = await world(800);
    const init = await initialize(w);
    const before = await f.clockFootprint(w.worldId);
    const next = await operation(
      w.bindingBytes,
      'EXPIRY_' + counter,
      'ADVANCE',
      '2000',
      init.record.head,
    );
    const blocker = await f.admin.connect();
    await blocker.query('begin');
    await blocker.query(
      'select * from world_v2.isolated_clock_head where world_id=$1 for update',
      [w.worldId],
    );
    const pending = w.clock.apply(next).catch((error) => error);
    try {
      await waitBlocked(blocker);
      await expired(w.worldId);
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    expect(await pending).toMatchObject({ outcome: 'ROLLED_BACK' });
    expect(await f.clockFootprint(w.worldId)).toEqual(before);
  });

  it('takeover rejects old holder/fence and restores durable anchor for RUNNING downtime', async () => {
    const w = await world(150);
    const init = await initialize(w);
    await expired(w.worldId);
    const lease = (
      await f.admin.query(
        'select * from world_v2.acquire_world_writer_lease($1,$2,clock_timestamp(),60000)',
        [w.worldId, 'NEXT_HOLDER'],
      )
    ).rows[0];
    expect(String(lease.fencing_token)).toBe('2');
    const old = await operation(
      w.bindingBytes,
      'OLD_' + counter,
      'ADVANCE',
      '1001000',
      init.record.head,
    );
    await expect(w.clock.apply(old)).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
    });
    const next = await operation(
      w.bindingBytes,
      'NEXT_' + counter,
      'ADVANCE',
      '1001000',
      init.record.head,
      { holderId: 'NEXT_HOLDER', fencingToken: '2' },
    );
    const fresh = createTestOnlyDurableWorldClock({
      bindingBytes: w.bindingBytes,
      database: f.database,
    });
    const result = await fresh.apply(next);
    expect(
      restoreSimulationSchedulerState(
        result.record.head.stateBytes,
      ).clock.simTime.toCanonicalValue(),
    ).toBe('10000000');
    const recovered = await fresh.recover(init.intent);
    expect(recovered.status).toBe('RECORDED_SUPERSEDED');
    expect(recovered.record).toEqual(init.record);
    expect(recovered.current?.revision).toBe('2');
  });

  it('persists pause/resume restart with zero paused downtime and no lifecycle repeat on retry', async () => {
    const w = await world();
    let last = (await initialize(w)).record;
    for (const [kind, at] of [
      ['PAUSE', '1100'],
      ['RESUME', '9000000'],
      ['ADVANCE', '9000010'],
    ] as const) {
      const intent = await operation(
        w.bindingBytes,
        kind + '_' + counter,
        kind,
        at,
        last.head,
      );
      const fresh = createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: f.database,
      });
      last = (await fresh.apply(intent)).record;
      expect((await fresh.apply(intent)).record).toEqual(last);
      expect((await fresh.recover(intent)).status).toBe('RECORDED_CURRENT');
    }
    expect(
      restoreSimulationSchedulerState(
        last.head.stateBytes,
      ).clock.simTime.toCanonicalValue(),
    ).toBe('1100');
  });

  it('every journal/head/precommit fault rolls back all K/input writes, halts and never auto-retries', async () => {
    const points: ClockFaultPoint[] = [
      'BEFORE_JOURNAL',
      'AFTER_JOURNAL',
      'BEFORE_HEAD',
      'AFTER_HEAD',
      'BEFORE_COMMIT',
    ];
    for (const point of points) {
      const w = await world();
      const init = await initialize(w);
      const before = await f.clockFootprint(w.worldId);
      const next = await operation(
        w.bindingBytes,
        'FAULT_' + counter,
        'ADVANCE',
        '2000',
        init.record.head,
      );
      let hits = 0;
      const clock = createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: f.database,
        fault: async (p) => {
          if (p === point) {
            hits++;
            throw Error('FIXTURE_' + point);
          }
        },
      });
      await expect(clock.apply(next)).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
      });
      expect(await f.clockFootprint(w.worldId)).toEqual(before);
      expect(hits).toBe(1);
      await expect(clock.apply(next)).rejects.toThrow('HALTED');
      expect(hits).toBe(1);
      expect((await clock.recover(next)).status).toBe('UNKNOWN_NOT_RECORDED');
    }
  });

  it('lost COMMIT ACK versus not-sent commit both halt UNKNOWN; fresh read-only lineage resolves only recorded facts', async () => {
    for (const mode of [
      'ACK_LOST',
      'COMMIT_NOT_SENT',
      'ROLLBACK_LOST',
    ] as const) {
      const w = await world();
      const init = await initialize(w);
      const next = await operation(
        w.bindingBytes,
        mode + '_' + counter,
        'ADVANCE',
        '2000',
        init.record.head,
      );
      const clock = createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: new PostgresSqlDatabase(faultPool(f.pool, mode)),
        ...(mode === 'ROLLBACK_LOST'
          ? {
              fault: async () => {
                throw Error('CALLBACK_FAULT');
              },
            }
          : {}),
      });
      await expect(clock.apply(next)).rejects.toMatchObject({
        outcome: 'UNKNOWN',
        committedRecord: null,
      });
      expect(clock.status().halted).toBe(true);
      const recovery = createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: f.database,
      });
      expect((await recovery.recover(next)).status).toBe(
        mode === 'ACK_LOST' ? 'RECORDED_CURRENT' : 'UNKNOWN_NOT_RECORDED',
      );
      await expect(clock.apply(next)).rejects.toThrow('HALTED');
    }
  });

  it('known commit plus cleanup fault retains COMMITTED separately; ordinary adapter release error stays UNKNOWN', async () => {
    for (const mode of [
      'AFTER_COMMIT',
      'CLEANUP_KNOWN',
      'CLEANUP_UNKNOWN',
    ] as const) {
      const w = await world();
      const init = await initialize(w);
      const next = await operation(
        w.bindingBytes,
        mode + '_' + counter,
        'ADVANCE',
        '2000',
        init.record.head,
      );
      const clock = createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database:
          mode === 'AFTER_COMMIT'
            ? f.database
            : new PostgresSqlDatabase(faultPool(f.pool, mode)),
        ...(mode === 'AFTER_COMMIT'
          ? {
              fault: async (p: ClockFaultPoint) => {
                if (p === 'AFTER_COMMIT') throw Error('CLEANUP_FAILED');
              },
            }
          : {}),
      });
      const error = (await clock
        .apply(next)
        .catch((e) => e)) as DurableClockError;
      expect(error).toBeInstanceOf(DurableClockError);
      expect(error.outcome).toBe(
        mode === 'CLEANUP_UNKNOWN' ? 'UNKNOWN' : 'COMMITTED',
      );
      expect(error.cleanup).toBe(
        mode === 'CLEANUP_UNKNOWN'
          ? 'NOT_KNOWN_INCOMPLETE'
          : 'CLEANUP_INCOMPLETE',
      );
      expect(error.committedRecord === null).toBe(mode === 'CLEANUP_UNKNOWN');
      expect(clock.status().halted).toBe(true);
      const fresh = createTestOnlyDurableWorldClock({
        bindingBytes: w.bindingBytes,
        database: f.database,
      });
      expect((await fresh.recover(next)).status).toBe('RECORDED_CURRENT');
    }
  });

  it('recovery sees one read-only MVCC snapshot even when another connection advances between head/lineage reads', async () => {
    const w = await world();
    const init = await initialize(w);
    const next = await operation(
      w.bindingBytes,
      'MVCC_' + counter,
      'ADVANCE',
      '2000',
      init.record.head,
    );
    let fired = false;
    const statements: string[] = [];
    const wrapped: SqlDatabase = {
      query: f.database.query.bind(f.database),
      transaction: (fn) =>
        f.database.transaction(async (sql) => {
          const witness: SqlExecutor = {
            query: async (statement, params) => {
              statements.push(statement);
              const result = await sql.query(statement, params);
              if (
                statement.includes('from world_v2.isolated_clock_head') &&
                !fired
              ) {
                fired = true;
                await w.clock.apply(next);
              }
              return result as never;
            },
          };
          return fn(witness);
        }),
    };
    const recovery = createTestOnlyDurableWorldClock({
      bindingBytes: w.bindingBytes,
      database: wrapped,
    });
    const result = await recovery.recover(init.intent);
    expect(result.status).toBe('RECORDED_CURRENT');
    expect(result.current?.revision).toBe('1');
    expect(statements[0]).toBe(
      'set transaction isolation level repeatable read read only',
    );
    expect(
      statements.every((s) => !/^\s*(insert|update|delete)/iu.test(s)),
    ).toBe(true);
    expect((await recovery.recover(init.intent)).status).toBe(
      'RECORDED_SUPERSEDED',
    );
  });

  it('reader, raw immutable DML, SET ROLE and wrong source environment are refused; fixture K capability is NOT publisher non-bypass', async () => {
    const w = await world();
    const init = await initialize(w);
    for (const table of [
      'isolated_clock_input',
      'isolated_clock_head',
      'isolated_clock_test_source',
    ]) {
      await expect(
        f.reader.query(`select * from world_v2.${table}`),
      ).rejects.toThrow();
      await expect(
        f.reader.query(`delete from world_v2.${table}`),
      ).rejects.toThrow();
    }
    await expect(
      f.pool.query('set role a_clock_test_bootstrap'),
    ).rejects.toThrow();
    await expect(
      f.reader.query('set role a_clock_test_writer'),
    ).rejects.toThrow();
    await expect(
      f.pool.query(
        'update world_v2.isolated_clock_test_source set original_bytes=original_bytes',
      ),
    ).rejects.toThrow('IMMUTABLE');
    await expect(
      f.pool.query('delete from world_v2.isolated_clock_input'),
    ).rejects.toThrow();
    await expect(
      f.pool.query('truncate world_v2.isolated_clock_input'),
    ).rejects.toThrow();
    const bad = fixtureIntent(
      w.bindingBytes,
      'WRONG_ENV_' + counter,
      'ADVANCE',
      init.record.head,
    );
    await f.addSource(
      w.bindingBytes,
      'SOURCE_WRONG_ENV_' + counter,
      fixtureObservation(w.bindingBytes, 'SOURCE_WRONG_ENV_' + counter, '2000'),
      'OBSERVATION',
      'LIVE',
    );
    await expect(w.clock.apply(bad)).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
    });
    const before = await f.clockFootprint(w.worldId);
    // Deliberately acknowledge fixture capability: writer can corrupt raw K.
    await f.pool.query(
      'update world_v2.isolated_clock_head set anchor_real_ms=anchor_real_ms+1 where world_id=$1',
      [w.worldId],
    );
    expect(await f.clockFootprint(w.worldId)).not.toEqual(before);
    const fresh = createTestOnlyDurableWorldClock({
      bindingBytes: w.bindingBytes,
      database: f.database,
    });
    await expect(fresh.recover(init.intent)).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
      cause: expect.objectContaining({
        message: 'CLOCK_MATERIALIZATION_BYTES_MISMATCH',
      }),
    });
    expect(fresh.status().halted).toBe(true);
    expect(fresh.status().realPublisherNonBypass).toBe('NOT_PROVEN');
  });

  it('immutable base/epoch/World/source mismatches fail closed before any Clock publication', async () => {
    for (const override of [
      { sourceEpoch: 'WRONG_EPOCH' },
      { worldId: 'CLOCK_ISOLATED_OTHER' },
      { baseGenesisRef: 'WRONG_BASE' },
      { sourceVersion: '2' },
    ]) {
      const w = await world();
      const id = 'BAD_SOURCE_' + counter;
      const intent = fixtureIntent(w.bindingBytes, id, 'INIT', null);
      await f.addSource(
        w.bindingBytes,
        'SOURCE_' + id,
        fixtureObservation(w.bindingBytes, 'SOURCE_' + id, '1000', override),
      );
      const before = await f.clockFootprint(w.worldId);
      await expect(w.clock.apply(intent)).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
      });
      expect(await f.clockFootprint(w.worldId)).toEqual(before);
    }
    const w = await world();
    const intent = await operation(
      w.bindingBytes,
      'BASE_SWAP_' + counter,
      'INIT',
      '1000',
      null,
    );
    const swapped = fixtureBinding(w.worldId, { baseRealMs: '1001' });
    const clock = createTestOnlyDurableWorldClock({
      bindingBytes: swapped,
      database: f.database,
    });
    await expect(clock.apply(intent)).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
    });
    expect((await f.clockFootprint(w.worldId))[0]).toEqual({
      inputs: [],
      heads: [],
    });
    const missing = fixtureIntent(
      w.bindingBytes,
      'MISSING_SOURCE_' + counter,
      'INIT',
      null,
    );
    await expect(w.clock.apply(missing)).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
    });
    expect((await f.clockFootprint(w.worldId))[0]).toEqual({
      inputs: [],
      heads: [],
    });
  });
});
