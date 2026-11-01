/** Explicitly adopted scenario DATA only; no actual source/grant/operation,
 * electricity consumption, payment, output or registered Clock is issued. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  INDUSTRY_FIRST_DAY_WATER_SCENARIO_POLICY as POLICY,
  createIndustryFirstDayWaterScenario,
  readIndustryFirstDayWaterScenarioProfiles,
  calculateIndustryFirstDayWaterScenarioPeriod,
  replayIndustryFirstDayWaterScenarioPeriod,
  type IndustryWaterScenarioDemand,
  type IndustryWaterScenarioOperation,
  type IndustryWaterScenarioState,
} from '../../packages/core/src/water/industry-first-day-scenario.js';
import {
  addWater,
  compareWater,
  scaleWater,
  sumWater,
  volumeFromDecimal,
  waterFraction,
  waterVolume,
} from '../../packages/core/src/water/exact-volume.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const paths = {
  allocations:
    'artifacts/world-balanced-candidate-v1/data/water-allocations.json',
  population:
    'artifacts/world-balanced-candidate-v1/data/population-services.json',
  seasonal: 'artifacts/world-balanced-candidate-v1/data/seasonal-water.json',
  geography: 'artifacts/world-balanced-candidate-v1/data/geography.json',
  regions: 'artifacts/world-balanced-candidate-v1/data/regions.json',
  countries: 'artifacts/world-balanced-candidate-v1/data/countries.json',
  facilities: 'artifacts/world-balanced-candidate-v1/data/facilities.json',
  recipes: 'artifacts/world-balanced-candidate-v1/data/recipes.json',
  utilityPolicy: 'config/postwar-genesis/utilities.v1.json',
} as const;
const raw = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([k, p]) => [
      k,
      await readFile(new URL('../../' + p, import.meta.url), 'utf8'),
    ]),
  ),
) as Record<keyof typeof paths, string>;
const adoptionRecordBytes = await readFile(
  new URL(
    '../../docs/reports/office-connection/INDUSTRY_UTILITIES_ADOPTION_20261101.json',
    import.meta.url,
  ),
  'utf8',
);
const initial = createIndustryFirstDayWaterScenario(
  {
    modelRef: 'MODEL_TEST_ONLY_ADOPTED_INDUSTRY_WATER',
    raw,
    adoptionRecordBytes,
    year: '2026',
    month: '7',
  },
  sha,
);
function demand(
  run = 'RUN_SCENARIO_TEST_1',
  amount = '1',
): IndustryWaterScenarioDemand {
  return {
    demandRef: 'DEMAND_' + run,
    sourceCountryId: 'visual-territory-02',
    sourceRegionId: 'visual-territory-02-E1',
    sourceOperatorId: 'OP-02',
    facilityId: 'OPEN-02-REFINED_FUEL',
    runId: run,
    requestedOutputAmount: amount,
  };
}
function operation(
  state: Readonly<IndustryWaterScenarioState>,
  id = 'OPERATION_SCENARIO_TEST_1',
  until = '28800000',
  d: readonly IndustryWaterScenarioDemand[] = [demand()],
): IndustryWaterScenarioOperation {
  return {
    operationRef: id,
    predecessorRef: state.predecessorRef,
    untilTicks: until,
    observedAtTicks: until,
    demands: d,
    additionalProtectedClaims: [],
  };
}
describe('adopted first-day industrial nonpotable scenario mathematics', () => {
  it('pins the actual user transcription and unchanged raw sources, without treating adoption as source or physical calibration', () => {
    expect(sha(adoptionRecordBytes)).toBe(POLICY.userAdoptionSha256);
    expect(POLICY.additionalElectricityPerAbstractedM3).toBe('0.1');
    expect(POLICY.physicalPumpingCalibration).toBe(
      'UNCALIBRATED_NOT_MEASURED_NOT_ENGINEERING_UPPER_BOUND',
    );
    expect(POLICY.rawPlantRecipeWaterMeteringMeaning).toBe('UNKNOWN_UNCHANGED');
    expect(POLICY.rawPlantRecipeElectricityIncludesWaterUtilities).toBe(
      'UNKNOWN_UNCHANGED',
    );
    expect(() =>
      createIndustryFirstDayWaterScenario(
        {
          modelRef: 'MODEL_TEST',
          raw,
          adoptionRecordBytes: adoptionRecordBytes + ' ',
          year: '2026',
          month: '7',
        },
        sha,
      ),
    ).toThrow('transcription');
    expect(() =>
      createIndustryFirstDayWaterScenario(
        {
          modelRef: 'MODEL_TEST',
          raw: { ...raw, regions: raw.regions + ' ' },
          adoptionRecordBytes,
          year: '2026',
          month: '7',
        },
        sha,
      ),
    ).toThrow('source drift');
    expect(() =>
      readIndustryFirstDayWaterScenarioProfiles({ ...initial }),
    ).toThrow('genuine DATA state');
  });
  it('reproduces disclosed C2 profile and about5.44-times electricity exactly, keeping abstracted/delivered/rejected and energy lines separate', () => {
    const p = readIndustryFirstDayWaterScenarioProfiles(initial).profiles.find(
      (x) => x.sourceRegionId === 'visual-territory-02-E1',
    )!;
    expect(p.treatmentBps).toBe('4618');
    expect(p.qualityBps).toBe('6101');
    expect(p.simulatedFraction).toEqual(waterFraction('14087209', '50000000'));
    const op = operation(initial),
      result = calculateIndustryFirstDayWaterScenarioPeriod(
        { state: initial, operation: op },
        sha,
      ),
      line = result.record.lines[0]!;
    expect(line.outputUnit).toBe('barrel equivalent');
    expect(line.originalRecipeWaterUnit).toBe('m3/barrel equivalent');
    expect(line.originalRecipeElectricityUnit).toBe('MWh/barrel equivalent');
    expect(line.requestedDelivered).toEqual(volumeFromDecimal('0.1'));
    expect(line.deliveredModelQuantity).toEqual(line.requestedDelivered);
    expect(line.abstracted).toEqual(waterVolume('5000000', '14087209'));
    expect(
      addWater(
        line.deliveredModelQuantity,
        line.modelUnavailableAfterAbstraction,
      ),
    ).toEqual(line.abstracted);
    expect(line.additionalWaterElectricityRequirement).toEqual({
      numerator: '500000',
      denominator: '14087209',
      unit: 'MWh',
    });
    expect(line.originalPlantElectricityForSupportedOutput).toEqual({
      numerator: '1',
      denominator: '125',
      unit: 'MWh',
    });
    expect(line.combinedScenarioElectricityRequirement).toEqual({
      numerator: '76587209',
      denominator: '1760901125',
      unit: 'MWh',
    });
    expect(line.unservedRequest.numerator).toBe('0');
    expect(
      replayIndustryFirstDayWaterScenarioPeriod(
        { state: initial, operation: op, record: result.record },
        sha,
      ).record,
    ).toEqual(result.record);
    expect(() =>
      replayIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: op,
          record: {
            ...result.record,
            additionalWaterElectricityRequirement: {
              numerator: '0',
              denominator: '1',
              unit: 'MWh',
            },
          },
        },
        sha,
      ),
    ).toThrow('complete exact');
  });
  it('does not book a repeated RUN twice, preserves later state on retry, and rejects changed original scope or output', () => {
    const op = operation(initial),
      first = calculateIndustryFirstDayWaterScenarioPeriod(
        { state: initial, operation: op },
        sha,
      );
    const second = calculateIndustryFirstDayWaterScenarioPeriod(
      {
        state: first.state,
        operation: operation(first.state, 'OPERATION_TWO', '57600000', [
          demand('RUN_TWO'),
        ]),
      },
      sha,
    );
    const repeated = calculateIndustryFirstDayWaterScenarioPeriod(
      { state: second.state, operation: op },
      sha,
    );
    expect(repeated.replayed).toBe(true);
    expect(repeated.state).toBe(second.state);
    expect(repeated.record).toBe(first.record);
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: first.state,
          operation: operation(first.state, 'NEW_ID_SAME_RUN', '57600000'),
        },
        sha,
      ),
    ).toThrow('already satisfied');
    const partial = calculateIndustryFirstDayWaterScenarioPeriod(
      {
        state: initial,
        operation: operation(initial, 'PARTIAL', '43200000', [
          demand('HUGE_RUN', '1000000000'),
        ]),
      },
      sha,
    );
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: partial.state,
          operation: operation(partial.state, 'CHANGED_RUN', '86400000', [
            demand('HUGE_RUN', '2'),
          ]),
        },
        sha,
      ),
    ).toThrow('original demand cannot change');
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: {
            ...op,
            demands: [{ ...demand(), sourceOperatorId: 'OP-01' }],
          },
        },
        sha,
      ),
    ).toThrow('operator/region');
  });
  it('splits time without increasing the daily source budget, and never treats unserved demand as delivery', () => {
    const huge = [demand('HUGE_RUN', '1000000000')],
      half = calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: operation(initial, 'HALF_A', '43200000', huge),
        },
        sha,
      ),
      next = calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: half.state,
          operation: operation(half.state, 'HALF_B', '86400000', huge),
        },
        sha,
      ),
      whole = calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: operation(initial, 'WHOLE', '86400000', huge),
        },
        sha,
      );
    expect(next.state.abstracted).toEqual(whole.state.abstracted);
    expect(next.state.deliveredModelQuantity).toEqual(
      whole.state.deliveredModelQuantity,
    );
    expect(next.state.additionalWaterElectricityRequirement).toEqual(
      whole.state.additionalWaterElectricityRequirement,
    );
    expect(whole.record.unservedRequest.numerator).not.toBe('0');
    expect(
      addWater(
        whole.record.lines[0]!.deliveredModelQuantity,
        whole.record.lines[0]!.unservedRequest,
      ),
    ).toEqual(whole.record.lines[0]!.requestedDelivered);
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: half.state,
          operation: operation(half.state, 'OVERLAP', '43200000', [
            demand('OTHER'),
          ]),
        },
        sha,
      ),
    ).toThrow('ordered');
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: { ...operation(initial), observedAtTicks: '0' },
        },
        sha,
      ),
    ).toThrow('elapsed');
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: operation(initial, 'NEXT_DAY', '86400001'),
        },
        sha,
      ),
    ).toThrow('first-day');
  });
  it('protects explicit additional public reservations before industrial withdrawals, including exact rational claims', () => {
    const op = operation(initial, 'PUBLIC_PRIORITY', '86400000');
    const protectedOp = {
      ...op,
      additionalProtectedClaims: [
        {
          claimRef: 'CURRENT_RIGHT_DATA_REQUIRED_BY_RUNTIME',
          sourceRegionId: 'visual-territory-02-E1',
          rawReserved: volumeFromDecimal('999999999999'),
        },
      ],
    };
    const r = calculateIndustryFirstDayWaterScenarioPeriod(
      { state: initial, operation: protectedOp },
      sha,
    );
    expect(r.record.abstracted.numerator).toBe('0');
    expect(r.record.unservedRequest).toEqual(volumeFromDecimal('0.1'));
    expect(r.record.additionalProtectedClaims).toEqual(
      protectedOp.additionalProtectedClaims,
    );
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: {
            ...protectedOp,
            additionalProtectedClaims: [
              ...protectedOp.additionalProtectedClaims,
              ...protectedOp.additionalProtectedClaims,
            ],
          },
        },
        sha,
      ),
    ).toThrow('duplicate protected claim');
    const partial = calculateIndustryFirstDayWaterScenarioPeriod(
      {
        state: initial,
        operation: {
          ...op,
          additionalProtectedClaims: [
            {
              claimRef: 'EXACT_RATIONAL_PUBLIC_CLAIM',
              sourceRegionId: 'visual-territory-02-E1',
              rawReserved: waterVolume('1', '3'),
            },
          ],
        },
      },
      sha,
    );
    expect(partial.record.additionalProtectedClaims[0]!.rawReserved).toEqual(
      waterVolume('1', '3'),
    );
  });
  it('collects all refinery regions in one shared interval, respects every basin and allocates same-region scarcity proportionally', () => {
    const p = readIndustryFirstDayWaterScenarioProfiles(initial);
    const all = p.targets.map((t, i) => ({
      demandRef: 'DEMAND_' + i,
      sourceCountryId: t.sourceCountryId,
      sourceRegionId: t.sourceRegionId,
      sourceOperatorId: t.sourceOperatorId,
      facilityId: t.id,
      runId: 'RUN_' + i,
      requestedOutputAmount: '1000000000',
    }));
    const result = calculateIndustryFirstDayWaterScenarioPeriod(
      {
        state: initial,
        operation: operation(initial, 'ALL_REGIONS', '86400000', all),
      },
      sha,
    );
    expect(result.record.lines).toHaveLength(all.length);
    expect(
      addWater(
        result.record.deliveredModelQuantity,
        result.record.modelUnavailableAfterAbstraction,
      ),
    ).toEqual(result.record.abstracted);
    for (const region of p.profiles) {
      const ls = result.record.lines.filter(
        (l) => l.demand.sourceRegionId === region.sourceRegionId,
      );
      expect(
        compareWater(
          sumWater(ls.map((x) => x.abstracted)),
          region.dailyRawLimit,
        ),
      ).toBeLessThanOrEqual(0);
    }
    const same = calculateIndustryFirstDayWaterScenarioPeriod(
      {
        state: initial,
        operation: operation(initial, 'SAME_REGION', '86400000', [
          demand('A', '1000000000'),
          demand('B', '2000000000'),
        ]),
      },
      sha,
    );
    expect(
      scaleWater(same.record.lines[0]!.abstracted, waterFraction('2', '1')),
    ).toEqual(same.record.lines[1]!.abstracted);
    expect(() =>
      calculateIndustryFirstDayWaterScenarioPeriod(
        {
          state: initial,
          operation: { ...operation(initial), demands: [demand(), demand()] },
        },
        sha,
      ),
    ).toThrow('duplicate');
  });
});
