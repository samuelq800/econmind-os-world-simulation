/** Actual embedded SQL/role/source-hash protocol only. Installer metadata in
 * the fixture does not claim official source/financial adoption or production. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createIndustryRunParametersSqlFixture } from '../support/postwar-industry-run-parameters-fixture.js';
import { createPostwarIndustryRunParametersReader } from '../../apps/world-worker/src/persistence/postwar-industry-run-parameters-read.js';
let f: Awaited<ReturnType<typeof createIndustryRunParametersSqlFixture>>;
beforeAll(async () => {
  f = await createIndustryRunParametersSqlFixture();
}, 30000);
afterEach(async () => {
  await f.f.reset();
});
afterAll(async () => {
  await f?.close();
});
const reader = createPostwarIndustryRunParametersReader({
  runtimeReaderRole: 'world_v2_postwar_projection_reader',
  authorizationPublisherRole: 'world_v2_postwar_projection_publisher',
});
describe('RUN original parameter low-role page', () => {
  it('reads actual published policy/source/unit and original currency without money/ready/economic values', async () => {
    await f.begin();
    const r = await reader.readPageFrom(f.tx, { worldId: f.f.world });
    expect(r.status).toBe('PAGE');
    if (!('rows' in r)) throw Error('ACTUAL_PAGE_REQUIRED');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      countryId: 'COUNTRY_02',
      facilityId: 'OPEN-02-REFINED_FUEL',
      sourceRef: f.published.sourceRef,
      sourceRawSha256: f.published.sourceSha256,
      expenseCurrency: f.currency,
      windowStartsAtSimTime: '0',
      windowEndsAtSimTime: '86400000',
    });
    expect(r.source).toMatchObject({
      worldVersion: '0',
      eventSequence: '0',
      observedHead: { worldVersion: '0', eventSequence: '0' },
    });
    expect('balance' in r.rows[0]!).toBe(false);
    expect('ready' in r.rows[0]!).toBe(false);
    const permissions = await f.db.query(
      "select has_table_privilege(current_user,'world_v2.postwar_industry_first_day_source','SELECT')source_select,has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')seed_read",
    );
    expect(permissions.rows[0]).toEqual({
      source_select: false,
      seed_read: false,
    });
  });
  it('enforces source version and real pagination, with no raw source grant to readers', async () => {
    await f.begin();
    const first = await reader.readPageFrom(f.tx, {
      worldId: f.f.world,
      limit: 1,
    });
    if (!('source' in first)) throw Error('PAGE_REQUIRED');
    const empty = await reader.readPageFrom(f.tx, {
      worldId: f.f.world,
      offset: 1,
      limit: 1,
      expectedVersion: first.source.sourceVersion,
    });
    expect(empty.status).toBe('EMPTY');
    expect(
      (
        await reader.readPageFrom(f.tx, {
          worldId: f.f.world,
          expectedVersion: 'sha256:' + '0'.repeat(64),
        })
      ).status,
    ).toBe('STALE');
    await expect(
      f.db.query(
        'select world_v2.postwar_industry_run_parameter_originals($1,$2,$3,$4)',
        [f.f.world, f.f.buyer, f.f.seed.fingerprint, f.f.admissionRef],
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('requires fresh subject/country/seat and source revocation; absent parameters are unavailable rather than a known empty source', async () => {
    await f.f.reset();
    await f.db.query(
      "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='INDUSTRY'",
      [f.f.world],
    );
    await f.begin();
    expect(
      (await reader.readPageFrom(f.tx, { worldId: f.f.world })).status,
    ).toBe('DENIED');
    await f.f.reset();
    await f.db.query(
      "update world_v2.current_commit_authorization set active=true where world_id=$1 and office_id='INDUSTRY'",
      [f.f.world],
    );
    await f.db.exec(
      'set session authorization world_v2_industry_source_publisher',
    );
    await f.db.query(
      'select world_v2.revoke_postwar_industry_first_day_source($1,$2,$3)',
      [f.f.world, f.published.sourceRef, 'TEST_ONLY_REVOKED'],
    );
    await f.begin();
    expect(
      (await reader.readPageFrom(f.tx, { worldId: f.f.world })).status,
    ).toBe('UNAVAILABLE');
  });
});
