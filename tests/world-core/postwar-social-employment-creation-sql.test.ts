/** Actual SQL over TEST_ONLY source originals and genuine Core frames. */
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import { createSocialEmploymentCreationSqlFixture } from '../support/social-employment-creation-sql-fixture.js';
let fixture: Awaited<
  ReturnType<typeof createSocialEmploymentCreationSqlFixture>
>;
let db: typeof fixture.db, fixtures: typeof fixture.fixtures;
let world: string;
const admin = () => fixture.admin(),
  readerSession = () => fixture.readerSession(),
  prepareLicences = () => fixture.prepareLicences(),
  creationData = () => fixture.creationData(),
  command = (...args: Parameters<typeof fixture.command>) =>
    fixture.command(...args),
  scoped = (...args: Parameters<typeof fixture.scoped>) =>
    fixture.scoped(...args);
beforeAll(async () => {
  fixture = await createSocialEmploymentCreationSqlFixture();
  ({ db, fixtures, world } = fixture);
}, 60000);
afterEach(async () => {
  await admin();
});
afterAll(async () => {
  await db.close();
});
describe('actual SQL licence supplement over TEST_ONLY genuine Core opening data', () => {
  it('derives licences only from the admitted original; keeps old scope bytes, repeats exactly, and denies the online reader', async () => {
    await admin();
    const before = await db.query(
      'select country_id,scope_document,scope_sha256 from world_v2.postwar_social_prefix_scope order by country_id',
    );
    expect(
      (await prepareLicences()).rows[0]!
        .prepare_postwar_social_employment_creation_licences,
    ).toBe(2);
    expect(
      (await prepareLicences()).rows[0]!
        .prepare_postwar_social_employment_creation_licences,
    ).toBe(2);
    await admin();
    expect(
      (
        await db.query(
          'select country_id,scope_document,scope_sha256 from world_v2.postwar_social_prefix_scope order by country_id',
        )
      ).rows,
    ).toEqual(before.rows);
    const rows = await db.query<{ canonical_licence: string }>(
      'select canonical_licence from world_v2.postwar_social_employment_creation_licence order by country_id',
    );
    expect(rows.rows.map((r) => JSON.parse(r.canonical_licence))).toEqual(
      fixtures.map((f) => f.country.npcUsageLicenses[0]),
    );
    await readerSession();
    await expect(
      db.query(
        'select world_v2.prepare_postwar_social_employment_creation_licences($1)',
        [world],
      ),
    ).rejects.toThrow('permission denied');
    await admin();
    await readerSession();
    await expect(
      db.query(
        'select * from world_v2.postwar_social_employment_creation_licence',
      ),
    ).rejects.toThrow('permission denied');
  });
  it('accepts genuine Core CREATE source binding and refuses a foreign licence, missing record, invented budget or altered source', async () => {
    await prepareLicences();
    const x = creationData();
    expect(await scoped(x.c, x.op.eventPayload)).toBe(true);
    const event = x.op.eventPayload! as unknown as Record<string, unknown>,
      facts = x.facts;
    for (const patch of [
      { usageLicence: fixtures[1]!.country.npcUsageLicenses[0] },
      {
        usageLicence: { ...facts.usageLicence, licenseId: 'MISSING_TEST_ONLY' },
      },
      { sourceFingerprint: 'sha256:' + 'f'.repeat(64) },
    ])
      expect(
        await scoped(x.c, { ...event, readFacts: { ...facts, ...patch } }),
      ).toBe(false);
    const bad = command(
      'BAD_BUDGET_SQL',
      C.SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
      '0',
      {
        ...JSON.parse(x.c.canonicalPayload),
        budget: { amount: '1', currency: 'XAA' },
      },
    );
    expect(await scoped(bad, event)).toBe(false);
  });
});

it('replays real Core CREATE→child PLAN→MATCH from stored SQL and retains the physical parent capacity, with no economic postings', async () => {
  await fixture.assertActualCreationChain();
});
it('keeps all supplementary authority confined to the exact existing inaccessible owners and publisher', async () => {
  await admin();
  const funcs = await db.query<{
    name: string;
    owner: string;
    prosecdef: boolean;
    proconfig: string[];
    reader: boolean;
    publisher: boolean;
    social: boolean;
    finance: boolean;
  }>(`select p.proname name,pg_get_userbyid(p.proowner)owner,p.prosecdef,p.proconfig,
 has_function_privilege('world_v2_postwar_projection_reader',p.oid,'EXECUTE')reader,
 has_function_privilege('world_v2_postwar_projection_publisher',p.oid,'EXECUTE')publisher,
 has_function_privilege('world_v2_social_source_owner',p.oid,'EXECUTE')social,
 has_function_privilege('world_v2_finance_budget_source_owner',p.oid,'EXECUTE')finance
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='world_v2'and p.proname in('prepare_postwar_social_employment_creation_licences','postwar_social_employment_creation_effect_scoped','postwar_social_created_pool')order by p.proname`);
  expect(funcs.rows).toHaveLength(3);
  for (const f of funcs.rows) {
    expect(f.owner).toBe('world_v2_postwar_projection_owner');
    expect(f.prosecdef).toBe(true);
    expect(f.proconfig).toEqual(['search_path=pg_catalog']);
    expect(f.reader).toBe(false);
    expect(f.publisher).toBe(
      f.name === 'prepare_postwar_social_employment_creation_licences',
    );
    expect(f.social).toBe(
      f.name === 'postwar_social_employment_creation_effect_scoped',
    );
    expect(f.finance).toBe(
      f.name !== 'prepare_postwar_social_employment_creation_licences',
    );
  }
  const grants = await db.query(
    `select has_table_privilege('world_v2_postwar_projection_reader','world_v2.postwar_social_employment_creation_licence','SELECT,INSERT,UPDATE,DELETE')r,has_table_privilege('world_v2_postwar_projection_publisher','world_v2.postwar_social_employment_creation_licence','SELECT,INSERT,UPDATE,DELETE')p`,
  );
  expect(grants.rows[0]).toEqual({ r: false, p: false });
  const roles = await db.query<{
    rolcanlogin: boolean;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(
    "select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname in('world_v2_postwar_projection_owner','world_v2_social_source_owner','world_v2_finance_budget_source_owner')",
  );
  expect(roles.rows).toHaveLength(3);
  expect(
    roles.rows.every((r) => !r.rolcanlogin && !r.rolsuper && !r.rolbypassrls),
  ).toBe(true);
});
