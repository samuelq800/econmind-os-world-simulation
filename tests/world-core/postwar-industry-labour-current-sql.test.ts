/** Actual PGlite SQL extraction/ACL/page mechanism. Header, mixed-prefix and
 * current-materialization helpers are explicit TEST_ONLY seams, not admission,
 * native locking or full Core replay acceptance. No operating rules created. */
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import {
  canonicalSerialize,
  createOpeningSource,
  openingSourceId,
  OPENING_SOURCE_SCHEMA_VERSION,
} from '@econmind/core';
const sha = (s: string) => createHash('sha256').update(s).digest('hex'),
  hash = (v: unknown) => 'sha256:' + sha('SHA-256\n' + canonicalSerialize(v));
const world = 'WORLD_INDUSTRY_TEST_ONLY',
  country = 'COUNTRY_01',
  subject = '11111111-1111-4111-8111-111111111111';
let db: PGlite, seedFP: string, seedSHA: string, sourceHash: string;
const original = {
  countryId: country,
  locationId: 'REGION_TEST',
  positionId: 'POSITION_TEST',
  sourceObjectId: 'FACILITY_TEST',
  sourceBucket: 'INDUSTRY',
  employerId: 'OP_TEST',
  employerRole: 'OP',
  owner: 'PRIVATE_SECTOR',
  occupation: 'GENERAL',
  skill: 'HIGH',
  classificationId: 'STEEL',
  requiredCount: '10',
  filledCount: '6',
  personRange: { poolId: 'POOL_TEST', startOrdinal: '0', count: '6' },
};
const openingPosition = {
  positionId: 'POSITION_TEST',
  countryId: country,
  locationId: 'REGION_TEST',
  owner: 'PRIVATE_SECTOR',
  skill: 'HIGH',
  classificationId: 'STEEL',
  requiredCount: '10',
  employedCount: '6',
};
const document = {
  schemaVersion: 'postwar-social-employment-state-v1',
  sourceRevision: 'TEST_ONLY_SOURCE_V1',
  countries: [{ countryId: country }, { countryId: 'COUNTRY_02' }],
  inputs: {
    worldId: world,
    seedId: 'SEED_TEST',
    sourcePositions: [original],
    labour: {
      positions: [
        { ...original, wageCurrency: 'AAA', payrollFundingRef: 'PAYROLL_TEST' },
      ],
    },
    populationPositionRefs: [
      {
        positionId: 'POSITION_TEST',
        regionId: 'REGION_TEST',
        count: '6',
        sourcePoolId: 'POOL_TEST',
        sourceStartOrdinal: '0',
      },
    ],
    positionFunding: [
      {
        positionId: 'POSITION_TEST',
        countryId: country,
        locationId: 'REGION_TEST',
        payerEntityId: 'OP_TEST',
        kind: 'PAYROLL',
        filledCount: '6',
        currency: 'AAA',
        payrollFundingRef: 'PAYROLL_TEST',
      },
    ],
  },
};
const rows = [
  {
    schemaVersion: 'postwar-industry-labour-current-row-v1',
    countryId: country,
    facilityId: 'FACILITY_TEST',
    locationId: 'REGION_TEST',
    operatorId: 'OP_TEST',
    positionId: 'POSITION_TEST',
    skill: 'HIGH',
    classificationId: 'STEEL',
    requiredCount: '10',
    openingFilledCount: '6',
    currentEmployedCount: '6',
    measurement: 'EMPLOYMENT_HEADCOUNT_NOT_ATTENDANCE_OR_PAYMENT',
    completedPersonDays: null,
    paidCost: null,
  },
];
const coverage = {
  prefixFingerprint: hash('prefix'),
  knownEffectsFingerprint: hash('effects'),
  coveredThroughEventId: 'EVENT_TEST',
  coveredThroughEventFingerprint: hash('event'),
  financialPostingCount: '6',
  financialBatchCount: '2',
  financialPostingsFingerprint: hash('batches'),
};
function assertion(changes: Record<string, unknown> = {}) {
  return canonicalSerialize({
    head: { worldId: world, worldVersion: '1', eventSequence: '1' },
    seedPins: {
      worldId: world,
      seedId: 'SEED_TEST',
      seedFingerprint: seedFP,
      admissionRef: 'ADMISSION_TEST',
    },
    coverage,
    rowsHash: hash(rows),
    ...changes,
  });
}
async function admin() {
  await db.exec('reset role;set session authorization postgres');
}
async function publisher() {
  await admin();
  await db.exec('set session authorization industry_test_publisher');
}
async function reader(who = subject) {
  await admin();
  await db.exec('set session authorization industry_test_reader');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who]);
}
async function page(offset = 0, limit = 25, version: string | null = null) {
  return (
    await db.query<{
      status: string;
      source: Record<string, unknown>;
      page: Record<string, unknown>;
      rows_text: string;
    }>(
      'select * from world_v2.read_postwar_industry_labour_current_page($1,$2,$3,$4)',
      [world, offset, limit, version],
    )
  ).rows[0]!;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema world_v2;
 create role world_v2_social_source_owner nologin nosuperuser nobypassrls;
 create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls;
 create role world_v2_postwar_projection_publisher nologin nosuperuser nobypassrls;
 create role world_v2_postwar_projection_reader nologin nosuperuser nobypassrls;
 create role industry_test_publisher login nosuperuser nobypassrls;
 create role industry_test_reader login nosuperuser nobypassrls;
 grant world_v2_postwar_projection_publisher to industry_test_publisher;
 grant world_v2_postwar_projection_reader to industry_test_reader;
 grant usage on schema world_v2 to world_v2_postwar_projection_owner,world_v2_postwar_projection_publisher,world_v2_postwar_projection_reader;
 create function world_v2.canonical_json(v jsonb)returns text language plpgsql immutable as $$declare r text;begin
 case jsonb_typeof(v)when 'object'then select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||world_v2.canonical_json(value),','order by key),'')||'}'into r from jsonb_each(v);
 when 'array'then select '['||coalesce(string_agg(world_v2.canonical_json(value),','order by n),'')||']'into r from jsonb_array_elements(v)with ordinality a(value,n);else r:=v::text;end case;return r;end;$$;
 create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE';end;$$;
 create table world_v2.social_operating_source_registration(world_id text,country_id text,seed_fingerprint text,admission_ref text,source_id text,source_payload_hash text,registration_ref text);
 create table world_v2.social_operating_source_revocation(registration_ref text);
 grant usage on schema world_v2 to world_v2_social_source_owner;
 grant select on world_v2.social_operating_source_registration,world_v2.social_operating_source_revocation to world_v2_social_source_owner;
 create table world_v2.opening_seed(world_id text,canonical_payload text,seed_fingerprint text);
 create table world_v2.world_head(world_id text,world_version bigint,event_sequence bigint);
 create table world_v2.test_admission(world_id text,seed_id text,seed_fingerprint text,admission_ref text,source_bundle_sha256 text);
 create table world_v2.postwar_social_prefix_scope(world_id text,country_id text,seed_fingerprint text,admission_ref text,canonical_seed_sha256 text,source_bundle_sha256 text,source_id text,source_payload_hash text,scope_document text,scope_sha256 text,primary key(world_id,country_id));
 create table world_v2.postwar_office_projection_document(document_ref text,world_id text,country_id text,office_id text,dataset text,seed_id text,seed_fingerprint text,admission_ref text,canonical_seed_sha256 text,source_bundle_sha256 text);
 create table world_v2.postwar_office_projection_revocation(world_id text,document_ref text);
 create table world_v2.command_receipt(world_id text,outcome text);
 create table world_v2.financial_posting_batch(world_id text);
 create table world_v2.inventory_posting(world_id text);
 create table world_v2.authoritative_event(world_id text,event_id text,event_fingerprint text,world_version bigint,event_sequence bigint,event_type text,causation_command_id text);
 create table world_v2.current_materialization(world_id text,materialization_key text,source_command_id text,payload_sha256 text,world_version bigint);
 create table world_v2.command_submission(world_id text,command_id text,country_id text);
 create function world_v2.postwar_projection_admission_header(w text)returns setof world_v2.test_admission language sql as $$select * from world_v2.test_admission where world_id=w$$;
 create function world_v2.lock_postwar_social_current_prefix_publication(w text,c text)returns table(world_version text,event_sequence text)language plpgsql security definer as $$begin perform set_config('econmind.postwar_projection_world',w,true);return query select h.world_version::text,h.event_sequence::text from world_v2.world_head h where h.world_id=w for share;end;$$;
 create function world_v2.postwar_social_origin_at_prefix(w text,c text)returns table(state jsonb,binding jsonb)language sql as $$select null::jsonb,null::jsonb where false$$;
 create function world_v2.postwar_mixed_current_prefix(w text)returns table(prefix_fingerprint text,effects_fingerprint text,last_event_id text,last_event_fingerprint text,financial_posting_count text,financial_batch_count text,financial_postings_fingerprint text)language sql as $$select '${coverage.prefixFingerprint}','${coverage.knownEffectsFingerprint}','EVENT_TEST','${coverage.coveredThroughEventFingerprint}','6','2','${coverage.financialPostingsFingerprint}'$$;
 create function world_v2.read_postwar_office_projection_seats(w text)returns table(world_id text,country_id text,office_id text,auth_subject text,team_id text,authorization_revision text,scope_key text,seat_ref text,seed_id text,seed_fingerprint text,admission_ref text,source_bundle_sha256 text,world_version text,event_sequence text,model_version text,replay_binding text)language plpgsql security definer as $$begin perform set_config('econmind.postwar_projection_world',w,true);return query select a.world_id,case when current_setting('request.jwt.claim.sub',true)='33333333-3333-4333-8333-333333333333'then'COUNTRY_02'else'COUNTRY_01'end,'INDUSTRY',current_setting('request.jwt.claim.sub',true),'TEAM_TEST','REV_TEST','OFFICE_434F554E5452595F3031_494E445553545259','SEAT_TEST',a.seed_id,a.seed_fingerprint,a.admission_ref,a.source_bundle_sha256,h.world_version::text,h.event_sequence::text,'TEST_MODEL','TEST_REPLAY'from world_v2.test_admission a join world_v2.world_head h using(world_id)where a.world_id=w and current_setting('request.jwt.claim.sub',true)in('${subject}','33333333-3333-4333-8333-333333333333');end;$$;
 grant select on all tables in schema world_v2 to world_v2_postwar_projection_owner;
 grant update(world_version)on world_v2.world_head to world_v2_postwar_projection_owner;
 alter table world_v2.postwar_social_prefix_scope owner to world_v2_postwar_projection_owner;
 alter table world_v2.postwar_office_projection_document owner to world_v2_postwar_projection_owner;
 `);
  const payload = canonicalSerialize({
    schemaVersion: 'postwar-operating-genesis-seed-source-v1',
    carrier: { socialEmployment: document },
  });
  sourceHash = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_OPERATING_TEST'),
      sourceKind: 'TEST_FIXTURE',
      sourceVersion: 'TEST_ONLY_V1',
      locator: 'TEST_ONLY_SQL_MECHANISM',
      payload: JSON.parse(payload) as unknown,
    },
    sha,
  ).payloadHash;
  const seedText = canonicalSerialize({
    sources: [
      {
        sourceId: 'SOURCE_OPERATING_TEST',
        payloadHash: sourceHash,
        canonicalPayload: payload,
      },
    ],
  });
  seedFP = 'sha256:' + sha('SHA-256\n' + seedText);
  seedSHA = sha(seedText);
  await db.query('insert into world_v2.opening_seed values($1,$2,$3)', [
    world,
    seedText,
    seedFP,
  ]);
  await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
  await db.query('insert into world_v2.test_admission values($1,$2,$3,$4,$5)', [
    world,
    'SEED_TEST',
    seedFP,
    'ADMISSION_TEST',
    'a'.repeat(64),
  ]);
  for (const c of [country, 'COUNTRY_02']) {
    const scope = canonicalSerialize({
      positions: c === country ? [openingPosition] : [],
    });
    await db.query(
      'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        world,
        c,
        seedFP,
        'ADMISSION_TEST',
        seedSHA,
        'a'.repeat(64),
        'SOURCE_OPERATING_TEST',
        sourceHash,
        scope,
        sha(scope),
      ],
    );
  }
  await db.query(
    'insert into world_v2.postwar_office_projection_document values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
    [
      'PARENT_TEST',
      world,
      country,
      'INDUSTRY',
      'regional-source-capacity',
      'SEED_TEST',
      seedFP,
      'ADMISSION_TEST',
      seedSHA,
      'a'.repeat(64),
    ],
  );
  await db.query(
    'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5,$6,$7)',
    [
      world,
      country,
      seedFP,
      'ADMISSION_TEST',
      'SOURCE_OPERATING_TEST',
      sourceHash,
      'REGISTRATION_TEST',
    ],
  );
  await db.query(
    "insert into world_v2.postwar_office_projection_document select 'PARENT_EMPTY',world_id,'COUNTRY_02',office_id,dataset,seed_id,seed_fingerprint,admission_ref,canonical_seed_sha256,source_bundle_sha256 from world_v2.postwar_office_projection_document where document_ref='PARENT_TEST'",
  );
  await db.query(
    "insert into world_v2.social_operating_source_registration select world_id,'COUNTRY_02',seed_fingerprint,admission_ref,source_id,source_payload_hash,'REGISTRATION_EMPTY'from world_v2.social_operating_source_registration where country_id='COUNTRY_01'",
  );
  await db.exec(
    await readFile(
      new URL(
        '../../database/proposals/postwar-industry-labour-current-read.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
});
afterAll(async () => {
  await db?.close();
});
describe('Industry SQL derived current headcount mechanism', () => {
  it('publishes strict actual H0 originals before any command, then refuses H0 fallback at H1', async () => {
    await publisher();
    await db.query(
      'select world_v2.prepare_postwar_industry_labour_scopes($1)',
      [world],
    );
    await reader();
    const h0 = await page();
    expect(h0.status).toBe('PAGE');
    expect(JSON.parse(h0.rows_text)).toEqual(rows);
    expect(h0.source.dataNature).toBe(
      'ADMITTED_OPENING_INDUSTRY_EMPLOYMENT_HEADCOUNT',
    );
    expect(h0.source.currentIndustryLabourCoverage).toMatchObject({
      globalWorldVersion: '0',
      globalEventSequence: '0',
      coveredThroughEventId: null,
      coveredThroughEventFingerprint: null,
      financialPostingCount: '0',
    });
    await admin();
    await db.query('insert into world_v2.financial_posting_batch values($1)', [
      world,
    ]);
    await reader();
    expect((await page()).status).toBe('UNAVAILABLE');
    await admin();
    await db.exec('delete from world_v2.financial_posting_batch');
    await db.exec(
      'update world_v2.world_head set world_version=1,event_sequence=1',
    );
    await db.query(
      'insert into world_v2.authoritative_event values($1,$2,$3,1,1,$4,$5)',
      [
        world,
        'EVENT_TEST',
        coverage.coveredThroughEventFingerprint,
        'TEST_ONLY_PREFIX_SEAM',
        'COMMAND_TEST',
      ],
    );

    await reader();
    expect((await page()).status).toBe('UNAVAILABLE');
    expect((await page(0, 25, h0.source.sourceVersion as string)).status).toBe(
      'STALE',
    );
  });

  it('extracts facility/operator only from actual stored bytes and independently derives publication rows', async () => {
    await publisher();
    await db.query(
      'select world_v2.prepare_postwar_industry_labour_scopes($1)',
      [world],
    );
    await db.query(
      'select world_v2.prepare_postwar_industry_labour_scopes($1)',
      [world],
    );
    await expect(
      db.query(
        'select * from world_v2.publish_postwar_industry_labour_current($1,$2,$3)',
        [world, country, assertion({ rowsHash: hash([]) })],
      ),
    ).rejects.toThrow('CORE_SQL_ROWS_MISMATCH');
    const published = await db.query(
      'select * from world_v2.publish_postwar_industry_labour_current($1,$2,$3)',
      [world, country, assertion()],
    );
    expect(published.rows).toHaveLength(1);
    await reader();
    const p = await page();
    expect(p.status).toBe('PAGE');
    expect(JSON.parse(p.rows_text)).toEqual(rows);
    expect(p.source.currentIndustryLabourCoverage).toMatchObject({
      financialPostingCount: '6',
      globalWorldVersion: '1',
    });
    expect(
      (p.source.sourcePointer as Record<string, unknown>).sourcePayloadHash,
    ).toBe(sourceHash);
  });
  it('denies reader source writes/raw reads and publisher-supplied head/prefix changes', async () => {
    await reader();
    await expect(
      db.query('select * from world_v2.postwar_industry_labour_scope'),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query('select world_v2.prepare_postwar_industry_labour_scopes($1)', [
        world,
      ]),
    ).rejects.toThrow('permission denied');
    await publisher();
    await expect(
      db.query(
        'select * from world_v2.publish_postwar_industry_labour_current($1,$2,$3)',
        [
          world,
          country,
          assertion({
            head: { worldId: world, worldVersion: '2', eventSequence: '2' },
          }),
        ],
      ),
    ).rejects.toThrow('COMPLETE_PREFIX_MISMATCH');
  });
  it('keeps EMPTY/cursor/foreign subject/current head absence distinct and never falls back to H0', async () => {
    await reader();
    const first = await page(),
      version = first.source.sourceVersion as string;
    expect((await page(1, 25, version)).status).toBe('EMPTY');
    expect((await page(0, 25, 'sha256:' + '0'.repeat(64))).status).toBe(
      'STALE',
    );
    await reader('22222222-2222-4222-8222-222222222222');
    expect((await page()).status).toBe('DENIED');
    await admin();
    await db.exec(
      'update world_v2.world_head set world_version=2,event_sequence=2',
    );
    await reader();
    expect((await page()).status).toBe('UNAVAILABLE');
    expect((await page(0, 25, version)).status).toBe('STALE');
    await admin();
    await db.exec(
      'update world_v2.world_head set world_version=1,event_sequence=1',
    );
  });
  it('publishes a genuine empty roster separately from unavailable data', async () => {
    await publisher();
    const a = JSON.parse(assertion({ rowsHash: hash([]) }));
    const r = await db.query(
      'select * from world_v2.publish_postwar_industry_labour_current($1,$2,$3)',
      [world, 'COUNTRY_02', canonicalSerialize(a)],
    );
    expect(r.rows).toHaveLength(1);
    await reader('33333333-3333-4333-8333-333333333333');
    const p = await page();
    expect(p.status).toBe('EMPTY');
    expect(p.page.total).toBe(0);
    expect(p.rows_text).toBe('[]');
  });
  it('revocation makes already derived rows unavailable without rewriting immutable history', async () => {
    await admin();
    await db.query(
      'insert into world_v2.social_operating_source_revocation values($1)',
      ['REGISTRATION_TEST'],
    );
    await reader();
    expect((await page()).status).toBe('UNAVAILABLE');
    await admin();
    await db.exec('delete from world_v2.social_operating_source_revocation');
    await db.query(
      'insert into world_v2.postwar_office_projection_revocation values($1,$2)',
      [world, 'PARENT_TEST'],
    );
    await reader();
    expect((await page()).status).toBe('UNAVAILABLE');
  });
});
