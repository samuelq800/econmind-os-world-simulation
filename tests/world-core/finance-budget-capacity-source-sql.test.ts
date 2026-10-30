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
    'finance-budget-capacity-source.sql',
  ])
    await db.exec(await file('database/proposals/' + p));
  await db.exec(
    'create role test_only_budget_reader login nosuperuser nobypassrls;grant world_v2_finance_budget_source_reader to test_only_budget_reader;create role test_only_budget_publisher login nosuperuser nobypassrls;grant world_v2_finance_budget_source_publisher to test_only_budget_publisher',
  );
});
afterAll(async () => {
  await db?.close();
});
describe('fixed Budget capacity SQL / local TEST_ONLY role isolation', () => {
  it('does not grant source rows, generic ledger authority or publisher membership to the reader', async () => {
    expect(
      (
        await db.query(
          "select has_table_privilege('test_only_budget_reader','world_v2.finance_budget_capacity_original','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')as raw,has_function_privilege('test_only_budget_reader','world_v2.publish_finance_budget_capacity(text,text,text,text,text)','EXECUTE')as publish,pg_has_role('test_only_budget_reader','world_v2_finance_budget_source_publisher','MEMBER')as publisher",
        )
      ).rows,
    ).toEqual([{ raw: false, publish: false, publisher: false }]);
  });
  it('refuses publication without a genuine stored admitted seed instead of accepting caller source rows', async () => {
    await db.exec('set role test_only_budget_publisher');
    try {
      await expect(
        db.query(
          'select world_v2.publish_finance_budget_capacity($1,$2,$3,$4,$5)',
          [
            'WORLD_ABSENT',
            'COUNTRY_01',
            'sha256:' + '0'.repeat(64),
            'ADMISSION_ABSENT',
            '0'.repeat(64),
          ],
        ),
      ).rejects.toMatchObject({ code: 'P0002' });
    } finally {
      await db.exec('reset role');
    }
    expect(
      (
        await db.query(
          'select count(*)::int as count from world_v2.finance_budget_capacity_original',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
  it('requires actual current policy, admission and lease on every reader call', async () => {
    await db.exec('set role test_only_budget_reader');
    try {
      await db.query(
        "select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)",
      );
      await expect(
        db.query(
          'select * from world_v2.read_finance_budget_capacity($1,$2,$3,$4,$5,now())',
          [
            'WORLD_ABSENT',
            'COUNTRY_01',
            'ENVELOPE_ABSENT',
            'PERIOD_ABSENT',
            'WORKER_ABSENT',
          ],
        ),
      ).rejects.toMatchObject({
        code: '42501',
        message: 'BUDGET_CURRENT_WRITER_LEASE_REQUIRED',
      });
    } finally {
      await db.exec('reset role');
    }
  });
});
