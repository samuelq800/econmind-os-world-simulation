import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import * as C from '../../packages/core/src/index.js';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
  readIndustryCompletedWork,
  type IndustryFirstDayWorkSiteSource,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  derivePostwarIndustryPowerServiceSiteData,
  derivePostwarIndustryWaterServiceSiteData,
  projectPostwarIndustryWaterServiceSource,
} from '../../apps/world-worker/src/persistence/postwar-industry-utility-service-source.js';
import { POSTWAR_WATER_STAFF_POLICY } from '../../apps/world-worker/src/preparation/postwar-water-staff-policy.js';
import { actualPowerStaffDataFixture } from '../support/postwar-water-staff-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const at = '2026-11-13T00:00:00.000Z';
function fixture() {
  const input = {
    ...actualPowerStaffDataFixture(),
    targetFacilityId: 'OPEN-02-REFINED_FUEL',
  };
  return {
    input,
    water: derivePostwarIndustryWaterServiceSiteData(input),
    power: derivePostwarIndustryPowerServiceSiteData(input),
  };
}
function harness(sites: readonly IndustryFirstDayWorkSiteSource[]) {
  let state = createIndustryFirstDayWorkState(sites),
    head = 0;
  const command = (
    id: string,
    type: string,
    time: string,
    payload: unknown,
    automatic = false,
  ) =>
    C.parseCanonicalCommand(
      {
        schemaVersion: C.COMMAND_SCHEMA_VERSION,
        commandId: id,
        commandType: type,
        worldId: sites[0]!.worldId,
        countryId: sites[0]!.countryId,
        officeId: automatic ? null : 'INDUSTRY',
        actorId: 'TEST_ONLY_ACTOR',
        authSubject: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: id,
        correlationId: 'CORRELATION_' + id,
        expectedWorldVersion: String(head),
        simTime: time,
        submittedAtReal: at,
        payload,
      },
      sha,
    );
  return {
    schedule(
      site: IndustryFirstDayWorkSiteSource,
      id: string,
      from: string,
      until: string,
      quantity: string,
    ) {
      const run = prepareIndustryRunScheduleFrame(
        {
          state,
          head: { worldVersion: String(head), eventSequence: String(head) },
          observedAtReal: at,
          command: command(id, 'CORE_INDUSTRY_RUN_SCHEDULE_V1', '0', {
            schemaVersion: 'postwar-industry-run-schedule-v1',
            runId: id,
            facilityId: site.facilityId,
            quantity: { amount: quantity, unit: 'person-day' },
            startsAtSimTime: from,
            endsAtSimTime: until,
            maximumExpense: { amount: '10000', currency: 'XBB' },
            policyVersion: site.policyVersion,
            sourceRef: site.sourceRef,
            sourceRawSha256: site.sourceRawSha256,
          }),
        },
        sha,
      );
      state = run.state;
      head++;
      return {
        site,
        id,
        from,
        until,
        fingerprint: run.frame.command.fingerprint,
      };
    },
    work(
      run: {
        site: IndustryFirstDayWorkSiteSource;
        id: string;
        from: string;
        until: string;
        fingerprint: string;
      },
      absolute = run.site.positions[0]!.startOrdinal,
    ) {
      const p = run.site.positions[0]!,
        duration = (BigInt(run.until) - BigInt(run.from)).toString();
      const step = prepareIndustryFirstDayWorkFrame(
        {
          state,
          head: { worldVersion: String(head), eventSequence: String(head) },
          observedAtReal: at,
          command: command(
            'WORK_' + run.id,
            'CORE_INDUSTRY_FIRST_DAY_WORK_V1',
            run.until,
            {
              schemaVersion: 'postwar-industry-work-command-v1',
              runId: run.id,
              scheduleCommandFingerprint: run.fingerprint,
              allocations: [
                {
                  positionId: p.positionId,
                  poolId: p.poolId,
                  regionId: p.regionId,
                  cohortRef: p.cohortRef,
                  populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1',
                  sourceStartOrdinal: (
                    BigInt(p.sourceStartOrdinal) +
                    BigInt(absolute) -
                    BigInt(p.startOrdinal)
                  ).toString(),
                  startOrdinal: absolute,
                  count: '1',
                  skill: p.skill,
                  startsAtSimTime: run.from,
                  endsAtSimTime: run.until,
                  personMilliseconds: duration,
                  personMinutes: { numerator: duration, denominator: '60000' },
                },
              ],
            },
            true,
          ),
        },
        sha,
      );
      state = step.state;
      head++;
      return step;
    },
  };
}
describe('adopted water staffing from actual same-OP power personnel', () => {
  it('pins the explicit adoption and retains exact people, skills and source wages without inventing water productivity', async () => {
    const f = fixture(),
      adoption = await readFile(
        new URL(
          '../../' + POSTWAR_WATER_STAFF_POLICY.userAdoptionPath,
          import.meta.url,
        ),
        'utf8',
      );
    expect(sha(adoption)).toBe(
      POSTWAR_WATER_STAFF_POLICY.userAdoptionRawSha256,
    );
    expect(f.water.siteSource.positions).toEqual(f.power.siteSource.positions);
    expect(f.water.siteSource.facilityId).toBe(
      'UTILITY_WATER_OPEN-02-REFINED_FUEL',
    );
    expect(f.water.siteSource.capacityPerSimDay).toBe('3');
    expect(f.water.siteSource.outputUnit).toBe('person-day');
    const raw = JSON.parse(f.water.firstdayOriginal.rawText);
    expect(raw.sourcePositions).toEqual(f.input.sourcePositions);
    expect(raw.staffSourceObjectId).toBe(f.input.scope.storageId);
    expect(raw.userAdoptionRawSha256).toBe(sha(adoption));
    expect(f.water.firstdayOriginal.data.staffingPolicy).toEqual(
      POSTWAR_WATER_STAFF_POLICY,
    );
    expect(f.water.firstdayOriginal.data).not.toHaveProperty('recipe');
    expect(POSTWAR_WATER_STAFF_POLICY.volumeBasedLabourCoefficient).toBeNull();
  });
  it('refuses foreign OP staff, missing wages and empty real crews', () => {
    const f = fixture();
    expect(() =>
      derivePostwarIndustryWaterServiceSiteData({
        ...f.input,
        scope: { ...f.input.scope, operatorId: 'FOREIGN_OP' },
      }),
    ).toThrow(/POSITION_SET_MISSING/);
    expect(() =>
      derivePostwarIndustryWaterServiceSiteData({
        ...f.input,
        wagePositions: [],
      }),
    ).toThrow(/WAGE_PEOPLE_FUNDING_JOIN/);
    expect(() =>
      derivePostwarIndustryWaterServiceSiteData({
        ...f.input,
        sourcePositions: [],
      }),
    ).toThrow(/POSITION_SET_MISSING/);
    expect(() =>
      projectPostwarIndustryWaterServiceSource({
        baseline: {} as never,
        preparation: {} as never,
      }),
    ).toThrow();
  });
  it('shares person identity across water and power; overlapping duties reject while a different unoccupied person succeeds', () => {
    const { power, water } = fixture(),
      h = harness([power.siteSource, water.siteSource]);
    const a = h.schedule(power.siteSource, 'POWER_RUN', '0', '28800', '0.001'),
      b = h.schedule(water.siteSource, 'WATER_RUN', '0', '28800', '0.001');
    h.work(a);
    expect(() => h.work(b)).toThrow('WORKER_TIME_ALREADY_BOOKED');
    const w = h.work(b, '1');
    expect(readIndustryCompletedWork(w.work!).data.facilityId).toBe(
      water.siteSource.facilityId,
    );
    expect(w.frame.financialPostingBatches).toHaveLength(0);
    expect(w.frame.inventoryPostings).toHaveLength(0);
  });
  it('enforces the shared 480-minute daily limit across sequential power and water services', () => {
    const { power, water } = fixture(),
      h = harness([power.siteSource, water.siteSource]);
    const a = h.schedule(
        power.siteSource,
        'FULL_DAY_POWER',
        '0',
        '28800000',
        '1',
      ),
      b = h.schedule(
        water.siteSource,
        'EXTRA_WATER',
        '28800000',
        '28828800',
        '0.001',
      );
    h.work(a);
    expect(() => h.work(b)).toThrow('FIRST_DAY_WORKER_480_MINUTES_EXCEEDED');
  });
});
