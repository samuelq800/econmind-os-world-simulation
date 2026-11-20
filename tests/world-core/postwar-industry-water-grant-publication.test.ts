import type { Pool } from 'pg';
import {
  createPostwarSocialRuntimeConnection,
  loadPostwarSocialConnectionOpeningAdoption,
} from '../../apps/world-worker/src/runtime-preparation/social-runtime-connection.js';
import {
  createPostwarIndustryUtilityRuntime,
  isPreparedPostwarIndustryUtilityRuntime,
  isPostwarIndustryUtilitySourceCommitProtectionPort,
} from '../../apps/world-worker/src/persistence/postwar-industry-utility-runtime.js';
import { AtomicTransitionRepository } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
/** Embedded SQL + real Core small RUN/GRANT. Parent/source registration rows
 * are explicit TEST_ONLY installer metadata, NOT official E03/utility source
 * preparation, native consumer, registered Clock or production acceptance. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import { createIndustryRunParametersSqlFixture } from '../support/postwar-industry-run-parameters-fixture.js';
import { createIndustryFirstDayWorkCoreFixture } from '../support/industry-first-day-work-core-fixture.js';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
} from '@econmind/core/industry-first-day-work';
import {
  createIndustryFirstDayWaterScenario,
  INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY as POLICY,
} from '@econmind/core/industry-first-day-water-scenario';
import {
  prepareFinanceSocialReplayContinuation,
  appendFinanceSocialReplayPage,
  readFinanceSocialReplayContinuation,
} from '@econmind/core/finance-social-replay-continuation';
import {
  prepareIndustryUtilityExecution,
  parseIndustryUtilityAutomaticWaterGrantIntent,
} from '@econmind/core/industry-utility-execution';
import { prepareIndustryFirstDayWaterExecution } from '@econmind/core/industry-first-day-water-execution';
const sha = (s: string) => createHash('sha256').update(s).digest('hex'),
  file = (p: string) =>
    readFile(new URL('../../' + p, import.meta.url), 'utf8');
describe('fixed automatic water quota publisher', () => {
  it('derives the exact RUN-bound command, recovers it once and requires actual publication/claim/source before grant', async () => {
    const f = await createIndustryRunParametersSqlFixture();
    try {
      for (const name of [
        'migrations/artifacts/0005_world_v2_writer_lease_fencing.sql',
        'migrations/artifacts/0010_world_v2_command_claim_fencing.sql',
        'migrations/artifacts/0012_world_v2_command_claim_active_lease_guard.sql',
        'proposals/postwar-industry-run-custody.sql',
        'proposals/postwar-industry-work-custody.sql',
        'proposals/postwar-industry-work-publication.sql',
        'proposals/postwar-industry-utility-custody.sql',
        'proposals/postwar-source-revocation-fence.sql',
      ])
        await f.db.exec(await file('database/' + name));
      await f.db.exec(
        `create role test_water_publisher nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;grant world_v2_industry_source_publisher to test_water_publisher;grant world_v2_industry_source_reader to ${f.f.readerRole}`,
      );
      const world = f.f.world,
        country = 'COUNTRY_02',
        facility = 'OPEN-02-REFINED_FUEL',
        operator = 'ENTITY_OPERATOR_02',
        now = '2026-11-08T00:00:00.000Z',
        worker = 'WORKER_TEST_ONLY_WATER_GRANT',
        runId = 'RUN_TEST_ONLY_WATER_GRANT',
        raw = createIndustryFirstDayWorkCoreFixture(),
        site = {
          ...raw.source,
          worldId: world,
          countryId: country,
          locationId: 'REGION_02_E1',
          operatorId: operator,
          seedId: f.f.seed.seedId,
          seedFingerprint: f.f.seed.fingerprint,
          admissionRef: f.f.admissionRef,
          sourceRef: f.published.sourceRef,
          sourceRawSha256: f.published.sourceSha256,
          positions: raw.source.positions.map((p) => ({
            ...p,
            regionId: 'REGION_02_E1',
          })),
        };
      const scheduleCommand = C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            worldId: world,
            commandId: 'COMMAND_TEST_ONLY_WATER_RUN',
            commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
            countryId: country,
            officeId: 'INDUSTRY',
            actorId: 'ACTOR_TEST_ONLY_WATER',
            authSubject: f.f.subject,
            expectedWorldVersion: '0',
            idempotencyKey: 'RUN_TEST_ONLY_WATER',
            correlationId: 'CORRELATION_TEST_ONLY_WATER',
            simTime: '0',
            submittedAtReal: now,
            payload: {
              ...raw.terms,
              runId,
              sourceRef: site.sourceRef,
              sourceRawSha256: site.sourceRawSha256,
            },
          },
          sha,
        ),
        scheduled = prepareIndustryRunScheduleFrame(
          {
            state: createIndustryFirstDayWorkState([site]),
            command: scheduleCommand,
            head: { worldVersion: '0', eventSequence: '0' },
            observedAtReal: now,
          },
          sha,
        ),
        r = scheduled.frame.receipt,
        e = scheduled.frame.events[0]!;
      await f.db.query(
        'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,0,0,$13,$14::timestamptz)',
        [
          world,
          scheduleCommand.commandId,
          scheduleCommand.idempotencyKey,
          scheduleCommand.commandType,
          scheduleCommand.schemaVersion,
          scheduleCommand.canonicalPayload,
          scheduleCommand.payloadHash,
          scheduleCommand.fingerprint,
          scheduleCommand.authSubject,
          scheduleCommand.actorId,
          country,
          'INDUSTRY',
          scheduleCommand.correlationId,
          now,
        ],
      );
      await f.db.query(
        'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real)values($1,$2,1,1,$3,$4,$5,$6,$7,$8,$9,0,$10::timestamptz)',
        [
          world,
          e.eventId,
          e.causationCommandId,
          e.correlationId,
          e.eventType,
          e.schemaVersion,
          e.canonicalPayload,
          e.payloadHash,
          e.fingerprint,
          now,
        ],
      );
      await f.db.query(
        'insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,null,$7,0,1,0,$8::jsonb,$9::timestamptz)',
        [
          world,
          r.commandId,
          r.idempotencyKey,
          r.schemaVersion,
          r.commandFingerprint,
          r.outcome,
          r.transitionId,
          JSON.stringify(r.eventIds),
          now,
        ],
      );
      await f.db.query(
        'update world_v2.world_head set world_version=1,event_sequence=1 where world_id=$1',
        [world],
      );
      await f.db.query(
        'insert into world_v2.world_writer_lease values($1,$2,1,$3::timestamptz,$3::timestamptz,$4::timestamptz)',
        [world, worker, '2026-11-07T23:00:00.000Z', '2026-11-08T01:00:00.000Z'],
      );
      const compactText = C.canonicalSerialize({
          classification: 'TEST_ONLY_REGISTERED_METADATA_NOT_OFFICIAL_SOURCE',
          worldId: world,
          countryId: country,
          facilityId: facility,
          rawQuotaPerDay: '4221.590388',
        }),
        sourceSha = sha(compactText),
        sourceRef = 'INDUSTRY_UTILITY_' + sourceSha.toUpperCase(),
        reg = (
          await f.db.query<{ registration_ref: string }>(
            'select registration_ref from world_v2.postwar_industry_original where world_id=$1 and country_id=$2 and facility_id=$3',
            [world, country, facility],
          )
        ).rows[0]!.registration_ref;
      await f.db.query(
        'insert into world_v2.postwar_industry_utility_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          world,
          country,
          facility,
          reg,
          f.f.seed.seedId,
          f.f.seed.fingerprint,
          f.f.admissionRef,
          sourceRef,
          compactText,
          sourceSha,
        ],
      );
      // Explicit TEST_ONLY second-country source metadata. The authoritative
      // SQL recovery contract must distinguish country/site even when two real
      // Core RUN frames use the same local runId. This is not a 70-country E03
      // source/admission or consumer-authority positive.
      const secondCountry = 'COUNTRY_10',
        secondFacility = 'OPEN-10-REFINED_FUEL',
        secondOperator = 'ENTITY_OPERATOR_10',
        secondLocation = 'REGION_10_E1',
        secondSourceText = C.canonicalSerialize({
          worldId: world,
          countryId: secondCountry,
          facilityId: secondFacility,
        }),
        secondSourceSha = sha(secondSourceText),
        secondSourceRef = 'INDUSTRY_FIRST_DAY_' + secondSourceSha.toUpperCase(),
        secondRegistration = reg + '_COUNTRY_10';
      await f.db.query(
        `insert into world_v2.postwar_industry_original(world_id,country_id,facility_id,registration_ref,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,document_text,document_sha256)
select world_id,$2,$3,$4,seed_fingerprint,admission_ref,operating_source_id,operating_source_hash,checksums_sha256,owner_original_sha256,$5,$6 from world_v2.postwar_industry_original where world_id=$1 and registration_ref=$7`,
        [
          world,
          secondCountry,
          secondFacility,
          secondRegistration,
          secondSourceText,
          secondSourceSha,
          reg,
        ],
      );
      await f.db.query(
        `insert into world_v2.postwar_industry_first_day_source
select world_id,$2,$3,$4,$5,seed_id,seed_fingerprint,admission_ref,policy_version,policy_raw_sha256,user_adoption_raw_sha256,$6,$7 from world_v2.postwar_industry_first_day_source where world_id=$1 and source_ref=$8`,
        [
          world,
          secondCountry,
          secondFacility,
          secondSourceRef,
          secondRegistration,
          secondSourceText,
          secondSourceSha,
          site.sourceRef,
        ],
      );
      const secondCompact = C.canonicalSerialize({
          worldId: world,
          countryId: secondCountry,
          facilityId: secondFacility,
          rawQuotaPerDay: '1',
        }),
        secondCompactSha = sha(secondCompact),
        secondCompactRef = 'INDUSTRY_UTILITY_' + secondCompactSha.toUpperCase();
      await f.db.query(
        'insert into world_v2.postwar_industry_utility_source values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          world,
          secondCountry,
          secondFacility,
          secondRegistration,
          f.f.seed.seedId,
          f.f.seed.fingerprint,
          f.f.admissionRef,
          secondCompactRef,
          secondCompact,
          secondCompactSha,
        ],
      );
      const secondSite = {
          ...site,
          countryId: secondCountry,
          facilityId: secondFacility,
          locationId: secondLocation,
          operatorId: secondOperator,
          sourceRef: secondSourceRef,
          sourceRawSha256: secondSourceSha,
          positions: site.positions.map((p) => ({
            ...p,
            positionId: p.positionId + '_COUNTRY_10',
            poolId: p.poolId + '_COUNTRY_10',
            cohortRef: p.cohortRef + '_COUNTRY_10',
            regionId: secondLocation,
          })),
        },
        secondScheduleCommand = C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            worldId: world,
            commandId: 'COMMAND_TEST_ONLY_SECOND_WATER_RUN',
            commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
            countryId: secondCountry,
            officeId: 'INDUSTRY',
            actorId: 'ACTOR_TEST_ONLY_SECOND_WATER',
            authSubject: f.f.subject,
            expectedWorldVersion: '1',
            idempotencyKey: 'RUN_TEST_ONLY_SECOND_WATER',
            correlationId: 'CORRELATION_TEST_ONLY_SECOND_WATER',
            simTime: '0',
            submittedAtReal: now,
            payload: {
              ...raw.terms,
              runId,
              sourceRef: secondSourceRef,
              sourceRawSha256: secondSourceSha,
              facilityId: secondFacility,
            },
          },
          sha,
        ),
        secondScheduled = prepareIndustryRunScheduleFrame(
          {
            state: createIndustryFirstDayWorkState([secondSite]),
            command: secondScheduleCommand,
            head: { worldVersion: '1', eventSequence: '1' },
            observedAtReal: now,
          },
          sha,
        ),
        secondEvent = secondScheduled.frame.events[0]!,
        secondReceipt = secondScheduled.frame.receipt;
      await f.db.query(
        'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,1,0,$13,$14::timestamptz)',
        [
          world,
          secondScheduleCommand.commandId,
          secondScheduleCommand.idempotencyKey,
          secondScheduleCommand.commandType,
          secondScheduleCommand.schemaVersion,
          secondScheduleCommand.canonicalPayload,
          secondScheduleCommand.payloadHash,
          secondScheduleCommand.fingerprint,
          secondScheduleCommand.authSubject,
          secondScheduleCommand.actorId,
          secondCountry,
          'INDUSTRY',
          secondScheduleCommand.correlationId,
          now,
        ],
      );
      await f.db.query(
        'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real)values($1,$2,2,2,$3,$4,$5,$6,$7,$8,$9,0,$10::timestamptz)',
        [
          world,
          secondEvent.eventId,
          secondScheduleCommand.commandId,
          secondScheduleCommand.correlationId,
          secondEvent.eventType,
          secondEvent.schemaVersion,
          secondEvent.canonicalPayload,
          secondEvent.payloadHash,
          secondEvent.fingerprint,
          now,
        ],
      );
      await f.db.query(
        'insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,null,$7,1,2,0,$8::jsonb,$9::timestamptz)',
        [
          world,
          secondScheduleCommand.commandId,
          secondScheduleCommand.idempotencyKey,
          secondReceipt.schemaVersion,
          secondScheduleCommand.fingerprint,
          secondReceipt.outcome,
          secondReceipt.transitionId,
          JSON.stringify(secondReceipt.eventIds),
          now,
        ],
      );
      await f.db.query(
        'update world_v2.world_head set world_version=2,event_sequence=2 where world_id=$1',
        [world],
      );
      const id =
          'COMMAND_INDUSTRY_WATER_GRANT_' +
          sha(
            C.canonicalSerialize([
              world,
              scheduleCommand.fingerprint,
              sourceSha,
              'INDUSTRY_BOUNDED_WATER_GRANT_V1',
            ]),
          ).toUpperCase(),
        command = C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            worldId: world,
            commandId: id,
            commandType: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
            countryId: country,
            officeId: null,
            actorId: scheduleCommand.actorId,
            authSubject: scheduleCommand.authSubject,
            expectedWorldVersion: '2',
            idempotencyKey: id,
            correlationId: scheduleCommand.correlationId,
            simTime: '0',
            submittedAtReal: now,
            payload: {
              schemaVersion: 'industry-first-day-utility-command-v1',
              serviceKind: 'WATER',
              operationRef: id,
              facilityId: facility,
              runId,
              sourceRef: sourceRef + '_WATER',
              sourceRawSha256: sourceSha,
              operation: { action: 'GRANT_RIGHT' },
            },
          },
          sha,
        );
      const paths = {
          allocations: 'water-allocations',
          population: 'population-services',
          seasonal: 'seasonal-water',
          geography: 'geography',
          regions: 'regions',
          countries: 'countries',
          facilities: 'facilities',
          recipes: 'recipes',
        },
        modelRaw = {
          ...Object.fromEntries(
            await Promise.all(
              Object.entries(paths).map(async ([k, p]) => [
                k,
                await file(
                  'artifacts/world-balanced-candidate-v1/data/' + p + '.json',
                ),
              ]),
            ),
          ),
          utilityPolicy: await file('config/postwar-genesis/utilities.v1.json'),
        } as Parameters<typeof createIndustryFirstDayWaterScenario>[0]['raw'],
        scenario = createIndustryFirstDayWaterScenario(
          {
            modelRef: 'MODEL_TEST_ONLY_SQL_WATER',
            raw: modelRaw,
            adoptionRecordBytes: await file(POLICY.userAdoptionPath),
            year: '2026',
            month: '10',
          },
          sha,
        );
      const eligibility = C.canonicalSerialize({
          schemaVersion:
            'industry-first-day-water-grant-eligibility-original-v1',
          worldId: world,
          seedId: f.f.seed.seedId,
          seedFingerprint: f.f.seed.fingerprint,
          admissionRef: f.f.admissionRef,
          countryId: country,
          locationId: 'REGION_02_E1',
          operatorId: operator,
          sourceCountryId: 'visual-territory-02',
          sourceRegionId: 'visual-territory-02-E1',
          basinRef: 'BASIN-HL23',
          maximumRawQuotaPerDay: { amount: '4221.590388', unit: 'm3/sim-day' },
          validFromTicks: '0',
          validUntilTicks: '86400000',
          sourceRef: sourceRef + '_WATER',
          userAdoptionRawSha256: POLICY.userAdoptionSha256,
          sourceAllocationRawSha256: sha(modelRaw.allocations),
          grantAuthorityOriginalRef: sourceRef,
          grantAuthorityOriginalRawSha256: sourceSha,
        }),
        waterSource = {
          worldId: world,
          countryId: country,
          locationId: 'REGION_02_E1',
          facilityId: facility,
          operatorId: operator,
          runId,
          seedId: f.f.seed.seedId,
          seedFingerprint: f.f.seed.fingerprint,
          admissionRef: f.f.admissionRef,
          sourceRef: sourceRef + '_WATER',
          sourceRawSha256: sourceSha,
          policyVersion: POLICY.version,
          policyRawSha256: sha(C.canonicalSerialize(POLICY)),
          userAdoptionRawSha256: POLICY.userAdoptionSha256,
          originals: [
            {
              kind: 'WATER_GRANT_AUTHORITY',
              reference: sourceRef,
              rawSha256: sourceSha,
            },
            {
              kind: 'WATER_GRANT_ELIGIBILITY',
              reference: 'ELIGIBILITY_TEST_ONLY',
              rawSha256: sha(eligibility),
            },
          ],
        },
        opening = C.rebuildV08LedgersFromLineage({
          seed: f.f.seed,
          sha256Hex: sha,
        });
      let cursor = prepareFinanceSocialReplayContinuation(
        {
          opening,
          expectedHead: { worldVersion: '2', eventSequence: '2' },
          socialCountries: [],
          fxOriginals: [],
          industryWorkSources: [site, secondSite],
          industryWaterOriginals: [
            {
              source: waterSource,
              scenario,
              grantEligibilityOriginal: {
                reference: 'ELIGIBILITY_TEST_ONLY',
                rawText: eligibility,
              },
            },
          ],
          openingEncumbrances: [],
        },
        sha,
      );
      cursor = appendFinanceSocialReplayPage({
        continuation: cursor,
        sha256Hex: sha,
        page: {
          schemaVersion: 'finance-social-replay-page-v1',
          worldId: world,
          seedFingerprint: f.f.seed.fingerprint,
          fromHead: { worldVersion: '0', eventSequence: '0' },
          throughHead: { worldVersion: '2', eventSequence: '2' },
          expectedHead: { worldVersion: '2', eventSequence: '2' },
          frames: [scheduled.frame, secondScheduled.frame],
          framesSha256: C.canonicalSha256(
            C.canonicalHashInput([scheduled.frame, secondScheduled.frame]),
            sha,
          ),
        },
      });
      const before = readFinanceSocialReplayContinuation(cursor),
        draft = prepareIndustryFirstDayWaterExecution(
          {
            preparation: prepareIndustryUtilityExecution(
              { command, replay: before, source: waterSource },
              sha,
            ),
            state: before.result.industryWaterState!,
          },
          sha,
        );
      expect(draft.step.transition.events).toHaveLength(1);
      expect(
        JSON.parse(draft.step.transition.events[0]!.canonicalPayload).grant
          .right.quotaPerDay.amount,
      ).toBe('4221.590388');
      async function pub(fp: string = command.fingerprint) {
        await f.db.exec(
          'set session authorization test_water_publisher;begin isolation level repeatable read;set local role world_v2_industry_source_publisher',
        );
        try {
          const result = await f.db.query<Record<string, unknown>>(
            'select * from world_v2.publish_postwar_industry_water_grant($1,$2,$3,$4,$5,2,2,$6::timestamptz,$7,$8)',
            [world, country, facility, runId, worker, now, '0', fp],
          );
          await f.db.exec('commit');
          return result.rows;
        } catch (error) {
          await f.db.exec('rollback');
          throw error;
        } finally {
          await f.f.reset();
        }
      }
      await expect(pub('sha256:' + '0'.repeat(64))).rejects.toThrow(
        'CORE_EXACT_CANONICAL_FINGERPRINT',
      );
      const rows = await pub();
      expect(rows).toHaveLength(1);
      const actual = C.parseCanonicalCommand(rows[0]!.command_json, sha);
      expect(actual.fingerprint).toBe(command.fingerprint);
      parseIndustryUtilityAutomaticWaterGrantIntent(actual, sha);
      expect(rows[0]!.publication_status).toBe('QUEUED');
      expect((await pub())[0]!.command_fingerprint).toBe(command.fingerprint);
      const secondId =
          'COMMAND_INDUSTRY_WATER_GRANT_' +
          sha(
            C.canonicalSerialize([
              world,
              secondScheduleCommand.fingerprint,
              secondCompactSha,
              'INDUSTRY_BOUNDED_WATER_GRANT_V1',
            ]),
          ).toUpperCase(),
        secondCommand = C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            worldId: world,
            commandId: secondId,
            commandType: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
            countryId: secondCountry,
            officeId: null,
            actorId: secondScheduleCommand.actorId,
            authSubject: secondScheduleCommand.authSubject,
            expectedWorldVersion: '2',
            idempotencyKey: secondId,
            correlationId: secondScheduleCommand.correlationId,
            simTime: '0',
            submittedAtReal: now,
            payload: {
              schemaVersion: 'industry-first-day-utility-command-v1',
              serviceKind: 'WATER',
              operationRef: secondId,
              facilityId: secondFacility,
              runId,
              sourceRef: secondCompactRef + '_WATER',
              sourceRawSha256: secondCompactSha,
              operation: { action: 'GRANT_RIGHT' },
            },
          },
          sha,
        );
      expect(secondId).not.toBe(id);
      await f.db.exec(
        'set session authorization test_water_publisher;begin isolation level repeatable read;set local role world_v2_industry_source_publisher',
      );
      try {
        const secondIssued = await f.db.query<Record<string, unknown>>(
          'select * from world_v2.publish_postwar_industry_water_grant($1,$2,$3,$4,$5,2,2,$6::timestamptz,$7,$8)',
          [
            world,
            secondCountry,
            secondFacility,
            runId,
            worker,
            now,
            '0',
            secondCommand.fingerprint,
          ],
        );
        expect(secondIssued.rows[0]!.command_fingerprint).toBe(
          secondCommand.fingerprint,
        );
        const scopedRead = async (cid: string, facilityId: string) =>
          f.db.query<Record<string, unknown>>(
            'select * from world_v2.read_postwar_industry_water_grant_publication($1,$2,$3,$4)',
            [world, cid, facilityId, runId],
          );
        expect(
          (await scopedRead(country, facility)).rows[0]!.command_fingerprint,
        ).toBe(command.fingerprint);
        expect(
          (await scopedRead(secondCountry, secondFacility)).rows[0]!
            .command_fingerprint,
        ).toBe(secondCommand.fingerprint);
        expect((await scopedRead(secondCountry, facility)).rows).toEqual([]);
        expect(
          (await scopedRead('COUNTRY_03', 'OPEN-03-REFINED_FUEL')).rows,
        ).toEqual([]);
        const legacy = await f.db.query<Record<string, unknown>>(
          'select * from world_v2.read_postwar_industry_water_grant_publication($1,$2)',
          [world, runId],
        );
        expect(legacy.rows[0]!.command_fingerprint).toBe(command.fingerprint);
        await f.db.exec('commit');
      } catch (error) {
        await f.db.exec('rollback');
        throw error;
      } finally {
        await f.f.reset();
      }
      expect((await pub())[0]!.command_fingerprint).toBe(command.fingerprint);
      const count = await f.db.query<{ n: number }>(
        'select count(*)::int n from world_v2.command_queue where world_id=$1 and command_id=$2',
        [world, id],
      );
      expect(count.rows[0]!.n).toBe(1);
      async function scope(
        name:
          | 'read_postwar_industry_water_grant_preclaim_scope'
          | 'lock_postwar_industry_water_grant_scope',
      ) {
        await f.db.exec(
          'set session authorization ' +
            f.f.readerRole +
            ';begin isolation level repeatable read;set local role world_v2_industry_source_reader',
        );
        try {
          const r = await f.db.query(
            'select * from world_v2.' +
              name +
              '($1,$2,$3,$4,$5::timestamptz,$6)',
            [world, id, command.fingerprint, worker, now, '0'],
          );
          await f.db.exec('commit');
          return r.rows;
        } catch (error) {
          await f.db.exec('rollback');
          throw error;
        } finally {
          await f.f.reset();
        }
      }
      expect(
        await scope('read_postwar_industry_water_grant_preclaim_scope'),
      ).toHaveLength(1);
      await expect(
        scope('lock_postwar_industry_water_grant_scope'),
      ).rejects.toThrow('ACTUAL_UNFINISHED_FENCED_CLAIM');
      await f.db.query(
        "update world_v2.command_queue set queue_state='CLAIMED',claimed_by=$3,claim_fencing_token=1,claimed_at_real=$4::timestamptz,attempt_count=attempt_count+1 where world_id=$1 and command_id=$2",
        [world, id, worker, '2026-11-08T00:30:00.000Z'],
      );
      expect(
        await scope('lock_postwar_industry_water_grant_scope'),
      ).toHaveLength(1);
      const acl = await f.db.query<{ allowed: boolean }>(
        "select has_table_privilege('world_v2_industry_source_reader','world_v2.postwar_industry_utility_source','SELECT') allowed",
      );
      expect(acl.rows[0]!.allowed).toBe(false);
    } finally {
      await f.close();
    }
  }, 30000);
  it('allows genuine unprepared port identity at composition time without treating it as source readiness', async () => {
    const adoption = await loadPostwarSocialConnectionOpeningAdoption(
      process.cwd(),
    );
    let queries = 0;
    const pool = {
      async query() {
        queries++;
        throw Error('UNEXPECTED_SQL');
      },
      async connect() {
        queries++;
        throw Error('UNEXPECTED_CONNECT');
      },
    } as unknown as Pool;
    const social = createPostwarSocialRuntimeConnection({
        worldId: 'WORLD_TEST_ONLY_UTILITY_UNPREPARED',
        workerId: 'WORKER_TEST_ONLY_UTILITY',
        workerPool: pool,
        workerRole: 'test_utility_worker',
        openingAdoption: adoption,
      }),
      runtime = createPostwarIndustryUtilityRuntime({
        database: social.database,
        socialConnection: social,
      });
    try {
      expect(isPreparedPostwarIndustryUtilityRuntime(runtime)).toBe(false);
      expect(runtime.readPreparedSites()).toEqual([]);
      expect(runtime.readPlanningScope('COUNTRY_02')).toBeNull();
      expect(runtime.readPlanningScope('COUNTRY_03')).toBeNull();
      await expect(
        runtime.prepare({
          compact: {
            countryId: 'COUNTRY_03',
            facilityId: 'OPEN-03-REFINED_FUEL',
          },
        } as never),
      ).rejects.toThrow('GENUINE_LIVE_SAME_SOCIAL_UTILITY_SOURCE_REQUIRED');
      expect(runtime.readPreparedSites()).toEqual([]);
      await expect(
        runtime.publishWaterGrant({
          countryId: 'COUNTRY_03',
          facilityId: 'OPEN-03-REFINED_FUEL',
          runId: 'RUN_TEST_ONLY_FOREIGN_SCOPE',
        }),
      ).rejects.toThrow('REGISTERED_UTILITY_SITE_NOT_PREPARED');
      expect(
        isPostwarIndustryUtilitySourceCommitProtectionPort(
          runtime.sourceCommitProtectionPort,
        ),
      ).toBe(true);
      const input = {
        database: social.database,
        workerId: social.workerId,
        sha256Hex: sha,
        authorizationGuard: {
          async assertCurrent() {
            throw Error('UNEXPECTED_AUTHORIZATION');
          },
        },
        industryUtilitySourceCommitProtectionPort:
          runtime.sourceCommitProtectionPort,
      };
      expect(() => new AtomicTransitionRepository(input)).not.toThrow();
      expect(
        () =>
          new AtomicTransitionRepository({
            ...input,
            industryUtilitySourceCommitProtectionPort: {
              ...runtime.sourceCommitProtectionPort,
            },
          }),
      ).toThrow('fixed live runtime');
      const c = C.parseCanonicalCommand(
        {
          schemaVersion: 'command-v1',
          worldId: social.worldId,
          commandId: 'COMMAND_TEST_ONLY_UNPREPARED_BOOK',
          commandType: 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1',
          actorId: 'ACTOR_TEST_ONLY',
          authSubject: '11111111-1111-4111-8111-111111111111',
          countryId: 'COUNTRY_02',
          officeId: 'INDUSTRY',
          expectedWorldVersion: '0',
          idempotencyKey: 'KEY_TEST_ONLY_UNPREPARED',
          correlationId: 'CORRELATION_TEST_ONLY_UNPREPARED',
          simTime: '0',
          submittedAtReal: '2026-11-08T00:00:00.000Z',
          payload: {
            schemaVersion: 'industry-first-day-utility-command-v1',
            serviceKind: 'POWER',
            operationRef: 'OP_TEST_ONLY_UNPREPARED',
            facilityId: 'OPEN-02-REFINED_FUEL',
            runId: 'RUN_TEST_ONLY',
            sourceRef: 'SOURCE_NOT_READY_TEST_ONLY',
            sourceRawSha256: 'a'.repeat(64),
            operation: {
              action: 'BOOK',
              bookingRef: 'BOOK_TEST_ONLY',
              purpose: 'INDUSTRY_SELF_USE',
              fromSimTime: '0',
              throughSimTime: '72000',
              outputMWh: '1',
            },
          },
        },
        sha,
      );
      await expect(
        runtime.assertSourceBeforeClaim(c, '2026-11-08T00:00:00.000Z'),
      ).rejects.toThrow('SOURCE_NOT_PREPARED');
      expect(queries).toBe(0);
    } finally {
      await Promise.all([runtime.close(), runtime.close()]);
      expect(runtime.readPreparedSites()).toEqual([]);
      await social.close();
    }
    expect(
      isPostwarIndustryUtilitySourceCommitProtectionPort(
        runtime.sourceCommitProtectionPort,
      ),
    ).toBe(false);
  });
});
