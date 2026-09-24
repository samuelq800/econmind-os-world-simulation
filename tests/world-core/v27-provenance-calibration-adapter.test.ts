import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  connectCountrySeedProvenanceToCalibration,
  V27_PROVENANCE_CALIBRATION_ADAPTER_STATUS,
} from '../../packages/core/src/calibration/country-provenance-adapter.js';
import {
  V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
  V27_2_REQUIRED_COUNTRY_COUNT,
  V27_2_REQUIRED_COUNTRY_COUNT_VALUE,
  v27_2CountryConfigurationRef,
} from '../../packages/core/src/calibration/country-input-closure.js';
import {
  COUNTRY_SEED_PROVENANCE_SCHEMA,
  parseCountrySeedProvenance,
  type CountrySeedDomain,
} from '../../packages/core/src/opening/country-seed-provenance-preparation.js';

const sha256 = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const SOURCE_REF = 'SOURCE_ASSUMPTION';
const ASSUMPTION_REF = 'ASSUMPTION_1';
const SOURCE_HASH = 'a'.repeat(64);
const domains: readonly CountrySeedDomain[] = [
  'POPULATION',
  'RESOURCES',
  'FACILITIES',
  'TECHNOLOGY',
  'ACCOUNTS',
  'TRADE_DEPENDENCY',
];
const domainKinds = {
  POPULATION: ['COUNT', 'person'],
  RESOURCES: ['QUANTITY', 'tonne'],
  FACILITIES: ['COUNT', 'facility'],
  TECHNOLOGY: ['COUNT', 'license'],
  ACCOUNTS: ['MONEY', 'GCU'],
  TRADE_DEPENDENCY: ['SHARE', 'ratio'],
} as const;

function calibratedQuantity(amount: string, unit: string) {
  const token = `${unit}-${amount}`.replace(/[^A-Za-z0-9.-]/gu, '-');
  return {
    amount,
    unit,
    sourceUnit: unit,
    sourceRef: SOURCE_REF,
    assumptionRef: ASSUMPTION_REF,
    changes: [
      {
        changeRef: `change.${token}`,
        before: '0',
        delta: amount,
        after: amount,
        unit,
        sourceRef: SOURCE_REF,
        assumptionRef: ASSUMPTION_REF,
      },
    ],
  };
}

function calibrationCountry(index: number) {
  const suffix = String(index).padStart(2, '0');
  const countryId = `COUNTRY_${suffix}`;
  return {
    countryId,
    archetypeRef: `archetype.fixture-${suffix}`,
    financialBatches: [
      {
        batchRef: `batch.finance-${suffix}`,
        legs: [
          {
            legRef: `leg.cash-${suffix}`,
            accountRef: `account.cash-${suffix}`,
            direction: 'DEBIT',
            quantity: calibratedQuantity('100', 'GCU'),
            counterpartLegRef: `leg.equity-${suffix}`,
          },
          {
            legRef: `leg.equity-${suffix}`,
            accountRef: `account.equity-${suffix}`,
            direction: 'CREDIT',
            quantity: calibratedQuantity('100', 'GCU'),
            counterpartLegRef: `leg.cash-${suffix}`,
          },
        ],
      },
    ],
    inventoryClosures: [
      {
        commodityId: 'GRAIN',
        total: calibratedQuantity('10', 'tonne'),
        buckets: {
          available: calibratedQuantity('4', 'tonne'),
          reserved: calibratedQuantity('3', 'tonne'),
          strategic: calibratedQuantity('2', 'tonne'),
          inTransit: calibratedQuantity('1', 'tonne'),
        },
      },
    ],
    geologicalClosures: [
      {
        resourceId: 'IRON_ORE',
        total: calibratedQuantity('10', 'tonne'),
        layers: {
          undiscovered: calibratedQuantity('2', 'tonne'),
          discoveredUnrecoverable: calibratedQuantity('2', 'tonne'),
          recoverableUndeveloped: calibratedQuantity('2', 'tonne'),
          developedRemaining: calibratedQuantity('2', 'tonne'),
          cumulativeExtracted: calibratedQuantity('2', 'tonne'),
        },
      },
    ],
    facilities: [
      {
        facilityId: `FACILITY_${suffix}`,
        installedCapacity: calibratedQuantity('10', 'tonne_per_day'),
        operationalCapacity: calibratedQuantity('8', 'tonne_per_day'),
        staffRequired: calibratedQuantity('10', 'person'),
        staffAssigned: calibratedQuantity('8', 'person'),
      },
    ],
    supplyChains: [
      {
        commodityId: 'GRAIN',
        supplierShares: [
          {
            supplierCountryId: countryId,
            share: calibratedQuantity('1', 'ratio'),
          },
        ],
      },
    ],
  };
}

