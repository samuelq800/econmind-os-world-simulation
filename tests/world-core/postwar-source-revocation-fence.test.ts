/** Actual embedded SQL guard/ACL contract. The separate native two-backend
 * evidence proves RR blocking/40001; this tiny metadata fixture is TEST_ONLY. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  lockPostwarSourceRevocationFencesFrom,
  POSTWAR_SOURCE_REVOCATION_FENCE_QUERY,
} from '../../apps/world-worker/src/persistence/postwar-source-revocation-fence.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
let db: PGlite;
const world = 'WORLD_FENCE_TEST_ONLY';
const sql = (name: string) =>
  readFile(
    new URL('../../database/proposals/' + name + '.sql', import.meta.url),
    'utf8',
  );
const tx: SqlExecutor = {
  async query<Row extends object>(q: string, args: readonly unknown[] = []) {
    const r = await db.query<Row>(q, [...args]);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
};
async function reader<T>(f: () => Promise<T>, mode = 'repeatable read') {
  await db.exec(
    'set session authorization fence_test_reader;begin isolation level ' +
      mode +
      ';set local role world_v2_captain_source_reader',
  );
  try {
    return await f();
  } finally {
    await db.exec('rollback;reset role;set session authorization postgres');
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema world_v2;
 create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
 create table world_v2.opening_seed(world_id text,seed_fingerprint text,unique(world_id,seed_fingerprint));
 create table world_v2.world_writer_lease(world_id text,holder_id text,fencing_token bigint,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz);
 create table world_v2.current_commit_authorization(world_id text,auth_subject uuid,country_id text,office_id text,team_id text,authorization_version text,capability text,active boolean);
 create table world_v2.runtime_read_seat(world_id text,auth_subject uuid);
 create table world_v2.world_command_execution_revocation(registration_ref text,world_id text,reason_ref text);
 create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;
 insert into world_v2.world_head values('WORLD_FENCE_TEST_ONLY',0,0);`);
  await db.exec(await sql('captain-operating-custody'));
  await db.exec(
    'create role world_v2_social_source_publisher nologin nosuperuser nobypassrls;create role world_v2_social_source_owner nologin nosuperuser nobypassrls;create role world_v2_industry_source_owner nologin nosuperuser nobypassrls;create role world_v2_social_source_reader nologin nosuperuser nobypassrls;grant usage on schema world_v2 to world_v2_social_source_publisher,world_v2_social_source_owner',
  );
  await db.exec(await sql('postwar-source-revocation-fence'));
  await db.exec(
    "create role fence_test_publisher login nosuperuser nobypassrls;grant world_v2_social_source_publisher to fence_test_publisher;create function world_v2.test_only_nested_fence(p_world text)returns void language sql security definer set search_path=pg_catalog as 'select world_v2.lock_postwar_source_revocation_fences(p_world)';alter function world_v2.test_only_nested_fence(text)owner to world_v2_social_source_owner;revoke all on function world_v2.test_only_nested_fence(text)from public;grant execute on function world_v2.test_only_nested_fence(text)to world_v2_social_source_publisher",
  );
  await db.exec(
    "create role fence_test_social login nosuperuser nobypassrls;grant world_v2_social_source_reader to fence_test_social;grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_industry_source_owner;create function world_v2.test_only_industry_nested_fence(p_world text)returns void language sql security definer set search_path=pg_catalog as 'select world_v2.lock_postwar_source_revocation_fences(p_world)';alter function world_v2.test_only_industry_nested_fence(text)owner to world_v2_industry_source_owner;revoke all on function world_v2.test_only_industry_nested_fence(text)from public;grant execute on function world_v2.test_only_industry_nested_fence(text)to world_v2_social_source_reader",
  );
  await db.exec(
    'create role fence_test_reader login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_captain_source_reader to fence_test_reader',
  );
}, 15000);
afterAll(async () => {
  await db?.close();
});
it('backfills existing World and creates a fence for later new Worlds, without source facts', async () => {
  await reader(() =>
    lockPostwarSourceRevocationFencesFrom(tx, { worldId: world }),
  );
  await db.query('insert into world_v2.world_head values($1,0,0)', [
    'WORLD_FENCE_NEW_TEST_ONLY',
  ]);
  await reader(() =>
    lockPostwarSourceRevocationFencesFrom(tx, {
      worldId: 'WORLD_FENCE_NEW_TEST_ONLY',
    }),
  );
  expect(
    (
      await db.query(
        'select count(*)::text n from world_v2.postwar_source_revocation_fence',
      )
    ).rows,
  ).toEqual([{ n: '2' }]);
});
it('requires actual bounded role and write RR, and never grants raw fence access', async () => {
  await expect(
    reader(() =>
      tx.query('select * from world_v2.postwar_source_revocation_fence'),
    ),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    reader(
      () => lockPostwarSourceRevocationFencesFrom(tx, { worldId: world }),
      'read committed',
    ),
  ).rejects.toMatchObject({ code: '25001' });
  await expect(
    tx.query(POSTWAR_SOURCE_REVOCATION_FENCE_QUERY, [world]),
  ).rejects.toMatchObject({ code: '42501' });
  const p = await db.query(
    `select has_table_privilege('fence_test_reader','world_v2.postwar_source_revocation_fence','SELECT') sel,has_column_privilege('fence_test_reader','world_v2.postwar_source_revocation_fence','revision','UPDATE') upd`,
  );
  expect(p.rows).toEqual([{ sel: false, upd: false }]);
});
it('denies unknown or malformed World scope instead of inventing revision zero', async () => {
  await expect(
    reader(() =>
      lockPostwarSourceRevocationFencesFrom(tx, {
        worldId: 'WORLD_UNKNOWN_TEST_ONLY',
      }),
    ),
  ).rejects.toMatchObject({
    code: '55000',
    message: 'REVOCATION_FENCE_REGISTERED_WORLD_REQUIRED',
  });
  await expect(
    lockPostwarSourceRevocationFencesFrom(tx, { worldId: 'world;drop' }),
  ).rejects.toThrow('EXACT_WORLD');
});
it('updates only derived same-World fence for auth/seat/control changes and rolls it back with failed transaction', async () => {
  const before = await db.query(
    'select revision::text from world_v2.postwar_source_revocation_fence where world_id=$1',
    [world],
  );
  await db.exec('begin');
  await db.query(
    "insert into world_v2.runtime_read_seat values($1,'11111111-1111-4111-8111-111111111111')",
    [world],
  );
  await db.query(
    "insert into world_v2.world_command_execution_revocation values('TEST_ONLY_EXECUTION',$1,'TEST_ONLY_REVOCATION')",
    [world],
  );
  await db.exec('rollback');
  expect(
    (
      await db.query(
        'select revision::text from world_v2.postwar_source_revocation_fence where world_id=$1',
        [world],
      )
    ).rows,
  ).toEqual(before.rows);
  expect(
    (await db.query('select count(*)::text n from world_v2.runtime_read_seat'))
      .rows,
  ).toEqual([{ n: '0' }]);
});
it('allows the actual Social publisher role and nested inaccessible owner to execute only the fixed guard', async () => {
  await db.exec(
    'set session authorization fence_test_publisher;begin isolation level repeatable read;set local role world_v2_social_source_publisher',
  );
  try {
    await tx.query('select world_v2.test_only_nested_fence($1)', [world]);
    await tx.query(POSTWAR_SOURCE_REVOCATION_FENCE_QUERY, [world]);
  } finally {
    await db.exec('rollback;reset role;set session authorization postgres');
  }
  expect(
    (
      await db.query(
        "select pg_has_role('fence_test_publisher','world_v2_captain_source_reader','MEMBER') member,has_table_privilege('fence_test_publisher','world_v2.postwar_source_revocation_fence','SELECT') raw",
      )
    ).rows,
  ).toEqual([{ member: false, raw: false }]);
});
it('allows the genuine Social reader effective role through the inaccessible Industry owner guard', async () => {
  await db.exec(
    'set session authorization fence_test_social;begin isolation level repeatable read;set local role world_v2_social_source_reader',
  );
  try {
    await tx.query('select world_v2.test_only_industry_nested_fence($1)', [
      world,
    ]);
  } finally {
    await db.exec('rollback;reset role;set session authorization postgres');
  }
  expect(
    (
      await db.query(
        "select pg_has_role('fence_test_social','world_v2_industry_source_owner','MEMBER') owner_member,has_table_privilege('fence_test_social','world_v2.postwar_source_revocation_fence','SELECT') raw",
      )
    ).rows,
  ).toEqual([{ owner_member: false, raw: false }]);
});
it('rejects moving current metadata between Worlds rather than fencing only the new identity', async () => {
  await db.query(
    "insert into world_v2.runtime_read_seat values($1,'11111111-1111-4111-8111-111111111111')",
    [world],
  );
  const before = await db.query(
    'select world_id,revision::text from world_v2.postwar_source_revocation_fence order by world_id',
  );
  await expect(
    db.query(
      "update world_v2.runtime_read_seat set world_id='WORLD_FENCE_NEW_TEST_ONLY' where world_id=$1",
      [world],
    ),
  ).rejects.toMatchObject({
    code: '22023',
    message: 'REVOCATION_FENCE_WORLD_IDENTITY_IMMUTABLE',
  });
  expect(
    (
      await db.query(
        'select world_id,revision::text from world_v2.postwar_source_revocation_fence order by world_id',
      )
    ).rows,
  ).toEqual(before.rows);
  expect(
    (await db.query('select world_id from world_v2.runtime_read_seat')).rows,
  ).toEqual([{ world_id: world }]);
});
it('refuses a subsequently installed unprotected revocation domain', async () => {
  await db.exec(
    'create table world_v2.finance_budget_policy_revocation(policy_ref text)',
  );
  await expect(
    reader(() => lockPostwarSourceRevocationFencesFrom(tx, { worldId: world })),
  ).rejects.toMatchObject({
    code: '55000',
    message:
      'REVOCATION_FENCE_TRIGGER_COVERAGE_REQUIRED:finance_budget_policy_revocation',
  });
});
it('does not treat missing RPC rows as a ready proof', async () => {
  await expect(
    lockPostwarSourceRevocationFencesFrom(
      {
        async query() {
          return { rows: [], rowCount: 0 };
        },
      },
      { worldId: world },
    ),
  ).rejects.toThrow('ONE_FIXED_RESULT');
});
