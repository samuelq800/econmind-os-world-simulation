import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseExistingDataInventory,
  prepareExistingDataSeedClosure,
  V27_V29_EXISTING_DATA_CLOSURE_STATUS,
} from '../../packages/core/src/calibration/existing-data-seed-closure.js';
import {
  V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
  V27_2_REQUIRED_COUNTRY_COUNT_VALUE,
} from '../../packages/core/src/calibration/country-input-closure.js';
import {
  COUNTRY_SEED_PROVENANCE_SCHEMA,
  parseCountrySeedProvenance,
  type CountrySeedDomain,
} from '../../packages/core/src/opening/country-seed-provenance-preparation.js';

const sha256Hex = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const inventoryPath = resolve(
  'docs/reports/V27_V29_EXISTING_DATA_CLOSURE/EXISTING_DATA_INVENTORY.json',
);

function inventory(): Record<string, unknown> {
  return JSON.parse(readFileSync(inventoryPath, 'utf8')) as Record<
    string,
    unknown
  >;
}

const domains: readonly CountrySeedDomain[] = [
  'POPULATION',
  'RESOURCES',
  'FACILITIES',
  'TECHNOLOGY',
  'ACCOUNTS',
  'TRADE_DEPENDENCY',
];

function missingField(
  domain: CountrySeedDomain,
  counterpartyCountryId: string | null,
) {
  const numeric = {
    POPULATION: ['COUNT', 'person'],
    RESOURCES: ['QUANTITY', 'tonne'],
    FACILITIES: ['QUANTITY', 'tonne_per_day'],
    TECHNOLOGY: ['COUNT', 'license'],
    ACCOUNTS: ['MONEY', 'GCU'],
    TRADE_DEPENDENCY: ['SHARE', 'ratio'],
  } as const;
  const [numericKind, unit] = numeric[domain];
  return {
    status: 'MISSING',
    domain,
    metricRef: `${domain}_BASELINE`,
    subjectRef: null,
    counterpartyCountryId:
      domain === 'TRADE_DEPENDENCY' ? counterpartyCountryId : null,
    numericKind,
    unit,
    reason: 'SOURCE_NOT_AVAILABLE',
    sourceRef: null,
  };
}

function twoCountryProvenance(contentSha256: string) {
  const countryIds = ['COUNTRY_01', 'COUNTRY_02'];
  const input = {
    schemaVersion: COUNTRY_SEED_PROVENANCE_SCHEMA,
    worldId: 'WORLD_SHARED',
    seasonRef: 'SEASON_1',
    configuredCountryIds: countryIds,
    sources: [
      {
        sourceRef: 'SOURCE_EXISTING',
        sourceKind: 'DESIGN_ASSUMPTION',
        locator: 'data/calibration/pilot/normalized_observations.v1.json',
        sourceVersion: 'ABB_CDC_5',
        contentSha256,
        periodRef: null,
        geographyRef: null,
      },
    ],
    countries: countryIds.map((countryId, index) => ({
      countryId,
      fields: domains.map((domain) =>
        missingField(domain, countryIds[index === 0 ? 1 : 0] ?? null),
      ) as Array<Record<string, unknown>>,
    })),
  };
  const facilityIndex = input.countries[0]!.fields.findIndex(
    (field) => field.domain === 'FACILITIES',
  );
  input.countries[0]!.fields[facilityIndex] = {
    status: 'VALUE',
    domain: 'FACILITIES',
    metricRef: 'FACILITY_OPERATIONAL_CAPACITY',
    subjectRef: 'FACILITY_01',
    counterpartyCountryId: null,
    numericKind: 'QUANTITY',
    amount: '8',
    unit: 'tonne_per_day',
    sourceRef: 'SOURCE_EXISTING',
    valueOrigin: 'DESIGN_ASSUMPTION',
    derivationRef: null,
    assumptionRef: 'ASSUMPTION_EXISTING',
  };
  return parseCountrySeedProvenance(input);
}