function calibrationInput() {
  const countries = Array.from(
    { length: V27_2_REQUIRED_COUNTRY_COUNT },
    (_, index) => calibrationCountry(index + 1),
  );
  const worldId = 'WORLD_SHARED';
  return {
    schemaVersion: V27_2_CALIBRATION_PREPARATION_SCHEMA_VERSION,
    worldId,
    countryConfigurationRef: v27_2CountryConfigurationRef(
      { worldId, countryIds: countries.map((country) => country.countryId) },
      sha256,
    ),
    expectedCountryCount: V27_2_REQUIRED_COUNTRY_COUNT_VALUE,
    sources: [
      {
        sourceRef: SOURCE_REF,
        classification: 'SYNTHETIC_CALIBRATION',
        locator: 'tests/fixtures/source-assumption.json',
        sourceVersion: 'VERSION_1',
        contentHash: `sha256:${SOURCE_HASH}`,
      },
    ],
    countries,
  };
}

function missingField(
  domain: CountrySeedDomain,
  counterpartyCountryId: string | null,
) {
  const [numericKind, unit] = domainKinds[domain];
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

function provenanceInput(count = V27_2_REQUIRED_COUNTRY_COUNT) {
  const configuredCountryIds = Array.from(
    { length: count },
    (_, index) => `COUNTRY_${String(index + 1).padStart(2, '0')}`,
  );
  const input = {
    schemaVersion: COUNTRY_SEED_PROVENANCE_SCHEMA,
    worldId: 'WORLD_SHARED',
    seasonRef: 'SEASON_1',
    configuredCountryIds,
    sources: [
      {
        sourceRef: SOURCE_REF,
        sourceKind: 'DESIGN_ASSUMPTION',
        locator: 'tests/fixtures/source-assumption.json',
        sourceVersion: 'VERSION_1',
        contentSha256: SOURCE_HASH,
        periodRef: null,
        geographyRef: null,
      },
    ],
    countries: configuredCountryIds.map((countryId, index) => ({
      countryId,
      fields: domains.map((domain) =>
        missingField(domain, configuredCountryIds[(index + 1) % count] ?? null),
      ) as Array<Record<string, unknown>>,
    })),
  };
  const first = input.countries[0]!;
  const facilityIndex = first.fields.findIndex(
    (field) => field.domain === 'FACILITIES',
  );
  first.fields[facilityIndex] = {
    status: 'VALUE',
    domain: 'FACILITIES',
    metricRef: 'FACILITY_OPERATIONAL_CAPACITY',
    subjectRef: 'FACILITY_01',
    counterpartyCountryId: null,
    numericKind: 'QUANTITY',
    amount: '8',
    unit: 'tonne_per_day',
    sourceRef: SOURCE_REF,
    valueOrigin: 'DESIGN_ASSUMPTION',
    derivationRef: null,
    assumptionRef: ASSUMPTION_REF,
  };
  return input;
}

function connect(
  provenance = parseCountrySeedProvenance(provenanceInput()),
  calibration: unknown = calibrationInput(),
) {
  return connectCountrySeedProvenanceToCalibration({
    provenance,
    calibration,
    sha256Hex: sha256,
  });
}

describe('V27.1 to V27.2 provenance/calibration adapter', () => {
  it('preserves one exact value and its full causal chain without authorizing generation', () => {
    const result = connect();
    expect(result).toMatchObject({
      preparationStatus: V27_PROVENANCE_CALIBRATION_ADAPTER_STATUS,
      status: 'UNAVAILABLE',
      generationAuthorized: false,
      worldId: 'WORLD_SHARED',
      countryConfigurationRef: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      seasonRef: 'SEASON_1',
      countryCount: '70',
      hashInput: expect.stringMatching(/^SHA-256\n/u),
    });
    expect(result.links).toContainEqual(
      expect.objectContaining({
        countryId: 'COUNTRY_01',
        metricRef: 'FACILITY_OPERATIONAL_CAPACITY',
        calibrationPath: 'facilities.FACILITY_01.operationalCapacity',
        unit: 'tonne_per_day',
        provenanceAmount: '8',
        originalCalibrationAmount: '0',
        finalCalibrationAmount: '8',
        assumptionRef: ASSUMPTION_REF,
        changes: [
          expect.objectContaining({ before: '0', delta: '8', after: '8' }),
        ],
        numericDerivationTrace: {
          sourceRef: SOURCE_REF,
          assumptionRef: ASSUMPTION_REF,
          unit: 'tonne_per_day',
          originalAmount: '0',
          finalAmount: '8',
          changes: [
            expect.objectContaining({ before: '0', delta: '8', after: '8' }),
          ],
        },
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'COUNTRY_CONFIGURATION_AUTHORITY_UNVERIFIED',
        missingFields: ['countryConfiguration.authoritativeSource'],
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(/buff|multiplier|engineMode/iu);
  });

  it('reports source digest mismatch instead of preserving a false link', () => {
    const calibration = calibrationInput();
    calibration.sources[0]!.contentHash = `sha256:${'b'.repeat(64)}`;
    const result = connect(
      parseCountrySeedProvenance(provenanceInput()),
      calibration,
    );
    expect(result.status).toBe('MISMATCH');
    expect(result.links).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'SOURCE_EVIDENCE_MISMATCH' }),
    );
  });

  it('uses verified metric and subject identity instead of an equal-value sibling path', () => {
    const calibration = calibrationInput();
    calibration.countries[0]!.facilities[0]!.installedCapacity =
      calibratedQuantity('8', 'tonne_per_day');
    const result = connect(
      parseCountrySeedProvenance(provenanceInput()),
      calibration,
    );
    expect(result.links).toContainEqual(
      expect.objectContaining({
        metricRef: 'FACILITY_OPERATIONAL_CAPACITY',
        calibrationPath: 'facilities.FACILITY_01.operationalCapacity',
      }),
    );
    expect(result.links).toHaveLength(1);
  });

  it('does not link FACILITY_99 provenance to FACILITY_01 by matching value tuple', () => {
    const raw = provenanceInput();
    const field = raw.countries[0]!.fields.find(
      (candidate) => candidate.domain === 'FACILITIES',
    )!;
    field.subjectRef = 'FACILITY_99';
    const result = connect(parseCountrySeedProvenance(raw));

    expect(result.links).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'CALIBRATION_QUANTITY_UNAVAILABLE',
        metricRef: 'FACILITY_OPERATIONAL_CAPACITY',
        missingFields: ['calibration.metricRef', 'calibration.quantity'],
      }),
    );
  });

  it('does not let a second provenance label claim an already matched structural path', () => {
    const raw = provenanceInput();
    const original = raw.countries[0]!.fields.find(
      (candidate) => candidate.domain === 'FACILITIES',
    )!;
    raw.countries[0]!.fields.push({
      ...original,
      metricRef: 'FACILITY_OUTPUT_CAPACITY',
    });
    const result = connect(parseCountrySeedProvenance(raw));

    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      metricRef: 'FACILITY_OPERATIONAL_CAPACITY',
      calibrationPath: 'facilities.FACILITY_01.operationalCapacity',
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'CALIBRATION_METRIC_IDENTITY_MISSING',
        metricRef: 'FACILITY_OUTPUT_CAPACITY',
        missingFields: [
          'calibration.metricRef',
          'calibration.structuralPathBinding',
        ],
      }),
    );
  });

  it('reports V27.1 derivationRef as unmappable rather than treating it as an assumption', () => {
    const raw = provenanceInput();
    raw.sources[0]!.sourceKind = 'OBSERVED_SNAPSHOT';
    raw.sources[0]!.periodRef = 'PERIOD_2024';
    raw.sources[0]!.geographyRef = 'COUNTRY_01';
    const field = raw.countries[0]!.fields.find(
      (candidate) => candidate.domain === 'FACILITIES',
    )!;
    Object.assign(field, {
      valueOrigin: 'DERIVED',
      derivationRef: 'DERIVATION_1',
      assumptionRef: null,
    });
    const calibration = calibrationInput();
    calibration.sources[0]!.classification = 'DERIVED';
    const result = connect(parseCountrySeedProvenance(raw), calibration);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'CALIBRATION_DERIVATION_FIELD_MISSING',
        missingFields: ['calibration.derivationRef'],
      }),
    );
  });

  it('reports country configuration disagreement as a mismatch', () => {
    const result = connect(
      parseCountrySeedProvenance(provenanceInput(69)),
      calibrationInput(),
    );
    expect(result.status).toBe('MISMATCH');
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'COUNTRY_SET_MISMATCH' }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'WORLD_CONFIGURATION_BINDING_MISMATCH' }),
    );
    expect(result.links).toHaveLength(0);
  });

  it('rejects a different World even when its local country digest is self-consistent', () => {
    const calibration = calibrationInput();
    calibration.worldId = 'WORLD_OTHER';
    calibration.countryConfigurationRef = v27_2CountryConfigurationRef(
      {
        worldId: calibration.worldId,
        countryIds: calibration.countries.map((country) => country.countryId),
      },
      sha256,
    );
    const result = connect(
      parseCountrySeedProvenance(provenanceInput()),
      calibration,
    );
    expect(result.status).toBe('MISMATCH');
    expect(result.links).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: 'WORLD_CONFIGURATION_BINDING_MISMATCH' }),
    );
  });

  it('reports an incomplete calibration candidate without emitting links', () => {
    const calibration = calibrationInput();
    calibration.countries.pop();
    const result = connect(
      parseCountrySeedProvenance(provenanceInput()),
      calibration,
    );
    expect(result).toMatchObject({
      status: 'UNAVAILABLE',
      generationAuthorized: false,
      links: [],
      issues: [
        expect.objectContaining({ code: 'CALIBRATION_INPUT_INCOMPLETE' }),
      ],
    });
  });

  it('rejects a forged parseCountrySeedProvenance result', () => {
    const parsed = parseCountrySeedProvenance(provenanceInput());
    const forged = {
      ...parsed,
      dataCompleteness: 'UNVERIFIED_VALUES_ONLY' as const,
    };
    expect(() => connect(forged)).toThrow(
      'provenance result does not match parser output',
    );
  });

  it('is invariant to V27.2 input order', () => {
    const first = connect();
    const reversed = calibrationInput();
    reversed.countries.reverse();
    const second = connect(
      parseCountrySeedProvenance(provenanceInput()),
      reversed,
    );
    expect(second).toEqual(first);
  });
});
