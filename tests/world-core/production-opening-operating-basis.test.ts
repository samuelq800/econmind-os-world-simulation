/** Pure Core contracts against the actual adopted rule bytes. These TEST_ONLY
 * source records are not native custody, maintenance, payment or licenses. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  assertProductionOpeningBasisScope,
  assertProductionOperatingBasis,
  INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
  INDUSTRY_FIRST_DAY_POLICY_VERSION,
  INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
  PRODUCTION_OPENING_SERVICEABILITY_BASIS,
  type ProductionOpeningBasisSource,
} from '../../packages/core/src/inventory/production-operating-basis.js';
import { canonicalSerialize } from '../../packages/core/src/serialization/canonical.js';
type Input = Parameters<typeof assertProductionOperatingBasis>[0];
const scope = {
  worldId: 'WORLD_TEST_ONLY_INDUSTRY',
  countryId: 'COUNTRY_TEST_ONLY_INDUSTRY',
  facilityRef: 'FACILITY.TEST_ONLY.REFINERY',
  operatorId: 'OP_TEST_ONLY_INDUSTRY',
  seedId: 'SEED_TEST_ONLY_INDUSTRY',
  seedFingerprint: 'sha256:' + 'a'.repeat(64),
};
function fixture(): Input {
  const source: ProductionOpeningBasisSource = {
    ...scope,
    schemaVersion: 'postwar-industry-first-day-basis-v1',
    policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
    policyRawSha256: INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
    userAdoptionRawSha256: INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
    sourceRef: 'SOURCE.TEST_ONLY.PHYSICAL',
    sourceRawSha256: 'b'.repeat(64),
    sourcePointer: 'TEST_ONLY.facilities[REFINERY].conditionFraction',
    rightsScope: 'DOMESTIC_EXISTING_UNFRAGMENTED_OP_AGGREGATE',
    openingWindowStartsAtSimTime: '0',
    openingWindowEndsAtSimTime: '86400000',
  };
  const productivity = { amount: '1', inputUnit: 'tonne', outputUnit: 'tonne' };
  const recipeCanonicalPayload = canonicalSerialize({
    facilityRef: scope.facilityRef,
    materials: [{ materialRef: 'CRUDE.TEST_ONLY', amount: '1' }],
  });
  return {
    scope,
    snapshotAt: { amount: '1000', unit: 'sim_millisecond' },
    operatingDuration: { amount: '1', unit: 'hour' },
    recipeFactRef: 'FACT.TEST_ONLY.RECIPE',
    recipeSourceRef: 'SOURCE.TEST_ONLY.RECIPE',
    recipeCanonicalPayload,
    productivity,
    operating: {
      maintenanceAppliedRef: null,
      maintenanceBasis: PRODUCTION_OPENING_SERVICEABILITY_BASIS,
      openingServiceability: { ...source, originalConditionFraction: '1' },
      technologyRightRef: null,
      baselineTechnologyNonrequirement: {
        ...source,
        sourcePointer: 'TEST_ONLY.recipe.baseline',
        basis: 'EXISTING_SITE_REFINERY_RECIPE_COEFFICIENTS',
        recipeFactRef: 'FACT.TEST_ONLY.RECIPE',
        recipeSourceRef: 'SOURCE.TEST_ONLY.RECIPE',
        recipeCanonicalPayload,
        baselineProductivity: productivity,
        baselineRequiredTechnologyRightRefs: [],
        excludedUpgradeTechnologyRefs: ['FRONTIER.PROPOSED.NOT_GRANTED'],
      },
    },
  };
}
const opening = (f: Input) => f.operating.openingServiceability!;
const baseline = (f: Input) => f.operating.baselineTechnologyNonrequirement!;
describe('adopted bounded first-day Industry operating evidence', () => {
  it('pins the actual policy and original user answer bytes', async () => {
    for (const [p, expected] of [
      [
        'config/postwar-genesis/industry-first-day.v1.json',
        INDUSTRY_FIRST_DAY_POLICY_RAW_SHA256,
      ],
      [
        'docs/governance/owner-inputs/2026-11-01/INDUSTRY_FIRST_DAY_USER_ADOPTION.original.json',
        INDUSTRY_FIRST_DAY_USER_ADOPTION_RAW_SHA256,
      ],
    ])
      expect(
        createHash('sha256')
          .update(await readFile(new URL('../../' + p, import.meta.url)))
          .digest('hex'),
      ).toBe(expected);
  });
  it('keeps opening serviceability and baseline nonrequirement distinct from completed work or rights', () => {
    const f = fixture();
    expect(() => assertProductionOperatingBasis(f)).not.toThrow();
    expect(f.operating.maintenanceAppliedRef).toBeNull();
    expect(f.operating.technologyRightRef).toBeNull();
    expect(baseline(f).excludedUpgradeTechnologyRefs).toEqual([
      'FRONTIER.PROPOSED.NOT_GRANTED',
    ]);
    expect(() =>
      assertProductionOpeningBasisScope(opening(f), scope),
    ).not.toThrow();
  });
  it('preserves the legacy actual-maintenance/technology-right path outside the opening window', () => {
    expect(() =>
      assertProductionOperatingBasis({
        ...fixture(),
        snapshotAt: { amount: '172800000', unit: 'sim_millisecond' },
        operating: {
          maintenanceAppliedRef: 'MAINTENANCE.ACTUAL',
          technologyRightRef: 'TECHNOLOGY.RIGHT.ACTUAL',
        },
      }),
    ).not.toThrow();
  });
  it('allows the exact last complete interval and rejects a one-tick overrun or future day', () => {
    const f = fixture();
    expect(() =>
      assertProductionOperatingBasis({
        ...f,
        snapshotAt: { amount: '82800000', unit: 'sim_millisecond' },
      }),
    ).not.toThrow();
    for (const at of ['82800001', '86400000', '172800000'])
      expect(() =>
        assertProductionOperatingBasis({
          ...f,
          snapshotAt: { amount: at, unit: 'sim_millisecond' },
        }),
      ).toThrow('first simulation-day');
  });
  const corruptions: readonly [string, (f: Input) => unknown][] = [
    [
      'non-serviceable condition',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            originalConditionFraction: '0.999',
          },
        },
      }),
    ],
    [
      'decimal alias for original one',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            originalConditionFraction: '1.0',
          },
        },
      }),
    ],
    [
      'wrong adopted policy',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            policyRawSha256: 'c'.repeat(64),
          },
        },
      }),
    ],
    [
      'wrong user original',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            userAdoptionRawSha256: 'c'.repeat(64),
          },
        },
      }),
    ],
    [
      'shifted opening window',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            openingWindowStartsAtSimTime: '1000',
          },
        },
      }),
    ],
    [
      'extended opening window',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            openingWindowEndsAtSimTime: '172800000',
          },
        },
      }),
    ],
    [
      'cross facility',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            facilityRef: 'OTHER.FACILITY',
          },
        },
      }),
    ],
    [
      'cross country',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: { ...opening(f), countryId: 'OTHER_COUNTRY' },
        },
      }),
    ],
    [
      'cross operator',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            operatorId: 'OTHER_OPERATOR',
          },
        },
      }),
    ],
    [
      'mixed seed pins',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            seedId: 'OTHER_SEED',
          },
        },
      }),
    ],
    [
      'finer private rights',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          openingServiceability: {
            ...opening(f),
            rightsScope: 'PRIVATE_FRAGMENTED',
          },
        },
      }),
    ],
    [
      'missing maintenance basis',
      (f) => ({
        ...f,
        operating: { ...f.operating, maintenanceBasis: undefined },
      }),
    ],
    [
      'fabricated completed maintenance',
      (f) => ({
        ...f,
        operating: { ...f.operating, maintenanceAppliedRef: 'FAKE.COMPLETED' },
      }),
    ],
    [
      'fabricated technology right',
      (f) => ({
        ...f,
        operating: { ...f.operating, technologyRightRef: 'FAKE.MASTERED' },
      }),
    ],
    [
      'explicit required right',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            baselineRequiredTechnologyRightRefs: ['ACTUAL.REQUIRED.LICENSE'],
          },
        },
      }),
    ],
    [
      'efficiency upgrade',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            baselineProductivity: { ...f.productivity, amount: '2' },
          },
        },
      }),
    ],
    [
      'upgraded source and claimed baseline together',
      (f) => ({
        ...f,
        productivity: { ...f.productivity, amount: '2' },
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            baselineProductivity: { ...f.productivity, amount: '2' },
          },
        },
      }),
    ],
    [
      'implicit cross-unit baseline conversion',
      (f) => ({
        ...f,
        productivity: { ...f.productivity, inputUnit: 'kg' },
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            baselineProductivity: { ...f.productivity, inputUnit: 'kg' },
          },
        },
      }),
    ],
    [
      'different recipe bytes',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            recipeCanonicalPayload: '{}',
          },
        },
      }),
    ],
    [
      'different recipe source',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            recipeSourceRef: 'OTHER.RECIPE',
          },
        },
      }),
    ],
    [
      'false mastered field',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            technologyState: 'MASTERED',
          },
        },
      }),
    ],
    [
      'duplicate excluded proposal',
      (f) => ({
        ...f,
        operating: {
          ...f.operating,
          baselineTechnologyNonrequirement: {
            ...baseline(f),
            excludedUpgradeTechnologyRefs: ['A.PROPOSED', 'A.PROPOSED'],
          },
        },
      }),
    ],
    [
      'unknown time unit',
      (f) => ({ ...f, operatingDuration: { amount: '1', unit: 'period' } }),
    ],
    [
      'fractional millisecond interval',
      (f) => ({
        ...f,
        operatingDuration: { amount: '0.0000001', unit: 'hour' },
      }),
    ],
  ];
  it.each(corruptions)('fails closed for %s', (_name, change) => {
    // Deliberately malformed untrusted evidence enters the real runtime validator.
    expect(() =>
      assertProductionOperatingBasis(change(fixture()) as Input),
    ).toThrow();
  });
  it('requires actual native source seed pins even when two caller records agree', () => {
    const f = fixture();
    expect(() =>
      assertProductionOpeningBasisScope(opening(f), {
        ...scope,
        seedFingerprint: 'sha256:' + 'c'.repeat(64),
      }),
    ).toThrow('scope/seed');
  });
});
