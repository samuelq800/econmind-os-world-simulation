/** TEST_ONLY tiny genuine admitted SQL source. Proves deterministic WATER
 * publication and restricted readback, not actual70-country execution or paid service.
 * Whole schema installation/guard checks have separate native evidence. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createIndustryRunParametersSqlFixture } from '../support/postwar-industry-run-parameters-fixture.js';
import { derivePostwarIndustryWaterServiceSiteData } from '../../apps/world-worker/src/persistence/postwar-industry-utility-service-source.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
describe('actual stored finite water staffing original', () => {
  it('publishes exact existing E03 crew once, refuses substitutions and restricted writes, and changes no economics', async () => {
    const world = 'WORLD_TEST_ONLY_TRADE_CUTOFF',
      country = 'COUNTRY_02',
      storage = 'POWER-02-13',
      sourcePositions = (['LOW', 'MEDIUM', 'HIGH'] as const).map(
        (skill, i) => ({
          positionId:
            'POSTWAR_SOURCE_' + sha(storage + '/' + skill).toUpperCase(),
          countryId: country,
          locationId: 'REGION_02_E1',
          employerId: 'ENTITY_OPERATOR_02',
          employerRole: 'OP',
          sourceBucket: 'POWER',
          sourceObjectId: storage,
          skill,
          filledCount: '1',
          personRange: {
            poolId: 'TEST_ONLY_POWER_POOL_' + skill,
            startOrdinal: '0',
            count: '1',
          },
          testOrdinal: String(i),
        }),
      ),
      f = await createIndustryRunParametersSqlFixture({
        operatingSocialEmployment: {
          schemaVersion: 'postwar-social-employment-state-v1',
          inputs: {
            worldId: world,
            seedId: 'SEED_TEST_ONLY_TRADE_CUTOFF',
            sourcePositions,
          },
          countries: [{ countryId: 'COUNTRY_01' }, { countryId: country }],
        },
      });
    try {
      for (const p of [
        'migrations/artifacts/0005_world_v2_writer_lease_fencing.sql',
        'migrations/artifacts/0010_world_v2_command_claim_fencing.sql',
        'migrations/artifacts/0012_world_v2_command_claim_active_lease_guard.sql',
        'proposals/postwar-industry-run-custody.sql',
        'proposals/postwar-industry-work-custody.sql',
        'proposals/postwar-industry-work-publication.sql',
        'proposals/postwar-industry-utility-custody.sql',
        'proposals/postwar-industry-power-service-source.sql',
        'proposals/postwar-source-revocation-fence.sql',
      ])
        await f.db.exec(await read(p));
      // Interface fixture loads the actual new publisher/current-reader bodies.
      // Exact whole-upgrade guards and owner/ACL preservation are separately
      // exercised on native PostgreSQL after all 83 immutable predecessor steps.
      const waterSql = await read(
        'proposals/postwar-industry-water-service-source.sql',
      );
      for (const name of [
        'publish_postwar_industry_water_service_source',
        'read_postwar_industry_first_day_source',
      ]) {
        const start = waterSql.indexOf(
          (name.startsWith('publish_')
            ? 'create function'
            : 'create or replace function') +
            ' world_v2.' +
            name +
            '(',
        );
        const next = waterSql.indexOf(
          '\ncreate or replace function',
          start + 1,
        );
        expect(start).toBeGreaterThan(0);
        expect(next).toBeGreaterThan(start);
        await f.db.exec(waterSql.slice(start, next));
      }
      await f.db.exec(
        `create role test_water_service_pub nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_industry_source_publisher to test_water_service_pub;grant world_v2_industry_source_reader to ${f.f.readerRole}`,
      );
      const compact = C.canonicalSerialize({
          countryId: country,
          locationId: 'REGION_02_E1',
          operatorId: 'ENTITY_OPERATOR_02',
          power: { storageId: storage },
        }),
        compactSha = sha(compact),
        registration = (
          await f.db.query<{ registration_ref: string }>(
            'select registration_ref from world_v2.postwar_industry_original where world_id=$1',
            [world],
          )
        ).rows[0]!.registration_ref;
      await f.db.query(
        'insert into world_v2.postwar_industry_utility_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          world,
          country,
          'OPEN-02-REFINED_FUEL',
          registration,
          f.f.seed.seedId,
          f.f.seed.fingerprint,
          f.f.admissionRef,
          'INDUSTRY_UTILITY_' + compactSha.toUpperCase(),
          compact,
          compactSha,
        ],
      );
      const projected = derivePostwarIndustryWaterServiceSiteData({
        targetFacilityId: 'OPEN-02-REFINED_FUEL',
        scope: {
          worldId: world,
          countryId: country,
          locationId: 'REGION_02_E1',
          operatorId: 'ENTITY_OPERATOR_02',
          storageId: storage,
          seedId: f.f.seed.seedId,
          seedFingerprint: f.f.seed.fingerprint,
          admissionRef: f.f.admissionRef,
          physicalSourceRef: 'TEST_ONLY_PHYSICAL',
          physicalSourceRawSha256: '1'.repeat(64),
          utilityCompactSha256: compactSha,
        },
        sourcePositions,
        wagePositions: sourcePositions.map((p) => ({
          ...p,
          wageAmount: '72000',
          wageCurrency: f.currency,
          wagePeriod: 'SIM_YEAR',
          wageVersion: 'TEST_ONLY_ORIGINAL_POWER_WAGE',
          payrollFundingRef: 'TEST_ONLY_PAYROLL_' + p.skill,
        })),
        populationPositionRefs: sourcePositions.map((p, i) => ({
          positionId: p.positionId,
          regionId: p.locationId,
          sourcePoolId: p.personRange.poolId,
          sourceStartOrdinal: '0',
          startOrdinal: String(i),
          count: '1',
          cohortId: 'TEST_ONLY_POWER_COHORT_' + p.skill,
        })),
        positionFunding: sourcePositions.map((p) => ({
          positionId: p.positionId,
          payerEntityId: p.employerId,
          accountRef: 'TEST_ONLY_OPERATOR_DEPOSIT',
          currency: f.currency,
        })),
      });
      async function publisher<T>(run: () => Promise<T>) {
        await f.db.exec(
          'set session authorization test_water_service_pub;begin isolation level repeatable read;set local role world_v2_industry_source_publisher',
        );
        try {
          const r = await run();
          await f.db.exec('commit');
          return r;
        } catch (e) {
          await f.db.exec('rollback');
          throw e;
        } finally {
          await f.f.reset();
        }
      }
      const counts = () =>
        f.db.query<{ counts: unknown }>(
          "select jsonb_build_object('head',(select world_version from world_v2.world_head where world_id=$1),'commands',(select count(*)from world_v2.command_submission),'events',(select count(*)from world_v2.authoritative_event),'batches',(select count(*)from world_v2.financial_posting_batch),'inventory',(select count(*)from world_v2.inventory_posting))counts",
          [world],
        );
      const before = (await counts()).rows;
      const publish = () =>
        publisher(() =>
          f.db.query<{ source_ref: string; source_sha256: string }>(
            'select * from world_v2.publish_postwar_industry_water_service_source($1,$2)',
            [world, projected.firstdayOriginal.rawText],
          ),
        );
      await expect(
        publisher(() =>
          f.db.query(
            'select * from world_v2.publish_postwar_industry_water_service_source($1,$2)',
            [world, '[]'],
          ),
        ),
      ).rejects.toThrow('ACTUAL_E03_BYTES_DIFFER');
      expect((await publish()).rows[0]).toEqual({
        source_ref: projected.firstdayOriginal.sourceRef,
        source_sha256: projected.firstdayOriginal.rawSha256,
      });
      expect((await publish()).rows).toHaveLength(1);

      const raw = JSON.parse(projected.firstdayOriginal.rawText);
      for (const bad of [
        { ...raw, operatorId: 'FOREIGN_OPERATOR' },
        { ...raw, countryId: 'COUNTRY_01' },
        { ...raw, policyVersion: 'UNADOPTED_POLICY' },
        { ...raw, sourcePositions: [] },
        {
          ...raw,
          sourcePositions: raw.sourcePositions.map(
            (x: Record<string, unknown>) => ({ ...x, filledCount: '0' }),
          ),
        },
      ]) {
        await expect(
          publisher(() =>
            f.db.query(
              'select * from world_v2.publish_postwar_industry_water_service_source($1,$2)',
              [world, C.canonicalSerialize(bad)],
            ),
          ),
        ).rejects.toThrow();
      }
      await f.db.exec('set session authorization ' + f.f.readerRole);
      await f.db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        f.f.subject,
      ]);
      await f.db.exec(
        'begin isolation level repeatable read;set local role world_v2_industry_source_reader',
      );
      const current = await f.db.query<{ source_text: string }>(
        'select * from world_v2.read_postwar_industry_first_day_source($1,$2,$3,0,0)',
        [world, country, projected.siteSource.facilityId],
      );
      expect(current.rows[0]!.source_text).toBe(
        projected.firstdayOriginal.rawText,
      );
      await f.db.exec('rollback');
      await f.f.reset();
      for (const role of [
        'world_v2_industry_source_reader',
        'world_v2_postwar_projection_reader',
      ]) {
        await f.db.exec(
          'set session authorization ' +
            f.f.readerRole +
            ';begin;set local role ' +
            role,
        );
        await expect(
          f.db.query(
            'select * from world_v2.publish_postwar_industry_water_service_source($1,$2)',
            [world, projected.firstdayOriginal.rawText],
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await f.db.exec('rollback');
        await f.f.reset();
      }
      expect((await counts()).rows).toEqual(before);
      expect(
        (
          await f.db.query<{ n: number }>(
            "select count(*)::int n from world_v2.postwar_industry_first_day_source where source_ref like 'INDUSTRY_WATER_STAFF_%'",
          )
        ).rows[0]!.n,
      ).toBe(1);
    } finally {
      await f.close();
    }
  }, 60000);
});
