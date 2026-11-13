/** Actual installed five-column → six-column PGlite upgrade. Metadata rows and
 * journal bodies below are TEST_ONLY, not economic settlement or admission. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const signature = 'world_v2.read_postwar_bounded_journal(text,text,text)';
const world = 'WORLD_TEST_ONLY_JOURNAL',
  other = 'WORLD_OTHER_JOURNAL';
const fp = 'sha256:' + '1'.repeat(64),
  permitHash = '2'.repeat(64),
  admission = 'ADMISSION_' + permitHash.toUpperCase(),
  replay = '{"modelVersion":"TEST_ONLY_MODEL"}';
const base = `
create schema world_v2;
create role world_v2_social_source_reader nologin nosuperuser nobypassrls;
create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls;
create role world_v2_day_one_fx_source_reader nologin nosuperuser nobypassrls;
grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.opening_seed(world_id text,seed_id text,seed_fingerprint text,replay_binding text,canonical_payload text);
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,model_version text,replay_binding text,admitted_at_real timestamptz);
create table world_v2.runtime_admission_publication_permit(authorization_id text,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);
create table world_v2.current_commit_authorization(world_id text);
create table world_v2.runtime_read_seat(world_id text);
create table world_v2.projection_entitlement(world_id text);
create table world_v2.postwar_day_one_fx_source_original(world_id text,registration_ref text,seed_id text,seed_fingerprint text,admission_ref text,policy_sha256 text,user_receipt_sha256 text);
create table world_v2.postwar_day_one_fx_quote_original(world_id text,country_id text,quote_ref text,source_revision text,quote_text text,quote_text_sha256 text);
create table world_v2.postwar_day_one_fx_source_revocation(registration_ref text);
create table world_v2.postwar_day_one_fx_quote_revocation(quote_ref text);
create table world_v2.social_operating_source_registration(world_id text,country_id text,seed_fingerprint text,admission_ref text,registration_ref text);
create table world_v2.social_operating_source_revocation(registration_ref text);
create table world_v2.finance_budget_policy_original(world_id text,country_id text,seed_fingerprint text,admission_ref text,policy_ref text);
create table world_v2.finance_budget_policy_revocation(policy_ref text);
create table world_v2.authoritative_event(world_id text,event_id text,event_type text,causation_command_id text,canonical_payload text,payload_sha256 text,world_version bigint,event_sequence bigint,sim_time bigint);
create table world_v2.command_submission(world_id text,command_id text,command_type text,country_id text,office_id text,command_fingerprint text,canonical_payload text,expected_world_version bigint,sim_time bigint,primary key(world_id,command_id));
create table world_v2.command_receipt(world_id text,command_id text,command_fingerprint text,outcome text,reason_code text,world_version_before bigint,world_version_after bigint,event_ids jsonb,sim_time bigint);
`;
it('upgrades actual legacy returns atomically with RESTRICT, rolls failures back and preserves data, RLS and exact reader ACLs', async () => {
  const db = new PGlite();
  const load = (p: string) =>
    readFile(new URL('../../' + p, import.meta.url), 'utf8');
  const legacy = await load(
      'tests/fixtures/sql/postwar-bounded-journal-read.legacy-five-columns.sql',
    ),
    current = await load('database/proposals/postwar-bounded-journal-read.sql'),
    upgrade = await load(
      'database/upgrades/postwar-bounded-journal-return-upgrade.sql',
    );
  const fn = current.slice(
    current.indexOf('create function world_v2.read_postwar_bounded_journal('),
    current.indexOf('alter function world_v2.read_postwar_bounded_journal('),
  );
  const stages: object[] = [];
  const metadata = async () =>
    (
      await db.query<{
        result: string;
        owner: string;
        prosecdef: boolean;
        proconfig: string[];
        prosrc: string;
        acl: unknown;
      }>(`
    select pg_get_function_result(p.oid) as result,pg_get_userbyid(p.proowner) as owner,
      p.prosecdef,p.proconfig,p.prosrc,
      (select jsonb_agg(jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end,'privilege',x.privilege_type,'grantable',x.is_grantable)order by x.grantee,x.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x)as acl
    from pg_proc p where p.oid=to_regprocedure('${signature}')`)
    ).rows;
  const policies = async () =>
    (
      await db.query(`
    select c.relname,c.relrowsecurity,c.relforcerowsecurity,p.polname,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid)as qual,pg_get_expr(p.polwithcheck,p.polrelid)as check_expr
    from pg_class c join pg_policy p on p.polrelid=c.oid
    where c.oid in('world_v2.financial_posting_batch'::regclass,'world_v2.inventory_posting'::regclass)
    order by c.relname,p.polname`)
    ).rows;
  const data = async () =>
    (
      await db.query(`
    select (select jsonb_agg(to_jsonb(x)order by x.batch_id)from world_v2.financial_posting_batch x)as financial,
      (select jsonb_agg(to_jsonb(x)order by x.posting_id)from world_v2.inventory_posting x)as inventory,
      (select jsonb_agg(to_jsonb(x)order by x.world_id)from world_v2.world_head x)as heads,
      (select jsonb_agg(to_jsonb(x)order by x.rolname)from pg_roles x where x.rolname like 'world_v2_%')as roles,
      (select jsonb_agg(to_jsonb(x)order by x.roleid,x.member)from pg_auth_members x)as memberships`)
    ).rows;
  const read = async (
    w = world,
    country = 'COUNTRY_01',
    office = 'SOCIAL',
    role = 'world_v2_social_source_reader',
  ) => {
    await db.exec('begin;set local role ' + role);
    try {
      return await db.query<Record<string, unknown>>(
        'select * from world_v2.read_postwar_bounded_journal($1,$2,$3)',
        [w, country, office],
      );
    } finally {
      await db.exec('rollback');
    }
  };
  const rejectTransaction = async (
    sql: string,
    code: string,
    message?: string,
  ) => {
    let actual: unknown;
    try {
      await db.exec(sql);
    } catch (error) {
      actual = error;
    } finally {
      await db.exec('rollback');
    }
    expect(actual).toMatchObject({ code });
    if (message) expect(String((actual as Error).message)).toContain(message);
  };
  try {
    expect(sha(legacy)).toBe(
      'd651aab6dbe0a165ad8f3de9a85a81a262a1666091f3e512a6f880e894ff10e2',
    );
    expect(sha(current)).toBe(
      'fd18216e8ca22f9000892082368b6718c7dd294748f9c7fa08709b6833fb407e',
    );
    await db.exec(base);
    const migration = await load(
      'database/migrations/artifacts/0007_world_v2_atomic_transition_facts.sql',
    );
    for (const table of ['inventory_posting', 'financial_posting_batch']) {
      const start = migration.indexOf('create table world_v2.' + table + ' ('),
        end = migration.indexOf('\n);', start);
      if (start < 0 || end < 0) throw Error('OFFICIAL_JOURNAL_DDL_REQUIRED');
      await db.exec(migration.slice(start, end + 4));
    }
    await db.exec(
      await load('database/proposals/postwar-day-one-fx-history-read.sql'),
    );
    await db.exec(legacy);
    for (const table of [
      'world_head',
      'opening_seed',
      'runtime_opening_admission',
      'postwar_day_one_fx_source_original',
      'postwar_day_one_fx_quote_original',
      'social_operating_source_registration',
      'finance_budget_policy_original',
      'financial_posting_batch',
      'inventory_posting',
    ]) {
      await db.exec(
        'alter table world_v2.' +
          table +
          ' enable row level security;alter table world_v2.' +
          table +
          ' force row level security',
      );
    }
    for (const w of [world, other]) {
      await db.query('insert into world_v2.world_head values($1,2,2)', [w]);
      await db.query(
        'insert into world_v2.opening_seed values($1,$2,$3,$4,$5)',
        [w, 'SEED_JOURNAL', fp, replay, 'RAW_NEVER_RETURNED'],
      );
      await db.query(
        `insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,'TEST_ONLY_MODEL',$5,'2026-10-29T00:00:00Z')`,
        [w, 'SEED_JOURNAL', fp, admission, replay],
      );
      await db.query(
        `insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,'TEST_ONLY_MODEL',$6,'2026-10-28T00:00:00Z','2026-10-31T00:00:00Z')`,
        ['AUTH_' + w, permitHash, w, 'SEED_JOURNAL', fp, replay],
      );
      await db.query(
        'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
        [w, 'COUNTRY_01', fp, admission, 'SOCIAL_' + w],
      );
      await db.query(
        'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5)',
        [w, 'COUNTRY_01', fp, admission, 'POLICY_' + w],
      );
      await db.query(
        `insert into world_v2.command_submission(world_id,command_id)values($1,'COMMAND_TEST_ONLY')`,
        [w],
      );
    }
    expect((await read()).rows[0]).not.toHaveProperty('inventory_postings');
    const oldMetadata = await metadata(),
      oldPolicies = await policies();
    await db.query(
      `insert into world_v2.financial_posting_batch values($1,'BATCH_A','COMMAND_TEST_ONLY',0,1,0,'["EVENT_TEST_ONLY"]','{}','XAA','{"financial":1}',$2)`,
      [world, 'sha256:' + '3'.repeat(64)],
    );
    await db.query(
      `insert into world_v2.financial_posting_batch values($1,'BATCH_OTHER','COMMAND_TEST_ONLY',0,1,0,'["EVENT_TEST_ONLY"]','{}','XAA','OTHER_WORLD_NEVER_RETURNED',$2)`,
      [other, 'sha256:' + '3'.repeat(64)],
    );
    await db.query(
      `insert into world_v2.inventory_posting values($1,'INVENTORY_A','COMMAND_TEST_ONLY',0,1,0,'["EVENT_TEST_ONLY"]','{}','RESERVE','{"inventory":1}',$2)`,
      [world, 'sha256:' + '4'.repeat(64)],
    );
    const oldData = await data();
    await rejectTransaction(
      'begin;' + fn.replace('create function', 'create or replace function'),
      '42P13',
    );
    expect(await metadata()).toEqual(oldMetadata);
    expect(await data()).toEqual(oldData);
    stages.push({
      stage: 'ACTUAL_CREATE_OR_REPLACE_REJECTED_42P13_OLD_FUNCTION_PRESERVED',
    });
    await db.exec(
      "create view world_v2.test_only_journal_dependent as select * from world_v2.read_postwar_bounded_journal('WORLD_TEST_ONLY_JOURNAL','COUNTRY_01','SOCIAL')",
    );
    await rejectTransaction(
      upgrade,
      '2BP01',
      'JOURNAL_UPGRADE_UNREVIEWED_DEPENDENCY',
    );
    expect(await metadata()).toEqual(oldMetadata);
    await rejectTransaction(
      'begin;drop function ' + signature + ' restrict;',
      '2BP01',
    );
    expect(await metadata()).toEqual(oldMetadata);
    await db.exec('drop view world_v2.test_only_journal_dependent restrict');
    stages.push({ stage: 'ACTUAL_DEPENDENCY_REJECTED_WITHOUT_CASCADE' });
    await db.exec('grant execute on function ' + signature + ' to public');
    await rejectTransaction(
      upgrade,
      '42501',
      'JOURNAL_UPGRADE_PUBLIC_ACL_FORBIDDEN',
    );
    await db.exec('revoke execute on function ' + signature + ' from public');
    await db.exec(
      'grant execute on function ' +
        signature +
        ' to world_v2_social_source_reader with grant option',
    );
    await rejectTransaction(
      upgrade,
      '42501',
      'JOURNAL_UPGRADE_EXACT_READER_ACL_REQUIRED',
    );
    await db.exec(
      'revoke grant option for execute on function ' +
        signature +
        ' from world_v2_social_source_reader restrict',
    );
    expect(await metadata()).toEqual(oldMetadata);
    const beforeFailurePrivileges = (
      await db.query(
        `select attname,attacl from pg_attribute where attrelid='world_v2.inventory_posting'::regclass and attnum>0 order by attnum`,
      )
    ).rows;
    const injected = upgrade.replace(
      'create function world_v2.read_postwar_bounded_journal(',
      "do $failure$begin raise exception 'TEST_ONLY_INJECTED_AFTER_DROP'using errcode='P0001';end;$failure$;\ncreate function world_v2.read_postwar_bounded_journal(",
    );
    await rejectTransaction(injected, 'P0001', 'TEST_ONLY_INJECTED_AFTER_DROP');
    expect(await metadata()).toEqual(oldMetadata);
    expect(
      (
        await db.query(
          `select attname,attacl from pg_attribute where attrelid='world_v2.inventory_posting'::regclass and attnum>0 order by attnum`,
        )
      ).rows,
    ).toEqual(beforeFailurePrivileges);
    expect(await policies()).toEqual(oldPolicies);
    expect(await data()).toEqual(oldData);
    stages.push({
      stage:
        'ACTUAL_POST_DROP_FAILURE_ROLLED_BACK_FUNCTION_ACL_COLUMN_GRANTS_DATA',
    });
    await db.exec(upgrade);
    const upgraded = await metadata();
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]).toMatchObject({
      owner: 'world_v2_day_one_fx_history_owner',
      prosecdef: true,
      proconfig: ['search_path=pg_catalog'],
    });
    expect(upgraded[0]?.result).toBe(
      'TABLE(world_version text, event_sequence text, financial_batch_count text, inventory_posting_count text, financial_batches jsonb, inventory_postings jsonb)',
    );
    expect(upgraded[0]?.prosrc).toBe(
      current.match(/as \$\$([\s\S]*?)\$\$;/u)?.[1],
    );
    expect(upgraded[0]?.acl).toEqual(oldMetadata[0]?.acl);
    expect(await policies()).toEqual(oldPolicies);
    expect(await data()).toEqual(oldData);
    await rejectTransaction(
      upgrade,
      '55000',
      'JOURNAL_UPGRADE_EXACT_OLD_FUNCTION_REQUIRED',
    );
    expect(await metadata()).toEqual(upgraded);
    stages.push({
      stage: 'ALREADY_INSTALLED_SIX_COLUMNS_REJECTED_NOT_FRESH_INSTALL',
    });
    const actual = (await read()).rows[0]!;
    expect(actual).toMatchObject({
      world_version: '2',
      event_sequence: '2',
      financial_batch_count: '1',
      inventory_posting_count: '1',
      financial_batches: [
        {
          causation_command_id: 'COMMAND_TEST_ONLY',
          canonical_payload: '{"financial":1}',
          fingerprint: 'sha256:' + '3'.repeat(64),
        },
      ],
      inventory_postings: [
        {
          causation_command_id: 'COMMAND_TEST_ONLY',
          canonical_payload: '{"inventory":1}',
          fingerprint: 'sha256:' + '4'.repeat(64),
        },
      ],
    });
    expect(
      (
        await read(
          world,
          'COUNTRY_01',
          'FINANCE',
          'world_v2_finance_budget_source_reader',
        )
      ).rows[0],
    ).toEqual(actual);
    await expect(read(world, 'COUNTRY_02')).rejects.toThrow(
      'JOURNAL_CURRENT_HOST_SOURCE_REVOKED',
    );
    await expect(read('WORLD_ABSENT')).rejects.toThrow(
      'JOURNAL_ACTUAL_HEAD_REQUIRED',
    );
    await expect(read(world, 'COUNTRY_01', 'FINANCE')).rejects.toThrow(
      'JOURNAL_FIXED_SOURCE_READER_REQUIRED',
    );
    await expect(
      read(world, 'COUNTRY_01', 'SOCIAL', 'world_v2_day_one_fx_source_reader'),
    ).rejects.toThrow('permission denied');
    for (const role of [
      'world_v2_social_source_reader',
      'world_v2_finance_budget_source_reader',
    ]) {
      await db.exec('begin;set local role ' + role);
      for (const table of ['financial_posting_batch', 'inventory_posting']) {
        await db.exec('savepoint denial');
        await expect(
          db.query('select canonical_payload from world_v2.' + table),
        ).rejects.toMatchObject({ code: '42501' });
        await db.exec('rollback to savepoint denial');
      }
      await db.exec('rollback');
    }
    expect(JSON.stringify(actual)).not.toContain('OTHER_WORLD_NEVER_RETURNED');
    await db.query(
      'insert into world_v2.social_operating_source_revocation values($1)',
      ['SOCIAL_' + world],
    );
    await expect(read()).rejects.toThrow('JOURNAL_CURRENT_HOST_SOURCE_REVOKED');
    await db.exec('delete from world_v2.social_operating_source_revocation');
    await db.query(
      'insert into world_v2.runtime_admission_publication_revocation values($1)',
      ['AUTH_' + world],
    );
    await expect(read()).rejects.toThrow(
      'JOURNAL_CURRENT_WORLD_ADMISSION_REVOKED',
    );
    await db.exec(
      'delete from world_v2.runtime_admission_publication_revocation',
    );
    await db.query(
      "update world_v2.inventory_posting set canonical_payload=$1 where posting_id='INVENTORY_A'",
      ['x'.repeat(65537)],
    );
    await expect(read()).rejects.toThrow('JOURNAL_BOUNDED_CAPACITY_EXCEEDED');
    stages.push({
      stage:
        'SIX_COLUMN_FUNCTION_ACTUAL_LOW_ROLES_COMPLETE_FINANCIAL_INVENTORY_FOREIGN_REVOKED_OVERFLOW_DENIALS',
      metadata: upgraded,
      policies: oldPolicies,
    });
    if (process.env.ECONMIND_BOUNDED_JOURNAL_UPGRADE_EVIDENCE)
      await writeFile(
        process.env.ECONMIND_BOUNDED_JOURNAL_UPGRADE_EVIDENCE,
        JSON.stringify(
          {
            status: 'ACTUAL_EMBEDDED_HISTORICAL_UPGRADE_PASS',
            oldSqlSHA256: sha(legacy),
            newSqlSHA256: sha(current),
            upgradeSQLSHA256: sha(upgrade),
            stages,
            production: false,
            nativePostgres: false,
          },
          null,
          2,
        ) + '\n',
      );
  } finally {
    await db.close();
  }
}, 30000);
