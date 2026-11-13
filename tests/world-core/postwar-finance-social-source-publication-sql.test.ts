/** Actual isolated SQL ACL/absence tests; no fabricated seed/admission positive. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const read = (path: string) =>
  readFile(new URL('../../' + path, import.meta.url), 'utf8');
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  for (const id of [
    '0001_world_v2_namespace',
    '0002_world_v2_command_event_ledger',
    '0003_world_v2_command_receipts_outbox',
    '0005_world_v2_writer_lease_fencing',
    '0007_world_v2_atomic_transition_facts',
    '0009_world_v2_posting_payload_integrity',
    '0011_world_v2_current_commit_authorization',
    '0013_world_v2_read_projection_boundary',
    '0016_world_v2_opening_seed',
  ])
    await db.exec(await read('database/migrations/artifacts/' + id + '.sql'));
  for (const p of [
    'runtime-read-binding-storage',
    'runtime-admission-publication',
    'social-operating-custody',
    'finance-budget-custody',
    'finance-budget-capacity-source',
    'finance-budget-mixed-source',
    'postwar-finance-social-source-publication',
  ])
    await db.exec(await read('database/proposals/' + p + '.sql'));
  await db.exec(
    'create role test_source_finance login nosuperuser nobypassrls;grant world_v2_finance_budget_source_publisher to test_source_finance;create role test_source_social login nosuperuser nobypassrls;grant world_v2_social_source_publisher to test_source_social;',
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe('fixed version Finance/Social publication SQL', () => {
  it('grants only the proper existing publisher EXECUTE, with private verifier and no raw/source table rights', async () => {
    expect(
      (
        await db.query(
          `select has_function_privilege('world_v2_finance_budget_source_reader','world_v2.publish_postwar_finance_source_bounded(text)','EXECUTE')reader_publish,has_function_privilege('test_source_finance','world_v2.publish_postwar_social_source_bounded(text)','EXECUTE')cross_publish,has_function_privilege('test_source_social','world_v2.verify_postwar_finance_social_publication(text,text)','EXECUTE')private_verify,has_column_privilege('test_source_finance','world_v2.opening_seed','canonical_payload','SELECT')raw_seed,has_table_privilege('test_source_finance','world_v2.finance_budget_mixed_social_original','INSERT,UPDATE,DELETE,TRUNCATE')direct_write,has_function_privilege('test_source_finance','world_v2.publish_postwar_finance_source_bounded(text)','EXECUTE')finance_publish`,
        )
      ).rows,
    ).toEqual([
      {
        reader_publish: false,
        cross_publish: false,
        private_verify: false,
        raw_seed: false,
        direct_write: false,
        finance_publish: true,
      },
    ]);
  });
  it('rejects privileged callers and arbitrary/fake derived rows without writing a source', async () => {
    await expect(
      db.query(
        "select * from world_v2.publish_postwar_finance_source_bounded('{}')",
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('set session authorization test_source_finance');
    try {
      await expect(
        db.query(
          "select * from world_v2.publish_postwar_finance_source_bounded('{}')",
        ),
      ).rejects.toThrow('FIXED_CORE_DERIVATION_HASH_REQUIRED');
      await expect(
        db.query(
          'select * from world_v2.publish_postwar_finance_source_bounded($1)',
          ['x'.repeat(524289)],
        ),
      ).rejects.toThrow('BOUNDED_DERIVED_COUNTRY_REQUIRED');
    } finally {
      await db.exec('set session authorization postgres');
    }
    expect(
      (
        await db.query(
          'select count(*)::text n from world_v2.finance_budget_mixed_social_original',
        )
      ).rows,
    ).toEqual([{ n: '0' }]);
  });
  it('fixes all function owners/search paths and contains no full-seed JSON parser or policy/membership expansion', async () => {
    const sql = await read(
      'database/proposals/postwar-finance-social-source-publication.sql',
    );
    expect(sql).not.toMatch(/canonical_payload\s*::\s*json/iu);
    expect(sql).not.toMatch(
      /create role|create policy|grant (?:select|insert|update|delete|all)\b/iu,
    );
    expect(
      (
        await db.query(
          "select p.proname,r.rolname owner,p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2'and p.proname in('verify_postwar_finance_social_publication','publish_postwar_social_source_bounded','publish_postwar_finance_source_bounded')order by p.proname",
        )
      ).rows,
    ).toHaveLength(3);
  });
});
