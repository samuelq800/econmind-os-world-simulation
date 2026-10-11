// TEST_ONLY native two-connection schedules. No real source/writer admission.
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { loadFrozenRenewalMigrationFixture } from '../support/renewal-frozen-migration-fixture.js';
import {
  fixture,
  footprint,
  insertAuthorization,
  observe,
  repository,
  seed,
  zeroEffects,
  worker,
  recordedAt,
  type Fixture,
} from '../support/d-revoked-receipt-fixture.js';

const suite = process.env.V09_TEST_DATABASE_URL ? describe : describe.skip;
const consumerRole = 'd_test_revoked_consumer';
const writerRole = 'd_test_revoked_writer';
let admin: Pool;
let consumer: Pool;
let writer: Pool;
let database: PostgresSqlDatabase;
function gate() {
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
async function beginWriter() {
  const client = await writer.connect();
  await client.query('begin');
  return client;
}
async function lockHead(client: PoolClient, f: Fixture) {
  return client.query(
    'select world_id from world_v2.world_head where world_id = $1 for update',
    [f.command.worldId],
  );
}
async function changeAuthority(
  client: PoolClient,
  f: Fixture,
  active: boolean,
) {
  await client.query(
    `update world_v2.current_commit_authorization set active=$2,
    authorization_version='TEST_REVISION_2',refreshed_at_real='2026-10-10T00:00:00.500Z' where world_id=$1`,
    [f.command.worldId, active],
  );
}
async function active(f: Fixture) {
  return (
    await admin.query(
      'select active from world_v2.current_commit_authorization where world_id=$1',
      [f.command.worldId],
    )
  ).rows[0]?.active;
}
async function assertBlocked(applicationName: string, blocker: number) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const rows = (
      await admin.query(
        `select pid,wait_event_type from pg_stat_activity
      where application_name=$1 and $2::int=any(pg_blocking_pids(pid))`,
        [applicationName, blocker],
      )
    ).rows;
    if (rows.length === 1 && rows[0].wait_event_type === 'Lock') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`EXPECTED_NATIVE_H_BLOCK_NOT_OBSERVED:${applicationName}`);
}
async function pausedReceipt(f: Fixture) {
  const paused = gate();
  const resume = gate();
  let consumerPid = 0;
  // Observational wrappers only: actual guard, repository SQL, adapter and
  // COMMIT remain unchanged. Pause AFTER real receipt insert and Q update.
  const port = observe(database, async (sql, _parameters, phase) => {
    if (phase === 'AFTER' && /update world_v2.command_queue/u.test(sql)) {
      consumerPid = Number(
        (
          await admin.query(`select pid from pg_stat_activity
        where application_name='d_revoked_consumer' and state='idle in transaction'`)
        ).rows[0]?.pid,
      );
      paused.release();
      await resume.wait;
    }
  });
  const pending = repository(port)
    .recordZeroEffectReceipt(f.receipt)
    .then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );
  await Promise.race([
    paused.wait,
    pending.then((result) => {
      throw new Error(
        `RECEIPT_DID_NOT_REACH_Q_PAUSE:${JSON.stringify(result)}`,
      );
    }),
  ]);
  expect(consumerPid).toBeGreaterThan(0);
  return { pending, resume, consumerPid };
}

