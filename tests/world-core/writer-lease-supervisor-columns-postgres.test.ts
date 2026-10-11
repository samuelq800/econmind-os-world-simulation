// TEST_ONLY: fresh guarded loopback database, exact frozen 0001..0006 only.
// All grants/DDL below are disposable fixtures, never provisioning artifacts.
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
const role = 'd_test_column_supervisor';
const group = 'd_test_column_extra';
const t0 = '2026-10-10T00:00:00.000Z';
const t250 = '2026-10-10T00:00:00.250Z';
const t500 = '2026-10-10T00:00:00.500Z';
const functions = {
  acquire: 'world_v2.acquire_world_writer_lease(text,text,timestamptz,bigint)',
  guard:
    'world_v2.assert_world_writer_commit_guard(text,text,bigint,bigint,timestamptz)',
};
const mutable = {
  world_head: ['world_version', 'event_sequence'],
  world_writer_lease: [
    'holder_id',
    'fencing_token',
    'acquired_at_real',
    'renewed_at_real',
    'lease_expires_at_real',
  ],
};
let admin: Pool;
let scoped: Pool;
let database: PostgresSqlDatabase;
let worldNumber = 0;
const extraPools: Pool[] = [];

async function addWorld() {
  const world = `WORLD_D_COLUMN_${++worldNumber}`;
  await admin.query('insert into world_v2.world_head(world_id) values($1)', [
    world,
  ]);
  return world;
}
function host(world: string, port: SqlDatabase = database) {
  return createWriterLeaseSupervisor({
    database: port,
    role,
    worldId: world,
    workerId: 'WORKER_D_COLUMN',
    leaseDurationMilliseconds: '1000',
  });
}
async function denyWithoutLease(world: string, port: SqlDatabase = database) {
  const instance = host(world, port);
  await expect(instance.acquire(t0)).rejects.toMatchObject({
    outcome: 'REJECTED',
    cause: { cause: { code: 'DATABASE_ROLE_DENIED' } },
  });
  expect(instance.status(t0)).toMatchObject({
    ready: false,
    failure: 'LOST',
    lastConfirmedLease: null,
  });
  expect(
    (
      await admin.query(
        'select 1 from world_v2.world_writer_lease where world_id=$1',
        [world],
      )
    ).rows,
  ).toHaveLength(0);
  await instance.stop();
}
async function withGrant(
  grant: string,
  revoke: string,
  operation: () => Promise<void>,
) {
  await assertBaseline();
  await admin.query(grant);
  try {
    await operation();
  } finally {
    await admin.query(revoke);
    // PostgreSQL table REVOKE UPDATE also removes column UPDATE grants. Restore
    // only the original narrow fixture matrix, never table UPDATE/identity.
    for (const [table, columns] of Object.entries(mutable))
      await admin.query(
        `grant update(${columns.join(',')}) on world_v2.${table} to ${role}`,
      );
    await assertBaseline();
  }
}

async function assertBaseline() {
  const columns = Object.entries(mutable).flatMap(([table, names]) =>
    names.map((column) => ({ table, column })),
  );
  for (const { table, column } of columns)
    expect(
      (
        await scoped.query(
          "select has_column_privilege(current_user,$1,$2,'UPDATE') as allowed",
          [`world_v2.${table}`, column],
        )
      ).rows[0].allowed,
    ).toBe(true);
  const row = (
    await scoped.query(`select
    has_table_privilege(current_user,'world_v2.world_head','UPDATE') as head_broad,
    has_table_privilege(current_user,'world_v2.world_writer_lease','UPDATE') as lease_broad,
    has_column_privilege(current_user,'world_v2.world_head','world_id','UPDATE') as head_identity,
    has_column_privilege(current_user,'world_v2.world_writer_lease','world_id','UPDATE') as lease_identity,
    exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname=current_user) as membership`)
  ).rows[0];
  expect(row).toEqual({
    head_broad: false,
    lease_broad: false,
    head_identity: false,
    lease_identity: false,
    membership: false,
  });
}

