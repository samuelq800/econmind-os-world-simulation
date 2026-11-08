/** Actual pinned 21-site DATA + candidate SQL over explicit TEST_ONLY admission
 * metadata and a tiny Core-created seed. No official E03, current jobs, wages,
 * utility delivery, native host or production execution is certified here. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { PGlite } from '@electric-sql/pglite';
import * as C from '@econmind/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { readPostwarIndustryRefineryCoverage } from '../../apps/world-worker/src/persistence/postwar-industry-refinery-sites.js';
import { loadPostwarSourceContext } from '../../apps/world-worker/src/preparation/postwar-source-context.js';
import {
  readPostwarIndustryUtilityRegisteredPacket,
  derivePostwarIndustryUtilityCompactSourceData,
  derivePostwarIndustryUtilityCompactSourceDataSet,
} from '../../apps/world-worker/src/persistence/postwar-industry-utility-source.js';
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../' + p, import.meta.url), 'utf8');
let context: Awaited<ReturnType<typeof loadPostwarSourceContext>>,
  utilityPolicyBytes: string,
  adoption: string,
  firstPolicy: string,
  firstAdoption: string;
const world = 'WORLD_TEST_ONLY_REFINERY_UTILITY',
  seedRef = 'SEED_TEST_ONLY_REFINERY_UTILITY',
  contentHash = 'sha256:' + '1'.repeat(64),
  admissionRef = 'ADMISSION_' + '2'.repeat(64),
  openingGregorianTimestamp = '2026-11-01T00:00:00.000Z';
beforeAll(async () => {
  context = await loadPostwarSourceContext(process.cwd());
  utilityPolicyBytes = await read('config/postwar-genesis/utilities.v1.json');
  adoption = await read(
    'docs/reports/office-connection/INDUSTRY_UTILITIES_ADOPTION_20261101.json',
  );
  firstPolicy = await read('config/postwar-genesis/industry-first-day.v1.json');
  firstAdoption = await read(
    'docs/governance/owner-inputs/2026-11-01/INDUSTRY_FIRST_DAY_USER_ADOPTION.original.json',
  );
});
const sourceInput = () => ({
  sourceContext: context,
  utilityPolicyBytes,
  openingGregorianTimestamp,
  pins: { worldId: world, seedRef, contentHash, admissionRef },
});
describe('country-scoped actual refinery utility originals', () => {
  it('derives exactly 21 own-country sources and 49 N/A with no executed facts', () => {
    const data =
      derivePostwarIndustryUtilityCompactSourceDataSet(sourceInput());
    expect(data.sites).toHaveLength(21);
    expect(data.notApplicableCountries).toHaveLength(49);
    for (const d of data.sites) {
      const c = d.compact;
      expect(c.power.countryId).toBe(c.countryId);
      expect(c.power.operatorId).toBe(c.operatorId);
      expect(c.power.storageId).toBe('POWER-' + c.countryId.slice(-2) + '-13');
      expect(c.water.sourceRegionId).toContain(d.sourceCountryId);
      expect(c.power.protectedReservations).toHaveLength(1);
      expect(c.power.originalEfficiency).toBe('0.9');
    }
    const a = data.sites.find(
        (x) => x.compact.countryId === 'COUNTRY_02',
      )!.compact,
      b = data.sites.find((x) => x.compact.countryId === 'COUNTRY_10')!.compact;
    expect(a.power.originalOpeningSocMWh).toBe('3306797.965009');
    expect(b.power.originalOpeningSocMWh).toBe('5251585.122598');
    expect(a.water.rawQuotaPerDay).toBe('4221.590388');
    expect(b.water.rawQuotaPerDay).toBe('56580.294358615174');
    expect(b.operatorId).toBe('ENTITY_OPERATOR_10');
    expect(() =>
      derivePostwarIndustryUtilityCompactSourceData({
        ...sourceInput(),
        site: { countryId: 'COUNTRY_01', facilityId: 'OPEN-01-REFINED_FUEL' },
      }),
    ).toThrow('NOT_APPLICABLE');
    expect(() =>
      derivePostwarIndustryUtilityCompactSourceData({
        ...sourceInput(),
        site: { countryId: 'COUNTRY_10', facilityId: 'OPEN-02-REFINED_FUEL' },
      }),
    ).toThrow('EXACT_COUNTRY_FACILITY');
  });
  it('publishes two actual different sites, denies substitution/roles/head, preserves history after revoke and rereads persistence', async () => {
    const db = new PGlite();
    try {
      await db.exec(`create schema world_v2;
create role world_v2_industry_source_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
create role world_v2_industry_source_publisher nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
create role world_v2_industry_source_reader nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
grant usage on schema world_v2 to world_v2_industry_source_owner,world_v2_industry_source_publisher,world_v2_industry_source_reader;
create table world_v2.world_head(world_id text primary key,world_version bigint,event_sequence bigint);
create table world_v2.opening_seed(world_id text primary key,seed_fingerprint text,canonical_payload text);
create table world_v2.runtime_opening_admission(world_id text,seed_id text,seed_fingerprint text,replay_binding text,model_version text,admission_ref text,admitted_at_real timestamptz);
create table world_v2.runtime_admission_publication_permit(authorization_id text primary key,authorization_sha256 text,world_id text,seed_id text,seed_fingerprint text,model_version text,replay_binding text,valid_from timestamptz,valid_until timestamptz);
create table world_v2.runtime_admission_publication_revocation(authorization_id text);
create table world_v2.postwar_industry_original(world_id text,country_id text,facility_id text,registration_ref text,seed_fingerprint text,admission_ref text,document_text text,document_sha256 text,checksums_sha256 text,operating_source_id text,operating_source_hash text,unique(world_id,registration_ref));
create table world_v2.postwar_industry_original_revocation(world_id text,registration_ref text);
create table world_v2.command_submission(world_id text,command_id text,command_type text,country_id text,office_id text,canonical_payload text,command_fingerprint text,primary key(world_id,command_id));
create table world_v2.command_receipt(world_id text,command_id text,outcome text,world_version_after bigint,event_ids jsonb);
create table world_v2.world_writer_lease(world_id text,holder_id text,acquired_at_real timestamptz,renewed_at_real timestamptz,lease_expires_at_real timestamptz,fencing_token bigint);
create table world_v2.authoritative_event(world_id text,event_id text,event_type text,causation_command_id text,world_version bigint,event_sequence bigint,sim_time numeric,canonical_payload text,event_fingerprint text);
create function world_v2.reject_authoritative_history_mutation()returns trigger language plpgsql as $$begin raise exception 'IMMUTABLE_HISTORY';end;$$;
grant select on world_v2.world_head,world_v2.opening_seed,world_v2.runtime_opening_admission,world_v2.runtime_admission_publication_permit,world_v2.runtime_admission_publication_revocation,world_v2.postwar_industry_original,world_v2.postwar_industry_original_revocation to world_v2_industry_source_owner;
grant update(world_version)on world_v2.world_head to world_v2_industry_source_owner;
grant update(seed_id)on world_v2.runtime_opening_admission to world_v2_industry_source_owner;
grant update(authorization_id)on world_v2.runtime_admission_publication_permit to world_v2_industry_source_owner;
grant update(registration_ref)on world_v2.postwar_industry_original to world_v2_industry_source_owner;`);
      const original = await read(
          'database/proposals/postwar-industry-production-source.sql',
        ),
        start = original.indexOf(
          'create function world_v2.industry_source_admission(',
        ),
        end = original.indexOf(
          'create function world_v2.register_postwar_industry_originals(',
        );
      await db.exec(
        'grant create on schema world_v2 to world_v2_industry_source_owner;' +
          original.slice(start, end),
      );
      await db.exec(
        await read('database/proposals/postwar-industry-first-day-source.sql'),
      );
      await db.exec(
        await read('database/proposals/postwar-industry-utility-custody.sql'),
      );
      await db.exec(
        await read('database/proposals/postwar-source-revocation-fence.sql'),
      );
      const coverage = readPostwarIndustryRefineryCoverage(context),
        rawFacilities = JSON.parse(
          context.sourceBytes.datasets['data/facilities.json']!,
          (_k: string, v: unknown, c?: { source?: string }) =>
            typeof v === 'number' ? c?.source : v,
        ) as Record<string, unknown>[];
      // Actual original staffing quantities, but TEST_ONLY person ranges; no
      // official E03/current-employment or performed-service claim is made.
      const sourcePositions = coverage.sites
        .filter((s) => ['COUNTRY_02', 'COUNTRY_10'].includes(s.countryId))
        .flatMap((site) => {
          const storage = rawFacilities.find(
              (f) =>
                f.countryId === site.sourceFacility.countryId &&
                f.projectId === 'PROJECT-13' &&
                f.constructionStatusProposal === 'OPENING_EXISTING_ASSET',
            )!,
            skills = storage.labourBySkill as Record<string, string>;
          return ['LOW', 'MEDIUM', 'HIGH'].map((skill) => ({
            positionId:
              'POSTWAR_SOURCE_' +
              sha(String(storage.id) + '/' + skill).toUpperCase(),
            countryId: site.countryId,
            locationId: site.locationId,
            employerId: site.operatorId,
            employerRole: 'OP',
            sourceBucket: 'POWER',
            sourceObjectId: String(storage.id),
            skill,
            filledCount: skills[skill.toLowerCase()]!,
            personRange: {
              poolId: 'TEST_ONLY_POOL_' + site.countryId + '_' + skill,
              startOrdinal: '0',
              count: skills[skill.toLowerCase()]!,
            },
          }));
        });
      const journal = await read(
          'database/migrations/artifacts/0009_world_v2_posting_payload_integrity.sql',
        ),
        canonicalEnd = journal.indexOf('create or replace function', 10);
      if (canonicalEnd < 0) throw Error('CANONICAL_HELPER_NOT_FOUND');
      await db.exec(journal.slice(0, canonicalEnd));
      await db.exec(
        await read(
          'database/proposals/postwar-industry-power-service-source.sql',
        ),
      );
      const receipt = C.canonicalSerialize({ openingGregorianTimestamp }),
        op = C.createOpeningSource(
          {
            schemaVersion: C.OPENING_SOURCE_SCHEMA_VERSION,
            sourceId: C.openingSourceId('SOURCE_TEST_ONLY_UTILITY'),
            sourceKind: 'TEST_FIXTURE',
            sourceVersion: 'TEST_ONLY_V1',
            locator: 'TEST_ONLY_NO_OFFICIAL_E03',
            payload: {
              schemaVersion: 'postwar-operating-genesis-seed-source-v1',
              carrier: {
                socialEmployment: {
                  schemaVersion: 'postwar-social-employment-state-v1',
                  inputs: { worldId: world, seedId: seedRef, sourcePositions },
                },
                physicalServiceReceiptDocumentId: 'DOC_TEST_ONLY_PHYSICAL',
                documents: [
                  {
                    documentId: 'DOC_TEST_ONLY_PHYSICAL',
                    bytes: receipt,
                    sha256: sha(receipt),
                  },
                ],
              },
            },
          },
          sha,
        ),
        seed = C.createOpeningSeed(
          {
            schemaVersion: C.OPENING_SEED_SCHEMA_VERSION,
            worldId: C.worldId(world),
            seedId: C.openingSeedId(seedRef),
            openingWorldVersion: '0',
            replayBinding: C.CURRENT_REPLAY_BINDING,
            sources: [op],
            inventoryEntries: [],
            financialBatches: [],
          },
          sha,
        );
      await db.query('insert into world_v2.world_head values($1,0,0)', [world]);
      await db.query('insert into world_v2.opening_seed values($1,$2,$3)', [
        world,
        seed.fingerprint,
        C.canonicalSerialize(seed),
      ]);
      await db.query(
        "insert into world_v2.runtime_opening_admission values($1,$2,$3,'TEST_ONLY_REPLAY','TEST_ONLY_MODEL',$4,'2026-11-01Z')",
        [world, seedRef, seed.fingerprint, admissionRef],
      );
      await db.query(
        "insert into world_v2.runtime_admission_publication_permit values('PERMIT_TEST_ONLY_UTILITY',$1,$2,$3,$4,'TEST_ONLY_MODEL','TEST_ONLY_REPLAY','2026-01-01Z','2027-01-01Z')",
        ['2'.repeat(64), world, seedRef, seed.fingerprint],
      );
      const run = async <T>(role: string, fn: () => Promise<T>) => {
        await db.exec(
          'set session authorization ' +
            role +
            ';begin isolation level repeatable read;set local role ' +
            role,
        );
        try {
          const r = await fn();
          await db.exec('commit');
          return r;
        } catch (e) {
          await db.exec('rollback');
          throw e;
        } finally {
          await db.exec('set session authorization postgres;reset role');
        }
      };
      const data = derivePostwarIndustryUtilityCompactSourceDataSet({
          ...sourceInput(),
          pins: {
            worldId: world,
            seedRef,
            contentHash: seed.fingerprint,
            admissionRef,
          },
        }),
        selected = data.sites.filter((x) =>
          ['COUNTRY_02', 'COUNTRY_10'].includes(x.compact.countryId),
        ),
        rawdata = context.sourceBytes.datasets;
      const facilities = JSON.parse(
          rawdata['data/facilities.json']!,
          (_k: string, v: unknown, c?: { source?: string }) =>
            typeof v === 'number' ? c?.source : v,
        ) as Record<string, unknown>[],
        recipes = JSON.parse(
          rawdata['data/recipes.json']!,
          (_k: string, v: unknown, c?: { source?: string }) =>
            typeof v === 'number' ? c?.source : v,
        ) as Record<string, unknown>[];
      for (const d of selected) {
        const c = d.compact,
          facility = facilities.find((f) => f.id === c.facilityId)!,
          recipe = recipes.find((r) => r.id === facility.recipeId)!,
          body = C.canonicalSerialize({
            worldId: world,
            countryId: c.countryId,
            locationId: c.locationId,
            operatorId: c.operatorId,
            sourceFacility: facility,
            recipe,
            technologyProposals: [],
            licenseProposals: [],
            commodityCatalog: [],
          }),
          reg = 'TEST_ONLY_REG_' + c.countryId;
        await db.query(
          'insert into world_v2.postwar_industry_original values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [
            world,
            c.countryId,
            c.facilityId,
            reg,
            seed.fingerprint,
            admissionRef,
            body,
            sha(body),
            sha(context.sourceBytes.checksumsBytes),
            op.sourceId,
            op.payloadHash,
          ],
        );
        await run('world_v2_industry_source_publisher', () =>
          db.query(
            'select * from world_v2.publish_postwar_industry_first_day_source($1,$2,$3,$4,$5,$6,$7)',
            [
              world,
              c.countryId,
              c.facilityId,
              firstPolicy,
              firstAdoption,
              context.sourceBytes.checksumsBytes,
              rawdata['data/domestic-access.json']!,
            ],
          ),
        );
      }
      const pub = (
        d: (typeof selected)[number],
        override: unknown = d.compact,
      ) =>
        run('world_v2_industry_source_publisher', () =>
          db.query(
            'select * from world_v2.publish_postwar_industry_utility_source($1,$2,$3::jsonb,$4)',
            [
              world,
              C.canonicalSerialize(override),
              JSON.stringify(d.raw),
              adoption,
            ],
          ),
        );
      const get = (d: (typeof selected)[number], version = '0') =>
        run('world_v2_industry_source_reader', () =>
          db.query<{ source_text: string; source_sha256: string }>(
            'select * from world_v2.read_postwar_industry_utility_source($1,$2,$3,$4::bigint,0)',
            [world, d.compact.countryId, d.compact.facilityId, version],
          ),
        );
      for (const d of selected) {
        const first = await pub(d);
        expect(await pub(d)).toEqual(first);
        const r = await get(d);
        expect(r.rows[0]!.source_text).toBe(C.canonicalSerialize(d.compact));
        expect(r.rows[0]!.source_sha256).toBe(sha(r.rows[0]!.source_text));
      }
      const a = selected[0]!,
        b = selected[1]!;
      expect(a.compact.power.originalOpeningSocMWh).not.toBe(
        b.compact.power.originalOpeningSocMWh,
      );
      await expect(
        pub(b, { ...b.compact, power: a.compact.power }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        pub(b, { ...b.compact, worldId: 'WORLD_WRONG' }),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(get(b, '1')).rejects.toMatchObject({ code: '55000' });
      await expect(
        run('world_v2_industry_source_reader', () =>
          db.query('select * from world_v2.opening_seed'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run('world_v2_industry_source_reader', () =>
          db.query('select * from world_v2.postwar_industry_utility_source'),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        run('world_v2_industry_source_publisher', () =>
          db.query(
            'select * from world_v2.read_postwar_industry_utility_source($1,$2,$3,0,0)',
            [world, b.compact.countryId, b.compact.facilityId],
          ),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      for (const d of selected) {
        const expected = sourcePositions.filter(
            (p) => p.countryId === d.compact.countryId,
          ),
          raw = C.canonicalSerialize(expected),
          publishService = () =>
            run('world_v2_industry_source_publisher', () =>
              db.query<{ source_ref: string; source_sha256: string }>(
                'select * from world_v2.publish_postwar_industry_power_service_source($1,$2)',
                [world, raw],
              ),
            );
        const first = await publishService();
        expect(await publishService()).toEqual(first);
        expect(first.rows[0]!.source_sha256).toBe(sha(raw));
        const service = await run('world_v2_industry_source_reader', () =>
          db.query<{ source_text: string }>(
            'select * from world_v2.read_postwar_industry_first_day_source($1,$2,$3,0,0)',
            [world, d.compact.countryId, d.compact.power.storageId],
          ),
        );
        expect(service.rows[0]!.source_text).toBe(raw);
      }
      const substituted = C.canonicalSerialize([
        sourcePositions[0]!,
        ...sourcePositions.slice(4),
      ]);
      await expect(
        run('world_v2_industry_source_publisher', () =>
          db.query(
            'select * from world_v2.publish_postwar_industry_power_service_source($1,$2)',
            [world, substituted],
          ),
        ),
      ).rejects.toThrow('ACTUAL_E03_BYTES_DIFFER');
      await db.exec(
        'create role test_utility_packet_worker nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant world_v2_industry_source_reader to test_utility_packet_worker;grant usage on schema world_v2 to test_utility_packet_worker;grant select on world_v2.world_head to test_utility_packet_worker',
      );
      let released = 0;
      const database = new PostgresSqlDatabase({
        connect: async () => {
          await db.exec('set session authorization test_utility_packet_worker');
          return {
            query: async (q: string, params: unknown[] = []) => {
              const r = await db.query(q, params);
              return {
                rows: r.rows,
                rowCount: r.affectedRows ?? r.rows.length,
              };
            },
            release: () => {
              released++;
            },
          };
        },
      } as unknown as Pool);
      const packet = (countryId: string, facilityId: string) =>
        readPostwarIndustryUtilityRegisteredPacket({
          database,
          workerRole: 'test_utility_packet_worker',
          worldId: world,
          countryId,
          facilityId,
        });
      expect(
        (await packet(a.compact.countryId, a.compact.facilityId)).source
          ?.source_text,
      ).toBe(C.canonicalSerialize(a.compact));
      // A real 0-row function result succeeds through the real transaction
      // adapter; another registered country's next read remains available.
      expect(
        (await packet('COUNTRY_01', 'OPEN-01-REFINED_FUEL')).source,
      ).toBeUndefined();
      expect(
        (await packet(b.compact.countryId, b.compact.facilityId)).source
          ?.source_text,
      ).toBe(C.canonicalSerialize(b.compact));
      expect(released).toBe(3);
      await db.exec('set session authorization postgres;reset role');
      // New executor/session reads immutable persisted data, no in-memory token recovery.
      expect((await get(b)).rows[0]!.source_text).toBe(
        C.canonicalSerialize(b.compact),
      );
      await db.query(
        'insert into world_v2.postwar_industry_original_revocation values($1,$2)',
        [world, 'TEST_ONLY_REG_' + b.compact.countryId],
      );
      await expect(get(b)).rejects.toMatchObject({ code: '55000' });
      expect((await get(a)).rows).toHaveLength(1);
      const history = await run('world_v2_industry_source_reader', () =>
        db.query(
          'select * from world_v2.read_postwar_industry_utility_history_source($1,$2,$3,0,0)',
          [world, b.compact.countryId, b.compact.facilityId],
        ),
      );
      expect(history.rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
  it('does not translate SQL, role-restore or unknown-COMMIT adapter failures into a missing registry', async () => {
    for (const mode of ['sql', 'restore', 'commit'] as const) {
      const error = Object.assign(new Error('TEST_ONLY_' + mode), {
          code: mode === 'sql' ? '42501' : 'TEST_ONLY_FAILURE',
        }),
        statements: string[] = [];
      const database = new PostgresSqlDatabase({
        connect: async () => ({
          query: async (q: string) => {
            statements.push(q);
            if (
              (mode === 'sql' &&
                q.includes('read_postwar_industry_utility_history_source')) ||
              (mode === 'restore' &&
                q === 'set local role "test_utility_packet_worker"') ||
              (mode === 'commit' && q === 'commit')
            )
              throw error;
            return {
              rowCount: q.includes('select world_version') ? 1 : 0,
              rows: q.includes('select world_version')
                ? [{ world_version: '0', event_sequence: '0' }]
                : [],
            };
          },
          release: () => undefined,
        }),
      } as unknown as Pool);
      await expect(
        readPostwarIndustryUtilityRegisteredPacket({
          database,
          workerRole: 'test_utility_packet_worker',
          worldId: world,
          countryId: 'COUNTRY_01',
          facilityId: 'OPEN-01-REFINED_FUEL',
        }),
      ).rejects.toMatchObject({
        name: PostgresTransactionError.name,
        outcome: mode === 'commit' ? 'COMMIT_OUTCOME_UNKNOWN' : 'ROLLED_BACK',
        cause: error,
      });
      expect(statements).toContain(
        'set local role "test_utility_packet_worker"',
      );
    }
  });
});
