/** TEST_ONLY actual embedded PostgreSQL metadata and role boundaries. No
 * production grants or economic writes; transport tests do not mint proofs. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
import { installPostwarNarrowTradeCutoffFixture } from '../support/postwar-narrow-trade-cutoff-fixture.js';
import {
  createPostwarIndustryAuthorizationDatabase,
  INDUSTRY_CURRENT_AUTHORIZATION_LOCK_QUERY as current,
  INDUSTRY_REVOKED_AUTHORIZATION_LOCK_QUERY as revoked,
} from '../../apps/world-worker/src/persistence/postwar-industry-current-authorization.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/worker-authorization-sql.js';
import { SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY } from '../../apps/world-worker/src/persistence/social-intake-authorization.js';
import type {
  SqlDatabase,
  SqlExecutor,
} from '../../apps/world-worker/src/persistence/sql-database.js';
describe('Industry exact worker authorization delegation protocol', () => {
  it('maps only Industry literals on the same executor, preserving raw errors, rows and wrapper identity', async () => {
    const calls: { sql: string; args: readonly unknown[] }[] = [],
      failure = Error('ACTUAL_SQL_FAILURE');
    let transactions = 0;
    const tx: SqlExecutor = {
      async query<Row extends object>(
        sql: string,
        args: readonly unknown[] = [],
      ) {
        calls.push({ sql, args });
        if (sql === 'fail') throw failure;
        return { rows: [] as Row[], rowCount: 0 };
      },
    };
    const db: SqlDatabase = {
      query: tx.query,
      async transaction<T>(consume: (t: SqlExecutor) => Promise<T>) {
        transactions++;
        return consume(tx);
      },
    };
    const w = createPostwarIndustryAuthorizationDatabase(db),
      p = [
        'WORLD_TEST',
        '00000000-0000-4000-8000-000000000001',
        'COUNTRY_02',
        'INDUSTRY',
        'INDUSTRY_PRODUCTION',
      ];
    expect(createPostwarIndustryAuthorizationDatabase(db)).toBe(w);
    expect(createPostwarIndustryAuthorizationDatabase(w)).toBe(w);
    await w.transaction(async (t) => {
      await t.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, p);
      await t.query(WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY, p.slice(0, 4));
      await t.query(SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY, p);
      expect(calls.map((c) => c.sql)).toEqual([
        current,
        revoked,
        'select team_id,authorization_version from world_v2.lock_postwar_industry_current_authorization($1,$2::uuid,$3,$4,$5)',
      ]);
      const foreign = [...p];
      foreign[3] = 'SOCIAL';
      foreign[4] = 'SOCIAL_LABOUR';
      await t.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, foreign);
      expect(calls.at(-1)).toEqual({
        sql: WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
        args: foreign,
      });
      await t.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY + ' ', p);
      expect(calls.at(-1)?.sql).toBe(
        WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY + ' ',
      );
      expect(() =>
        t.query(WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY, [
          ...p.slice(0, 4),
          'FINANCE_BUDGET',
        ]),
      ).toThrow('FIXED_PARAMETERS');
      expect(() => t.query(WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY, p)).toThrow(
        'FIXED_PARAMETERS',
      );
      await expect(t.query('fail')).rejects.toBe(failure);
    });
    expect(transactions).toBe(1);
    expect(calls.some((c) => /grant|set role|begin/i.test(c.sql))).toBe(false);
  });
});
describe('Industry current/revoked actual low-role SQL', () => {
  let db: PGlite,
    f: Awaited<ReturnType<typeof installPostwarNarrowTradeCutoffFixture>>,
    args: string[];
  const scope = (c: string) =>
    'OFFICE_' +
    Buffer.from(c).toString('hex').toUpperCase() +
    '_494E445553545259';
  beforeAll(async () => {
    db = new PGlite();
    f = await installPostwarNarrowTradeCutoffFixture(db);
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-industry-production-source.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(`grant world_v2_industry_source_reader to ${f.readerRole}`);
    await db.query(
      'update world_v2.current_commit_authorization set active=false where world_id=$1',
      [f.world],
    );
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'INDUSTRY','INDUSTRY_PRODUCTION',$4,$5,true,now())",
      [f.world, f.subject, f.seller, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.runtime_read_seat(world_id,auth_subject,country_id,office_id,team_id,authorization_revision)values($1,$2::uuid,$3,'INDUSTRY',$4,$5)",
      [f.world, f.subject, f.seller, f.team, f.revision],
    );
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE',$3,$4,true,now(),null)",
      [f.world, f.subject, scope(f.seller), f.revision],
    );
    await db.exec(
      await readFile(
        new URL(
          '../../database/proposals/postwar-industry-intake-binding.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    // Exercise owner policies with RLS actually enabled, not only declared.
    await db.exec(
      'alter table world_v2.current_commit_authorization enable row level security; alter table world_v2.current_commit_authorization force row level security',
    );
    args = [f.world, f.subject, f.seller, 'INDUSTRY', 'INDUSTRY_PRODUCTION'];
  }, 60000);
  afterEach(async () => {
    await f.reset();
  });
  afterAll(async () => {
    await db.close();
  });
  async function low() {
    await f.begin();
    await db.query("select set_config('request.jwt.claim.sub','',true)");
  }
  async function admin() {
    await f.reset();
  }
  it('reads real current and any-active metadata under actual RLS without JWT fabrication, raw seed or auth UPDATE', async () => {
    await low();
    const result = await db.query(current, args);
    expect(result.rows).toEqual([
      {
        auth_subject: f.subject,
        world_id: f.world,
        country_id: f.seller,
        office_id: 'INDUSTRY',
        capability: 'INDUSTRY_PRODUCTION',
        team_id: f.team,
        authorization_version: f.revision,
      },
    ]);
    expect((await db.query(revoked, args.slice(0, 4))).rows).toEqual([
      { '?column?': 1 },
    ]);
    const privileges = await db.query(
      "select has_column_privilege(current_user,'world_v2.current_commit_authorization','authorization_version','UPDATE')auth_update,has_column_privilege(current_user,'world_v2.projection_entitlement','active','UPDATE')entitlement_update,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')seed_read",
    );
    expect(privileges.rows[0]).toEqual({
      auth_update: false,
      entitlement_update: false,
      seed_read: false,
    });
    await expect(
      db.exec('update world_v2.current_commit_authorization set active=false'),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('rejects foreign offices/capabilities and returns no invented authorization for wrong country, subject or stale seat', async () => {
    for (const p of [
      [...args.slice(0, 4), 'FINANCE_BUDGET'],
      [...args.slice(0, 3), 'FINANCE', args[4]],
    ]) {
      await low();
      await expect(db.query(current, p)).rejects.toMatchObject({
        code: '42501',
      });
    }
    await low();
    expect(
      (
        await db.query(current, [
          f.world,
          f.subject,
          f.buyer,
          'INDUSTRY',
          'INDUSTRY_PRODUCTION',
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (await db.query(revoked, [f.world, f.subject, f.buyer, 'INDUSTRY'])).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(current, [
          f.world,
          '00000000-0000-4000-8000-000000000002',
          ...args.slice(2),
        ])
      ).rows,
    ).toEqual([]);
    await admin();
    await db.query(
      "update world_v2.current_commit_authorization set authorization_version='STALE'where world_id=$1 and office_id='INDUSTRY'",
      [f.world],
    );
    await low();
    expect((await db.query(current, args)).rows).toEqual([]);
    // A stale seat cannot make still-active authorization appear revoked.
    expect((await db.query(revoked, args.slice(0, 4))).rows).toEqual([
      { '?column?': 1 },
    ]);
    await admin();
    await db.query(
      "update world_v2.current_commit_authorization set authorization_version=$2 where world_id=$1 and office_id='INDUSTRY'",
      [f.world, f.revision],
    );
  });
  it('observes authorization and entitlement revocation while preserving ANY active capability in the negative predicate', async () => {
    await admin();
    await db.query(
      'update world_v2.projection_entitlement set active=false,revoked_at=now()where world_id=$1 and scope_key=$2',
      [f.world, scope(f.seller)],
    );
    await low();
    expect((await db.query(current, args)).rows).toEqual([]);
    expect((await db.query(revoked, args.slice(0, 4))).rows).toEqual([
      { '?column?': 1 },
    ]);
    await admin();
    await db.query(
      'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1',
      [f.world],
    );
    await db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='INDUSTRY'",
      [f.world],
    );
    await low();
    expect((await db.query(current, args)).rows).toEqual([]);
    expect((await db.query(revoked, args.slice(0, 4))).rows).toEqual([]);
    await admin();
    await db.query(
      "insert into world_v2.current_commit_authorization values($1,$2::uuid,$3,'INDUSTRY','TEST_ONLY_OTHER_CAPABILITY',$4,$5,true,now())",
      [f.world, f.subject, f.seller, f.team, f.revision],
    );
    await low();
    expect((await db.query(current, args)).rows).toEqual([]);
    expect((await db.query(revoked, args.slice(0, 4))).rows).toEqual([
      { '?column?': 1 },
    ]);
    await admin();
    await db.query(
      "delete from world_v2.current_commit_authorization where world_id=$1 and capability='TEST_ONLY_OTHER_CAPABILITY'",
      [f.world],
    );
    await db.query(
      "update world_v2.current_commit_authorization set active=true where world_id=$1 and office_id='INDUSTRY'",
      [f.world],
    );
  });
  it('permits an existing-reader-member NOINHERIT worker only through explicit fixture EXECUTE, rejecting PUBLIC/nonmember and owner escalation', async () => {
    await admin();
    await db.exec(
      'create role test_industry_noinherit nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole; create role test_industry_nonmember nologin noinherit nosuperuser nobypassrls nocreatedb nocreaterole; grant world_v2_industry_source_reader to test_industry_noinherit; grant usage on schema world_v2 to test_industry_noinherit,test_industry_nonmember; grant execute on function world_v2.lock_postwar_industry_current_authorization(text,uuid,text,text,text),world_v2.lock_postwar_industry_revoked_authorization(text,uuid,text,text)to test_industry_noinherit,test_industry_nonmember',
    );
    await db.exec('set session authorization test_industry_noinherit;begin');
    expect((await db.query(current, args)).rows).toHaveLength(1);
    await expect(
      db.exec('set role world_v2_industry_source_owner'),
    ).rejects.toMatchObject({ code: '42501' });
    await admin();
    await db.exec('set session authorization test_industry_nonmember;begin');
    await expect(db.query(current, args)).rejects.toMatchObject({
      code: '42501',
    });
    await admin();
    const acl = await db.query(
      "select p.proname,p.prosecdef,pg_get_userbyid(p.proowner)owner,p.proconfig,exists(select 1 from aclexplode(p.proacl)a where a.grantee=0 and a.privilege_type='EXECUTE')public_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2'and p.proname in('lock_postwar_industry_current_authorization','lock_postwar_industry_revoked_authorization')order by p.proname",
    );
    expect(acl.rows).toHaveLength(2);
    for (const row of acl.rows)
      expect(row).toMatchObject({
        prosecdef: true,
        owner: 'world_v2_industry_source_owner',
        proconfig: ['search_path=pg_catalog'],
        public_exec: false,
      });
  });
  it('rejects READ ONLY worker use and missing/revoked admission rather than falsely proving authorization absence', async () => {
    await admin();
    await db.exec(
      'set session authorization ' +
        f.readerRole +
        ';begin isolation level repeatable read read only',
    );
    await expect(db.query(revoked, args.slice(0, 4))).rejects.toMatchObject({
      code: '42501',
    });
    await low();
    await expect(
      db.query(current, ['WORLD_MISSING', ...args.slice(1)]),
    ).rejects.toMatchObject({ code: '55000' });
    await admin();
    const permit = await db.query<{ authorization_id: string }>(
      'select authorization_id from world_v2.runtime_admission_publication_permit where world_id=$1',
      [f.world],
    );
    expect(permit.rows).toHaveLength(1);
    await db.exec('set role world_v2_admission_release');
    await db.query(
      'insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,$2)',
      [permit.rows[0]!.authorization_id, 'TEST_ONLY_INDUSTRY_WORKER_REVOKED'],
    );
    await low();
    await expect(db.query(current, args)).rejects.toMatchObject({
      code: '55000',
    });
    await low();
    await expect(db.query(revoked, args.slice(0, 4))).rejects.toMatchObject({
      code: '55000',
    });
  });
});
