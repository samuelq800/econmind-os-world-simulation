/** Actual embedded SQL RUN metadata boundary; real controlled TEST_ONLY seed
 * admission, low roles and lease. No work/production or native PG is claimed. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createPostwarIndustryRunCustodyFixture } from '../support/postwar-industry-run-custody-fixture.js';
const query =
  'select * from world_v2.lock_postwar_industry_run_scope($1,$2,$3::uuid,$4,$5::bigint,$6::timestamptz)';
describe('actual Industry RUN fixed scope metadata SQL', () => {
  let db: PGlite,
    f: Awaited<ReturnType<typeof createPostwarIndustryRunCustodyFixture>>['f'],
    params: unknown[],
    seat: string;
  let fixture: Awaited<
    ReturnType<typeof createPostwarIndustryRunCustodyFixture>
  >;
  const worker = 'WORKER_TEST_ONLY_RUN';
  beforeAll(async () => {
    fixture = await createPostwarIndustryRunCustodyFixture();
    ({ db, f, params, seat } = fixture);
  }, 30000);
  afterEach(async () => {
    await f.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });
  async function begin(options: Parameters<typeof fixture.begin>[0] = {}) {
    return fixture.begin(options);
  }
  it('uses the actual seat_ref, exact current actor and H with the held lease, returning only metadata', async () => {
    expect(seat).not.toBe(f.team);
    await begin();
    const r = await db.query(query, params);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      world_version: '0',
      event_sequence: '0',
      team_id: f.team,
      authorization_version: f.revision,
      holder_id: worker,
      fencing_token: '1',
    });
    expect(Object.keys(r.rows[0]!)).toHaveLength(9);
    const permissions = await db.query(
      "select has_column_privilege(current_user,'world_v2.opening_seed','canonical_payload','SELECT')raw_seed,has_column_privilege(current_user,'world_v2.current_commit_authorization','authorization_version','UPDATE')auth_update,has_column_privilege(current_user,'world_v2.world_writer_lease','fencing_token','UPDATE')lease_update",
    );
    expect(permissions.rows[0]).toEqual({
      raw_seed: false,
      auth_update: false,
      lease_update: false,
    });
  });
  it('refuses a membership-bearing base role, owner switching and readonly/nonstable transactions', async () => {
    await begin({ role: 'BASE' });
    await expect(db.query(query, params)).rejects.toMatchObject({
      code: '42501',
    });
    await begin();
    await expect(
      db.exec('set role world_v2_industry_source_owner'),
    ).rejects.toMatchObject({ code: '42501' });
    await begin({ readOnly: true });
    await expect(db.query(query, params)).rejects.toMatchObject({
      code: '25001',
    });
    await begin({ isolation: 'read committed' });
    await expect(db.query(query, params)).rejects.toMatchObject({
      code: '25001',
    });
  });
  it('rejects wrong subject/country/world/head/holder and an expired observed lease', async () => {
    for (const [index, value, code] of [
      [2, '00000000-0000-4000-8000-000000000002', '42501'],
      [1, f.buyer, '42501'],
      [0, 'WORLD_OTHER', '55000'],
      [4, '1', '40001'],
      [3, 'WORKER_OTHER', '55000'],
      [5, new Date(Date.now() + 7200000).toISOString(), '55000'],
    ] as const) {
      await begin();
      const p = [...params];
      p[index] = value;
      await expect(db.query(query, p)).rejects.toMatchObject({ code });
    }
  });
  it('reads fresh seat/auth/entitlement state rather than preserving a former successful scope', async () => {
    const mutations = [
      [
        "update world_v2.current_commit_authorization set authorization_version='REV_STALE'where world_id=$1 and office_id='INDUSTRY'",
        "update world_v2.current_commit_authorization set authorization_version=$2 where world_id=$1 and office_id='INDUSTRY'",
      ],
      [
        "update world_v2.current_commit_authorization set active=false where world_id=$1 and office_id='INDUSTRY'",
        "update world_v2.current_commit_authorization set active=true where world_id=$1 and office_id='INDUSTRY'",
      ],
      [
        'update world_v2.projection_entitlement set active=false,revoked_at=now() where world_id=$1',
        'update world_v2.projection_entitlement set active=true,revoked_at=null where world_id=$1',
      ],
    ];
    for (const [change, restore] of mutations) {
      await f.reset();
      await db.query(change!, [f.world]);
      try {
        await begin();
        await expect(db.query(query, params)).rejects.toMatchObject({
          code: '42501',
        });
      } finally {
        await f.reset();
        await db.query(
          restore!,
          restore!.includes('$2') ? [f.world, f.revision] : [f.world],
        );
      }
      await begin();
      expect((await db.query(query, params)).rows).toHaveLength(1);
    }
  });
  it('does not accept an admission after its append-only permit revocation', async () => {
    await f.reset();
    const permits = await db.query<{ authorization_id: string }>(
      'select authorization_id from world_v2.runtime_admission_publication_permit where world_id=$1',
      [f.world],
    );
    await db.exec('set role world_v2_admission_release');
    await db.query(
      "insert into world_v2.runtime_admission_publication_revocation(authorization_id,reason_ref)values($1,'TEST_ONLY_RUN_REVOKED')",
      [permits.rows[0]!.authorization_id],
    );
    await db.exec('reset role');
    await begin();
    await expect(db.query(query, params)).rejects.toMatchObject({
      code: '42501',
    });
  });
});
