import { describe, expect, it } from 'vitest';
import {
  FIXED_INPUT,
  SOURCE_PINS,
  projectCountry01FoodReference,
  readFixedFoodReferenceSources,
} from '../../tools/unknown2544-g-food-floor/input-reference.mjs';

// Genuine pinned scenario bytes; they remain authored, unadopted references.
const sourceBuffers = readFixedFoodReferenceSources();
const input = () => structuredClone(FIXED_INPUT);
type ObjectValue = Record<string, unknown>;
function changed(path: string, value: unknown) {
  const draft = input();
  const tokens = path.split('/');
  const key = tokens.pop()!;
  let target = draft as unknown as ObjectValue;
  for (const token of tokens) target = target[token] as ObjectValue;
  target[key] = value;
  return draft;
}
function project(draft = input(), sources = sourceBuffers) {
  return projectCountry01FoodReference({
    input: draft,
    sourceBuffers: sources,
  });
}

describe('fixed C01 food reference input, never an actual floor', () => {
  it('validates real pinned references and derives the exact lexical total', () => {
    const result = project();
    expect(result.status).toBe(
      'REFERENCE_INPUT_VALIDATED_NOT_ACTUAL_FOOD_FLOOR',
    );
    expect(result.originClass).toBe('CONSTRUCTED_NOT_ADOPTED');
    expect(result.originalId).toBe(
      'U2544::COUNTRY::COUNTRY_01::protectedServiceFloor',
    );
    expect(result.originalUnit).toBe('VERSIONED_SERVICE_RULE');
    expect(result.originalValue).toBeNull();
    expect(result.referencePlanningLoad).toEqual({
      value: '70337.8993333333262995434',
      unit: 'TONNE',
      basis: 'TOTAL_OVER_DECLARED_INTERVAL',
      rate: '0.0006666666666666666',
      personDays: '105506849',
      exactRational: {
        numerator: '351689496666666631497717',
        denominator: '5000000000000000000',
      },
      normalFloorTarget: null,
      criticalFloorTarget: null,
    });
    expect(result.sourceTrace).toHaveLength(6);
    expect(result.designBinding.manifestSha256).toBe(
      'ea871296dbd0da36333d979c2a86db55a3b38efcc028a50eefd3547b33b27aa1',
    );
    expect(Object.values(result.actual).every((v) => v === null)).toBe(true);
    expect(result.closure).toEqual({
      candidateOriginalValue: null,
      sourceComplete: false,
      engineeringWired: false,
      validationPassed: false,
      formallyAdopted: false,
      sourceAdmitted: false,
      runtimeConnected: false,
      productionAuthority: false,
      qualifiedImports: 0,
      originalFieldsClosed: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.actual)).toBe(true);
    expect(project()).toEqual(result);
  });

  it('requires all six independent pinned buffers, even with the exact template', () => {
    expect(() => project(input(), {})).toThrow(
      'CLOSED_KEYS_MISMATCH:/sourceBuffers',
    );
    expect(() =>
      project(input(), { ...sourceBuffers, adoption: Buffer.from('{}') }),
    ).toThrow('CLOSED_KEYS_MISMATCH:/sourceBuffers');
    expect(() =>
      project(input(), { ...sourceBuffers, countries: sourceBuffers.regions }),
    ).toThrow('SOURCE_BYTES_REQUIRED:countries');
  });

  it('rejects same-length source tampering instead of accepting caller evidence', () => {
    const bytes = Buffer.from(sourceBuffers['commodity-catalog']);
    const index = bytes.indexOf('0.0006666666666666666');
    expect(index).toBeGreaterThan(0);
    bytes[index + 2] = '7'.charCodeAt(0);
    expect(() =>
      project(input(), { ...sourceBuffers, 'commodity-catalog': bytes }),
    ).toThrow('SOURCE_DRIFT:commodity-catalog');
  });

  it('rejects truncated bytes and accepts detached subarray views without mutation', () => {
    const bytes = sourceBuffers.countries;
    expect(() =>
      project(input(), { ...sourceBuffers, countries: bytes.subarray(1) }),
    ).toThrow('SOURCE_BYTES_REQUIRED:countries');
    const backing = Buffer.concat([Buffer.from('x'), bytes, Buffer.from('y')]);
    const before = Buffer.from(backing);
    expect(
      project(input(), {
        ...sourceBuffers,
        countries: backing.subarray(1, -1),
      }),
    ).toEqual(project());
    expect(backing.equals(before)).toBe(true);
  });

  it.each([
    ['schemaVersion', 'G_C01_FOOD_FLOOR_DEMAND_DESIGN_V2'],
    ['originClass', 'ACTUAL'],
    ['originalId', 'U2544::COUNTRY::COUNTRY_02::protectedServiceFloor'],
    ['originalUnit', 'TONNE'],
    ['countryId', 'COUNTRY_02'],
    ['scenarioCountryId', 'visual-territory-02'],
    ['scenarioRegionId', 'visual-territory-02-E1'],
    ['scenarioFacilityReferenceId', 'OPEN-02-GRAIN'],
    ['referenceRate/source/pointer', '/4/finalDemandPerPersonDay'],
    ['referenceRate/source/sha256', '0'.repeat(64)],
    ['planningCoverage/sourceRefs/0/bytes', 1],
  ])('rejects changed identity/version/source binding %s', (path, value) => {
    expect(() => project(changed(path, value))).toThrow();
  });

  it.each([
    ['planningPeriod/from', '1'],
    ['planningPeriod/until', '0'],
    ['planningPeriod/until', '-1'],
    ['planningPeriod/until', '2'],
    ['planningPeriod/until', 1],
    ['planningPeriod/calendar', 'ACTUAL_WORLD'],
    ['planningPeriod/worldBinding', 'WORLD_01'],
  ])(
    'rejects invalid or out-of-version relative period %s=%s',
    (path, value) => {
      expect(() => project(changed(path, value))).toThrow();
    },
  );

  it.each([
    ['referenceRate/value', 0.0006666666666666666],
    ['referenceRate/value', '1/1500'],
    ['referenceRate/value', '0.0006666666666666667'],
    ['planningLoad/value', 70337.89933333333],
    ['planningLoad/value', '70337.89933333333'],
    ['planningLoad/value', '202638.900682'],
    ['planningLoad/value', '176207.739724'],
    ['planningLoad/unit', 'NATIVE_MONEY'],
    ['planningCoverage/personDays', '0'],
    ['planningLoad/exactRational/denominator', '0'],
    ['planningLoad/exactRational/numerator', '1'],
  ])(
    'rejects float/rate/capacity/plan/unit/arithmetic substitution %s',
    (path, value) => {
      expect(() => project(changed(path, value))).toThrow();
    },
  );

  it.each([
    'actualTargetTonnes',
    'actualDuePersonDays',
    'completedDeliveryTonnes',
    'qualifiedCreditedTonnes',
    'pendingDueCoverage',
    'unmetTonnes',
  ])('rejects actual zero at %s instead of filling a missing fact', (key) => {
    expect(() => project(changed(`actual/${key}`, '0'))).toThrow(
      `ACTUAL_VALUE_PROHIBITED:${key}`,
    );
  });

  it.each([
    ['policySelection/normalRateOrBasket', '0.0006666666666666666'],
    ['policySelection/criticalRateOrBasket', '0'],
    ['planningLoad/normalFloorTarget', '70337.8993333333262995434'],
    ['planningLoad/criticalFloorTarget', '0'],
    ['actual/adoptionEvidence', { approved: true }],
    ['actual/qualityMeasurementOrAcceptance', { safe: true }],
    ['actual/worldId', 'WORLD_01'],
    ['actual/periodOrValueDate', '[0,1)'],
    ['closure/sourceComplete', true],
    ['closure/engineeringWired', true],
    ['closure/validationPassed', true],
    ['closure/formallyAdopted', true],
    ['closure/sourceAdmitted', true],
    ['closure/runtimeConnected', true],
    ['closure/productionAuthority', true],
    ['closure/originalFieldsClosed', 1],
  ])('rejects policy/actual/authority promotion %s', (path, value) => {
    expect(() => project(changed(path, value))).toThrow();
  });

  it('rejects extra input keys, omitted nulls and caller hash overrides', () => {
    const extra = { ...input(), accepted: true };
    expect(() => project(extra)).toThrow('CLOSED_KEYS_MISMATCH:/input');
    const missing = input() as unknown as ObjectValue;
    delete missing.actual;
    expect(() =>
      projectCountry01FoodReference({ input: missing, sourceBuffers }),
    ).toThrow('CLOSED_KEYS_MISMATCH:/input');
    expect(() =>
      projectCountry01FoodReference({
        input: input(),
        sourceBuffers,
        pins: SOURCE_PINS,
      }),
    ).toThrow('CLOSED_KEYS_MISMATCH:/request');
  });
});
