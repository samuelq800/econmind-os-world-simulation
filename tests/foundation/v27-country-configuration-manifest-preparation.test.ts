import { describe, expect, it } from 'vitest';

import { prepareV27CountryConfigurationManifest } from '../../tools/v27/country-configuration-manifest-preparation.js';

interface MutableSource {
  sourceId: string;
  status: 'AVAILABLE' | 'MISSING';
  sourceHash: string | null;
  missingReason: string | null;
}

interface MutableCoverage {
  parameterId: string;
  status: 'COVERED' | 'MISSING';
  sourceId: string | null;
  missingReason: string | null;
}

interface MutableCountry {
  countryId: string;
  configurationSourceId: string | null;
  parameters: MutableCoverage[];
  policy?: string;
}

interface MutableManifest {
  countryConfigurationRef: string;
  configurationVersion: string;
  configurationHash: string;
  requiredParameterIds: string[];
  sources: MutableSource[];
  countries: MutableCountry[];
}

function manifest(): MutableManifest {
  return {
    countryConfigurationRef: 'WORLD_COUNTRY_CONFIG_V1',
    configurationVersion: 'VERSION_1',
    configurationHash: 'c'.repeat(64),
    requiredParameterIds: ['POPULATION_BASE', 'TRADE_TARIFF_RATE'],
    sources: [
      {
        sourceId: 'COUNTRY_ID_SOURCE',
        status: 'AVAILABLE',
        sourceHash: 'a'.repeat(64),
        missingReason: null,
      },
      {
        sourceId: 'PARAMETER_SOURCE',
        status: 'AVAILABLE',
        sourceHash: 'b'.repeat(64),
        missingReason: null,
      },
    ],
    countries: Array.from({ length: 70 }, (_, index) => ({
      countryId: `COUNTRY_${String(index + 1).padStart(2, '0')}`,
      configurationSourceId: 'COUNTRY_ID_SOURCE',
      parameters: [
        {
          parameterId: 'POPULATION_BASE',
          status: 'COVERED',
          sourceId: 'PARAMETER_SOURCE',
          missingReason: null,
        },
        {
          parameterId: 'TRADE_TARIFF_RATE',
          status: 'COVERED',
          sourceId: 'PARAMETER_SOURCE',
          missingReason: null,
        },
      ],
    })),
  };
}