suite('writer supervisor — exact-column native capability boundary', () => {
  beforeAll(async () => {
    const target = assertV09PostgresTestEnvironment();
    const fixture = await loadFrozenRenewalMigrationFixture(
      path.resolve(import.meta.dirname, '../..'),
    );
    admin = new Pool({ connectionString: target.connectionString, max: 2 });
    const identity = (
      await admin.query(
        'select current_database() as database,host(inet_server_addr()) as host,version() as version',
      )
    ).rows[0];
    expect(identity.database).toMatch(/^econmind_v09_d_supervisor_columns_/u);
    expect(identity.host).toBe('127.0.0.1');
    expect(
      (
        await admin.query(
          "select 1 from information_schema.schemata where schema_name='world_v2'",
        )
      ).rows,
    ).toHaveLength(0);
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
      `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
    );
    await admin.query(
      `create role ${group} nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
    );
    await admin.query(`grant usage on schema world_v2 to ${role}`);
    await admin.query(
      `grant select,insert,update(${mutable.world_writer_lease.join(',')}) on world_v2.world_writer_lease to ${role}`,
    );
    await admin.query(
      `grant select,update(${mutable.world_head.join(',')}) on world_v2.world_head to ${role}`,
    );
    // Remove default PUBLIC execution only in this owned fixture so each
    // missing function grant can actually be observed as missing.
    for (const fn of Object.values(functions)) {
      await admin.query(`revoke all on function ${fn} from public`);
      await admin.query(`grant execute on function ${fn} to ${role}`);
    }
    const url = new URL(target.connectionString);
    url.username = role;
    scoped = new Pool({
      connectionString: url.toString(),
      max: 3,
      options: '-c lock_timeout=2000 -c statement_timeout=10000',
    });
    database = new PostgresSqlDatabase(scoped);
    console.log(
      JSON.stringify({
        scope: 'TEST_ONLY_NATIVE_COLUMN_SUPERVISOR',
        ...identity,
        migrationPrefix: 6,
        productionAccess: false,
      }),
    );
  });
  afterAll(async () => {
    await Promise.all(extraPools.map((pool) => pool.end()));
    await scoped?.end();
    await admin?.end();
    // The caller owns/stops the generation. Never reset/drop a shared schema.
  });

  it('acquires, renews and asserts with real exact-column nonadmin rights, no table UPDATE', async () => {
    const identity = (
      await scoped.query(`select current_user,session_user,
      r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
      exists(select 1 from pg_auth_members where member=r.oid) as membership,
      has_table_privilege(current_user,'world_v2.world_head','UPDATE') as head_table_update,
      has_table_privilege(current_user,'world_v2.world_writer_lease','UPDATE') as lease_table_update,
      has_column_privilege(current_user,'world_v2.world_head','world_id','UPDATE') as head_identity,
      has_column_privilege(current_user,'world_v2.world_writer_lease','world_id','UPDATE') as lease_identity
      from pg_roles r where r.rolname=current_user`)
    ).rows[0];
    expect(identity).toEqual({
      current_user: role,
      session_user: role,
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      membership: false,
      head_table_update: false,
      lease_table_update: false,
      head_identity: false,
      lease_identity: false,
    });
    const world = await addWorld(),
      instance = host(world);
    const first = await instance.acquire(t0);
    expect(first).toMatchObject({ fencingToken: '1', acquiredAtReal: t0 });
    expect(await instance.renew(t250)).toMatchObject({
      fencingToken: '1',
      acquiredAtReal: t0,
      renewedAtReal: t250,
    });
    await expect(
      instance.assertCanCommit({
        observedAtReal: t500,
        expectedWorldVersion: '0',
      }),
    ).resolves.toMatchObject({ fencingToken: '1' });
    expect(instance.status(t500)).toMatchObject({ ready: true });
    await expect(
      scoped.query(
        'update world_v2.world_head set world_id=world_id where world_id=$1',
        [world],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      scoped.query(
        'update world_v2.world_writer_lease set world_id=world_id where world_id=$1',
        [world],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await instance.stop();
  });

  it.each(
    Object.entries(mutable).flatMap(([table, columns]) =>
      columns.map((column) => [table, column]),
    ),
  )('rejects each missing UPDATE column %s.%s', async (table, column) => {
    const world = await addWorld();
    await withGrant(
      `revoke update(${column}) on world_v2.${table} from ${role}`,
      `grant update(${column}) on world_v2.${table} to ${role}`,
      () => denyWithoutLease(world),
    );
  });
  it.each([
    ['world_head', 'select'],
    ['world_writer_lease', 'select'],
    ['world_writer_lease', 'insert'],
  ])('retains required %s %s', async (table, privilege) => {
    const world = await addWorld();
    await withGrant(
      `revoke ${privilege} on world_v2.${table} from ${role}`,
      `grant ${privilege} on world_v2.${table} to ${role}`,
      () => denyWithoutLease(world),
    );
  });
  it.each(Object.values(functions))(
    'retains required exact function EXECUTE %s',
    async (fn) => {
      const world = await addWorld();
      await withGrant(
        `revoke execute on function ${fn} from ${role}`,
        `grant execute on function ${fn} to ${role}`,
        () => denyWithoutLease(world),
      );
    },
  );
  it.each(Object.keys(mutable))(
    'rejects direct table UPDATE on %s even though all positive column checks are true',
    async (table) => {
      const world = await addWorld();
      await withGrant(
        `grant update on world_v2.${table} to ${role}`,
        `revoke update on world_v2.${table} from ${role}`,
        async () => {
          expect(
            (
              await scoped.query(
                `select has_column_privilege(current_user,'world_v2.${table}','world_id','UPDATE') as identity`,
              )
            ).rows[0].identity,
          ).toBe(true);
          await denyWithoutLease(world);
        },
      );
    },
  );
  it.each(Object.keys(mutable))(
    'rejects direct identity-column UPDATE on %s',
    async (table) => {
      const world = await addWorld();
      await withGrant(
        `grant update(world_id) on world_v2.${table} to ${role}`,
        `revoke update(world_id) on world_v2.${table} from ${role}`,
        () => denyWithoutLease(world),
      );
    },
  );
  it.each(Object.keys(mutable))(
    'rejects PUBLIC identity write on %s',
    async (table) => {
      const world = await addWorld();
      await withGrant(
        `grant update(world_id) on world_v2.${table} to public`,
        `revoke update(world_id) on world_v2.${table} from public`,
        () => denyWithoutLease(world),
      );
    },
  );
  it.each([
    'INHERIT TRUE, SET FALSE',
    'INHERIT FALSE, SET TRUE',
    'INHERIT FALSE, SET FALSE',
  ])('rejects membership/role-graph path %s', async (options) => {
    const world = await addWorld();
    await admin.query(`grant update on world_v2.world_head to ${group}`);
    await withGrant(
      `grant ${group} to ${role} with ${options}`,
      `revoke ${group} from ${role}`,
      async () => {
        if (options === 'INHERIT FALSE, SET TRUE') {
          expect(
            (
              await scoped.query(
                "select has_table_privilege(current_user,'world_v2.world_head','UPDATE') as broad",
              )
            ).rows[0].broad,
          ).toBe(false);
          const client = await scoped.connect();
          try {
            await client.query(`set role ${group}`);
            expect(
              (await client.query('select current_user')).rows[0].current_user,
            ).toBe(group);
          } finally {
            await client.query('reset role');
            client.release();
          }
        }
        await denyWithoutLease(world);
      },
    );
  });
  it.each(Object.keys(mutable))(
    'rejects an unexpected writable schema column on %s',
    async (table) => {
      const world = await addWorld();
      await assertBaseline();
      await admin.query(
        `alter table world_v2.${table} add column future_unreviewed text`,
      );
      try {
        await admin.query(
          `grant update(future_unreviewed) on world_v2.${table} to ${role}`,
        );
        await denyWithoutLease(world);
      } finally {
        await admin.query(
          `alter table world_v2.${table} drop column future_unreviewed`,
        );
        await assertBaseline();
      }
    },
  );
  it.each([
    [
      'head INSERT(column)',
      `grant insert(world_version) on world_v2.world_head to ${role}`,
      `revoke insert(world_version) on world_v2.world_head from ${role}`,
    ],
    [
      'head DELETE',
      `grant delete on world_v2.world_head to ${role}`,
      `revoke delete on world_v2.world_head from ${role}`,
    ],
    [
      'head TRUNCATE',
      `grant truncate on world_v2.world_head to ${role}`,
      `revoke truncate on world_v2.world_head from ${role}`,
    ],
    [
      'lease DELETE',
      `grant delete on world_v2.world_writer_lease to ${role}`,
      `revoke delete on world_v2.world_writer_lease from ${role}`,
    ],
    [
      'lease TRUNCATE',
      `grant truncate on world_v2.world_writer_lease to ${role}`,
      `revoke truncate on world_v2.world_writer_lease from ${role}`,
    ],
    [
      'schema CREATE',
      `grant create on schema world_v2 to ${role}`,
      `revoke create on schema world_v2 from ${role}`,
    ],
    [
      'CREATEDB',
      `alter role ${role} createdb`,
      `alter role ${role} nocreatedb`,
    ],
  ])('retains forbidden capability %s', async (_name, grant, revoke) => {
    const world = await addWorld();
    await withGrant(grant, revoke, () => denyWithoutLease(world));
  });
  it('denies read-only transactions before acquire', async () => {
    const world = await addWorld();
    const port: SqlDatabase = {
      query: database.query.bind(database),
      transaction: (run) =>
        database.transaction(async (sql) => {
          await sql.query('set transaction read only');
          return run(sql);
        }),
    };
    await denyWithoutLease(world, port);
  });
  it('rebinds after acquire and rolls back if a required column grant is lost', async () => {
    const world = await addWorld();
    const port: SqlDatabase = {
      query: database.query.bind(database),
      transaction: (run) =>
        database.transaction((sql) =>
          run({
            async query<Row extends object>(
              statement: string,
              parameters?: readonly unknown[],
            ) {
              const result = await sql.query<Row>(statement, parameters);
              if (
                statement.includes(
                  'acquisition_kind from world_v2.acquire_world_writer_lease',
                )
              )
                await admin.query(
                  `revoke update(event_sequence) on world_v2.world_head from ${role}`,
                );
              return result;
            },
          }),
        ),
    };
    try {
      await denyWithoutLease(world, port);
    } finally {
      await admin.query(
        `grant update(event_sequence) on world_v2.world_head to ${role}`,
      );
      await assertBaseline();
    }
  });
  it('does not grant liveness after renewal COMMIT or release acknowledgement failure', async () => {
    for (const failure of ['commit', 'release']) {
      const world = await addWorld();
      let calls = 0;
      const port: SqlDatabase = {
        query: database.query.bind(database),
        async transaction<T>(run: (sql: SqlExecutor) => Promise<T>) {
          const value = await database.transaction(run);
          if (++calls === 2) {
            if (failure === 'release')
              throw Error('TEST_ONLY_RELEASE_AFTER_REAL_COMMIT');
            throw new PostgresTransactionError({
              outcome: 'COMMIT_OUTCOME_UNKNOWN',
              cause: Error('TEST_ONLY_RENEW_ACK_LOSS'),
            });
          }
          return value;
        },
      };
      const instance = host(world, port);
      await instance.acquire(t0);
      await expect(instance.renew(t250)).rejects.toMatchObject({
        outcome: 'UNKNOWN',
      });
      expect(instance.status(t500)).toMatchObject({
        ready: false,
        failure: 'UNKNOWN',
        lastConfirmedLease: { renewedAtReal: t0 },
      });
      expect(
        (
          await admin.query(
            'select to_char(renewed_at_real at time zone \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') as renewed from world_v2.world_writer_lease where world_id=$1',
            [world],
          )
        ).rows[0].renewed,
      ).toBe(t250);
      expect(() =>
        instance.assertCanCommit({
          observedAtReal: t500,
          expectedWorldVersion: '0',
        }),
      ).toThrow('SUPERVISOR_CLOSED');
      expect(calls).toBe(2);
      await instance.stop();
    }
  });
  it('still rejects a changed World head via the real in-transaction guard', async () => {
    const world = await addWorld(),
      instance = host(world);
    await instance.acquire(t0);
    await admin.query(
      'update world_v2.world_head set world_version=1 where world_id=$1',
      [world],
    );
    await expect(
      instance.assertCanCommit({
        observedAtReal: t250,
        expectedWorldVersion: '0',
      }),
    ).rejects.toMatchObject({
      outcome: 'REJECTED',
      cause: { cause: { message: 'WORLD_VERSION_MISMATCH' } },
    });
    expect(instance.status(t250)).toMatchObject({
      ready: false,
      failure: 'LOST',
    });
    await instance.stop();
  });
  it('does not confer supervisor rights on reader/intake-like test identities', async () => {
    const target = assertV09PostgresTestEnvironment();
    for (const label of ['reader', 'intake']) {
      const other = `d_test_column_${label}`;
      await admin.query(
        `create role ${other} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
      await admin.query(`grant usage on schema world_v2 to ${other}`);
      await admin.query(
        `grant select on world_v2.world_head,world_v2.world_writer_lease to ${other}`,
      );
      const url = new URL(target.connectionString);
      url.username = other;
      const pool = new Pool({ connectionString: url.toString(), max: 1 });
      extraPools.push(pool);
      const world = await addWorld(),
        instance = createWriterLeaseSupervisor({
          database: new PostgresSqlDatabase(pool),
          role: other,
          worldId: world,
          workerId: 'WORKER_D_COLUMN',
          leaseDurationMilliseconds: '1000',
        });
      await expect(instance.acquire(t0)).rejects.toMatchObject({
        outcome: 'REJECTED',
      });
      expect(instance.status(t0).ready).toBe(false);
      await instance.stop();
      expect(
        (
          await admin.query(
            'select 1 from world_v2.world_writer_lease where world_id=$1',
            [world],
          )
        ).rows,
      ).toHaveLength(0);
    }
  });
});
