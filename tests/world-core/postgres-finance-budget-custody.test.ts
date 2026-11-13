/** Actual PGlite SQL permission/schema checks. No financial source, budget
 * approval or World effect is mocked into a positive custody result. Genuine
 * full-seed native integration is an explicit separate isolated-PG run. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const file = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0005_world_v2_writer_lease_fencing',
    '0007_world_v2_atomic_transition_facts',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await file('database/migrations/artifacts/' + id + '.sql'));
  for (const p of [
    'runtime-read-binding-storage.sql',
    'runtime-admission-publication.sql',
    'finance-budget-custody.sql',
  ])
    await db.exec(await file('database/proposals/' + p));
  await db.exec(
    'create role test_only_budget_reader login nosuperuser nobypassrls;grant world_v2_finance_budget_source_reader to test_only_budget_reader;create role test_only_budget_publisher login nosuperuser nobypassrls;grant world_v2_finance_budget_source_publisher to test_only_budget_publisher',
  );
});
afterAll(async () => {
  await db?.close();
});
describe('native Budget fixed custody SQL / TEST_ONLY local role isolation', () => {
  it('installs fixed functions without a source original, approval or membership in either runtime account', async () => {
    const r = await db.query<{
      originals: number;
      has_select: boolean;
      has_write: boolean;
      publisher_member: boolean;
    }>(
      `select (select count(*)::int from world_v2.finance_budget_policy_original)as originals,has_table_privilege('test_only_budget_reader','world_v2.opening_seed','SELECT')as has_select,has_table_privilege('test_only_budget_reader','world_v2.finance_budget_policy_original','INSERT,UPDATE,DELETE,TRUNCATE')as has_write,pg_has_role('test_only_budget_reader','world_v2_finance_budget_source_publisher','MEMBER')as publisher_member`,
    );
    expect(r.rows).toEqual([
      {
        originals: 0,
        has_select: false,
        has_write: false,
        publisher_member: false,
      },
    ]);
  });
  it('rejects privileged/superuser source consumers instead of treating their declarations as authority', async () => {
    await expect(
      db.query(
        'select * from world_v2.lock_finance_budget_policy($1,$2,$3,$4,$5,$6,$7::uuid)',
        [
          'WORLD_TEST_ONLY',
          'COUNTRY_01',
          'ENVELOPE_TEST_ONLY',
          'PERIOD_TEST_ONLY',
          'WORKER_TEST_ONLY',
          new Date().toISOString(),
          '11111111-1111-4111-8111-111111111111',
        ],
      ),
    ).rejects.toThrow('BUDGET_NATIVE_READER_REQUIRED');
  });
  it('requires a real lease before any policy/original return and gives reader no publication rights', async () => {
    await db.exec('set session authorization test_only_budget_reader');
    try {
      await expect(
        db.query(
          'select * from world_v2.lock_finance_budget_policy($1,$2,$3,$4,$5,$6,$7::uuid)',
          [
            'WORLD_TEST_ONLY',
            'COUNTRY_01',
            'ENVELOPE_TEST_ONLY',
            'PERIOD_TEST_ONLY',
            'WORKER_TEST_ONLY',
            new Date().toISOString(),
            '11111111-1111-4111-8111-111111111111',
          ],
        ),
      ).rejects.toThrow('BUDGET_CURRENT_WRITER_LEASE_REQUIRED');
      await expect(
        db.query(
          "select world_v2.publish_finance_budget_policy('P','ISSUER','{}','sha256:0','A','0')",
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        db.query('select * from world_v2.finance_budget_policy_original'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.exec('set session authorization postgres');
    }
  });
  it('rejects arbitrary rule/owner/hash publication without inserting any record', async () => {
    await db.exec('set session authorization test_only_budget_publisher');
    try {
      await expect(
        db.query(
          'select world_v2.publish_finance_budget_policy($1,$2,$3,$4,$5,$6)',
          [
            'POLICY_TEST_ONLY',
            'ISSUER_TEST_ONLY',
            JSON.stringify({
              schemaVersion: 'finance-native-budget-policy-v1',
              ruleRef: 'CALLER_RULE',
              requestingOfficeId: 'SOCIAL',
            }),
            'sha256:' + 'a'.repeat(64),
            'ADMISSION_TEST_ONLY',
            'b'.repeat(64),
          ],
        ),
      ).rejects.toThrow('BUDGET_UNSUPPORTED_APPROVAL_RULE');
    } finally {
      await db.exec('set session authorization postgres');
    }
    expect(
      (
        await db.query<{ n: number }>(
          'select count(*)::int as n from world_v2.finance_budget_policy_original',
        )
      ).rows[0]?.n,
    ).toBe(0);
  });
  it('returns real locked authority rows and preserves negative-any-capability semantics without reader UPDATE grants', async () => {
    const world = 'WORLD_TEST_ONLY_BUDGET_CUTOFF',
      subject = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
    for (const capability of ['FINANCE_BUDGET', 'FINANCE_TREASURY'])
      await db.query(
        "insert into world_v2.current_commit_authorization values($1,$2::uuid,'COUNTRY_01','FINANCE',$3,'TEAM_TEST_ONLY','REV_TEST_ONLY',true,now())",
        [world, subject, capability],
      );
    await db.exec('set session authorization test_only_budget_reader;begin');
    try {
      const actual = await db.query(
        'select * from world_v2.lock_finance_budget_current_authorization($1,$2::uuid,$3,$4,$5)',
        [world, subject, 'COUNTRY_01', 'FINANCE', 'FINANCE_BUDGET'],
      );
      expect(actual.rows).toEqual([
        {
          auth_subject: subject,
          world_id: world,
          country_id: 'COUNTRY_01',
          office_id: 'FINANCE',
          capability: 'FINANCE_BUDGET',
          team_id: 'TEAM_TEST_ONLY',
          authorization_version: 'REV_TEST_ONLY',
        },
      ]);
      expect(
        (
          await db.query(
            'select * from world_v2.lock_finance_budget_revoked_authorization($1,$2::uuid,$3,$4)',
            [world, subject, 'COUNTRY_01', 'FINANCE'],
          )
        ).rows,
      ).toHaveLength(2);
      expect(
        (
          await db.query(
            'select * from world_v2.lock_finance_budget_current_authorization($1,$2::uuid,$3,$4,$5)',
            [world, subject, 'COUNTRY_02', 'FINANCE', 'FINANCE_BUDGET'],
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await db.exec('rollback;set session authorization postgres');
    }
    expect(
      (
        await db.query<{ has_update: boolean }>(
          "select has_table_privilege('test_only_budget_reader','world_v2.current_commit_authorization','UPDATE') as has_update",
        )
      ).rows[0]?.has_update,
    ).toBe(false);
  });
  it('locks real RLS entitlements with UPDATE-USING visibility while still vetoing actual source-owner mutation', async () => {
    const world = 'WORLD_TEST_ONLY_BUDGET_RLS',
      subject = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
    await db.query(
      "insert into world_v2.projection_entitlement values($1,$2::uuid,'OFFICE_PRIVATE','SCOPE_TEST_ONLY','REV_TEST_ONLY',true,now(),null)",
      [world, subject],
    );
    await db.exec('begin;set local role world_v2_finance_budget_source_owner');
    try {
      await db.query(
        "select set_config('econmind.finance_budget_source_world',$1,true)",
        [world],
      );
      expect(
        (
          await db.query(
            'select world_id from world_v2.projection_entitlement where world_id=$1 for share',
            [world],
          )
        ).rows,
      ).toEqual([{ world_id: world }]);
      await expect(
        db.query(
          'update world_v2.projection_entitlement set active=active where world_id=$1',
          [world],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.exec('rollback');
    }
  });
});