describe('V27 exactly-70 country configuration manifest preparation', () => {
  it('prepares one deterministic upstream countryConfigurationRef without values or authority', () => {
    const result = prepareV27CountryConfigurationManifest(manifest());
    expect(result).toMatchObject({
      status: 'PREPARATION_ONLY_TRACEABLE',
      countryConfigurationRef: 'WORLD_COUNTRY_CONFIG_V1',
      configurationVersion: 'VERSION_1',
      configurationHash: 'c'.repeat(64),
      configurationHashVerified: false,
      sourceHashesVerified: false,
      generationAuthorized: false,
      formallyVerified: false,
      countryCount: 70,
      counts: {
        declaredSources: 2,
        requiredParameters: 2,
        parameterCoverageRows: 140,
        gaps: 0,
      },
    });
    expect(result.countryIds[0]).toBe('COUNTRY_01');
    expect(result.countryIds[69]).toBe('COUNTRY_70');
    expect(result.parameterCoverage[0]).toMatchObject({
      countryId: 'COUNTRY_01',
      parameterId: 'POPULATION_BASE',
      status: 'COVERED',
      sourceId: 'PARAMETER_SOURCE',
      sourceHash: 'b'.repeat(64),
      sourceHashVerified: false,
    });
    expect(JSON.stringify(result)).not.toMatch(/"value"|"policy"/u);
  });

  it('is invariant to country, source, required-parameter and coverage order', () => {
    const first = prepareV27CountryConfigurationManifest(manifest());
    const reversed = manifest();
    reversed.sources.reverse();
    reversed.requiredParameterIds.reverse();
    reversed.countries.reverse();
    for (const country of reversed.countries) country.parameters.reverse();
    expect(prepareV27CountryConfigurationManifest(reversed)).toEqual(first);
  });

  it('turns missing real sources into explicit MISSING coverage without defaults', () => {
    const value = manifest();
    Object.assign(value.sources[1]!, {
      status: 'MISSING',
      sourceHash: null,
      missingReason: 'REAL_PARAMETER_SOURCE_NOT_AVAILABLE',
    });
    const result = prepareV27CountryConfigurationManifest(value);
    expect(result.status).toBe('PREPARATION_ONLY_MISSING');
    expect(
      result.parameterCoverage.filter(
        (row) => row.parameterId === 'TRADE_TARIFF_RATE',
      ),
    ).toHaveLength(70);
    expect(
      result.parameterCoverage.every(
        (row) => row.status === 'MISSING' && row.sourceHash === null,
      ),
    ).toBe(true);
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DECLARED_SOURCE_MISSING',
          sourceId: 'PARAMETER_SOURCE',
        }),
        expect.objectContaining({
          code: 'PARAMETER_SOURCE_UNAVAILABLE',
          countryId: 'COUNTRY_01',
          parameterId: 'POPULATION_BASE',
        }),
      ]),
    );
  });

  it('lists missing country sources and omitted parameter coverage precisely', () => {
    const value = manifest();
    value.countries[0]!.configurationSourceId = null;
    value.countries[1]!.parameters.pop();
    const result = prepareV27CountryConfigurationManifest(value);
    expect(result.status).toBe('PREPARATION_ONLY_MISSING');
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'COUNTRY_SOURCE_NOT_DECLARED',
          countryId: 'COUNTRY_01',
        }),
        expect.objectContaining({
          code: 'PARAMETER_COVERAGE_NOT_DECLARED',
          countryId: 'COUNTRY_02',
          parameterId: 'TRADE_TARIFF_RATE',
        }),
      ]),
    );
    expect(result.parameterCoverage).toContainEqual(
      expect.objectContaining({
        countryId: 'COUNTRY_02',
        parameterId: 'TRADE_TARIFF_RATE',
        status: 'MISSING',
        sourceId: null,
        sourceHash: null,
        missingReason: 'PARAMETER_COVERAGE_NOT_DECLARED',
      }),
    );
  });

  it('requires exactly 70 unique country IDs', () => {
    const tooFew = manifest();
    tooFew.countries.pop();
    expect(() => prepareV27CountryConfigurationManifest(tooFew)).toThrow(
      'countries must contain exactly 70 unique IDs',
    );

    const tooMany = manifest();
    tooMany.countries.push({
      ...tooMany.countries[0]!,
      countryId: 'COUNTRY_71',
    });
    expect(() => prepareV27CountryConfigurationManifest(tooMany)).toThrow(
      'countries must contain exactly 70 unique IDs',
    );

    const duplicate = manifest();
    duplicate.countries[69]!.countryId = 'COUNTRY_01';
    expect(() => prepareV27CountryConfigurationManifest(duplicate)).toThrow(
      'country identities must be unique',
    );
  });

  it('rejects malformed hashes, unknown bindings and policy/value expansion', () => {
    const badConfigurationHash = manifest();
    badConfigurationHash.configurationHash = 'short';
    expect(() =>
      prepareV27CountryConfigurationManifest(badConfigurationHash),
    ).toThrow('configurationHash must be lowercase SHA-256');

    const missingAvailableHash = manifest();
    missingAvailableHash.sources[0]!.sourceHash = null;
    expect(() =>
      prepareV27CountryConfigurationManifest(missingAvailableHash),
    ).toThrow('available source COUNTRY_ID_SOURCE requires SHA-256');

    const unknownSource = manifest();
    unknownSource.countries[0]!.parameters[0]!.sourceId = 'UNKNOWN_SOURCE';
    expect(() => prepareV27CountryConfigurationManifest(unknownSource)).toThrow(
      'references unknown source UNKNOWN_SOURCE',
    );

    const expanded = manifest();
    expanded.countries[0]!.policy = 'INVENTED_POLICY';
    expect(() => prepareV27CountryConfigurationManifest(expanded)).toThrow(
      'country configuration contains missing or unknown fields',
    );
  });
});
