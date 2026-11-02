/** Embedded metadata/ACL protocol ONLY. No cfc seed, Core settlement, money,
 * real source admission, native PG or command authority is constructed here. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const canon = (v: Record<string, unknown>) =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, v[k]]),
    ),
  );
const world = 'WORLD_TEST_ONLY_FX_ARCHIVE',
  seed = 'SEED_TEST_ONLY_FX_ARCHIVE',
  seedFP = 'sha256:' + '1'.repeat(64),
  authHash = '2'.repeat(64),
  admission = 'ADMISSION_' + authHash.toUpperCase(),
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
describe('historical committed FX quote source replay candidate', () => {
  it('uses a distinct fixed Treasury FX source replay mode without a Budget role or policy and retains committed history after FX revocation', async () => {
    const db = new PGlite();
    const q = {
      worldId: world,
      seedFingerprint: seedFP,
      countryId: 'COUNTRY_02',
      quoteRef: 'QUOTE_TEST_ONLY',
      quoteSha256: '3'.repeat(64),
    };
    const bytes = canon(q),
      payload = canon({ quote: q, fee: '0' }),
      hash = 'sha256:' + sha('SHA-256\n' + payload);
    const args = [
      world,
      'COUNTRY_01',
      'COUNTRY_02',
      'FINANCE',
      seedFP,
      admission,
      'EVENT_TEST_ONLY',
      hash,
      q.quoteRef,
      q.quoteSha256,
      'TREASURY_FX_SOURCE_REPLAY',
    ];
    const read = async (p: readonly unknown[] = args) => {
      await db.exec('begin;set local role world_v2_day_one_fx_source_reader');
      try {
        return await db.query<Record<string, unknown>>(
          'select * from world_v2.read_postwar_day_one_fx_committed_quote($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [...p],
        );
      } finally {
        await db.exec('rollback');
      }
    };
    try {
      await db.exec(base);
      await db.exec(
        await readFile(
          new URL(
            '../../database/proposals/postwar-day-one-fx-history-read.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await db.query('insert into world_v2.world_head values($1,3,5)', [world]);
      await db.query(
        'insert into world_v2.opening_seed values($1,$2,$3,$4,$5)',
        [world, seed, seedFP, replay, 'RAW_SEED_MUST_NOT_BE_READ'],
      );
      await db.query(
        "insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,'TEST_ONLY_MODEL',$5,'2026-10-29T00:00:00Z')",
        [world, seed, seedFP, admission, replay],
      );
      await db.query(
        "insert into world_v2.runtime_admission_publication_permit values('AUTH_TEST_ONLY',$1,$2,$3,$4,'TEST_ONLY_MODEL',$5,'2026-10-28T00:00:00Z','2026-10-30T00:00:00Z')",
        [authHash, world, seed, seedFP, replay],
      );
      await db.query(
        'insert into world_v2.postwar_day_one_fx_source_original values($1,$2,$3,$4,$5,$6,$7)',
        [
          world,
          'FX_REG_TEST_ONLY',
          seed,
          seedFP,
          admission,
          '4'.repeat(64),
          '5'.repeat(64),
        ],
      );
      await db.query(
        'insert into world_v2.postwar_day_one_fx_quote_original values($1,$2,$3,$4,$5,$6)',
        [
          world,
          'COUNTRY_02',
          q.quoteRef,
          'FX_REV_TEST_ONLY',
          bytes,
          sha(bytes),
        ],
      );
      await db.query(
        'insert into world_v2.postwar_day_one_fx_quote_original values($1,$2,$3,$4,$5,$6)',
        [world, 'COUNTRY_01', 'HOST_QUOTE', 'HOST_REV', '{}', sha('{}')],
      );
      await db.query(
        "insert into world_v2.authoritative_event values($1,'EVENT_TEST_ONLY','POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1','COMMAND_TEST_ONLY',$2,$3,2,4,0)",
        [world, payload, hash],
      );
      await db.query(
        "insert into world_v2.command_submission values($1,'COMMAND_TEST_ONLY','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','COUNTRY_02','FINANCE',$2,$3,1,0)",
        [
          world,
          'sha256:' + '6'.repeat(64),
          canon({ quoteRef: q.quoteRef, expectedQuoteSha256: q.quoteSha256 }),
        ],
      );
      await db.query(
        "insert into world_v2.command_receipt values($1,'COMMAND_TEST_ONLY',$2,'COMMITTED',null,1,2,'[\"EVENT_TEST_ONLY\"]',0)",
        [world, 'sha256:' + '6'.repeat(64)],
      );
      expect(
        (
          await db.query(
            'select * from world_v2.finance_budget_policy_original',
          )
        ).rows,
      ).toEqual([]);
      const before = await read();
      expect(before.rows[0]).toMatchObject({
        office_id: 'FINANCE',
        host_source_ref: 'FX_REG_TEST_ONLY',
        quote_text: bytes,
      });
      await db.exec(
        "insert into world_v2.postwar_day_one_fx_source_revocation values('FX_REG_TEST_ONLY');insert into world_v2.postwar_day_one_fx_quote_revocation values('QUOTE_TEST_ONLY')",
      );
      expect((await read()).rows).toEqual(before.rows);
      const budget = [...args];
      budget[10] = 'SOURCE_REPLAY';
      await expect(read(budget)).rejects.toThrow(
        'FX_HISTORY_FIXED_SOURCE_READER_REQUIRED',
      );
      const foreignHost = [...args];
      foreignHost[1] = 'COUNTRY_03';
      await expect(read(foreignHost)).rejects.toThrow(
        'FX_HISTORY_CURRENT_HOST_SOURCE_REQUIRED',
      );
      const altered = [...args];
      altered[7] = 'sha256:' + '7'.repeat(64);
      await expect(read(altered)).rejects.toThrow(
        'FX_HISTORY_EXACT_CANONICAL_EVENT_REQUIRED',
      );
      await db.exec("update world_v2.command_receipt set outcome='REJECTED'");
      await expect(read()).rejects.toThrow(
        'FX_HISTORY_EXACT_COMMITTED_RECEIPT_REQUIRED',
      );
      const membership = await db.query<{ budget: boolean; raw: boolean }>(
        "select pg_has_role('world_v2_day_one_fx_source_reader','world_v2_finance_budget_source_reader','MEMBER')as budget,has_column_privilege('world_v2_day_one_fx_source_reader','world_v2.opening_seed','canonical_payload','SELECT')as raw",
      );
      expect(membership.rows).toEqual([{ budget: false, raw: false }]);
    } finally {
      await db.close();
    }
  });
  it('retains past quotes after FX revocation while enforcing current host/admission and exact committed cross-country trace with finite read privileges', async () => {
    const db = new PGlite();
    const quote = {
      worldId: world,
      seedFingerprint: seedFP,
      countryId: 'COUNTRY_02',
      quoteRef: 'QUOTE_TEST_ONLY',
      quoteSha256: '3'.repeat(64),
    };
    const bytes = canon(quote),
      payload = canon({
        quote,
        fee: '0',
        schemaVersion: 'postwar-day-one-treasury-fx-settled-v1',
      }),
      eventHash = 'sha256:' + sha('SHA-256\n' + payload);
    const params = [
      world,
      'COUNTRY_01',
      'COUNTRY_02',
      'SOCIAL',
      seedFP,
      admission,
      'EVENT_TEST_ONLY',
      eventHash,
      quote.quoteRef,
      quote.quoteSha256,
      'SOURCE_REPLAY',
    ];
    const query =
      'select * from world_v2.read_postwar_day_one_fx_committed_quote($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)';
    const read = async (
      args: readonly unknown[] = params,
      role = 'world_v2_social_source_reader',
    ) => {
      await db.exec('begin;set local role ' + role);
      try {
        return await db.query<Record<string, unknown>>(query, [...args]);
      } finally {
        await db.exec('rollback');
      }
    };
    try {
      await db.exec(base);
      await db.exec(
        await readFile(
          new URL(
            '../../database/proposals/postwar-day-one-fx-history-read.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await db.query('insert into world_v2.world_head values($1,3,5)', [world]);
      await db.query(
        'insert into world_v2.opening_seed values($1,$2,$3,$4,$5)',
        [world, seed, seedFP, replay, 'RAW_SEED_MUST_NOT_BE_READ'],
      );
      await db.query(
        "insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,'TEST_ONLY_MODEL',$5,'2026-10-29T00:00:00Z')",
        [world, seed, seedFP, admission, replay],
      );
      await db.query(
        "insert into world_v2.runtime_admission_publication_permit values('AUTH_TEST_ONLY',$1,$2,$3,$4,'TEST_ONLY_MODEL',$5,'2026-10-28T00:00:00Z','2026-10-30T00:00:00Z')",
        [authHash, world, seed, seedFP, replay],
      );
      await db.query(
        'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5)',
        [world, 'COUNTRY_01', seedFP, admission, 'HOST_SOCIAL_TEST_ONLY'],
      );
      await db.query(
        'insert into world_v2.finance_budget_policy_original values($1,$2,$3,$4,$5)',
        [world, 'COUNTRY_01', seedFP, admission, 'HOST_FINANCE_TEST_ONLY'],
      );
      await db.query(
        'insert into world_v2.postwar_day_one_fx_source_original values($1,$2,$3,$4,$5,$6,$7)',
        [
          world,
          'FX_REG_TEST_ONLY',
          seed,
          seedFP,
          admission,
          '4'.repeat(64),
          '5'.repeat(64),
        ],
      );
      await db.query(
        'insert into world_v2.postwar_day_one_fx_quote_original values($1,$2,$3,$4,$5,$6)',
        [
          world,
          'COUNTRY_02',
          quote.quoteRef,
          'FX_REV_TEST_ONLY',
          bytes,
          sha(bytes),
        ],
      );
      await db.query(
        "insert into world_v2.authoritative_event values($1,'EVENT_TEST_ONLY','POSTWAR_DAY_ONE_TREASURY_FX_SETTLED_V1','COMMAND_TEST_ONLY',$2,$3,2,4,0)",
        [world, payload, eventHash],
      );
      await db.query(
        "insert into world_v2.command_submission values($1,'COMMAND_TEST_ONLY','POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1','COUNTRY_02','FINANCE',$2,$3,1,0)",
        [
          world,
          'sha256:' + '6'.repeat(64),
          canon({
            quoteRef: quote.quoteRef,
            expectedQuoteSha256: quote.quoteSha256,
          }),
        ],
      );
      await db.query(
        "insert into world_v2.command_receipt values($1,'COMMAND_TEST_ONLY',$2,'COMMITTED',null,1,2,'[\"EVENT_TEST_ONLY\"]',0)",
        [world, 'sha256:' + '6'.repeat(64)],
      );
      const actual = await read();
      expect(actual.rows).toHaveLength(1);
      expect(actual.rows[0]).toMatchObject({
        host_country_id: 'COUNTRY_01',
        source_country_id: 'COUNTRY_02',
        office_id: 'SOCIAL',
        quote_text: bytes,
        frame_world_version: '2',
        frame_event_sequence: '4',
        observed_world_version: '3',
        observed_event_sequence: '5',
      });
      await db.exec(
        "insert into world_v2.postwar_day_one_fx_source_revocation values('FX_REG_TEST_ONLY');insert into world_v2.postwar_day_one_fx_quote_revocation values('QUOTE_TEST_ONLY')",
      );
      expect((await read()).rows).toEqual(actual.rows);
      const finance = [...params];
      finance[3] = 'FINANCE';
      expect(
        (await read(finance, 'world_v2_finance_budget_source_reader')).rows[0],
      ).toMatchObject({
        host_source_ref: 'HOST_FINANCE_TEST_ONLY',
        quote_text: bytes,
      });
      await expect(read(finance)).rejects.toThrow(
        'FX_HISTORY_FIXED_SOURCE_READER_REQUIRED',
      );
      for (const [index, value, error] of [
        [0, 'WORLD_OTHER', 'FX_HISTORY_ACTUAL_HEAD_REQUIRED'],
        [1, 'COUNTRY_03', 'FX_HISTORY_CURRENT_HOST_SOURCE_REVOKED'],
        [2, 'COUNTRY_01', 'FX_HISTORY_EXACT_IMMUTABLE_QUOTE_REQUIRED'],
        [
          4,
          'sha256:' + '7'.repeat(64),
          'FX_HISTORY_ACTUAL_IMMUTABLE_ADMISSION_REQUIRED',
        ],
        [
          7,
          'sha256:' + '8'.repeat(64),
          'FX_HISTORY_EXACT_CANONICAL_EVENT_REQUIRED',
        ],
        [9, '9'.repeat(64), 'FX_HISTORY_EXACT_IMMUTABLE_QUOTE_REQUIRED'],
        [10, 'CURRENT_QUOTE', 'FX_HISTORY_EXACT_REPLAY_SCOPE_REQUIRED'],
      ] as const) {
        const wrong = [...params];
        wrong[index] = value;
        await expect(read(wrong)).rejects.toThrow(error);
      }
      await db.exec("update world_v2.command_receipt set outcome='REJECTED'");
      await expect(read()).rejects.toThrow(
        'FX_HISTORY_EXACT_COMMITTED_RECEIPT_REQUIRED',
      );
      await db.exec(
        "update world_v2.command_receipt set outcome='COMMITTED';insert into world_v2.social_operating_source_revocation values('HOST_SOCIAL_TEST_ONLY')",
      );
      await expect(read()).rejects.toThrow(
        'FX_HISTORY_CURRENT_HOST_SOURCE_REVOKED',
      );
      await db.exec(
        "insert into world_v2.runtime_admission_publication_revocation values('AUTH_TEST_ONLY')",
      );
      await expect(
        read(finance, 'world_v2_finance_budget_source_reader'),
      ).rejects.toThrow('FX_HISTORY_CURRENT_WORLD_ADMISSION_REVOKED');
      const access = await db.query<Record<string, boolean>>(`select
        has_column_privilege('world_v2_day_one_fx_history_owner','world_v2.opening_seed','canonical_payload','SELECT')as owner_raw,
        has_table_privilege('world_v2_social_source_reader','world_v2.postwar_day_one_fx_quote_original','SELECT,INSERT,UPDATE,DELETE')as social_direct,
        has_table_privilege('world_v2_finance_budget_source_reader','world_v2.postwar_day_one_fx_quote_original','SELECT,INSERT,UPDATE,DELETE')as finance_direct,
        has_table_privilege('world_v2_social_source_reader','world_v2.current_commit_authorization','UPDATE')as social_auth,
        pg_has_role('world_v2_social_source_reader','world_v2_day_one_fx_history_owner','MEMBER')as owner_member`);
      expect(access.rows).toEqual([
        {
          owner_raw: false,
          social_direct: false,
          finance_direct: false,
          social_auth: false,
          owner_member: false,
        },
      ]);
    } finally {
      await db.close();
    }
  });
});
