/** Actual immutable table DDL + embedded metadata/ACL protocol. The deliberately
 * unknown canonical family must be returned intact for Core rejection. This is
 * not a Core economics, native PG, source admission or command authority test. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
const world = 'WORLD_PREFIX_TEST_ONLY',
  other = 'WORLD_PREFIX_OTHER',
  fp = 'sha256:' + '1'.repeat(64),
  authHash = '2'.repeat(64),
  admission = 'ADMISSION_' + authHash.toUpperCase(),
  replay = '{"modelVersion":"TEST_ONLY_MODEL"}';
const base = `
create schema world_v2;
create role world_v2_social_source_reader nologin nosuperuser nobypassrls;
create role world_v2_finance_budget_source_reader nologin nosuperuser nobypassrls;
create role world_v2_day_one_fx_source_reader nologin nosuperuser nobypassrls;
grant usage on schema world_v2 to world_v2_social_source_reader,world_v2_finance_budget_source_reader,world_v2_day_one_fx_source_reader;
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
`;

it('returns every prefix metadata column without table grants, preserves unknown/cross-country frames and refuses incomplete/oversized/revoked reads', async () => {
  const db = new PGlite(),
    load = (p: string) =>
      readFile(new URL('../../' + p, import.meta.url), 'utf8');
  const read = async (
    w = world,
    country = 'COUNTRY_01',
    office = 'SOCIAL',
    role = 'world_v2_social_source_reader',
  ) => {
    await db.exec('begin;set local role ' + role);
    try {
      return await db.query<Record<string, unknown>>(
        'select * from world_v2.read_postwar_bounded_prefix($1,$2,$3)',
        [w, country, office],
      );
    } finally {
      await db.exec('rollback');
    }
  };
  try {
    await db.exec(base);
    const official = await load(
        'database/migrations/artifacts/0002_world_v2_command_event_ledger.sql',
      ),
      receipts = await load(
        'database/migrations/artifacts/0003_world_v2_command_receipts_outbox.sql',
      ),
      journals = await load(
        'database/migrations/artifacts/0007_world_v2_atomic_transition_facts.sql',
      );
    for (const [ddl, table] of [
      [official, 'world_head'],
      [official, 'command_submission'],
      [official, 'authoritative_event'],
      [receipts, 'command_receipt'],
      [journals, 'inventory_posting'],
      [journals, 'financial_posting_batch'],
    ] as const) {
      if (table === 'command_receipt')
        await db.exec(
          'alter table world_v2.command_submission add unique(world_id,command_id,command_fingerprint)',
        );
      const start = ddl.indexOf('create table world_v2.' + table + ' ('),
        end = ddl.indexOf('\n);', start);
      if (start < 0 || end < 0)
        throw Error('OFFICIAL_PREFIX_TABLE_DDL_REQUIRED');
      await db.exec(ddl.slice(start, end + 4));
    }
    for (const file of [
      'postwar-day-one-fx-history-read.sql',
      'postwar-bounded-journal-read.sql',
      'postwar-bounded-prefix-read.sql',
    ])
      await db.exec(await load('database/proposals/' + file));
    for (const table of [
      'world_head',
      'opening_seed',
      'runtime_opening_admission',
      'social_operating_source_registration',
      'finance_budget_policy_original',
      'authoritative_event',
      'command_submission',
      'command_receipt',
      'inventory_posting',
      'financial_posting_batch',
    ])
      await db.exec(
        'alter table world_v2.' +
          table +
          ' enable row level security;alter table world_v2.' +
          table +
          ' force row level security',
      );
    for (const w of [world, other]) {
      await db.query('insert into world_v2.world_head values($1,1,1)', [w]);
      await db.query(
        'insert into world_v2.opening_seed values($1,$2,$3,$4,$5)',
        [w, 'SEED_TEST_ONLY', fp, replay, 'RAW_SEED_NEVER_READ'],
      );
      await db.query(
        `insert into world_v2.runtime_opening_admission values($1,'SEED_TEST_ONLY',$2,$3,'TEST_ONLY_MODEL',$4,'2026-10-29T00:00:00Z')`,
        [w, fp, admission, replay],
      );
      await db.query(
        `insert into world_v2.runtime_admission_publication_permit values($1,$2,$3,'SEED_TEST_ONLY',$4,'TEST_ONLY_MODEL',$5,'2026-10-28T00:00:00Z','2026-10-31T00:00:00Z')`,
        ['AUTH_' + w, authHash, w, fp, replay],
      );
      await db.query(
        'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
        [w, 'COUNTRY_01', fp, admission, 'SOCIAL_' + w],
      );
      await db.query(
        'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5)',
        [w, 'COUNTRY_01', fp, admission, 'FINANCE_' + w],
      );
      for (const id of ['COMMAND_COMMITTED', 'COMMAND_PENDING'])
        await db.query(
          `insert into world_v2.command_submission values($1,$2,$2,'UNKNOWN_CANONICAL_COMMAND','command-v1','{}',$3,$3,'11111111-1111-4111-8111-111111111111','ACTOR_TEST_ONLY','COUNTRY_02','SOCIAL',0,9007199254740993,'CORRELATION_TEST_ONLY','2026-10-29T00:00:00.123Z')`,
          [w, id, fp],
        );
      await db.query(
        `insert into world_v2.authoritative_event values($1,'EVENT_UNKNOWN',1,1,'COMMAND_COMMITTED','CORRELATION_TEST_ONLY','UNKNOWN_CANONICAL_EVENT','event-v1','{}',$2,$2,9007199254740993,'2026-10-29T00:00:00.456Z',null)`,
        [w, fp],
      );
      await db.query(
        `insert into world_v2.command_receipt values($1,'COMMAND_COMMITTED','COMMAND_COMMITTED','command-receipt-v2',$2,'COMMITTED',null,'COMMAND_COMMITTED',0,1,9007199254740993,'["EVENT_UNKNOWN"]','2026-10-29T00:00:00.789Z')`,
        [w, fp],
      );
    }
    const actual = (await read()).rows[0]!;
    expect(actual.world_version).toBe('1');
    expect(actual.event_sequence).toBe('1');
    expect(actual.events).toEqual([
      {
        event_id: 'EVENT_UNKNOWN',
        event_type: 'UNKNOWN_CANONICAL_EVENT',
        schema_version: 'event-v1',
        world_id: world,
        causation_command_id: 'COMMAND_COMMITTED',
        correlation_id: 'CORRELATION_TEST_ONLY',
        world_version: '1',
        sequence: '1',
        sim_time: '9007199254740993',
        recorded_at_real: '2026-10-29T00:00:00.456Z',
        corrects_event_id: null,
        canonical_payload: '{}',
        payload_sha256: fp,
        event_fingerprint: fp,
      },
    ]);
    expect(actual.commands).toHaveLength(1);
    expect(actual.commands).toEqual([
      expect.objectContaining({
        world_id: world,
        command_id: 'COMMAND_COMMITTED',
        country_id: 'COUNTRY_02',
        auth_subject: '11111111-1111-4111-8111-111111111111',
        actor_id: 'ACTOR_TEST_ONLY',
        schema_version: 'command-v1',
        idempotency_key: 'COMMAND_COMMITTED',
        payload_sha256: fp,
        expected_world_version: '0',
        sim_time: '9007199254740993',
        submitted_at_real: '2026-10-29T00:00:00.123Z',
      }),
    ]);
    expect(actual.receipts).toEqual([
      expect.objectContaining({
        world_id: world,
        command_id: 'COMMAND_COMMITTED',
        schema_version: 'command-receipt-v2',
        idempotency_key: 'COMMAND_COMMITTED',
        transition_id: 'COMMAND_COMMITTED',
        world_version_before: '0',
        world_version_after: '1',
        sim_time: '9007199254740993',
        event_ids: ['EVENT_UNKNOWN'],
        recorded_at_real: '2026-10-29T00:00:00.789Z',
      }),
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
    ).toEqual([actual]);
    await db.exec(`set econmind.fx_history_world='${other}'`);
    expect((await read()).rows).toEqual([actual]);
    await expect(read(world, 'COUNTRY_02')).rejects.toThrow(
      'JOURNAL_CURRENT_HOST_SOURCE_REVOKED',
    );
    await expect(read(world, 'COUNTRY_01', 'FINANCE')).rejects.toThrow(
      'JOURNAL_FIXED_SOURCE_READER_REQUIRED',
    );
    for (const table of [
      'authoritative_event',
      'command_submission',
      'command_receipt',
    ]) {
      for (const role of [
        'world_v2_social_source_reader',
        'world_v2_finance_budget_source_reader',
      ]) {
        await db.exec('begin;set local role ' + role);
        await expect(
          db.query('select * from world_v2.' + table),
        ).rejects.toThrow('permission denied');
        await db.exec('rollback');
      }
    }
    await db.query(
      'insert into world_v2.finance_budget_policy_revocation values($1)',
      ['FINANCE_' + world],
    );
    await expect(
      read(
        world,
        'COUNTRY_01',
        'FINANCE',
        'world_v2_finance_budget_source_reader',
      ),
    ).rejects.toThrow('JOURNAL_CURRENT_HOST_SOURCE_REVOKED');
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
      'update world_v2.command_submission set canonical_payload=$1 where world_id=$2 and command_id=$3',
      ['x'.repeat(16385), world, 'COMMAND_COMMITTED'],
    );
    await expect(read()).rejects.toThrow(
      'PREFIX_BOUNDED_COMMAND_BYTES_EXCEEDED',
    );
    await db.query(
      "update world_v2.command_submission set canonical_payload='{}'where world_id=$1",
      [world],
    );
    await db.query(
      'update world_v2.authoritative_event set canonical_payload=$1 where world_id=$2',
      ['x'.repeat(65537), world],
    );
    await expect(read()).rejects.toThrow('PREFIX_BOUNDED_EVENT_BYTES_EXCEEDED');
    await db.query(
      "update world_v2.authoritative_event set canonical_payload='{}'where world_id=$1",
      [world],
    );
    await db.query(
      'update world_v2.world_head set event_sequence=2 where world_id=$1',
      [world],
    );
    await expect(read()).rejects.toThrow(
      'PREFIX_COMPLETE_EVENT_AND_RECEIPT_SET_REQUIRED',
    );
  } finally {
    await db.close();
  }
});
