/** Embedded metadata/ACL verification of bounded DATA reads, not native PG,
 * economic settlement, source admission, or actor execution authority. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
const world = 'WORLD_TEST_ONLY_JOURNAL',
  other = 'WORLD_OTHER_JOURNAL',
  seed = 'SEED_JOURNAL';
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
create table world_v2.command_submission(world_id text,command_id text,command_type text,country_id text,office_id text,command_fingerprint text,canonical_payload text,expected_world_version bigint,sim_time bigint);
create table world_v2.command_receipt(world_id text,command_id text,command_fingerprint text,outcome text,reason_code text,world_version_before bigint,world_version_after bigint,event_ids jsonb,sim_time bigint);
`;

it('returns the complete actual bounded journal through fixed role/host/admission locks and denies direct reads, revocation, foreign scopes and overflow', async () => {
  const db = new PGlite();
  const load = async (path: string) =>
    readFile(new URL('../../' + path, import.meta.url), 'utf8');
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
  const insertBatch = async (w: string, id: string, payload: string) =>
    db.query(
      `insert into world_v2.financial_posting_batch values($1,$2,'COMMAND_TEST_ONLY',0,1,0,'["EVENT_TEST_ONLY"]','{}','XAA',$3,$4)`,
      [w, id, payload, 'sha256:' + '3'.repeat(64)],
    );
  try {
    await db.exec(base);
    await db.exec(
      'alter table world_v2.command_submission add primary key(world_id,command_id)',
    );
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
    await db.exec(
      await load('database/proposals/postwar-bounded-journal-read.sql'),
    );
    // Force the actual owner to use world-specific policies too. Superuser fixture
    // writes below are TEST_ONLY setup; operational roles never receive those rights.
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
        [w, seed, fp, replay, 'RAW_NEVER_RETURNED'],
      );
      await db.query(
        `insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,'TEST_ONLY_MODEL',$5,'2026-10-29T00:00:00Z')`,
        [w, seed, fp, admission, replay],
      );
      await db.query(
        `insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,$4,$5,'TEST_ONLY_MODEL',$6,'2026-10-28T00:00:00Z','2026-10-31T00:00:00Z')`,
        ['AUTH_' + w, permitHash, w, seed, fp, replay],
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
    await insertBatch(world, 'BATCH_B', '{"b":2}');
    await insertBatch(world, 'BATCH_A', '{"a":1}');
    await insertBatch(other, 'BATCH_OTHER', 'SECRET_OTHER_WORLD');
    const actual = await read();
    expect(actual.rows).toEqual([
      {
        world_version: '2',
        event_sequence: '2',
        financial_batch_count: '2',
        inventory_posting_count: '0',
        financial_batches: [
          {
            causation_command_id: 'COMMAND_TEST_ONLY',
            canonical_payload: '{"a":1}',
            fingerprint: 'sha256:' + '3'.repeat(64),
          },
          {
            causation_command_id: 'COMMAND_TEST_ONLY',
            canonical_payload: '{"b":2}',
            fingerprint: 'sha256:' + '3'.repeat(64),
          },
        ],
      },
    ]);
    expect(
      (
        await read(
          world,
          'COUNTRY_01',
          'FINANCE',
          'world_v2_finance_budget_source_reader',
        )
      ).rows,
    ).toEqual(actual.rows);
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
    await db.exec('begin;set local role world_v2_social_source_reader');
    await expect(
      db.query(
        'select canonical_payload from world_v2.financial_posting_batch',
      ),
    ).rejects.toThrow('permission denied');
    await db.exec('rollback');
    const acl = await db.query(
      `select has_column_privilege('world_v2_social_source_reader','world_v2.financial_posting_batch','canonical_payload','SELECT')as social_raw,has_column_privilege('world_v2_finance_budget_source_reader','world_v2.financial_posting_batch','canonical_payload','SELECT')as finance_raw,has_column_privilege('world_v2_day_one_fx_history_owner','world_v2.opening_seed','canonical_payload','SELECT')as owner_seed,pg_has_role('world_v2_social_source_reader','world_v2_day_one_fx_history_owner','MEMBER')as owner_member`,
    );
    expect(acl.rows).toEqual([
      {
        social_raw: false,
        finance_raw: false,
        owner_seed: false,
        owner_member: false,
      },
    ]);
    // Caller GUC cannot expose the other World: the helper overwrites it and all
    // raw rows returned still come from the checked actual request world.
    await db.exec(`set econmind.fx_history_world='${other}'`);
    expect((await read()).rows).toEqual(actual.rows);
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
      `insert into world_v2.inventory_posting values($1,'INV','COMMAND_TEST_ONLY',0,1,0,'["EVENT_TEST_ONLY"]','{}','RESERVE','{}',$2)`,
      [world, 'sha256:' + '4'.repeat(64)],
    );
    await expect(read()).rejects.toThrow(
      'JOURNAL_UNSUPPORTED_INVENTORY_EFFECT',
    );
    await db.exec('delete from world_v2.inventory_posting');
    await insertBatch(world, 'OVERSIZED', 'x'.repeat(65537));
    await expect(read()).rejects.toThrow('JOURNAL_BOUNDED_CAPACITY_EXCEEDED');
    await db.exec(
      "delete from world_v2.financial_posting_batch where batch_id='OVERSIZED'",
    );
    await db.query(
      `insert into world_v2.financial_posting_batch select $1,'OVER_'||g,'COMMAND_TEST_ONLY',0,1,0,'["EVENT_TEST_ONLY"]'::jsonb,'{}','XAA','{}',$2 from generate_series(1,511)g`,
      [world, 'sha256:' + '3'.repeat(64)],
    );
    await expect(read()).rejects.toThrow('JOURNAL_BOUNDED_CAPACITY_EXCEEDED');
  } finally {
    await db.close();
  }
});
