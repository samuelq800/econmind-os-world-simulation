/** Tiny TEST_ONLY E03 DATA joins and actual deterministic service RUN/WORK.
 * No private Social baseline, admission, actor, cash settlement or power
 * delivery authority is fabricated for these fixtures. */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as C from '../../packages/core/src/index.js';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
  readIndustryCompletedWork,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  derivePostwarIndustryPowerServiceSiteData,
  projectPostwarIndustryPowerServiceSource,
  readPostwarIndustryPowerServiceSourceFrom,
} from '../../apps/world-worker/src/persistence/postwar-industry-utility-service-source.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function fixture() {
  const scope = {
    worldId: 'WORLD_TEST_ONLY_POWER_SERVICE',
    seedId: 'SEED_TEST_ONLY_POWER_SERVICE',
    seedFingerprint: 'sha256:' + 'a'.repeat(64),
    admissionRef: 'ADMISSION_TEST_ONLY',
    countryId: 'COUNTRY_02',
    locationId: 'REGION_02_E1',
    operatorId: 'ENTITY_OPERATOR_02',
    storageId: 'POWER-02-13',
    physicalSourceRef: 'TEST_ONLY_PHYSICAL_STORAGE',
    physicalSourceRawSha256: 'b'.repeat(64),
    utilityCompactSha256: 'c'.repeat(64),
  };
  const sourcePositions = (['LOW', 'MEDIUM', 'HIGH'] as const).map(
    (skill, i) => ({
      positionId:
        'POSTWAR_SOURCE_' + sha(scope.storageId + '/' + skill).toUpperCase(),
      countryId: scope.countryId,
      locationId: scope.locationId,
      employerId: scope.operatorId,
      employerRole: 'OP',
      sourceBucket: 'POWER',
      sourceObjectId: scope.storageId,
      skill,
      filledCount: ['2', '1', '0'][i]!,
      personRange: {
        poolId: 'TEST_POWER_POOL_' + skill,
        startOrdinal: '0',
        count: ['2', '1', '0'][i]!,
      },
    }),
  );
  const wagePositions = sourcePositions.map((p, i) => ({
    positionId: p.positionId,
    countryId: p.countryId,
    locationId: p.locationId,
    employerId: p.employerId,
    employerRole: 'OP',
    skill: p.skill,
    wageAmount: ['72000', '144000', '216000'][i]!,
    wageCurrency: 'XBB',
    wagePeriod: 'SIM_YEAR',
    wageVersion: 'TEST_ONLY_RETAINED_POWER_WAGE',
    payrollFundingRef: 'TEST_POWER_PAYROLL_' + p.skill,
  }));
  const populationPositionRefs = sourcePositions.map((p, i) => ({
    positionId: p.positionId,
    regionId: p.locationId,
    sourcePoolId: p.personRange.poolId,
    sourceStartOrdinal: '0',
    startOrdinal: ['0', '2', '3'][i]!,
    count: p.filledCount,
    cohortId: 'TEST_POWER_COHORT_' + p.skill,
  }));
  const positionFunding = sourcePositions.map((p) => ({
    positionId: p.positionId,
    payerEntityId: p.employerId,
    accountRef: 'TEST_ONLY_ORIGINAL_OP_DEPOSIT',
    currency: 'XBB',
  }));
  return {
    scope,
    sourcePositions,
    wagePositions,
    populationPositionRefs,
    positionFunding,
  };
}
describe('existing POWER staff as a distinct real service workplace', () => {
  it('retains exact source rows/skills/wages and expresses only person-time capacity', () => {
    const f = fixture(),
      p = derivePostwarIndustryPowerServiceSiteData(f);
    expect(p.siteSource.capacityPerSimDay).toBe('3');
    expect(p.siteSource.outputUnit).toBe('person-day');
    expect(p.siteSource.labourPersonDaysPerOutput).toBe('1');
    expect(p.siteSource.positions.map((x) => [x.skill, x.count])).toEqual([
      ['LOW', '2'],
      ['MEDIUM', '1'],
    ]);
    expect(p.firstdayOriginal.rawText).toBe(
      C.canonicalSerialize(f.sourcePositions),
    );
    expect(p.siteSource.sourceRawSha256).toBe(sha(p.firstdayOriginal.rawText));
    expect(p.firstdayOriginal.data.serviceKind).toBe('POWER');
    expect(p.firstdayOriginal.data).not.toHaveProperty('recipe');
    expect(p.firstdayOriginal.data).not.toHaveProperty('sourceFacility');
    expect(f.wagePositions.map((x) => x.wageAmount)).toEqual([
      '72000',
      '144000',
      '216000',
    ]);
  });
  it('supports actual separate service RUN/automatic WORK without reusing manufacturing labour', () => {
    const f = fixture(),
      p = derivePostwarIndustryPowerServiceSiteData(f),
      site = p.siteSource,
      at = '2026-11-08T00:00:00.000Z';
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
          schemaVersion: C.COMMAND_SCHEMA_VERSION,
          commandId: id,
          worldId: site.worldId,
          countryId: site.countryId,
          officeId: automatic ? null : 'INDUSTRY',
          actorId: 'TEST_ONLY_ACTOR',
          authSubject: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: id,
          correlationId: 'CORRELATION_' + id,
          expectedWorldVersion: version,
          simTime: time,
          submittedAtReal: at,
          commandType: type,
          payload,
        },
        sha,
      );
    const run = prepareIndustryRunScheduleFrame(
      {
        state: createIndustryFirstDayWorkState([site]),
        command: command(
          'TEST_ONLY_POWER_SERVICE_RUN',
          'CORE_INDUSTRY_RUN_SCHEDULE_V1',
          '0',
          '0',
          {
            schemaVersion: 'postwar-industry-run-schedule-v1',
            runId: 'UTILITY_POWER_SERVICE_TEST_RUN',
            facilityId: site.facilityId,
            quantity: { amount: '0.001', unit: 'person-day' },
            startsAtSimTime: '0',
            endsAtSimTime: '28800',
            maximumExpense: { amount: '1', currency: 'XBB' },
            policyVersion: site.policyVersion,
            sourceRef: site.sourceRef,
            sourceRawSha256: site.sourceRawSha256,
          },
        ),
        head: { worldVersion: '0', eventSequence: '0' },
        observedAtReal: at,
      },
      sha,
    );
    const position = site.positions[0]!,
      work = prepareIndustryFirstDayWorkFrame(
        {
          state: run.state,
          head: { worldVersion: '1', eventSequence: '1' },
          observedAtReal: at,
          command: command(
            'TEST_ONLY_POWER_SERVICE_WORK',
            'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
            '1',
            '28800',
            {
              schemaVersion: 'postwar-industry-work-command-v1',
              runId: 'UTILITY_POWER_SERVICE_TEST_RUN',
              scheduleCommandFingerprint: run.frame.command.fingerprint,
              allocations: [
                {
                  positionId: position.positionId,
                  poolId: position.poolId,
                  regionId: position.regionId,
                  cohortRef: position.cohortRef,
                  sourceStartOrdinal: '0',
                  populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
                  startOrdinal: '0',
                  count: '1',
                  skill: 'LOW',
                  startsAtSimTime: '0',
                  endsAtSimTime: '28800',
                  personMilliseconds: '28800',
                  personMinutes: { numerator: '28800', denominator: '60000' },
                },
              ],
            },
            true,
          ),
        },
        sha,
      );
    expect(readIndustryCompletedWork(work.work!).data.facilityId).toBe(
      'POWER-02-13',
    );
    expect(work.frame.financialPostingBatches).toHaveLength(0);
    expect(work.frame.inventoryPostings).toHaveLength(0);
    expect(work.frame.receipt.outcome).toBe('COMMITTED');
  });
  it('refuses manufacturing, duplicate or inconsistent staff instead of inventing a crew', () => {
    const f = fixture();
    expect(() =>
      derivePostwarIndustryPowerServiceSiteData({
        ...f,
        sourcePositions: f.sourcePositions.map((p, i) =>
          i ? p : { ...p, sourceBucket: 'INDUSTRY' },
        ),
      }),
    ).toThrow(/NOT_MANUFACTURING/);
    expect(() =>
      derivePostwarIndustryPowerServiceSiteData({
        ...f,
        sourcePositions: [f.sourcePositions[0]!, f.sourcePositions[0]!],
      }),
    ).toThrow(/DISTINCT_POWER/);
    expect(() =>
      derivePostwarIndustryPowerServiceSiteData({
        ...f,
        populationPositionRefs: f.populationPositionRefs.map((p, i) =>
          i ? p : { ...p, count: '3' },
        ),
      }),
    ).toThrow(/POPULATION_SCOPE/);
    expect(() =>
      derivePostwarIndustryPowerServiceSiteData({
        ...f,
        positionFunding: f.positionFunding.map((p, i) =>
          i ? p : { ...p, currency: 'GCU' },
        ),
      }),
    ).toThrow(/SCOPE_DIFFERS/);
  });
  it('rejects forged prepared sources before any SQL and creates no authority flag', async () => {
    let calls = 0;
    const tx = {
      query: async () => {
        calls++;
        throw Error('UNEXPECTED_SQL');
      },
    };
    expect(() =>
      projectPostwarIndustryPowerServiceSource({
        baseline: {} as never,
        preparation: {} as never,
      }),
    ).toThrow();
    await expect(
      readPostwarIndustryPowerServiceSourceFrom(tx, {
        baseline: {} as never,
        worldId: 'WORLD_TEST_ONLY',
        countryId: 'COUNTRY_02',
        facilityId: 'POWER-02-13',
        expectedHead: { worldVersion: '0', eventSequence: '0' },
      }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
