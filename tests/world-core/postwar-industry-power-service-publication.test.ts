/** TEST_ONLY tiny signed seed carrying real test E03 POWER rows. Parent compact
 * registration is explicit installer metadata, not official 70-country source
 * publication or native consumer acceptance. RUN/WORK below use real Core. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '@econmind/core';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
} from '@econmind/core/industry-first-day-work';
import type { FinanceNativeBudgetCanonicalFrame as Frame } from '@econmind/core/finance-budget-native';
import { createIndustryRunParametersSqlFixture } from '../support/postwar-industry-run-parameters-fixture.js';
import { derivePostwarIndustryPowerServiceSiteData } from '../../apps/world-worker/src/persistence/postwar-industry-utility-service-source.js';
import { derivePostwarIndustryRunWorkAllocations } from '../../apps/world-worker/src/persistence/postwar-industry-work-publisher.js';
import {
  createIndustryPowerExecutionFixture,
  industryPowerExecutionTestSha,
} from '../support/industry-power-execution-fixture.js';
import {
  readIndustryFirstDayPowerState,
  confirmIndustryFirstDayPowerExecution,
} from '../../packages/core/src/commands/industry-first-day-power-execution.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const read = (p: string) =>
  readFile(new URL('../../database/' + p, import.meta.url), 'utf8');
describe('actual stored POWER staff originals and independent service WORK', () => {
  it('exposes only actual folded payment references before delivery and consumes them only after complete committed delivery replay', () => {
    const f = createIndustryPowerExecutionFixture(),
      hash = industryPowerExecutionTestSha,
      before = readIndustryFirstDayPowerState(
        f.beforeDelivery.result.industryPowerState!,
        hash,
      );
    expect(before.paymentFrames).toHaveLength(1);
    expect(before.paymentFrames[0]!.receipt.outcome).toBe('COMMITTED');
    expect(before.paymentFrames[0]!.financialPostingBatches).toHaveLength(1);
    expect(before.usedPaidEventFingerprints).toEqual([]);
    expect(before.committedDeliveryEventFingerprints).toEqual([]);
    const draft = f.prepare(f.beforeDelivery, f.deliverCommand),
      frame = f.commit(draft),
      replay = f.replay([...f.frames, frame], f.withPayment, [f.wageSource]),
      after = readIndustryFirstDayPowerState(
        replay.result.industryPowerState!,
        hash,
      ),
      operation = JSON.parse(f.deliverCommand.canonicalPayload).operation as {
        workEventFingerprint: string;
        paymentEventFingerprint: string;
      };
    expect(after.usedPaidEventFingerprints).toEqual(
      expect.arrayContaining([
        operation.workEventFingerprint,
        operation.paymentEventFingerprint,
      ]),
    );
    expect(after.committedDeliveryEventFingerprints).toEqual([
      frame.events[0]!.fingerprint,
    ]);
    expect(before.usedPaidEventFingerprints).toEqual([]);
    expect(
      confirmIndustryFirstDayPowerExecution(
        { replay, eventFingerprint: frame.events[0]!.fingerprint },
        hash,
      ),
    ).toBeDefined();
  });

  it('derives immutable stored E03 bytes, requires current source and publishes only the actual elapsed service RUN', async () => {
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
      await f.db.exec(
        `create role test_power_service_pub nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_industry_source_publisher to test_power_service_pub;grant world_v2_industry_source_reader to ${f.f.readerRole}`,
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
      const projected = derivePostwarIndustryPowerServiceSiteData({
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
          'set session authorization test_power_service_pub;begin isolation level repeatable read;set local role world_v2_industry_source_publisher',
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
      const publish = () =>
        publisher(() =>
          f.db.query<{ source_ref: string; source_sha256: string }>(
            'select * from world_v2.publish_postwar_industry_power_service_source($1,$2)',
            [world, projected.firstdayOriginal.rawText],
          ),
        );
      await expect(
        publisher(() =>
          f.db.query(
            'select * from world_v2.publish_postwar_industry_power_service_source($1,$2)',
            [world, '[]'],
          ),
        ),
      ).rejects.toThrow('ACTUAL_E03_BYTES_DIFFER');
      expect((await publish()).rows[0]).toEqual({
        source_ref: projected.firstdayOriginal.sourceRef,
        source_sha256: projected.firstdayOriginal.rawSha256,
      });
      expect((await publish()).rows).toHaveLength(1);
      const now = '2026-11-08T00:00:00.000Z',
        worker = 'WORKER_TEST_ONLY_POWER_SERVICE',
        runId = 'UTILITY_POWER_SERVICE_TEST_ONLY_RUN',
        site = projected.siteSource;
      await f.db.query(
        'insert into world_v2.world_writer_lease values($1,$2,1,$3,$3,$4)',
        [world, worker, '2026-11-07T23:59:00.000Z', '2026-11-09T00:00:00.000Z'],
      );
      const command = (
        id: string,
        type: string,
        version: string,
        time: string,
        payload: unknown,
        automatic = false,
      ) =>
        C.parseCanonicalCommand(
          {
            schemaVersion: 'command-v1',
            worldId: world,
            countryId: country,
            commandId: id,
            commandType: type,
            actorId: 'ACTOR_TEST_ONLY_POWER',
            authSubject: f.f.subject,
            officeId: automatic ? null : 'INDUSTRY',
            expectedWorldVersion: version,
            idempotencyKey: id,
            correlationId: 'CORRELATION_TEST_ONLY_POWER',
            simTime: time,
            submittedAtReal: now,
            payload,
          },
          sha,
        );
      const schedule = prepareIndustryRunScheduleFrame(
        {
          state: createIndustryFirstDayWorkState([site]),
          command: command(
            'COMMAND_TEST_ONLY_POWER_SERVICE_RUN',
            'CORE_INDUSTRY_RUN_SCHEDULE_V1',
            '0',
            '0',
            {
              schemaVersion: 'postwar-industry-run-schedule-v1',
              policyVersion: site.policyVersion,
              runId,
              facilityId: storage,
              sourceRef: site.sourceRef,
              sourceRawSha256: site.sourceRawSha256,
              quantity: { amount: '0.125', unit: 'person-day' },
              startsAtSimTime: '0',
              endsAtSimTime: '3600000',
              maximumExpense: { amount: '100', currency: f.currency },
            },
          ),
          head: { worldVersion: '0', eventSequence: '0' },
          observedAtReal: now,
        },
        sha,
      );
      async function store(frame: Frame) {
        const c = frame.command,
          e = frame.events[0]!,
          r = frame.receipt;
        await f.db.query(
          'insert into world_v2.command_submission(world_id,command_id,idempotency_key,command_type,schema_version,canonical_payload,payload_sha256,command_fingerprint,auth_subject,actor_id,country_id,office_id,expected_world_version,sim_time,correlation_id,submitted_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,$13,$14,$15,$16::timestamptz)',
          [
            world,
            c.commandId,
            c.idempotencyKey,
            c.commandType,
            c.schemaVersion,
            c.canonicalPayload,
            c.payloadHash,
            c.fingerprint,
            c.authSubject,
            c.actorId,
            c.countryId,
            c.officeId,
            c.expectedWorldVersion,
            c.simTime.toCanonicalValue(),
            c.correlationId,
            now,
          ],
        );
        await f.db.query(
          'insert into world_v2.authoritative_event(world_id,event_id,event_sequence,world_version,causation_command_id,correlation_id,event_type,schema_version,canonical_payload,payload_sha256,event_fingerprint,sim_time,recorded_at_real)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz)',
          [
            world,
            e.eventId,
            e.sequence,
            e.worldVersion,
            c.commandId,
            c.correlationId,
            e.eventType,
            e.schemaVersion,
            e.canonicalPayload,
            e.payloadHash,
            e.fingerprint,
            e.simTime.toCanonicalValue(),
            now,
          ],
        );
        await f.db.query(
          'insert into world_v2.command_receipt(world_id,command_id,idempotency_key,schema_version,command_fingerprint,outcome,reason_code,transition_id,world_version_before,world_version_after,sim_time,event_ids,recorded_at_real)values($1,$2,$3,$4,$5,$6,null,$7,$8,$9,$10,$11::jsonb,$12::timestamptz)',
          [
            world,
            c.commandId,
            c.idempotencyKey,
            r.schemaVersion,
            c.fingerprint,
            r.outcome,
            r.transitionId,
            r.worldVersionBefore,
            r.worldVersionAfter,
            c.simTime.toCanonicalValue(),
            JSON.stringify(r.eventIds),
            now,
          ],
        );
        await f.db.query(
          'update world_v2.world_head set world_version=$2,event_sequence=$3 where world_id=$1',
          [world, r.worldVersionAfter, e.sequence],
        );
      }
      await store(schedule.frame);
      // Exact existing history-owner SELECT declaration, not a new product
      // grant. The remaining complete-current reducer is outside this unit.
      const historySql = await read(
          'proposals/postwar-industry-run-history.sql',
        ),
        historyGrant = historySql.match(
          /^grant select on world_v2\.authoritative_event,world_v2\.inventory_posting to world_v2_industry_source_owner;/mu,
        )?.[0];
      if (!historyGrant)
        throw Error('ACTUAL_HISTORY_OWNER_DEPENDENCY_REQUIRED');
      await f.db.exec(historyGrant);
      await f.db.exec(
        await read('proposals/postwar-industry-power-service-current.sql'),
      );
      await f.db
        .exec(`create role test_power_current_pub nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;grant world_v2_postwar_projection_publisher to test_power_current_pub;
create function world_v2.test_only_power_current_original(w text,c jsonb,e jsonb)returns jsonb language plpgsql security definer set search_path=pg_catalog as $$begin perform set_config('econmind.postwar_projection_world',w,true);return world_v2.postwar_projection_industry_original(w,c,e);end;$$;
alter function world_v2.test_only_power_current_original(text,jsonb,jsonb)owner to world_v2_postwar_projection_owner;
revoke all on function world_v2.test_only_power_current_original(text,jsonb,jsonb)from public;
grant execute on function world_v2.test_only_power_current_original(text,jsonb,jsonb)to world_v2_postwar_projection_publisher;`);
      async function currentOriginal() {
        await f.db.exec(
          'set session authorization test_power_current_pub;begin isolation level repeatable read;set local role world_v2_postwar_projection_publisher',
        );
        try {
          const result = await f.db.query<{ data: Record<string, unknown> }>(
            'select world_v2.test_only_power_current_original($1,$2::jsonb,$3::jsonb)as data',
            [
              world,
              JSON.stringify({
                commandId: schedule.frame.command.commandId,
                fingerprint: schedule.frame.command.fingerprint,
                countryId: country,
              }),
              JSON.stringify({
                eventId: schedule.frame.events[0]!.eventId,
                fingerprint: schedule.frame.events[0]!.fingerprint,
                canonicalPayload: schedule.frame.events[0]!.canonicalPayload,
              }),
            ],
          );
          await f.db.exec('commit');
          return result.rows[0]!.data;
        } catch (error) {
          await f.db.exec('rollback');
          throw error;
        } finally {
          await f.f.reset();
        }
      }
      expect(await currentOriginal()).toMatchObject({
        serviceKind: 'POWER',
        outputUnit: 'person-day',
        capacityPerSimDay: '3',
        labourPersonDaysPerOutput: '1',
        sourceRef: projected.firstdayOriginal.sourceRef,
      });
      expect(await currentOriginal()).not.toHaveProperty('recipe');
      const allocations = derivePostwarIndustryRunWorkAllocations({
          state: schedule.state,
          countryId: country,
          facilityId: storage,
          runId,
          simTime: '3600000',
          currentEmployment: site.positions.map((p) => ({
            positionId: p.positionId,
            employedCount: p.count,
          })),
        }),
        id =
          'COMMAND_INDUSTRY_WORK_' +
          sha(
            C.canonicalSerialize([
              world,
              schedule.frame.command.fingerprint,
              'INDUSTRY_FIRST_DAY_WORK_RULE_V1',
            ]),
          ).toUpperCase(),
        work = prepareIndustryFirstDayWorkFrame(
          {
            state: schedule.state,
            command: command(
              id,
              'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
              '1',
              '3600000',
              {
                schemaVersion: 'postwar-industry-work-command-v1',
                runId,
                scheduleCommandFingerprint: schedule.frame.command.fingerprint,
                allocations,
              },
              true,
            ),
            head: { worldVersion: '1', eventSequence: '1' },
            observedAtReal: now,
          },
          sha,
        );
      const publishWork = () =>
        publisher(() =>
          f.db.query<Record<string, unknown>>(
            'select * from world_v2.publish_postwar_industry_work_due($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9)',
            [
              world,
              schedule.frame.command.commandId,
              worker,
              '1',
              '1',
              now,
              '3600000',
              work.frame.command.canonicalPayload,
              work.frame.command.fingerprint,
            ],
          ),
        );
      const published = await publishWork();
      expect(published.rows[0]!.command_fingerprint).toBe(
        work.frame.command.fingerprint,
      );
      expect((await publishWork()).rows).toHaveLength(1);
      await f.db.exec(
        'set session authorization ' +
          f.f.readerRole +
          ';begin isolation level repeatable read;set local role world_v2_industry_source_reader',
      );
      const current = await f.db.query<{ source_text: string }>(
        'select * from world_v2.read_postwar_industry_first_day_source($1,$2,$3,1,1)',
        [world, country, storage],
      );
      expect(current.rows[0]!.source_text).toBe(
        projected.firstdayOriginal.rawText,
      );
      await f.db.exec('rollback');
      await f.f.reset();
      expect(
        (
          await f.db.query<{ raw: boolean }>(
            "select has_column_privilege('world_v2_industry_source_reader','world_v2.opening_seed','canonical_payload','SELECT') as raw",
          )
        ).rows[0]!.raw,
      ).toBe(false);
      await f.db.query(
        'insert into world_v2.postwar_industry_first_day_source_revocation values($1,$2,$3)',
        [world, projected.firstdayOriginal.sourceRef, 'TEST_ONLY_REVOKE'],
      );
      await expect(publish()).rejects.toThrow('CONFLICT_OR_REVOKED');
      expect(await currentOriginal()).toMatchObject({
        serviceKind: 'POWER',
        sourceRef: projected.firstdayOriginal.sourceRef,
      });
    } finally {
      await f.db.close();
    }
  });
});
