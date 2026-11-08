/** SQL DATA/ACL mechanism only. The small TEST_ONLY admission and fence seams
 * do not replace genuine Core replay or native concurrency acceptance. */
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { canonicalSerialize } from '@econmind/core';

const world = 'WORLD_REGIONAL_REPAIR_TEST_ONLY';
const country = 'COUNTRY_02';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
let db: PGlite;
let fingerprint: string;
let rawHash: string;
let sourceHash: string;
const regions = [{ id: 'RAW_REGION', initial: { freshwater: '17' } }];
const mapping = {
  mappings: [
    {
      sourceRegionId: 'RAW_REGION',
      normalizedRegionId: 'REGION_TEST',
      coreCountryId: country,
    },
  ],
};
const expected = [
  {
    countryId: country,
    locationId: 'REGION_TEST',
    sourceRegionId: 'RAW_REGION',
    sourceInitial: regions[0]!.initial,
    sourceStatus: 'PINNED_SOURCE_CAPACITY_NOT_CURRENT_DELIVERY',
  },
];
async function admin() {
  await db.exec('reset role;set session authorization postgres');
}
async function publisher() {
  await admin();
  await db.exec(
    'set session authorization repair_test_publisher;set role world_v2_postwar_projection_publisher',
  );
}
async function repair(w = world, c = country) {
  return db.query<{
    document_ref: string;
    total_rows: number;
    world_version: number;
  }>(
    'select * from world_v2.repair_postwar_industry_regional_source_capacity($1,$2)',
    [w, c],
  );
}
async function rejected(w: string, c: string, code: string, message?: string) {
  await publisher();
  await db.exec('begin isolation level repeatable read');
  try {
    await expect(repair(w, c)).rejects.toMatchObject({
      code,
      ...(message ? { message } : {}),
    });
  } finally {
    await db.exec('rollback');
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create schema world_v2;
create role world_v2_postwar_projection_owner nologin nosuperuser nobypassrls;
create role world_v2_postwar_projection_publisher nologin nosuperuser nobypassrls;
create role world_v2_postwar_projection_reader nologin nosuperuser nobypassrls;
create role world_v2_social_source_owner nologin nosuperuser nobypassrls;
create role repair_test_publisher login noinherit nosuperuser nobypassrls;
grant world_v2_postwar_projection_publisher to repair_test_publisher;
grant usage on schema world_v2 to world_v2_postwar_projection_owner,world_v2_postwar_projection_publisher,world_v2_postwar_projection_reader,world_v2_social_source_owner;
create table world_v2.opening_seed(world_id text,seed_id text primary key,seed_fingerprint text,canonical_payload text,replay_binding text,unique(world_id,seed_fingerprint));
create table world_v2.runtime_opening_admission(admission_ref text primary key,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,source_bundle_sha256 text,active boolean);
create table world_v2.world_head(world_id text,world_version bigint,event_sequence bigint);
create table world_v2.postwar_social_prefix_scope(world_id text,country_id text,seed_fingerprint text,admission_ref text,canonical_seed_sha256 text,source_id text,source_payload_hash text,scope_document text,scope_sha256 text);
create table world_v2.social_operating_source_registration(world_id text,country_id text,seed_fingerprint text,admission_ref text,source_id text,source_payload_hash text,registration_ref text);
create table world_v2.social_operating_source_revocation(registration_ref text);
create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE';end;$$;
create function world_v2.lock_postwar_source_revocation_fences(w text)returns void language plpgsql as $$begin if w<>'${world}'then raise exception 'TEST_ONLY_FENCE_UNKNOWN_WORLD'using errcode='55000';end if;end;$$;
create function world_v2.postwar_projection_admission_header(w text)returns table(admission_ref text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,source_bundle_sha256 text)language sql security definer set search_path=pg_catalog as $$select a.admission_ref,a.seed_id,a.seed_fingerprint,a.model_version,a.replay_binding,a.source_bundle_sha256 from world_v2.runtime_opening_admission a where a.world_id=w and a.active$$;
alter function world_v2.postwar_projection_admission_header(text)owner to world_v2_postwar_projection_owner;
grant select on world_v2.opening_seed,world_v2.runtime_opening_admission,world_v2.world_head,world_v2.postwar_social_prefix_scope to world_v2_postwar_projection_owner;
grant update(world_version)on world_v2.world_head to world_v2_postwar_projection_owner;
grant update(world_id)on world_v2.postwar_social_prefix_scope to world_v2_postwar_projection_owner;
grant select on world_v2.social_operating_source_registration,world_v2.social_operating_source_revocation to world_v2_social_source_owner;
alter table world_v2.opening_seed enable row level security;alter table world_v2.opening_seed force row level security;
create policy test_exact_seed_world on world_v2.opening_seed to world_v2_postwar_projection_owner using(world_id=current_setting('econmind.postwar_projection_world',true));`);
  const official = await readFile(
    new URL(
      '../../database/proposals/postwar-office-derived-read.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const storageStart = official.indexOf(
    'create table world_v2.postwar_office_projection_document(',
  );
  const storageEnd = official.indexOf('grant select on world_v2.world_head');
  await db.exec(official.slice(storageStart, storageEnd));
  const next = await readFile(
    new URL(
      '../../database/proposals/postwar-industry-labour-current-read.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const currentStart = next.indexOf(
    'create function world_v2.postwar_industry_labour_source_current(',
  );
  const currentEnd = next.indexOf(
    'revoke create on schema world_v2 from world_v2_social_source_owner;',
  );
  await db.exec(
    'grant create on schema world_v2 to world_v2_social_source_owner,world_v2_postwar_projection_owner;' +
      next.slice(currentStart, currentEnd),
  );
  const repairStart = next.indexOf(
    'create function world_v2.repair_postwar_industry_regional_source_capacity(',
  );
  const repairEnd = next.indexOf(
    'alter function world_v2.prepare_postwar_industry_labour_scopes',
  );
  await db.exec(next.slice(repairStart, repairEnd));
  await db.exec(
    'revoke create on schema world_v2 from world_v2_social_source_owner,world_v2_postwar_projection_owner',
  );
  const payload = canonicalSerialize({
    schemaVersion: 'postwar-operating-genesis-seed-source-v1',
    carrier: {
      socialEmployment: { countries: [{ countryId: country }] },
      selectedSource: {
        regionsBytes: canonicalSerialize(regions),
        regionMappingBytes: canonicalSerialize(mapping),
      },
    },
  });
  sourceHash = 'sha256:' + sha('SHA-256\n' + '{"payload":' + payload + '}');
  const seed = canonicalSerialize({
    worldId: world,
    seedId: 'SEED_TEST',
    replayBinding: { test: 'REPLAY' },
    sources: [
      {
        sourceId: 'SOURCE_TEST',
        sourceVersion: 'TEST_ONLY_V1',
        payloadHash: sourceHash,
        canonicalPayload: payload,
      },
    ],
  });
  fingerprint = 'sha256:' + sha('SHA-256\n' + seed);
  rawHash = sha(seed);
  await db.query('insert into world_v2.opening_seed values($1,$2,$3,$4,$5)', [
    world,
    'SEED_TEST',
    fingerprint,
    seed,
    '{"test":"REPLAY"}',
  ]);
  await db.query(
    'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6,$7,true)',
    [
      'ADMISSION_TEST',
      world,
      'SEED_TEST',
      fingerprint,
      'MODEL_TEST',
      '{"test":"REPLAY"}',
      'a'.repeat(64),
    ],
  );
  await db.query('insert into world_v2.world_head values($1,3,3)', [world]);
  await db.query(
    'insert into world_v2.postwar_social_prefix_scope values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [
      world,
      country,
      fingerprint,
      'ADMISSION_TEST',
      rawHash,
      'SOURCE_TEST',
      sourceHash,
      '{}',
      sha('{}'),
    ],
  );
  await db.query(
    'insert into world_v2.social_operating_source_registration values($1,$2,$3,$4,$5,$6,$7)',
    [
      world,
      country,
      fingerprint,
      'ADMISSION_TEST',
      'SOURCE_TEST',
      sourceHash,
      'REGISTRATION_TEST',
    ],
  );
});
afterAll(async () => {
  await db?.close();
});
it('derives only exact original regional rows at H3, with origin0 pins and transactional rollback', async () => {
  await publisher();
  await db.exec('begin isolation level repeatable read');
  const result = (await repair()).rows[0]!;
  expect(result).toMatchObject({
    total_rows: 1,
    world_version: 0,
    seed_fingerprint: fingerprint,
    canonical_seed_sha256: rawHash,
    source_payload_hash: sourceHash,
  });
  await db.exec('rollback');
  await admin();
  expect(
    (
      await db.query(
        'select count(*)::int n from world_v2.postwar_office_projection_document',
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
  await publisher();
  await db.exec('begin isolation level repeatable read');
  await repair();
  await db.exec('commit');
  await admin();
  const page = (
    await db.query<{ rows_text: string }>(
      'select rows_text from world_v2.postwar_office_projection_page',
    )
  ).rows[0]!;
  expect(JSON.parse(page.rows_text)).toEqual(expected);
  expect(
    (
      await db.query(
        'select world_version::text,event_sequence::text from world_v2.world_head',
      )
    ).rows,
  ).toEqual([{ world_version: '3', event_sequence: '3' }]);
});
it('rejects duplicates, missing countries/world, wrong isolation and actual reader/raw access', async () => {
  await rejected(
    world,
    country,
    '55000',
    'INDUSTRY_REGIONAL_REPAIR_ALREADY_EXISTS',
  );
  await rejected(world, 'COUNTRY_01', 'P0002');
  await rejected(
    'WORLD_OTHER',
    country,
    '55000',
    'TEST_ONLY_FENCE_UNKNOWN_WORLD',
  );
  await publisher();
  await expect(repair()).rejects.toMatchObject({ code: '25001' });
  await admin();
  await db.exec('set role world_v2_postwar_projection_reader');
  await expect(repair()).rejects.toMatchObject({ code: '42501' });
  await expect(
    db.query('select canonical_payload from world_v2.opening_seed'),
  ).rejects.toMatchObject({ code: '42501' });
});
it('keeps revoked parent/source/admission closed without changing the existing derived document', async () => {
  await admin();
  const ref = (
    await db.query<{ document_ref: string }>(
      'select document_ref from world_v2.postwar_office_projection_document',
    )
  ).rows[0]!.document_ref;
  await db.query(
    'insert into world_v2.postwar_office_projection_revocation values($1,$2,$3)',
    [ref, world, 'TEST_REVOKE'],
  );
  await rejected(
    world,
    country,
    '55000',
    'INDUSTRY_REGIONAL_REPAIR_PARENT_REVOKED',
  );
  await admin();
  await db.query(
    'insert into world_v2.social_operating_source_revocation values($1)',
    ['REGISTRATION_TEST'],
  );
  await rejected(world, country, '55000', 'INDUSTRY_REGIONAL_ORIGINAL_REVOKED');
  await admin();
  await db.exec('update world_v2.runtime_opening_admission set active=false');
  await rejected(world, country, 'P0002');
  await admin();
  expect(
    (
      await db.query(
        'select count(*)::int n from world_v2.postwar_office_projection_document',
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
});
