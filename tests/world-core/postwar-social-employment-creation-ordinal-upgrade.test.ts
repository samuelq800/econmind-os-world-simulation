/** Owned TEST_ONLY PGlite schema, not native PostgreSQL or official source proof. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { createSocialEmploymentCreationSqlFixture } from '../support/social-employment-creation-sql-fixture.js';
import {
  preparePostwarSocialEmploymentCreationForward,
  preparePostwarSocialEmploymentCreationOrdinalForward,
} from '../support/postwar-social-employment-creation-forward.js';
const signature =
  'world_v2.prepare_postwar_social_employment_creation_licences(text)';
it('repairs only the exact V1 initializer, retaining catalog/rows and rejecting retries, unknown metadata and failed transactions', async () => {
  const f = await createSocialEmploymentCreationSqlFixture('DC5_PREDECESSOR');
  try {
    const repair = await preparePostwarSocialEmploymentCreationOrdinalForward(
      resolve('.'),
    );
    const full = await preparePostwarSocialEmploymentCreationForward(
      resolve('.'),
    );
    const oldDefinition = await readFile(
      resolve(
        'tests/fixtures/sql/postwar-social-employment-creation.v1-initializer.sql',
      ),
      'utf8',
    );
    await f.admin();
    await f.db.exec(full.sql);
    await f.db.exec(oldDefinition);
    const metadata = async () =>
      (
        await f.db.query<{ catalog: Record<string, unknown>; body: string }>(
          `select to_jsonb(p)-'prosrc' catalog,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body from pg_proc p where oid=$1::regprocedure`,
          [signature],
        )
      ).rows[0]!;
    const unchanged = async () =>
      (
        await f.db.query(`select
      (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2' and p.oid<>'${signature}'::regprocedure)functions,
      (select jsonb_agg(to_jsonb(p) order by p.oid)from pg_policy p)policies,
      (select jsonb_agg(to_jsonb(x) order by country_id)from world_v2.postwar_social_prefix_scope x)scopes,
      (select jsonb_agg(to_jsonb(x) order by world_id)from world_v2.world_head x)heads,
      (select count(*)from world_v2.postwar_social_employment_creation_licence)licences,
      (select count(*)from world_v2.authoritative_event)events,
      (select count(*)from world_v2.command_receipt)receipts,
      (select count(*)from world_v2.financial_posting_batch)financial,
      (select count(*)from world_v2.inventory_posting)inventory`)
      ).rows;
    const before = await metadata(),
      stable = await unchanged();
    expect(before.body).toBe(repair.functions[0]!.oldBodySha256);
    await expect(f.prepareLicences()).rejects.toMatchObject({
      code: '23514',
      message: expect.stringContaining(
        'SOCIAL_CREATION_ACTUAL_DUTY_TIME_REQUIRED',
      ),
    });
    await f.admin();
    expect(await unchanged()).toEqual(stable);
    const reject = async (sql: string, message: string) => {
      await expect(f.db.exec(sql)).rejects.toMatchObject({
        code: '55000',
        message: expect.stringContaining(message),
      });
      await f.db.exec('rollback');
    };
    // V2 full install cannot silently adopt the already-installed V1 supplement.
    await reject(full.sql, 'SOCIAL_CREATE_EXACT_SUPPLEMENT_FUNCTION_REQUIRED');
    expect(await metadata()).toEqual(before);
    await f.db.exec(`alter function ${signature} set search_path=public`);
    await reject(
      repair.sql,
      'SOCIAL_CREATE_EXACT_SUPPLEMENT_FUNCTION_REQUIRED',
    );
    await f.db.exec(`alter function ${signature} set search_path=pg_catalog`);
    const boundary =
      ' -- Fixed failure-injection boundary for the isolated rollback test only.';
    expect(repair.sql).toContain(boundary);
    await reject(
      repair.sql.replace(
        boundary,
        ` raise exception 'TEST_ONLY_AFTER_BODY_FAILURE'using errcode='55000';\n${boundary}`,
      ),
      'TEST_ONLY_AFTER_BODY_FAILURE',
    );
    expect(await metadata()).toEqual(before);
    expect(await unchanged()).toEqual(stable);
    await f.db.exec(repair.sql);
    const after = await metadata();
    expect(after.catalog).toEqual(before.catalog);
    expect(after.body).toBe(repair.functions[0]!.newBodySha256);
    expect(await unchanged()).toEqual(stable);
    await reject(
      repair.sql,
      'SOCIAL_CREATE_EXACT_SUPPLEMENT_FUNCTION_REQUIRED',
    );
    expect(await metadata()).toEqual(after);
    // Publication remains a separate restricted-role operation, not part of DDL.
    expect(
      (await f.prepareLicences()).rows[0]!
        .prepare_postwar_social_employment_creation_licences,
    ).toBe(2);
    expect(
      (await f.prepareLicences()).rows[0]!
        .prepare_postwar_social_employment_creation_licences,
    ).toBe(2);
    await f.assertActualCreationChain();
  } finally {
    await f.db.close();
  }
}, 60000);
