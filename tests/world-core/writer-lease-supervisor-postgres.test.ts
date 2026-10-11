// TEST_ONLY native, disposable loopback PG. Never used by a deploy entry.
import path from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWriterLeaseSupervisor } from '../../apps/world-worker/src/runtime-preparation/writer-lease-supervisor.js';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { loadFrozenRenewalMigrationFixture } from '../support/renewal-frozen-migration-fixture.js';

const suite = process.env.V09_TEST_DATABASE_URL ? describe : describe.skip;
const t0 = '2026-10-10T00:00:00.000Z';
const t250 = '2026-10-10T00:00:00.250Z';
const t500 = '2026-10-10T00:00:00.500Z';
const t1 = '2026-10-10T00:00:01.000Z';
const role = 'd_test_lease_supervisor';
let admin: Pool;
let scoped: Pool;
let database: PostgresSqlDatabase;

function deferred() {
  let resolve = () => undefined as void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function decorated(
  operation: (
    sql: SqlExecutor,
    run: () => Promise<unknown>,
  ) => Promise<unknown>,
): SqlDatabase {
  return {
    query: database.query.bind(database),
    async transaction<T>(run: (sql: SqlExecutor) => Promise<T>): Promise<T> {
      return (await database.transaction(async (sql) =>
        operation(sql, () => run(sql)),
      )) as T;
    },
  };
}
function host(
  world: string,
  worker = 'WORKER_D_A',
  port: SqlDatabase = database,
  configuredRole = role,
) {
  return createWriterLeaseSupervisor({
    database: port,
    role: configuredRole,
    worldId: world,
    workerId: worker,
    leaseDurationMilliseconds: '1000',
  });
}
async function addWorld(world: string) {
  await admin.query('insert into world_v2.world_head(world_id) values($1)', [
    world,
  ]);
}
async function rows(world: string) {
  return (
    await admin.query<{ holder_id: string; fencing_token: string }>(
      'select holder_id, fencing_token::text from world_v2.world_writer_lease where world_id=$1',
      [world],
    )
  ).rows;
}

suite('writer supervisor — actual native PG isolated lifecycle', () => {
  beforeAll(async () => {
    // Guard and immutable source validation run before any connection or SQL.
    const target = assertV09PostgresTestEnvironment();
    const fixture = await loadFrozenRenewalMigrationFixture(
      path.resolve(import.meta.dirname, '../..'),
    );
    admin = new Pool({ connectionString: target.connectionString, max: 2 });
    const identity = await admin.query<{
      database: string;
      host: string | null;
      version: string;
    }>(
      'select current_database() as database,host(inet_server_addr()) as host,version() as version',
    );
    expect(identity.rows[0]?.database).toMatch(/^econmind_v09_d_supervisor_/u);
    expect(identity.rows[0]?.host).toBe('127.0.0.1');
    const existing = await admin.query(
      "select 1 from information_schema.schemata where schema_name='world_v2'",
    );
    expect(existing.rows).toHaveLength(0);
    // Only the existing exact 0001..0006 prefix needed by this mechanism.
    for (const [i, migration] of fixture.manifest.migrations
      .slice(0, 6)
      .entries()) {
      await admin.query(fixture.artifacts[i]!);
      await admin.query(
        'insert into world_v2.schema_release(migration_id,artifact_sha256,source_repo_commit,release_order) values($1,$2,$3,$4)',
        [
          migration.migration_id,
          migration.sha256,
          migration.artifact_source_commit,
          migration.release_order,
        ],
      );
    }
    await admin.query(
      `create role ${role} login nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
    );
    await admin.query(`grant usage on schema world_v2 to ${role}`);
    await admin.query(
      `grant select,insert,update(holder_id,fencing_token,acquired_at_real,renewed_at_real,lease_expires_at_real) on world_v2.world_writer_lease to ${role}`,
    );
    await admin.query(
      `grant select,update(world_version,event_sequence) on world_v2.world_head to ${role}`,
    );
    await admin.query(
      `grant execute on function world_v2.acquire_world_writer_lease(text,text,timestamptz,bigint),world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz) to ${role}`,
    );
    const url = new URL(target.connectionString);
    url.username = role;
    scoped = new Pool({
      connectionString: url.toString(),
      max: 4,
      options: '-c lock_timeout=2000 -c statement_timeout=10000',
    });
    database = new PostgresSqlDatabase(scoped);
    console.log(
      JSON.stringify({
        scope: 'TEST_ONLY_NATIVE_SUPERVISOR',
        ...identity.rows[0],
        migrationPrefix: 6,
        productionAccess: false,
      }),
    );
  });

  afterAll(async () => {
    await scoped?.end();
    await admin?.end();
    // Retain the owned generation and evidence; no schema/role reset/drop.
  });

  it('serializes one instance and admits only one of two same-World supervisors', async () => {
    const world = 'WORLD_D_SUPERVISOR_RACE';
    await addWorld(world);
    const a = host(world);
    const b = host(world, 'WORKER_D_B');
    const first = a.acquire(t0);
    expect(() => a.acquire(t0)).toThrow();
    expect(() => a.renew(t0)).toThrow('OPERATION_IN_FLIGHT');
    const result = await Promise.allSettled([first, b.acquire(t0)]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const winner = result[0]?.status === 'fulfilled' ? a : b;
    const loser = winner === a ? b : a;
    expect(winner.status(t250).ready).toBe(true);
    expect(loser.status(t250)).toMatchObject({ ready: false, failure: 'LOST' });
    expect(await rows(world)).toHaveLength(1);
    await expect(
      winner.assertCanCommit({
        observedAtReal: t250,
        expectedWorldVersion: '0',
      }),
    ).resolves.toMatchObject({ fencingToken: '1' });
    await Promise.all([a.stop(), b.stop()]);
  });

  it('renews exact fence/acquisition and performs expired takeover; SQL refuses the stale writer', async () => {
    const world = 'WORLD_D_SUPERVISOR_TAKEOVER';
    await addWorld(world);
    const a = host(world);
    const original = await a.acquire(t0);
    const renewed = await a.renew(t250);
    expect(renewed).toMatchObject({
      fencingToken: original.fencingToken,
      acquiredAtReal: t0,
      renewedAtReal: t250,
      expiresAtReal: '2026-10-10T00:00:01.250Z',
    });
    const b = host(world, 'WORKER_D_B');
    const taken = await b.acquire('2026-10-10T00:00:01.250Z');
    expect(taken.fencingToken).toBe('2');
    // Explicit prior time passes local expiry validation, but the real current
    // SQL holder/fence must reject; cached ACTIVE can never authorize a commit.
    await expect(
      a.assertCanCommit({ observedAtReal: t500, expectedWorldVersion: '0' }),
    ).rejects.toMatchObject({
      outcome: 'REJECTED',
      cause: { cause: { message: 'WORLD_WRITER_FENCE_STALE' } },
    });
    expect(a.status(t500)).toMatchObject({ ready: false, failure: 'LOST' });
    await expect(
      b.assertCanCommit({
        observedAtReal: '2026-10-10T00:00:01.500Z',
        expectedWorldVersion: '0',
      }),
    ).resolves.toMatchObject({ fencingToken: '2' });
    expect(await rows(world)).toEqual([
      { holder_id: 'WORKER_D_B', fencing_token: '2' },
    ]);
    await Promise.all([a.stop(), b.stop()]);
  });

  it('does not silently reacquire or reset the generation during renew', async () => {
    const world = 'WORLD_D_SUPERVISOR_RENEW_LOST';
    await addWorld(world);
    const a = host(world);
    await a.acquire(t0);
    const b = host(world, 'WORKER_D_B');
    await b.acquire(t1);
    await expect(a.renew(t500)).rejects.toMatchObject({ outcome: 'REJECTED' });
    expect(await rows(world)).toEqual([
      { holder_id: 'WORKER_D_B', fencing_token: '2' },
    ]);
    expect(() => a.renew(t500)).toThrow('SUPERVISOR_CLOSED');
    await Promise.all([a.stop(), b.stop()]);
  });

  it('fails closed on actual role mismatch, privileged port, and a missing World', async () => {
    const world = 'WORLD_D_SUPERVISOR_ROLES';
    await addWorld(world);
    for (const instance of [
      host(world, 'WORKER_D_A', database, 'd_test_wrong_role'),
      host(world, 'WORKER_D_B', new PostgresSqlDatabase(admin)),
      host('WORLD_D_SUPERVISOR_ABSENT'),
    ]) {
      await expect(instance.acquire(t0)).rejects.toMatchObject({
        outcome: 'REJECTED',
      });
      expect(instance.status(t0).ready).toBe(false);
      await instance.stop();
    }
    expect(await rows(world)).toEqual([]);
  });

  it('preserves an acquired SQL lease but never grants liveness after lost COMMIT acknowledgement', async () => {
    const world = 'WORLD_D_SUPERVISOR_UNKNOWN';
    await addWorld(world);
    let transactions = 0;
    const port: SqlDatabase = {
      query: database.query.bind(database),
      async transaction<T>(run: (sql: SqlExecutor) => Promise<T>) {
        transactions++;
        await database.transaction(run); // The real SQL COMMIT has completed.
        throw new PostgresTransactionError({
          outcome: 'COMMIT_OUTCOME_UNKNOWN',
          cause: Error('TEST_ONLY_LOST_ACK'),
        });
      },
    };
    const a = host(world, 'WORKER_D_A', port);
    await expect(a.acquire(t0)).rejects.toMatchObject({ outcome: 'UNKNOWN' });
    expect(a.status(t250)).toMatchObject({
      ready: false,
      failure: 'UNKNOWN',
      lastConfirmedLease: null,
    });
    expect(await rows(world)).toEqual([
      { holder_id: 'WORKER_D_A', fencing_token: '1' },
    ]);
    expect(() => a.renew(t250)).toThrow('SUPERVISOR_CLOSED');
    expect(() =>
      a.assertCanCommit({ observedAtReal: t250, expectedWorldVersion: '0' }),
    ).toThrow('SUPERVISOR_CLOSED');
    await a.stop();
    expect(a.status(t250)).toMatchObject({
      phase: 'STOPPED',
      ready: false,
      failure: 'UNKNOWN',
    });
    expect(transactions).toBe(1);
    expect(await rows(world)).toHaveLength(1);
  });

  it('drains an in-flight SQL renewal, denies new work immediately, and retains lineage on stop', async () => {
    const world = 'WORLD_D_SUPERVISOR_STOP';
    await addWorld(world);
    const entered = deferred();
    const release = deferred();
    let delay = false;
    const port = decorated(async (_sql, run) => {
      const value = await run();
      if (delay) {
        entered.resolve();
        await release.promise;
      }
      return value;
    });
    const a = host(world, 'WORKER_D_A', port);
    await a.acquire(t0);
    delay = true;
    const renewal = a.renew(t250);
    await entered.promise;
    expect(a.status(t250)).toMatchObject({ phase: 'RENEWING', ready: false });
    const stopped = a.stop();
    let stopDone = false;
    void stopped.then(() => {
      stopDone = true;
    });
    await Promise.resolve();
    expect(stopDone).toBe(false);
    expect(a.status(t250)).toMatchObject({ phase: 'DRAINING', ready: false });
    expect(() => a.renew(t500)).toThrow('SUPERVISOR_CLOSED');
    release.resolve();
    await renewal;
    await stopped;
    expect(a.status(t500)).toMatchObject({
      phase: 'STOPPED',
      ready: false,
      lastConfirmedLease: { fencingToken: '1', renewedAtReal: t250 },
    });
    await a.stop();
    expect(await rows(world)).toEqual([
      { holder_id: 'WORKER_D_A', fencing_token: '1' },
    ]);
    await expect(
      admin.query('delete from world_v2.world_writer_lease where world_id=$1', [
        world,
      ]),
    ).rejects.toMatchObject({ code: '55000' });
    const b = host(world, 'WORKER_D_B');
    await expect(b.acquire(t1)).rejects.toMatchObject({ outcome: 'REJECTED' });
    const c = host(world, 'WORKER_D_C');
    expect((await c.acquire('2026-10-10T00:00:01.250Z')).fencingToken).toBe(
      '2',
    );
    await Promise.all([b.stop(), c.stop()]);
  });

  it('never treats observed expiry or a duplicate live holder as a fresh acquisition', async () => {
    const world = 'WORLD_D_SUPERVISOR_EXPIRY';
    await addWorld(world);
    const a = host(world);
    await a.acquire(t0);
    const duplicate = host(world);
    await expect(duplicate.acquire(t250)).rejects.toMatchObject({
      outcome: 'REJECTED',
    });
    expect(a.status(t1)).toMatchObject({ phase: 'LOST', ready: false });
    expect(() => a.renew(t1)).toThrow('SUPERVISOR_CLOSED');
    const observed = await admin.query<{ expiry: string }>(
      "select to_char(lease_expires_at_real at time zone 'UTC','HH24:MI:SS.MS') as expiry from world_v2.world_writer_lease where world_id=$1",
      [world],
    );
    expect(observed.rows[0]?.expiry).toBe('00:00:01.000');
    await Promise.all([a.stop(), duplicate.stop()]);
  });
});