suite('revoked receipt — actual-schema native H serialization', () => {
  beforeAll(async () => {
    const target = assertV09PostgresTestEnvironment();
    const frozen = await loadFrozenRenewalMigrationFixture(
      path.resolve(import.meta.dirname, '../..'),
    );
    admin = new Pool({ connectionString: target.connectionString, max: 3 });
    const identity = (
      await admin.query(
        'select current_database() as database,host(inet_server_addr()) as host,version() as version',
      )
    ).rows[0];
    expect(identity.database).toMatch(/^econmind_v09_d_revoked_/u);
    expect(identity.host).toBe('127.0.0.1');
    expect(
      (
        await admin.query(
          "select 1 from information_schema.schemata where schema_name='world_v2'",
        )
      ).rows,
    ).toHaveLength(0);
    for (const [index, migration] of frozen.manifest.migrations
      .slice(0, 12)
      .entries()) {
      await admin.query(frozen.artifacts[index]!);
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
    for (const role of [consumerRole, writerRole]) {
      await admin.query(
        `create role ${role} login noinherit nosuperuser nobypassrls nocreatedb nocreaterole noreplication`,
      );
      await admin.query(`grant usage on schema world_v2 to ${role}`);
      // SELECT FOR UPDATE needs UPDATE on at least one column. This exact
      // mutable column grant matches D's column-aware supervisor contract.
      await admin.query(
        `grant select,update(world_version) on world_v2.world_head to ${role}`,
      );
    }
    await admin.query(
      `grant select,update(command_type) on world_v2.command_submission to ${consumerRole}`,
    );
    await admin.query(
      `grant select,insert on world_v2.command_receipt to ${consumerRole}`,
    );
    await admin.query(
      `grant select,update(queue_state,finalized_at_real) on world_v2.command_queue to ${consumerRole}`,
    );
    await admin.query(
      `grant select,update(active) on world_v2.current_commit_authorization to ${consumerRole}`,
    );
    await admin.query(
      `grant select,update(renewed_at_real) on world_v2.world_writer_lease to ${consumerRole}`,
    );
    await admin.query(
      `grant select on world_v2.authoritative_event to ${consumerRole}`,
    );
    await admin.query(
      `grant select,insert,update(active,authorization_version,refreshed_at_real) on world_v2.current_commit_authorization to ${writerRole}`,
    );
    const consumerUrl = new URL(target.connectionString);
    consumerUrl.username = consumerRole;
    const writerUrl = new URL(target.connectionString);
    writerUrl.username = writerRole;
    consumer = new Pool({
      connectionString: consumerUrl.toString(),
      max: 2,
      application_name: 'd_revoked_consumer',
      options: '-c lock_timeout=4000 -c statement_timeout=10000',
    });
    writer = new Pool({
      connectionString: writerUrl.toString(),
      max: 2,
      application_name: 'd_revoked_writer',
      options: '-c lock_timeout=4000 -c statement_timeout=10000',
    });
    database = new PostgresSqlDatabase(consumer);
    console.log(
      JSON.stringify({
        scope: 'TEST_ONLY_REVOKED_H_SERIALIZATION',
        ...identity,
        migrationPrefix: 12,
        fullChain: false,
        sourceRegistration: false,
        productionAccess: false,
      }),
    );
  });
  afterAll(async () => {
    await consumer?.end();
    await writer?.end();
    await admin?.end();
  });

  it('uses distinct nonadmin no-membership logins and only column-level H update', async () => {
    for (const [pool, role] of [
      [consumer, consumerRole],
      [writer, writerRole],
    ] as const) {
      const row = (
        await pool.query(`select current_user,session_user,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
        exists(select 1 from pg_auth_members where member=r.oid) as membership,
        has_table_privilege(current_user,'world_v2.world_head','UPDATE') as broad,
        has_column_privilege(current_user,'world_v2.world_head','world_version','UPDATE') as mutable,
        has_column_privilege(current_user,'world_v2.world_head','world_id','UPDATE') as identity
        from pg_roles r where r.rolname=current_user`)
      ).rows[0];
      expect(row).toEqual({
        current_user: role,
        session_user: role,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        membership: false,
        broad: false,
        mutable: true,
        identity: false,
      });
    }
  });
  it('retains H through receipt and Q until outer COMMIT (NOWAIT witness)', async () => {
    const f = fixture('NATIVE_HOLD');
    await seed(new PostgresSqlDatabase(admin), f);
    const paused = await pausedReceipt(f);
    const client = await beginWriter();
    try {
      await expect(
        client.query(
          'select world_id from world_v2.world_head where world_id=$1 for update nowait',
          [f.command.worldId],
        ),
      ).rejects.toMatchObject({ code: '55P03' });
      expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
        ...zeroEffects,
        queue: 'CLAIMED',
        receipts: 0,
      });
    } finally {
      await client.query('rollback');
      client.release();
      paused.resume.release();
      await paused.pending;
    }
    expect(await paused.pending).toMatchObject({ ok: true, value: f.receipt });
    expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
      ...zeroEffects,
      queue: 'FINALIZED',
      receipts: 1,
    });
  });
  it.each([false, null] as const)(
    'receipt-first blocks activation (%s) until refusal COMMIT',
    async (initial) => {
      const f = fixture(initial === null ? 'NATIVE_ABSENT' : 'NATIVE_INACTIVE');
      await seed(new PostgresSqlDatabase(admin), f, initial);
      const paused = await pausedReceipt(f);
      const client = await beginWriter();
      const locking = lockHead(client, f).then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      try {
        await assertBlocked('d_revoked_writer', paused.consumerPid);
        expect(await active(f)).toBe(initial === null ? undefined : false);
        paused.resume.release();
        expect(await paused.pending).toMatchObject({
          ok: true,
          value: f.receipt,
        });
        expect(await locking).toMatchObject({ ok: true });
        if (initial === null)
          await insertAuthorization(
            {
              query: async (sql, parameters = []) => {
                const r = await client.query(sql, [...parameters]);
                return { rowCount: r.rowCount, rows: r.rows };
              },
            },
            f,
            true,
          );
        else await changeAuthority(client, f, true);
        await client.query('commit');
      } finally {
        paused.resume.release();
        await paused.pending;
        await locking;
        await client.query('rollback');
        client.release();
      }
      expect(await active(f)).toBe(true);
      // Final immutable refusal survives later activation. No new decision or Q write.
      expect(
        await repository(database).recordZeroEffectReceipt(f.receipt),
      ).toEqual(f.receipt);
      expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
        ...zeroEffects,
        queue: 'FINALIZED',
        receipts: 1,
      });
    },
  );
  it.each([true, false] as const)(
    'writer-first active=%s: post-H fresh read observes committed activation/revoke',
    async (nextActive) => {
      const f = fixture(
        nextActive ? 'NATIVE_ACTIVATE_FIRST' : 'NATIVE_REVOKE_FIRST',
      );
      await seed(new PostgresSqlDatabase(admin), f, !nextActive);
      const client = await beginWriter();
      await lockHead(client, f);
      await changeAuthority(client, f, nextActive);
      const pid = Number(
        (await client.query('select pg_backend_pid() as pid')).rows[0].pid,
      );
      const pending = repository(database)
        .recordZeroEffectReceipt(f.receipt)
        .then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        );
      try {
        await assertBlocked('d_revoked_consumer', pid);
        await client.query('commit');
      } finally {
        await client.query('rollback');
        client.release();
      }
      if (nextActive)
        expect(await pending).toMatchObject({
          ok: false,
          error: {
            outcome: 'ROLLED_BACK',
            cause: { code: 'AUTHORIZATION_DENIED' },
          },
        });
      else expect(await pending).toMatchObject({ ok: true, value: f.receipt });
      expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
        ...zeroEffects,
        queue: nextActive ? 'CLAIMED' : 'FINALIZED',
        receipts: nextActive ? 0 : 1,
      });
    },
  );
  it('active-first refusal rolls back; a later H-first revoke permits exact retry', async () => {
    const f = fixture('NATIVE_ACTIVE_RETRY');
    await seed(new PostgresSqlDatabase(admin), f, true);
    await expect(
      repository(database).recordZeroEffectReceipt(f.receipt),
    ).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
      cause: { code: 'AUTHORIZATION_DENIED' },
    });
    expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
      ...zeroEffects,
      queue: 'CLAIMED',
      receipts: 0,
    });
    const client = await beginWriter();
    try {
      await lockHead(client, f);
      await changeAuthority(client, f, false);
      await client.query('commit');
    } finally {
      await client.query('rollback');
      client.release();
    }
    expect(
      await repository(database).recordZeroEffectReceipt(f.receipt),
    ).toEqual(f.receipt);
  });
  it('retains lease-before-H compatibility with the actual positive commit guard', async () => {
    const f = fixture('NATIVE_POSITIVE_PREFIX');
    await seed(new PostgresSqlDatabase(admin), f);
    const client = await consumer.connect();
    await client.query('begin');
    await client.query("set local application_name='d_revoked_positive'");
    // Deliberately stop inside the unchanged positive guard's real prefix.
    // No candidate, economic write, formal admission or positive COMMIT claim.
    await client.query(
      'select world_id from world_v2.world_writer_lease where world_id=$1 for update',
      [f.command.worldId],
    );
    const pid = Number(
      (await client.query('select pg_backend_pid() as pid')).rows[0].pid,
    );
    const pending = repository(database)
      .recordZeroEffectReceipt(f.receipt)
      .then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
    let guardResult: { ok: boolean; error?: unknown };
    try {
      await assertBlocked('d_revoked_consumer', pid);
      guardResult = await client
        .query(
          'select * from world_v2.assert_world_writer_commit_guard($1,$2,$3,$4,$5)',
          [f.command.worldId, worker, '1', '0', recordedAt],
        )
        .then(
          () => ({ ok: true }),
          (error) => ({ ok: false, error }),
        );
      await client.query(guardResult.ok ? 'commit' : 'rollback');
    } finally {
      await client.query('rollback');
      client.release();
    }
    const result = await pending;
    // Preserve actual PostgreSQL errors in the raw reporter on regression.
    expect({ guardResult, result }).toMatchObject({
      guardResult: { ok: true },
      result: { ok: true, value: f.receipt },
    });
    expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
      ...zeroEffects,
      queue: 'FINALIZED',
      receipts: 1,
    });
  });
  it('receipt-first releases its existing lease/H locks before the actual positive guard proceeds', async () => {
    const f = fixture('NATIVE_REFUSAL_POSITIVE');
    await seed(new PostgresSqlDatabase(admin), f);
    const paused = await pausedReceipt(f);
    const client = await consumer.connect();
    await client.query('begin');
    await client.query("set local application_name='d_revoked_positive'");
    const pending = client
      .query(
        'select * from world_v2.assert_world_writer_commit_guard($1,$2,$3,$4,$5)',
        [f.command.worldId, worker, '1', '0', recordedAt],
      )
      .then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );
    try {
      await assertBlocked('d_revoked_positive', paused.consumerPid);
      paused.resume.release();
      expect(await paused.pending).toMatchObject({
        ok: true,
        value: f.receipt,
      });
      expect(await pending).toMatchObject({ ok: true });
      await client.query('commit');
    } finally {
      paused.resume.release();
      await paused.pending;
      await pending;
      await client.query('rollback');
      client.release();
    }
    expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
      ...zeroEffects,
      queue: 'FINALIZED',
      receipts: 1,
    });
  });
  it('does not lock another World', async () => {
    const f = fixture('NATIVE_LOCAL');
    const other = fixture('NATIVE_OTHER');
    await seed(new PostgresSqlDatabase(admin), f);
    await seed(new PostgresSqlDatabase(admin), other);
    const paused = await pausedReceipt(f);
    const client = await beginWriter();
    try {
      expect(
        (
          await client.query(
            'select world_id from world_v2.world_head where world_id=$1 for update nowait',
            [other.command.worldId],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      await client.query('rollback');
      client.release();
      paused.resume.release();
      await paused.pending;
    }
    expect(await paused.pending).toMatchObject({ ok: true });
  });
  it('preserves the existing expired-lease veto with zero receipt/Q/economic writes', async () => {
    const f = fixture('NATIVE_LEASE');
    await seed(new PostgresSqlDatabase(admin), f);
    await expect(
      repository(database).recordZeroEffectReceipt({
        ...f.receipt,
        recordedAtReal: '2026-10-10T00:06:00.000Z',
      }),
    ).rejects.toMatchObject({
      outcome: 'ROLLED_BACK',
      cause: { code: 'WRITER_FENCE_STALE' },
    });
    expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
      ...zeroEffects,
      queue: 'CLAIMED',
      receipts: 0,
    });
  });
  it('requires an exact H-lock privilege; missing column UPDATE fails closed, no broad grant repair', async () => {
    const f = fixture('NATIVE_PRIVILEGE');
    await seed(new PostgresSqlDatabase(admin), f);
    await admin.query(
      `revoke update(world_version) on world_v2.world_head from ${consumerRole}`,
    );
    try {
      await expect(
        repository(database).recordZeroEffectReceipt(f.receipt),
      ).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
        cause: { code: '42501' },
      });
      expect(await footprint(new PostgresSqlDatabase(admin), f)).toEqual({
        ...zeroEffects,
        queue: 'CLAIMED',
        receipts: 0,
      });
    } finally {
      await admin.query(
        `grant update(world_version) on world_v2.world_head to ${consumerRole}`,
      );
    }
    expect(
      await repository(database).recordZeroEffectReceipt(f.receipt),
    ).toEqual(f.receipt);
  });
});
