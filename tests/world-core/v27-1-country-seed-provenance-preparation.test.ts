import { describe, expect, it } from 'vitest';

import {
  COUNTRY_SEED_PROVENANCE_SCHEMA,
  COUNTRY_SEED_PROVENANCE_STATUS,
  parseCountrySeedProvenance,
  type CountrySeedDomain,
} from '../../packages/core/src/opening/country-seed-provenance-preparation.js';

const domains: readonly CountrySeedDomain[] = [
  'POPULATION',
  'RESOURCES',
  'FACILITIES',
  'TECHNOLOGY',
  'ACCOUNTS',
  'TRADE_DEPENDENCY',
];
const numeric = {
  POPULATION: ['COUNT', 'person'],
  RESOURCES: ['QUANTITY', 'tonne'],
  FACILITIES: ['COUNT', 'facility'],
  TECHNOLOGY: ['COUNT', 'license'],
  ACCOUNTS: ['MONEY', 'GCU'],
  TRADE_DEPENDENCY: ['SHARE', 'ratio'],
} as const;

function source(
  sourceRef: string,
  sourceKind: 'OBSERVED_SNAPSHOT' | 'DESIGN_ASSUMPTION' | 'LEGACY_INDEX',
  geographyRef: string | null,
) {
  return {
    sourceRef,
    sourceKind,
    locator: `tests/fixtures/${sourceRef}.json`,
    sourceVersion: 'VERSION_1',
    contentSha256: 'a'.repeat(64),
    periodRef: sourceKind === 'DESIGN_ASSUMPTION' ? null : 'PERIOD_2024',
    geographyRef,
  };
}

