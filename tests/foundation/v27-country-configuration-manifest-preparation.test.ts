import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  prepareV27CountryConfigurationManifest,
  v27StructuralCountrySetFingerprint,
} from '../../tools/v27/country-configuration-manifest-preparation.js';

const GOLDEN_COUNTRY_SET_FINGERPRINT =
  'sha256:6a3d1df55987668814bc6ff7427289e51c4e304d543b9f40b14da609b7ebfaf3';

function sha256Hex(preimage: string): string {
  return createHash('sha256').update(preimage).digest('hex');
}

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
  worldId: string;
  sourceConfigurationRef: string;
  sourceConfigurationVersion: string;
  sourceConfigurationHash: string;
  expectedCountrySetFingerprint: string | null;
  requiredParameterIds: string[];
  sources: MutableSource[];
  countries: MutableCountry[];
}

function manifest(): MutableManifest {
  return {
    worldId: 'WORLD_SHARED',
    sourceConfigurationRef: 'WORLD_COUNTRY_CONFIG_V1',
    sourceConfigurationVersion: 'VERSION_1',
    sourceConfigurationHash: 'c'.repeat(64),
    expectedCountrySetFingerprint: GOLDEN_COUNTRY_SET_FINGERPRINT,
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

function prepare(value: unknown) {
  return prepareV27CountryConfigurationManifest(value, sha256Hex);
}

describe('V27 exactly-70 country configuration manifest preparation', () => {
  it('separates source provenance from the A-compatible structural fingerprint', () => {
    const result = prepare(manifest());
    expect(result).toMatchObject({
      status: 'PREPARATION_ONLY_TRACEABLE',
      worldId: 'WORLD_SHARED',
      sourceConfigurationRef: 'WORLD_COUNTRY_CONFIG_V1',
      sourceConfigurationVersion: 'VERSION_1',
      sourceConfigurationHash: 'c'.repeat(64),
      sourceConfigurationHashVerified: false,
      structuralBindingVersion: 'v27.2-country-configuration-identity-v1',
      structuralCountrySetFingerprint: GOLDEN_COUNTRY_SET_FINGERPRINT,
      expectedCountrySetFingerprint: GOLDEN_COUNTRY_SET_FINGERPRINT,
      countrySetFingerprintStatus: 'MATCH',
      configurationAuthorityVerified: false,
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
    expect(JSON.stringify(result)).not.toMatch(
      /"countryConfigurationRef"|"value"|"policy"/u,
    );
    expect(
      v27StructuralCountrySetFingerprint(
        {
          worldId: 'WORLD_SHARED',
          countryIds: result.countryIds,
        },
        sha256Hex,
      ),
    ).toBe(GOLDEN_COUNTRY_SET_FINGERPRINT);
  });

  it('is invariant to country, source, required-parameter and coverage order', () => {
    const first = prepare(manifest());
    const reversed = manifest();
    reversed.sources.reverse();
    reversed.requiredParameterIds.reverse();
    reversed.countries.reverse();
    for (const country of reversed.countries) country.parameters.reverse();
    expect(prepare(reversed)).toEqual(first);
  });

  it('reports NOT_VERIFIED when no expected structural fingerprint is supplied', () => {
    const value = manifest();
    value.expectedCountrySetFingerprint = null;
    expect(prepare(value)).toMatchObject({
      status: 'PREPARATION_ONLY_NOT_VERIFIED',
      structuralCountrySetFingerprint: GOLDEN_COUNTRY_SET_FINGERPRINT,
      expectedCountrySetFingerprint: null,
      countrySetFingerprintStatus: 'NOT_VERIFIED',
      configurationAuthorityVerified: false,
    });
  });

  it('reports MISMATCH without converting either digest into authority', () => {
    const value = manifest();
    value.expectedCountrySetFingerprint = `sha256:${'d'.repeat(64)}`;
    expect(prepare(value)).toMatchObject({
      status: 'PREPARATION_ONLY_MISMATCH',
      structuralCountrySetFingerprint: GOLDEN_COUNTRY_SET_FINGERPRINT,
      expectedCountrySetFingerprint: `sha256:${'d'.repeat(64)}`,
      countrySetFingerprintStatus: 'MISMATCH',
      sourceConfigurationHashVerified: false,
      configurationAuthorityVerified: false,
    });
  });

  it('turns missing real sources into explicit MISSING coverage without defaults', () => {
    const value = manifest();
    Object.assign(value.sources[1]!, {
      status: 'MISSING',
      sourceHash: null,
      missingReason: 'REAL_PARAMETER_SOURCE_NOT_AVAILABLE',
    });
    const result = prepare(value);
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
    const result = prepare(value);
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
    expect(() => prepare(tooFew)).toThrow(
      'countries must contain exactly 70 unique IDs',
    );

    const tooMany = manifest();
    tooMany.countries.push({
      ...tooMany.countries[0]!,
      countryId: 'COUNTRY_71',
    });
    expect(() => prepare(tooMany)).toThrow(
      'countries must contain exactly 70 unique IDs',
    );

    const duplicate = manifest();
    duplicate.countries[69]!.countryId = 'COUNTRY_01';
    expect(() => prepare(duplicate)).toThrow(
      'country identities must be unique',
    );
  });

  it('rejects malformed hashes, unknown bindings and policy/value expansion', () => {
    const badConfigurationHash = manifest();
    badConfigurationHash.sourceConfigurationHash = 'short';
    expect(() => prepare(badConfigurationHash)).toThrow(
      'sourceConfigurationHash must be lowercase SHA-256',
    );

    const missingAvailableHash = manifest();
    missingAvailableHash.sources[0]!.sourceHash = null;
    expect(() => prepare(missingAvailableHash)).toThrow(
      'available source COUNTRY_ID_SOURCE requires SHA-256',
    );

    const unknownSource = manifest();
    unknownSource.countries[0]!.parameters[0]!.sourceId = 'UNKNOWN_SOURCE';
    expect(() => prepare(unknownSource)).toThrow(
      'references unknown source UNKNOWN_SOURCE',
    );

    const expanded = manifest();
    expanded.countries[0]!.policy = 'INVENTED_POLICY';
    expect(() => prepare(expanded)).toThrow(
      'country configuration contains missing or unknown fields',
    );
  });

  it('rejects the legacy ambiguous countryConfigurationRef shape', () => {
    const legacy = manifest() as MutableManifest & {
      countryConfigurationRef?: string;
      configurationVersion?: string;
      configurationHash?: string;
    };
    legacy.countryConfigurationRef = legacy.sourceConfigurationRef;
    legacy.configurationVersion = legacy.sourceConfigurationVersion;
    legacy.configurationHash = legacy.sourceConfigurationHash;
    delete (legacy as Partial<MutableManifest>).sourceConfigurationRef;
    delete (legacy as Partial<MutableManifest>).sourceConfigurationVersion;
    delete (legacy as Partial<MutableManifest>).sourceConfigurationHash;
    expect(() => prepare(legacy)).toThrow(
      'V27 country configuration manifest contains missing or unknown fields',
    );
  });
});
