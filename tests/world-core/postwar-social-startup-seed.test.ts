/** Genuine small Core DATA + embedded metadata/ACL. This is not full-E03
 * admission, production authority, a native pass or a prepared source token. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect, vi } from 'vitest';
import * as C from '@econmind/core';
import {
  inspectPostwarSocialStartupSeed,
  readPostwarSocialStartupSeedFrom,
} from '../../apps/world-worker/src/persistence/postwar-social-startup-seed.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function seedFixture(kind: C.OpeningSourceKind = 'DOCUMENTED_ASSUMPTION') {
  const source = C.createOpeningSource(
    {
      schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: C.openingSourceId('SOURCE_STARTUP_METADATA_TEST_ONLY'),
      sourceKind: kind,
      locator: 'tests/world-core/postwar-social-startup-seed.test.ts',
      sourceVersion: 'TEST_ONLY_DATA_NOT_ADMISSION',
      payload: { classification: 'METADATA_TEST_ONLY' },
    },
    sha,
  );
  return C.createOpeningSeed(
    {
      schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
      worldId: C.worldId('WORLD_STARTUP_METADATA_TEST_ONLY'),
      seedId: C.openingSeedId('SEED_STARTUP_METADATA_TEST_ONLY'),
      openingWorldVersion: '0',
      replayBinding: C.CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha,
  );
}
const base = `create schema world_v2;
create role world_v2_social_source_owner nologin nosuperuser nobypassrls;
create role world_v2_social_source_reader nologin nosuperuser nobypassrls;
grant usage on schema world_v2 to world_v2_social_source_owner,world_v2_social_source_reader;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.opening_seed(world_id text,seed_id text,opening_world_version bigint,replay_binding text,canonical_payload text,seed_fingerprint text);
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text);
create table world_v2.social_operating_source_registration(world_id text,country_id text,registration_ref text,source_id text,source_payload_hash text,seed_fingerprint text,admission_ref text);
create table world_v2.social_operating_source_revocation(registration_ref text);
grant select on all tables in schema world_v2 to world_v2_social_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_social_source_owner;
alter table world_v2.social_operating_source_registration owner to world_v2_social_source_owner;
create function world_v2.social_source_admission(w text)returns world_v2.runtime_opening_admission language plpgsql security definer set search_path=pg_catalog as $$declare a world_v2.runtime_opening_admission%rowtype;begin select * into strict a from world_v2.runtime_opening_admission where world_id=w;return a;end;$$;
alter function world_v2.social_source_admission(text)owner to world_v2_social_source_owner;
create function world_v2.lock_social_operating_source(w text,c text)returns world_v2.social_operating_source_registration language plpgsql security definer set search_path=pg_catalog as $$declare r world_v2.social_operating_source_registration%rowtype;begin
 if current_setting('role')<>'world_v2_social_source_reader'then raise exception 'FIXED_READER_REQUIRED'using errcode='42501';end if;
 perform set_config('econmind.social_custody_world',w,true);perform 1 from world_v2.world_head where world_id=w for share;
 select * into strict r from world_v2.social_operating_source_registration where world_id=w and country_id=c for share;
 if exists(select 1 from world_v2.social_operating_source_revocation where registration_ref=r.registration_ref)then raise exception 'SOURCE_REVOKED'using errcode='55000';end if;return r;end;$$;
alter function world_v2.lock_social_operating_source(text,text)owner to world_v2_social_source_owner;`;
describe('explicit controlled Social startup seed', () => {
  it('requires a genuine immutable Core instance and computes the stored-intent SHA without trusting caller hashes', async () => {
    const seed = seedFixture(),
      { fingerprint, ...intent } = seed;
    expect(inspectPostwarSocialStartupSeed(seed).canonicalSeedSha256).toBe(
      sha(C.canonicalSerialize(intent)),
    );
    expect(fingerprint).toBe(
      'sha256:' + sha('SHA-256\n' + C.canonicalSerialize(intent)),
    );
    expect(() => inspectPostwarSocialStartupSeed({ ...seed })).toThrow(
      'genuine',
    );
    expect(() =>
      inspectPostwarSocialStartupSeed(seedFixture('TEST_FIXTURE')),
    ).toThrow('server opening provenance');
    const query = vi.fn();
    await expect(
      readPostwarSocialStartupSeedFrom({
        executor: { query },
        seed: { ...seed },
        worldId: seed.worldId,
        countryId: 'COUNTRY_01',
        seedRef: seed.seedId,
        seedFingerprint: seed.fingerprint,
        admissionRef: 'ADMISSION_TEST_ONLY',
        modelVersion: seed.replayBinding.modelVersion,
        registration: {},
      }),
    ).rejects.toThrow('genuine');
    expect(query).not.toHaveBeenCalled();
  });
  it('executes only the fixed metadata helper while the reader has no raw SELECT and rejects changed raw bytes or registered pins', async () => {
    const db = new PGlite(),
      seed = seedFixture(),
      { fingerprint, ...intent } = seed,
      source = seed.sources[0]!,
      raw = C.canonicalSerialize(intent),
      admission = 'ADMISSION_STARTUP_TEST_ONLY';
    const registration = {
      registration_ref: 'REG_STARTUP_TEST_ONLY',
      source_id: source.sourceId,
      source_payload_hash: source.payloadHash,
    };
    const statements: string[] = [];
    const executor: SqlExecutor = {
      query: async <Row extends object>(sql, parameters = []) => {
        statements.push(sql);
        const r = await db.query<Row>(sql, [...parameters]);
        return { rows: r.rows, rowCount: r.rows.length };
      },
    };
    const read = async (
      extra: Partial<
        Parameters<typeof readPostwarSocialStartupSeedFrom>[0]
      > = {},
    ) => {
      await db.exec('begin;set local role world_v2_social_source_reader');
      try {
        return await readPostwarSocialStartupSeedFrom({
          executor,
          seed,
          worldId: seed.worldId,
          countryId: 'COUNTRY_01',
          seedRef: seed.seedId,
          seedFingerprint: seed.fingerprint,
          admissionRef: admission,
          modelVersion: seed.replayBinding.modelVersion,
          registration,
          ...extra,
        });
      } finally {
        await db.exec('rollback');
      }
    };
    try {
      await db.exec(base);
      await db.exec(
        await readFile(
          new URL(
            '../../database/proposals/postwar-social-startup-seed-header.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await db.query('insert into world_v2.world_head values($1,3,5)', [
        seed.worldId,
      ]);
      await db.query(
        'insert into world_v2.opening_seed values($1,$2,0,$3,$4,$5)',
        [
          seed.worldId,
          seed.seedId,
          C.canonicalSerialize(seed.replayBinding),
          raw,
          fingerprint,
        ],
      );
      await db.query(
        'insert into world_v2.runtime_opening_admission values($1,$2,$3,$4,$5,$6)',
        [
          seed.worldId,
          seed.seedId,
          fingerprint,
          C.canonicalSerialize(seed.replayBinding),
          seed.replayBinding.modelVersion,
          admission,
        ],
      );
      await db.query(
        "insert into world_v2.social_operating_source_registration values($1,'COUNTRY_01',$2,$3,$4,$5,$6)",
        [
          seed.worldId,
          registration.registration_ref,
          source.sourceId,
          source.payloadHash,
          fingerprint,
          admission,
        ],
      );
      const privileges = await db.query<{ raw: boolean }>(
        "select has_column_privilege('world_v2_social_source_reader','world_v2.opening_seed','canonical_payload','SELECT')as raw",
      );
      expect(privileges.rows[0]!.raw).toBe(false);
      expect(await read()).toBe(seed);
      expect(statements).toEqual([
        'select * from world_v2.lock_social_startup_seed_header($1,$2)',
      ]);
      await expect(
        read({
          registration: {
            ...registration,
            source_payload_hash: 'sha256:' + 'f'.repeat(64),
          },
        }),
      ).rejects.toThrow('locked stored raw SHA/header/registration');
      await expect(read({ seedRef: 'SEED_OTHER' })).rejects.toThrow(
        'configured immutable pins',
      );
      await db.query('update world_v2.opening_seed set canonical_payload=$1', [
        raw + ' ',
      ]);
      await expect(read()).rejects.toThrow(
        'locked stored raw SHA/header/registration',
      );
      await db.query('update world_v2.opening_seed set canonical_payload=$1', [
        raw,
      ]);
      await db.query(
        'insert into world_v2.social_operating_source_revocation values($1)',
        [registration.registration_ref],
      );
      await expect(read()).rejects.toThrow('SOURCE_REVOKED');
      expect(statements.every((s) => !s.includes('canonical_payload'))).toBe(
        true,
      );
    } finally {
      await db.close();
    }
  });
});