function missing(
  domain: CountrySeedDomain,
  counterpartyCountryId: string | null,
) {
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

function input(count = 2) {
  const configuredCountryIds = Array.from(
    { length: count },
    (_, index) => `COUNTRY_${String(index + 1).padStart(2, '0')}`,
  );
  return {
    schemaVersion: COUNTRY_SEED_PROVENANCE_SCHEMA,
    worldId: 'WORLD_SEED_TEST',
    seasonRef: 'SEASON_1',
    configuredCountryIds,
    sources: [] as ReturnType<typeof source>[],
    countries: configuredCountryIds.map((countryId, index) => ({
      countryId,
      fields: domains.map((domain) =>
        missing(domain, configuredCountryIds[(index + 1) % count] ?? null),
      ) as Array<Record<string, unknown>>,
    })),
  };
}

function setField(
  value: ReturnType<typeof input>,
  countryIndex: number,
  domain: CountrySeedDomain,
  replacement: Record<string, unknown>,
) {
  const country = value.countries[countryIndex]!;
  const fieldIndex = country.fields.findIndex(
    (field) => field.domain === domain,
  );
  country.fields[fieldIndex] = replacement;
}

describe('V27.1 country opening source/assumption preparation', () => {
  it('preserves six explicit MISSING domains per configured country without zero filling', () => {
    const result = parseCountrySeedProvenance(input());
    expect(result.status).toBe(COUNTRY_SEED_PROVENANCE_STATUS);
    expect(result.dataCompleteness).toBe('INCOMPLETE');
    expect(result.configuredCountryIds).toEqual(['COUNTRY_01', 'COUNTRY_02']);
    expect(result.countries).toHaveLength(2);
    expect(
      result.countries.every((country) => country.fields.length === 6),
    ).toBe(true);
    expect(
      result.countries
        .flatMap((country) => country.fields)
        .every((field) => field.status === 'MISSING'),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain('"amount":"0"');
    expect(result.hashInput).toMatch(/^SHA-256\n/u);
  });

  it('keeps observed, derived and documented assumption values separately sourced, and quarantines a legacy index', () => {
    const candidate = input();
    candidate.sources.push(
      source('SOURCE_POPULATION', 'OBSERVED_SNAPSHOT', 'COUNTRY_01'),
      source('SOURCE_RESOURCE_ASSUMPTION', 'DESIGN_ASSUMPTION', null),
      source('SOURCE_TRADE_INPUT', 'OBSERVED_SNAPSHOT', 'COUNTRY_02'),
      source('SOURCE_LEGACY_SCORE', 'LEGACY_INDEX', 'COUNTRY_01'),
    );
    setField(candidate, 0, 'POPULATION', {
      status: 'VALUE',
      domain: 'POPULATION',
      metricRef: 'POPULATION_BASELINE',
      subjectRef: null,
      counterpartyCountryId: null,
      numericKind: 'COUNT',
      amount: '1200',
      unit: 'person',
      sourceRef: 'SOURCE_POPULATION',
      valueOrigin: 'OBSERVED',
      derivationRef: null,
      assumptionRef: null,
    });
    setField(candidate, 0, 'RESOURCES', {
      status: 'VALUE',
      domain: 'RESOURCES',
      metricRef: 'RESOURCES_BASELINE',
      subjectRef: 'DEPOSIT_A',
      counterpartyCountryId: null,
      numericKind: 'QUANTITY',
      amount: '3.25',
      unit: 'tonne',
      sourceRef: 'SOURCE_RESOURCE_ASSUMPTION',
      valueOrigin: 'DESIGN_ASSUMPTION',
      derivationRef: null,
      assumptionRef: 'ASSUMPTION_GEOLOGY_1',
    });
    setField(candidate, 0, 'TECHNOLOGY', {
      status: 'LEGACY_INDEX_ONLY',
      domain: 'TECHNOLOGY',
      metricRef: 'TECHNOLOGY_BASELINE',
      subjectRef: null,
      counterpartyCountryId: null,
      indexScore: '78',
      sourceRef: 'SOURCE_LEGACY_SCORE',
      conversionProhibited: true,
    });
    setField(candidate, 0, 'TRADE_DEPENDENCY', {
      status: 'VALUE',
      domain: 'TRADE_DEPENDENCY',
      metricRef: 'TRADE_DEPENDENCY_BASELINE',
      subjectRef: 'SUPPLIER_GRAIN',
      counterpartyCountryId: 'COUNTRY_02',
      numericKind: 'SHARE',
      amount: '0.25',
      unit: 'ratio',
      sourceRef: 'SOURCE_TRADE_INPUT',
      valueOrigin: 'DERIVED',
      derivationRef: 'DERIVATION_TRADE_SHARE_1',
      assumptionRef: null,
    });
    const result = parseCountrySeedProvenance(candidate);
    expect(result.dataCompleteness).toBe('INCOMPLETE');
    expect(
      result.countries[0]?.fields.filter((field) => field.status === 'VALUE'),
    ).toHaveLength(3);
    expect(
      result.countries[0]?.fields.find(
        (field) => field.domain === 'TECHNOLOGY',
      ),
    ).toMatchObject({
      status: 'LEGACY_INDEX_ONLY',
      conversionProhibited: true,
    });
    expect(result.sources.map((entry) => entry.sourceKind)).toContain(
      'DESIGN_ASSUMPTION',
    );
    expect(parseCountrySeedProvenance(candidate)).toEqual(result);
  });

  it('sorts source, country and metric input without changing the canonical preimage', () => {
    const candidate = input();
    const expected = parseCountrySeedProvenance(candidate);
    candidate.configuredCountryIds.reverse();
    candidate.countries.reverse();
    for (const country of candidate.countries) country.fields.reverse();
    expect(parseCountrySeedProvenance(candidate)).toEqual(expected);
  });

  it('labels even all-valued, assumed input as unverified rather than authoritative', () => {
    const candidate = input();
    candidate.sources.push(
      source('SOURCE_ASSUMED_ALL', 'DESIGN_ASSUMPTION', null),
    );
    for (const country of candidate.countries) {
      for (const domain of domains) {
        const [numericKind, unit] = numeric[domain];
        const original = country.fields.find(
          (field) => field.domain === domain,
        )!;
        country.fields[country.fields.indexOf(original)] = {
          status: 'VALUE',
          domain,
          metricRef: `${domain}_BASELINE`,
          subjectRef: null,
          counterpartyCountryId: original.counterpartyCountryId,
          numericKind,
          amount: domain === 'TRADE_DEPENDENCY' ? '0.5' : '0',
          unit,
          sourceRef: 'SOURCE_ASSUMED_ALL',
          valueOrigin: 'DESIGN_ASSUMPTION',
          derivationRef: null,
          assumptionRef: 'ASSUMPTION_TEST_ONLY',
        };
      }
    }
    const result = parseCountrySeedProvenance(candidate);
    expect(result.dataCompleteness).toBe('UNVERIFIED_VALUES_ONLY');
    expect(result.status).toBe('PREPARATION_ONLY');
  });

  it('uses Season configuration for 70 country records and rejects overflow or missing coverage', () => {
    expect(parseCountrySeedProvenance(input(70)).countries).toHaveLength(70);
    expect(() => parseCountrySeedProvenance(input(71))).toThrow('design cap');
    const incomplete = input();
    incomplete.countries.pop();
    expect(() => parseCountrySeedProvenance(incomplete)).toThrow(
      'exactly cover',
    );
    const missingDomain = input();
    missingDomain.countries[0]?.fields.pop();
    expect(() => parseCountrySeedProvenance(missingDomain)).toThrow('all six');
  });

  it('rejects a legacy index promoted into physical units or an unsupported numeric unit', () => {
    const candidate = input();
    candidate.sources.push(
      source('SOURCE_LEGACY', 'LEGACY_INDEX', 'COUNTRY_01'),
    );
    setField(candidate, 0, 'RESOURCES', {
      status: 'VALUE',
      domain: 'RESOURCES',
      metricRef: 'RESOURCES_BASELINE',
      subjectRef: null,
      counterpartyCountryId: null,
      numericKind: 'QUANTITY',
      amount: '75',
      unit: 'tonne',
      sourceRef: 'SOURCE_LEGACY',
      valueOrigin: 'DERIVED',
      derivationRef: 'CONVERSION_1',
      assumptionRef: null,
    });
    expect(() => parseCountrySeedProvenance(candidate)).toThrow(
      'Legacy 0–100 index',
    );
    candidate.sources[0] = source('SOURCE_LEGACY', 'DESIGN_ASSUMPTION', null);
    candidate.countries[0]!.fields[1] = {
      ...candidate.countries[0]!.fields[1]!,
      valueOrigin: 'DESIGN_ASSUMPTION',
      derivationRef: null,
      assumptionRef: 'ASSUMPTION_1',
      unit: 'resource_score',
    };
    expect(() => parseCountrySeedProvenance(candidate)).toThrow(
      'Measured unit cannot be an index',
    );
  });

  it('rejects missing masquerading as zero and undocumented assumptions', () => {
    const candidate = input();
    candidate.countries[0]!.fields[0] = {
      ...candidate.countries[0]!.fields[0]!,
      amount: '0',
    };
    expect(() => parseCountrySeedProvenance(candidate)).toThrow(
      'missing or unknown fields',
    );
    const undocumented = input();
    undocumented.sources.push(
      source('SOURCE_ASSUMPTION', 'DESIGN_ASSUMPTION', null),
    );
    setField(undocumented, 0, 'POPULATION', {
      status: 'VALUE',
      domain: 'POPULATION',
      metricRef: 'POPULATION_BASELINE',
      subjectRef: null,
      counterpartyCountryId: null,
      numericKind: 'COUNT',
      amount: '10',
      unit: 'person',
      sourceRef: 'SOURCE_ASSUMPTION',
      valueOrigin: 'DESIGN_ASSUMPTION',
      derivationRef: null,
      assumptionRef: null,
    });
    expect(() => parseCountrySeedProvenance(undocumented)).toThrow(
      'documented assumption',
    );
  });

  it('rejects noncanonical, fractional count, over-one share, and JavaScript-number amounts', () => {
    for (const amount of ['01', '1.0', '1.5', 1.5]) {
      const candidate = input();
      candidate.sources.push(
        source('SOURCE_ASSUMPTION', 'DESIGN_ASSUMPTION', null),
      );
      setField(candidate, 0, 'POPULATION', {
        status: 'VALUE',
        domain: 'POPULATION',
        metricRef: 'POPULATION_BASELINE',
        subjectRef: null,
        counterpartyCountryId: null,
        numericKind: 'COUNT',
        amount,
        unit: 'person',
        sourceRef: 'SOURCE_ASSUMPTION',
        valueOrigin: 'DESIGN_ASSUMPTION',
        derivationRef: null,
        assumptionRef: 'ASSUMPTION_POPULATION',
      });
      expect(() => parseCountrySeedProvenance(candidate)).toThrow();
    }
    const share = input();
    share.sources.push(source('SOURCE_ASSUMPTION', 'DESIGN_ASSUMPTION', null));
    setField(share, 0, 'TRADE_DEPENDENCY', {
      status: 'VALUE',
      domain: 'TRADE_DEPENDENCY',
      metricRef: 'TRADE_DEPENDENCY_BASELINE',
      subjectRef: null,
      counterpartyCountryId: 'COUNTRY_02',
      numericKind: 'SHARE',
      amount: '1.01',
      unit: 'ratio',
      sourceRef: 'SOURCE_ASSUMPTION',
      valueOrigin: 'DESIGN_ASSUMPTION',
      derivationRef: null,
      assumptionRef: 'ASSUMPTION_TRADE',
    });
    expect(() => parseCountrySeedProvenance(share)).toThrow(
      'Share must be within',
    );
  });

  it('rejects unknown counterparty, wrong observed geography, duplicate source and duplicate metric', () => {
    const wrongPartner = input();
    wrongPartner.countries[0]!.fields[5] = {
      ...wrongPartner.countries[0]!.fields[5]!,
      counterpartyCountryId: 'COUNTRY_99',
    };
    expect(() => parseCountrySeedProvenance(wrongPartner)).toThrow(
      'distinct configured counterparty',
    );
    const geography = input();
    geography.sources.push(
      source('SOURCE_OTHER', 'OBSERVED_SNAPSHOT', 'COUNTRY_02'),
    );
    setField(geography, 0, 'POPULATION', {
      status: 'VALUE',
      domain: 'POPULATION',
      metricRef: 'POPULATION_BASELINE',
      subjectRef: null,
      counterpartyCountryId: null,
      numericKind: 'COUNT',
      amount: '10',
      unit: 'person',
      sourceRef: 'SOURCE_OTHER',
      valueOrigin: 'OBSERVED',
      derivationRef: null,
      assumptionRef: null,
    });
    expect(() => parseCountrySeedProvenance(geography)).toThrow('same-country');
    const duplicateSource = input();
    duplicateSource.sources.push(
      source('SOURCE_A', 'DESIGN_ASSUMPTION', null),
      source('SOURCE_A', 'DESIGN_ASSUMPTION', null),
    );
    expect(() => parseCountrySeedProvenance(duplicateSource)).toThrow('unique');
    const unusedSource = input();
    unusedSource.sources.push(
      source('SOURCE_UNUSED', 'DESIGN_ASSUMPTION', null),
    );
    expect(() => parseCountrySeedProvenance(unusedSource)).toThrow(
      'bind at least one',
    );
    const duplicateMetric = input();
    duplicateMetric.countries[0]!.fields.push({
      ...duplicateMetric.countries[0]!.fields[0]!,
    });
    expect(() => parseCountrySeedProvenance(duplicateMetric)).toThrow('unique');
  });

  it('rejects hidden input fields, wrong digest, and forged index conversion flag', () => {
    expect(() =>
      parseCountrySeedProvenance({ ...input(), hiddenBuff: 50 }),
    ).toThrow();
    const wrongDigest = input();
    wrongDigest.sources.push({
      ...source('SOURCE_A', 'DESIGN_ASSUMPTION', null),
      contentSha256: 'NOT_A_HASH',
    });
    expect(() => parseCountrySeedProvenance(wrongDigest)).toThrow('SHA-256');
    const index = input();
    index.sources.push(source('SOURCE_INDEX', 'LEGACY_INDEX', 'COUNTRY_01'));
    setField(index, 0, 'TECHNOLOGY', {
      status: 'LEGACY_INDEX_ONLY',
      domain: 'TECHNOLOGY',
      metricRef: 'TECHNOLOGY_BASELINE',
      subjectRef: null,
      counterpartyCountryId: null,
      indexScore: '90',
      sourceRef: 'SOURCE_INDEX',
      conversionProhibited: false,
    });
    expect(() => parseCountrySeedProvenance(index)).toThrow('quarantined');
    index.countries[0]!.fields[3] = {
      ...index.countries[0]!.fields[3]!,
      conversionProhibited: true,
      indexScore: '101',
    };
    expect(() => parseCountrySeedProvenance(index)).toThrow('within 0–100');
  });
});
