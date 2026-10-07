import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';
import { PostgresNarrowTransferIntake } from '../../apps/world-worker/src/intake/postgres-narrow-transfer-intake.js';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { createIsolatedFinancialRuntimeComposition } from '../../apps/world-worker/src/preparation/isolated-financial-runtime-composition.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { createCIsolatedFinancialFixture } from '../support/c-isolated-financial-fixture.js';

// Opt-in native-only tests. No PGlite / mocked SQL positive-path substitution.
const native = process.env.V09_TEST_DATABASE_URL ? describe : describe.skip;
native('C TEST_ONLY isolated financial durable composition / native PG', () => {
  let pool: Pool;
  let database: PostgresSqlDatabase;
  let ordinal = 0;
  const connectionErrors: Error[] = [];
  beforeAll(async () => {
    const target = assertV09PostgresTestEnvironment(process.env);
    pool = new Pool({
      connectionString: target.connectionString,
      max: 6,
      options: '-c lock_timeout=2000 -c statement_timeout=10000',
    });
    // A terminated backend can emit a second connection-level error after its
    // query promise rejects. Record it explicitly; assert it in the crash test.
    pool.on('connect', (client) =>
      client.on('error', (error) => connectionErrors.push(error)),
    );
    database = new PostgresSqlDatabase(pool);
    const existing = await database.query<{ schema: string | null }>(
      "select to_regnamespace('world_v2')::text as schema",
    );
    if (existing.rows[0]?.schema !== null)
      throw new Error('C_REQUIRES_EMPTY_DISPOSABLE_DATABASE');
    // Existing publication artifacts, locally applied only. Never drop a schema.
    const migrationFiles = [
      '0001_world_v2_namespace.sql',
      '0002_world_v2_command_event_ledger.sql',
      '0003_world_v2_command_receipts_outbox.sql',
      '0004_world_v2_receipt_event_set_integrity.sql',
      '0005_world_v2_writer_lease_fencing.sql',
      '0006_world_v2_writer_lease_lineage_guard.sql',
      '0007_world_v2_atomic_transition_facts.sql',
      '0008_world_v2_materialization_recovery.sql',
      '0009_world_v2_posting_payload_integrity.sql',
      '0010_world_v2_command_claim_fencing.sql',
      '0011_world_v2_current_commit_authorization.sql',
      '0012_world_v2_command_claim_active_lease_guard.sql',
      '0013_world_v2_read_projection_boundary.sql',
      '0014_world_v2_current_negotiation_party_membership.sql',
      '0015_world_v2_narrow_transfer_approvals.sql',
      '0016_world_v2_opening_seed.sql',
    ];
    for (const name of migrationFiles)
      await pool.query(
        await readFile(
          path.resolve(
            import.meta.dirname,
            '../../database/migrations/artifacts',
            name,
          ),
          'utf8',
        ),
      );
  });
  afterAll(async () => {
    await pool?.end();
  });
  async function fixture() {
    ordinal += 1;
    return createCIsolatedFinancialFixture(database, `NATIVE_${ordinal}`);
  }
  async function queued(f: Awaited<ReturnType<typeof fixture>>) {
    expect(await f.intake.submitPending(f.intakeInput)).toMatchObject({
      status: 'PENDING_APPROVAL_OR_ENQUEUE',
    });
    await f.approve();
    expect(await f.intake.enqueueApproved(f.intakeInput)).toMatchObject({
      status: 'QUEUED',
    });
    await f.lease();
  }
  async function footprint(world: string) {
    const result = await database.query(
      `select world_version::text, event_sequence::text,
      (select count(*)::text from world_v2.authoritative_event where world_id=$1) as events,
      (select count(*)::text from world_v2.inventory_posting where world_id=$1) as inventory,
      (select count(*)::text from world_v2.financial_posting_batch where world_id=$1) as financial,
      (select count(*)::text from world_v2.command_receipt where world_id=$1) as receipts,
      (select count(*)::text from world_v2.notification_outbox where world_id=$1) as outbox
      from world_v2.world_head where world_id=$1`,
      [world],
    );
    return result.rows[0];
  }
  it('persists opening, authenticated intake + actual approvals, Reserve → real SQL Ship → Delivery, and exact replay', async () => {
    const f = await fixture();
    expect(f.openingReadback).toMatchObject({
      disposition: 'BOOTSTRAPPED',
      readback: { worldVersion: '0', eventSequence: '0' },
    });
    await queued(f);
    const before = await f.host.startIsolation();
    expect(before.status).toBe(
      'TEST_ONLY_NOT_OFFICIAL_OPENING_OR_RUNTIME_ACCEPTANCE',
    );
    expect(before.ledgers.seedFingerprint).toBe(f.seed.fingerprint);
    const reserve = await f.host.consumeOnce();
    expect(reserve.step).toMatchObject({
      status: 'PROCESSED',
      source: 'NEW_FINAL',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '1' },
    });
    expect(reserve.readback.headWorldVersion).toBe('1');
    await f.schedule(f.shipment);
    f.setTime('10100');
    const ship = await f.host.consumeOnce();
    expect(ship.step).toMatchObject({
      status: 'PROCESSED',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '2' },
    });
    expect(
      ship.readback.ledgers.inventory.balances
        .find((b) => b.account.bucket === 'IN_TRANSIT')
        ?.quantity.toCanonicalValue(),
    ).toEqual({ amount: '2', unit: 'tonne' });
    await f.schedule(f.delivery);
    f.setTime('10200');
    const deliver = await f.host.consumeOnce();
    expect(deliver.step).toMatchObject({
      status: 'PROCESSED',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
    });
    const positions = deliver.readback.ledgers.financial.positions;
    const amount = (id: string) =>
      positions
        .find((p) => p.account.accountId === id)
        ?.netDebitBalance.toCanonicalValue();
    expect(
      amount(f.original.financialAccounts.buyerTreasury.accountId),
    ).toEqual({ amount: '2', currency: 'GCU' });
    expect(
      amount(f.original.financialAccounts.sellerSettlement.accountId),
    ).toEqual({ amount: '8', currency: 'GCU' });
    expect(
      deliver.readback.ledgers.inventory.balances
        .find((b) => b.account.countryId === f.original.countries.buyer)
        ?.quantity.toCanonicalValue(),
    ).toEqual({ amount: '2', unit: 'tonne' });
    expect(await footprint(f.world)).toEqual({
      world_version: '3',
      event_sequence: '3',
      events: '3',
      inventory: '3',
      financial: '1',
      receipts: '3',
      outbox: '3',
    });
    expect(await f.intake.read(f.intakeInput)).toMatchObject({
      status: 'FINAL',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '1' },
    });
    expect(await f.intake.submitPending(f.intakeInput)).toMatchObject({
      status: 'FINAL',
    });
    expect((await f.host.consumeOnce()).step).toEqual({ status: 'IDLE' });
    const restart = createIsolatedFinancialRuntimeComposition(f.hostInput);
    expect(canonicalSerialize(await restart.startIsolation())).toBe(
      canonicalSerialize(deliver.readback),
    );
    expect((await restart.consumeOnce()).step).toEqual({ status: 'IDLE' });
    await restart.stop();
    await f.host.stop();
    expect(await footprint(f.world)).toMatchObject({
      world_version: '3',
      receipts: '3',
    });
  });
  it('cannot enqueue without Finance approval and rejects revoked current authority without economic effects', async () => {
    const f = await fixture();
    await f.intake.submitPending(f.intakeInput);
    await expect(f.intake.enqueueApproved(f.intakeInput)).rejects.toThrow();
    await f.approve();
    await f.intake.enqueueApproved(f.intakeInput);
    await f.lease();
    await database.query(
      `update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='FINANCE'`,
      [f.world],
    );
    await f.host.startIsolation();
    expect((await f.host.consumeOnce()).step.status).toBe('BLOCKED');
    expect(await footprint(f.world)).toMatchObject({
      world_version: '0',
      events: '0',
      inventory: '0',
      financial: '0',
      receipts: '0',
      outbox: '0',
    });
    await f.host.stop();
  });
  it('binds immutable seed, refuses wrong namespace/seed before a claim, and preserves other Worlds', async () => {
    const f = await fixture();
    await queued(f);
    expect(() =>
      createIsolatedFinancialRuntimeComposition({
        ...f.hostInput,
        opening: { ...f.hostInput.opening, worldId: 'WORLD_OFFICIAL' },
      }),
    ).toThrow();
    const wrong = createIsolatedFinancialRuntimeComposition({
      ...f.hostInput,
      opening: {
        ...f.hostInput.opening,
        seedFingerprint: `sha256:${'0'.repeat(64)}`,
      },
    });
    await expect(wrong.startIsolation()).rejects.toThrow();
    expect(wrong.state()).toBe('FAULTED');
    expect(await footprint(f.world)).toMatchObject({
      world_version: '0',
      receipts: '0',
    });
    expect(
      (
        await database.query(
          'select queue_state from world_v2.command_queue where world_id=$1',
          [f.world],
        )
      ).rows,
    ).toEqual([{ queue_state: 'PENDING' }]);
    const other = await fixture();
    await other.host.startIsolation();
    expect((await other.host.consumeOnce()).step).toEqual({ status: 'IDLE' });
    await other.host.stop();
    await wrong.stop();
  });
  it('two Workers cannot double settle the same durable command under one active fencing token', async () => {
    const f = await fixture();
    await queued(f);
    const contender = createIsolatedFinancialRuntimeComposition({
      ...f.hostInput,
      workerId: 'WORKER_C_CONTENDER',
    });
    await Promise.all([f.host.startIsolation(), contender.startIsolation()]);
    const steps = await Promise.all([
      f.host.consumeOnce(),
      contender.consumeOnce(),
    ]);
    expect(steps.filter((s) => s.step.status === 'PROCESSED')).toHaveLength(1);
    expect(
      steps.filter((s) => ['IDLE', 'BLOCKED'].includes(s.step.status)),
    ).toHaveLength(1);
    expect(await footprint(f.world)).toMatchObject({
      world_version: '1',
      events: '1',
      inventory: '1',
      receipts: '1',
      outbox: '1',
      financial: '0',
    });
    await Promise.all([f.host.stop(), contender.stop()]);
  });
  it('expired lease does not claim, advance the World or invent takeover/recovery', async () => {
    const f = await fixture();
    await queued(f);
    await f.host.startIsolation();
    f.setTime('10000', '2026-10-07T00:02:00.000Z');
    expect((await f.host.consumeOnce()).step).toMatchObject({
      status: 'BLOCKED',
    });
    expect(await footprint(f.world)).toMatchObject({
      world_version: '0',
      receipts: '0',
    });
    expect(
      (
        await database.query(
          'select queue_state from world_v2.command_queue where world_id=$1',
          [f.world],
        )
      ).rows,
    ).toEqual([{ queue_state: 'PENDING' }]);
    await f.host.stop();
  });
  it('loss before commit rolls back all economic facts; restart refuses the unrecovered claim', async () => {
    const f = await fixture();
    await queued(f);
    let faulted = false;
    const interrupted: SqlDatabase = {
      query: (sql, parameters) => database.query(sql, parameters),
      transaction: (operation) =>
        database.transaction((transaction) =>
          operation({
            async query<Row extends object>(
              sql: string,
              parameters?: readonly unknown[],
            ) {
              const result = await transaction.query<Row>(sql, parameters);
              if (
                !faulted &&
                /insert into world_v2\.inventory_posting/iu.test(sql)
              ) {
                faulted = true;
                // Real server-side process death, not a fake SQL success/rollback.
                // Terminate this backend while a query is active, so pg observes
                // the error through the query promise (no idle-client error leak).
                await transaction.query(
                  'select pg_terminate_backend(pg_backend_pid())',
                );
                throw new Error('C_SIMULATED_WORKER_LOSS_BEFORE_COMMIT');
              }
              return result;
            },
          } satisfies SqlExecutor),
        ),
    };
    const host = createIsolatedFinancialRuntimeComposition({
      ...f.hostInput,
      database: interrupted,
    });
    await host.startIsolation();
    expect((await host.consumeOnce()).step).toMatchObject({ status: 'FAILED' });
    expect(faulted).toBe(true);
    expect(await footprint(f.world)).toMatchObject({
      world_version: '0',
      events: '0',
      inventory: '0',
      financial: '0',
      receipts: '0',
      outbox: '0',
    });
    expect(connectionErrors).toHaveLength(1);
    expect(connectionErrors[0]?.message).toBe(
      'Connection terminated unexpectedly',
    );
    const restarted = createIsolatedFinancialRuntimeComposition({
      ...f.hostInput,
      workerId: 'WORKER_C_RECOVERY_NOT_AUTHORIZED',
    });
    await restarted.startIsolation();
    expect((await restarted.consumeOnce()).step).toMatchObject({
      status: 'BLOCKED',
      reason: 'CLAIM_REQUIRES_REVIEWED_RECOVERY',
    });
    await restarted.stop();
    await host.stop();
  });
  it('lost COMMIT acknowledgement reads the durable receipt without executing settlement twice', async () => {
    const f = await fixture();
    await queued(f);
    let acknowledgementsLost = 0;
    const lostAck: SqlDatabase = {
      query: (sql, params) => database.query(sql, params),
      async transaction(operation) {
        let writesEconomics = false;
        const result = await database.transaction((transaction) =>
          operation({
            async query<Row extends object>(
              sql: string,
              params?: readonly unknown[],
            ) {
              if (/insert into world_v2\.inventory_posting/iu.test(sql))
                writesEconomics = true;
              return transaction.query<Row>(sql, params);
            },
          }),
        );
        if (writesEconomics && acknowledgementsLost === 0) {
          acknowledgementsLost += 1;
          throw new PostgresTransactionError({
            outcome: 'COMMIT_OUTCOME_UNKNOWN',
            cause: new Error('TEST_ONLY_LOST_ACK_AFTER_REAL_COMMIT'),
          });
        }
        return result;
      },
    };
    const host = createIsolatedFinancialRuntimeComposition({
      ...f.hostInput,
      database: lostAck,
    });
    await host.startIsolation();
    expect((await host.consumeOnce()).step).toMatchObject({
      status: 'PROCESSED',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '1' },
    });
    expect(acknowledgementsLost).toBe(1);
    expect(await footprint(f.world)).toMatchObject({
      world_version: '1',
      events: '1',
      inventory: '1',
      receipts: '1',
      outbox: '1',
    });
    const restart = createIsolatedFinancialRuntimeComposition(f.hostInput);
    await restart.startIsolation();
    expect((await restart.consumeOnce()).step).toEqual({ status: 'IDLE' });
    await restart.stop();
    await host.stop();
  });
  it('current revoked intake subject and cross-World scope cannot create Commands', async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      f.intake.submitPending({
        ...f.intakeInput,
        scope: other.intakeInput.scope,
      }),
    ).rejects.toThrow();
    await database.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [f.world],
    );
    await expect(f.intake.submitPending(f.intakeInput)).rejects.toThrow();
    expect(
      (
        await database.query(
          'select count(*)::text as commands from world_v2.command_submission where world_id=$1',
          [f.world],
        )
      ).rows,
    ).toEqual([{ commands: '0' }]);
    expect(await footprint(f.world)).toMatchObject({
      world_version: '0',
      events: '0',
      receipts: '0',
    });
  });
  it('checks the actual connected database, not merely a test URL or a matching seed', async () => {
    const f = await fixture();
    const target = assertV09PostgresTestEnvironment(process.env);
    const controlUrl = new URL(target.connectionString);
    controlUrl.pathname = '/postgres';
    // Read-only negative control on the same disposable cluster created for
    // this suite. The host must refuse this non-approved database name.
    const controlPool = new Pool({ connectionString: controlUrl.href, max: 1 });
    try {
      const host = createIsolatedFinancialRuntimeComposition({
        ...f.hostInput,
        database: new PostgresSqlDatabase(controlPool),
      });
      await expect(host.startIsolation()).rejects.toThrow();
      expect(host.state()).toBe('FAULTED');
      await host.stop();
      expect(await footprint(f.world)).toMatchObject({
        world_version: '0',
        receipts: '0',
      });
    } finally {
      await controlPool.end();
    }
    expect(() =>
      createIsolatedFinancialRuntimeComposition({
        ...f.hostInput,
        environment: { ECONMIND_ENV: 'production' },
      }),
    ).toThrow();
    expect(() =>
      createIsolatedFinancialRuntimeComposition({
        ...f.hostInput,
        environment: { ECONMIND_ENV: 'local', DATABASE_URL: 'forbidden' },
      }),
    ).toThrow();
  });
  it('missing persistent opening fails before a command claim and cannot bootstrap itself', async () => {
    const f = await fixture();
    const missingWorld = 'WORLD_C_ISOLATED_MISSING_OPENING';
    await database.query(
      'insert into world_v2.world_head(world_id) values ($1)',
      [missingWorld],
    );
    const host = createIsolatedFinancialRuntimeComposition({
      ...f.hostInput,
      opening: { ...f.hostInput.opening, worldId: missingWorld },
    });
    await expect(host.startIsolation()).rejects.toThrow();
    expect(host.state()).toBe('FAULTED');
    expect(
      (
        await database.query(
          'select count(*)::text as seeds from world_v2.opening_seed where world_id=$1',
          [missingWorld],
        )
      ).rows,
    ).toEqual([{ seeds: '0' }]);
    expect(await footprint(missingWorld)).toMatchObject({
      world_version: '0',
      events: '0',
      receipts: '0',
    });
    await host.stop();
  });
  it('postcommit readback and real duplicate intake overlap without a reversed-lock deadlock', async () => {
    const f = await fixture();
    await queued(f);
    function gate() {
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ready, release };
    }
    async function deadline<T>(operation: Promise<T>): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          operation,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('C_READBACK_LOCK_BARRIER_TIMEOUT')),
              5000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    const firstReadbackLock = gate();
    const resumeReadback = gate();
    const intakeSubmissionRequested = gate();
    const intakeSubmissionLocked = gate();
    let economicsCommitted = false;
    let paused = false;
    let firstLock: 'COMMAND' | 'HEAD' | null = null;
    const sqlErrors: unknown[] = [];
    const backendPids = new Set<number>();
    function observed(role: 'WORKER' | 'INTAKE'): SqlDatabase {
      return {
        query: (sql, params) => database.query(sql, params),
        async transaction(operation) {
          let wroteEconomics = false;
          const result = await database.transaction(async (transaction) => {
            const pid = await transaction.query<{ pid: number }>(
              'select pg_backend_pid() as pid',
            );
            backendPids.add(pid.rows[0]!.pid);
            return operation({
              async query<Row extends object>(
                sql: string,
                params?: readonly unknown[],
              ) {
                const submission =
                  sql.includes('from world_v2.command_submission') &&
                  /for (?:share|update)/iu.test(sql);
                const head =
                  sql.includes('from world_v2.world_head') &&
                  /for share/iu.test(sql);
                if (role === 'INTAKE' && submission)
                  intakeSubmissionRequested.release();
                try {
                  const rows = await transaction.query<Row>(sql, params);
                  if (/insert into world_v2\.inventory_posting/iu.test(sql))
                    wroteEconomics = true;
                  if (role === 'INTAKE' && submission)
                    intakeSubmissionLocked.release();
                  if (
                    role === 'WORKER' &&
                    economicsCommitted &&
                    !paused &&
                    (submission || head)
                  ) {
                    paused = true;
                    firstLock = submission ? 'COMMAND' : 'HEAD';
                    firstReadbackLock.release();
                    await deadline(resumeReadback.ready);
                  }
                  return rows;
                } catch (error) {
                  sqlErrors.push(error);
                  throw error;
                }
              },
            });
          });
          if (wroteEconomics) economicsCommitted = true;
          return result;
        },
      };
    }
    const host = createIsolatedFinancialRuntimeComposition({
      ...f.hostInput,
      database: observed('WORKER'),
    });
    const duplicateIntake = new PostgresNarrowTransferIntake({
      database: observed('INTAKE'),
      sha256Hex: f.hostInput.sha256Hex,
    });
    await host.startIsolation();
    // Attach handlers immediately; old code must fail visibly without leaking
    // unhandled rejection or stranding either real PostgreSQL connection.
    const work = host.consumeOnce().then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error: error as unknown }),
    );
    let duplicate: ReturnType<typeof duplicateIntake.read> | undefined;
    try {
      await deadline(firstReadbackLock.ready);
      duplicate = duplicateIntake.read(f.intakeInput);
      await deadline(
        firstLock === 'HEAD'
          ? intakeSubmissionLocked.ready
          : intakeSubmissionRequested.ready,
      );
    } finally {
      resumeReadback.release();
    }
    const [worked, read] = await deadline(Promise.all([work, duplicate!]));
    expect(sqlErrors).toEqual([]);
    expect(firstLock).toBe('COMMAND');
    expect(backendPids.size).toBeGreaterThanOrEqual(2);
    expect(worked.error).toBeNull();
    expect(worked.value?.step).toMatchObject({
      status: 'PROCESSED',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '1' },
    });
    expect(read).toMatchObject({
      status: 'FINAL',
      receipt: { outcome: 'COMMITTED', worldVersionAfter: '1' },
    });
    expect(host.state()).toBe('READY');
    expect(await footprint(f.world)).toMatchObject({
      world_version: '1',
      events: '1',
      inventory: '1',
      receipts: '1',
      outbox: '1',
      financial: '0',
    });
    await host.stop();
  });
});