describe('V27 to V29 existing-data seed closure preparation', () => {
  it('reports the frozen pilot truth and every current blocker without authorizing a seed', () => {
    const result = prepareExistingDataSeedClosure({
      inventory: inventory(),
      provenance: null,
      calibration: null,
      sha256Hex,
    });

    expect(result).toMatchObject({
      preparationStatus: V27_V29_EXISTING_DATA_CLOSURE_STATUS,
      status: 'UNAVAILABLE',
      generationAuthorized: false,
      openingSeedAuthorized: false,
      provenanceCalibration: null,
      hashInput: expect.stringMatching(/^SHA-256\n/u),
    });
    expect(
      Object.fromEntries(
        result.inventory.metrics.map((metric) => [
          metric.metricRef,
          metric.value,
        ]),
      ),
    ).toMatchObject({
      EMPIRICAL_ENTITY_COUNT: '10',
      VARIABLE_COUNT: '10',
      PERIOD_COUNT: '3',
      OBSERVATION_COUNT: '247',
      DISTINCT_OBSERVATION_COUNT: '246',
      EXPLICIT_MISSING_COUNT: '6',
      EXACT_DUPLICATE_COUNT: '1',
      FEATURE_CANDIDATE_COUNT: '19',
      ADMITTED_FEATURE_COUNT: '0',
      CLOSURE_EVIDENCE_BINDING_COUNT: '0',
    });
    expect(
      result.issues.filter((issue) => issue.code === 'EXTERNAL_DATA_GATE_OPEN'),
    ).toHaveLength(7);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'FINAL_GENERATOR_NOT_READY' }),
        expect.objectContaining({
          code: 'FICTIONAL_COUNTRY_MAPPING_UNAUTHORIZED',
        }),
        expect.objectContaining({
          code: 'SOURCE_PROVIDER_GAP',
          sourceRef: 'WTO_TIMESERIES_V1',
        }),
        expect.objectContaining({ code: 'PROVENANCE_INPUT_MISSING' }),
        expect.objectContaining({ code: 'CALIBRATION_INPUT_MISSING' }),
      ]),
    );
  });

  it('canonicalizes inventory order without changing the closure result', () => {
    const first = prepareExistingDataSeedClosure({
      inventory: inventory(),
      provenance: null,
      calibration: null,
      sha256Hex,
    });
    const reversed = inventory();
    for (const key of ['artifacts', 'metrics', 'providerGaps', 'openGates']) {
      (reversed[key] as unknown[]).reverse();
    }
    const second = prepareExistingDataSeedClosure({
      inventory: reversed,
      provenance: null,
      calibration: null,
      sha256Hex,
    });
    expect(second).toEqual(first);
  });

  it('rejects a reported number that is not bound to a frozen artifact', () => {
    const value = inventory();
    const metrics = value.metrics as Array<Record<string, unknown>>;
    metrics[0]!.evidenceArtifactRef = 'UNKNOWN_ARTIFACT';
    expect(() => parseExistingDataInventory(value)).toThrow(
      'metric references an unknown evidence artifact',
    );
  });

  it('rejects a ready claim that conflicts with open gates and provider gaps', () => {
    const value = inventory();
    value.finalGeneratorReady = true;
    expect(() => parseExistingDataInventory(value)).toThrow(
      'finalGeneratorReady conflicts with unresolved evidence',
    );
  });

  it('detects an exact source digest mismatch and a non-70 provenance input', () => {
    const result = prepareExistingDataSeedClosure({
      inventory: inventory(),
      provenance: twoCountryProvenance('b'.repeat(64)),
      calibration: null,
      sha256Hex,
    });
    expect(result.status).toBe('MISMATCH');
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SOURCE_ARTIFACT_MISMATCH',
          severity: 'MISMATCH',
          sourceRef: 'SOURCE_EXISTING',
        }),
        expect.objectContaining({
          code: 'PROVENANCE_COUNTRY_COUNT_MISMATCH',
        }),
      ]),
    );
  });

  it('accepts an exact locator and digest binding without upgrading incomplete coverage', () => {
    const result = prepareExistingDataSeedClosure({
      inventory: inventory(),
      provenance: twoCountryProvenance(
        '2ddf22030106f92b906510b926bf40855e8879e5faca67d43ed9ade31cb6078a',
      ),
      calibration: null,
      sha256Hex,
    });
    expect(result.status).toBe('UNAVAILABLE');
    expect(
      result.issues.some(
        (issue) =>
          issue.code === 'SOURCE_ARTIFACT_MISMATCH' ||
          issue.code === 'SOURCE_ARTIFACT_UNBOUND',
      ),
    ).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'PROVENANCE_COUNTRY_COUNT_MISMATCH',
      }),
    );
  });

  it('reports a structurally valid but incomplete V27.2 candidate', () => {
    const result = prepareExistingDataSeedClosure({
      inventory: inventory(),
      provenance: null,
      calibration: {
        schemaVersion: V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
        expectedCountryCount: V27_2_REQUIRED_COUNTRY_COUNT_VALUE,
        sources: [],
        countries: [],
      },
      sha256Hex,
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'CALIBRATION_INPUT_INCOMPLETE',
        missingFields: ['calibration.candidate'],
      }),
    );
  });
});
