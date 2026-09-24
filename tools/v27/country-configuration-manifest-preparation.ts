/** V27 preparation: exactly-70 country configuration identity, never data fill. */

export type V27ConfigurationSourceStatus = 'AVAILABLE' | 'MISSING';
export type V27ParameterCoverageStatus = 'COVERED' | 'MISSING';
export type V27CountrySetFingerprintStatus =
  'MATCH' | 'MISMATCH' | 'NOT_VERIFIED';
export type Sha256Hex = (preimage: string) => string;

export const V27_COUNTRY_SET_BINDING_VERSION =
  'v27.2-country-configuration-identity-v1' as const;

export interface V27ConfigurationSourceInput {
  readonly sourceId: string;
  readonly status: V27ConfigurationSourceStatus;
  readonly sourceHash: string | null;
  readonly missingReason: string | null;
}

export interface V27CountryParameterCoverageInput {
  readonly parameterId: string;
  readonly status: V27ParameterCoverageStatus;
  readonly sourceId: string | null;
  readonly missingReason: string | null;
}

export interface V27CountryConfigurationInput {
  readonly countryId: string;
  readonly configurationSourceId: string | null;
  readonly parameters: readonly V27CountryParameterCoverageInput[];
}

export interface V27CountryConfigurationManifestInput {
  readonly worldId: string;
  readonly sourceConfigurationRef: string;
  readonly sourceConfigurationVersion: string;
  readonly sourceConfigurationHash: string;
  readonly expectedCountrySetFingerprint: string | null;
  readonly requiredParameterIds: readonly string[];
  readonly sources: readonly V27ConfigurationSourceInput[];
  readonly countries: readonly V27CountryConfigurationInput[];
}

export type V27CountryConfigurationGapCode =
  | 'DECLARED_SOURCE_MISSING'
  | 'COUNTRY_SOURCE_NOT_DECLARED'
  | 'COUNTRY_SOURCE_UNAVAILABLE'
  | 'PARAMETER_COVERAGE_NOT_DECLARED'
  | 'PARAMETER_SOURCE_MISSING'
  | 'PARAMETER_SOURCE_UNAVAILABLE';

export interface V27CountryConfigurationGap {
  readonly code: V27CountryConfigurationGapCode;
  readonly countryId: string | null;
  readonly parameterId: string | null;
  readonly sourceId: string | null;
  readonly missingFields: readonly string[];
  readonly message: string;
}

export interface V27CountrySourceBinding {
  readonly countryId: string;
  readonly status: V27ConfigurationSourceStatus;
  readonly sourceId: string | null;
  readonly sourceHash: string | null;
  readonly sourceHashVerified: false;
  readonly missingReason: string | null;
}

export interface V27CountryParameterCoverage {
  readonly countryId: string;
  readonly parameterId: string;
  readonly status: V27ParameterCoverageStatus;
  readonly sourceId: string | null;
  readonly sourceHash: string | null;
  readonly sourceHashVerified: false;
  readonly missingReason: string | null;
}

export interface V27CountryConfigurationManifestResult {
  readonly status:
    | 'PREPARATION_ONLY_TRACEABLE'
    | 'PREPARATION_ONLY_MISSING'
    | 'PREPARATION_ONLY_MISMATCH'
    | 'PREPARATION_ONLY_NOT_VERIFIED';
  readonly worldId: string;
  readonly sourceConfigurationRef: string;
  readonly sourceConfigurationVersion: string;
  readonly sourceConfigurationHash: string;
  readonly sourceConfigurationHashVerified: false;
  readonly structuralBindingVersion: typeof V27_COUNTRY_SET_BINDING_VERSION;
  readonly structuralCountrySetFingerprint: `sha256:${string}`;
  readonly expectedCountrySetFingerprint: `sha256:${string}` | null;
  readonly countrySetFingerprintStatus: V27CountrySetFingerprintStatus;
  readonly configurationAuthorityVerified: false;
  readonly sourceHashesVerified: false;
  readonly generationAuthorized: false;
  readonly formallyVerified: false;
  readonly countryCount: 70;
  readonly requiredParameterIds: readonly string[];
  readonly countryIds: readonly string[];
  readonly countrySources: readonly V27CountrySourceBinding[];
  readonly parameterCoverage: readonly V27CountryParameterCoverage[];
  readonly gaps: readonly V27CountryConfigurationGap[];
  readonly counts: {
    readonly declaredSources: number;
    readonly requiredParameters: number;
    readonly parameterCoverageRows: number;
    readonly gaps: number;
  };
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const REQUIRED_COUNTRY_COUNT = 70 as const;
const ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const REF = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PREFIXED_SHA256 = /^sha256:[0-9a-f]{64}$/u;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message: string): never {
  throw new Error(`V27 country configuration manifest invalid: ${message}`);
}

function record(value: unknown, label: string): UnknownRecord {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(`${label} must be a plain record`);
  }
  return value as UnknownRecord;
}

function exactKeys(
  value: UnknownRecord,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compare);
  const required = [...expected].sort(compare);
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    fail(`${label} contains missing or unknown fields`);
  }
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function text(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    fail(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function id(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ID.test(result)) fail(`${label} must be a canonical ID`);
  return result;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function stableRef(value: unknown, label: string): string {
  const result = text(value, label);
  if (!REF.test(result)) fail(`${label} must be a stable reference`);
  return result;
}

function prefixedSha256(value: unknown, label: string): `sha256:${string}` {
  const result = text(value, label);
  if (!PREFIXED_SHA256.test(result)) {
    fail(`${label} must be sha256:<64 lowercase hexadecimal characters>`);
  }
  return result as `sha256:${string}`;
}

function nullablePrefixedSha256(
  value: unknown,
  label: string,
): `sha256:${string}` | null {
  return value === null ? null : prefixedSha256(value, label);
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(`${label} is unsupported`);
  }
  return value as T;
}

function sortedUnique<T>(
  values: readonly T[],
  identity: (value: T) => string,
  label: string,
): readonly T[] {
  const sorted = [...values].sort((left, right) =>
    compare(identity(left), identity(right)),
  );
  if (new Set(sorted.map(identity)).size !== sorted.length) {
    fail(`${label} identities must be unique`);
  }
  return Object.freeze(sorted);
}

function parseSource(value: unknown): V27ConfigurationSourceInput {
  const input = record(value, 'configuration source');
  exactKeys(
    input,
    ['sourceId', 'status', 'sourceHash', 'missingReason'],
    'configuration source',
  );
  const sourceId = id(input.sourceId, 'sourceId');
  const status = choice(
    input.status,
    ['AVAILABLE', 'MISSING'] as const,
    'source status',
  );
  const sourceHash = nullableText(input.sourceHash, 'sourceHash');
  const missingReason = nullableText(
    input.missingReason,
    'source missingReason',
  );
  if (status === 'AVAILABLE') {
    if (
      sourceHash === null ||
      !SHA256.test(sourceHash) ||
      missingReason !== null
    ) {
      fail(
        `available source ${sourceId} requires SHA-256 and no missing reason`,
      );
    }
  } else if (sourceHash !== null || missingReason === null) {
    fail(`missing source ${sourceId} requires only an explicit reason`);
  }
  return Object.freeze({ sourceId, status, sourceHash, missingReason });
}

function parseParameterCoverage(
  value: unknown,
): V27CountryParameterCoverageInput {
  const input = record(value, 'country parameter coverage');
  exactKeys(
    input,
    ['parameterId', 'status', 'sourceId', 'missingReason'],
    'country parameter coverage',
  );
  const parameterId = id(input.parameterId, 'parameterId');
  const status = choice(
    input.status,
    ['COVERED', 'MISSING'] as const,
    'parameter coverage status',
  );
  const sourceId = nullableId(input.sourceId, 'parameter sourceId');
  const missingReason = nullableText(
    input.missingReason,
    'parameter missingReason',
  );
  if (status === 'COVERED') {
    if (sourceId === null || missingReason !== null) {
      fail(
        `covered parameter ${parameterId} requires sourceId and no missing reason`,
      );
    }
  } else if (sourceId !== null || missingReason === null) {
    fail(
      `missing parameter ${parameterId} requires only an explicit missing reason`,
    );
  }
  return Object.freeze({ parameterId, status, sourceId, missingReason });
}

function parseCountry(value: unknown): V27CountryConfigurationInput {
  const input = record(value, 'country configuration');
  exactKeys(
    input,
    ['countryId', 'configurationSourceId', 'parameters'],
    'country configuration',
  );
  return Object.freeze({
    countryId: id(input.countryId, 'countryId'),
    configurationSourceId: nullableId(
      input.configurationSourceId,
      'configurationSourceId',
    ),
    parameters: sortedUnique(
      list(input.parameters, 'country parameters').map(parseParameterCoverage),
      (parameter) => parameter.parameterId,
      'country parameter',
    ),
  });
}

function gap(input: V27CountryConfigurationGap): V27CountryConfigurationGap {
  return Object.freeze({
    ...input,
    missingFields: Object.freeze([...input.missingFields].sort(compare)),
  });
}

function gapKey(value: V27CountryConfigurationGap): string {
  return [
    value.code,
    value.countryId ?? '',
    value.parameterId ?? '',
    value.sourceId ?? '',
    ...value.missingFields,
    value.message,
  ].join('\u0000');
}

function coverageKey(value: V27CountryParameterCoverage): string {
  return `${value.countryId}\u0000${value.parameterId}`;
}

/**
 * A-compatible structural identity only. It does not verify or confer external
 * configuration authority.
 */
export function v27StructuralCountrySetFingerprint(
  input: { readonly worldId: string; readonly countryIds: readonly string[] },
  sha256Hex: Sha256Hex,
): `sha256:${string}` {
  const worldId = id(input.worldId, 'worldId');
  const countryIds = sortedUnique(
    list(input.countryIds, 'country configuration IDs').map((value) =>
      id(value, 'country configuration ID'),
    ),
    (value) => value,
    'country configuration',
  );
  const canonical = JSON.stringify({
    bindingVersion: V27_COUNTRY_SET_BINDING_VERSION,
    countryIds,
    worldId,
  });
  const digest = sha256Hex(`SHA-256\n${canonical}`);
  if (!SHA256.test(digest)) {
    fail('SHA-256 adapter must return 64 lowercase hexadecimal characters');
  }
  return `sha256:${digest}`;
}

export function prepareV27CountryConfigurationManifest(
  value: unknown,
  sha256Hex: Sha256Hex,
): V27CountryConfigurationManifestResult {
  const input = record(value, 'V27 country configuration manifest');
  exactKeys(
    input,
    [
      'worldId',
      'sourceConfigurationRef',
      'sourceConfigurationVersion',
      'sourceConfigurationHash',
      'expectedCountrySetFingerprint',
      'requiredParameterIds',
      'sources',
      'countries',
    ],
    'V27 country configuration manifest',
  );
  const worldId = id(input.worldId, 'worldId');
  const sourceConfigurationRef = stableRef(
    input.sourceConfigurationRef,
    'sourceConfigurationRef',
  );
  const sourceConfigurationVersion = stableRef(
    input.sourceConfigurationVersion,
    'sourceConfigurationVersion',
  );
  const sourceConfigurationHash = text(
    input.sourceConfigurationHash,
    'sourceConfigurationHash',
  );
  if (!SHA256.test(sourceConfigurationHash)) {
    fail('sourceConfigurationHash must be lowercase SHA-256');
  }
  const expectedCountrySetFingerprint = nullablePrefixedSha256(
    input.expectedCountrySetFingerprint,
    'expectedCountrySetFingerprint',
  );
  const requiredParameterIds = sortedUnique(
    list(input.requiredParameterIds, 'requiredParameterIds').map((item) =>
      id(item, 'requiredParameterId'),
    ),
    (item) => item,
    'required parameter',
  );
  if (requiredParameterIds.length === 0) {
    fail('requiredParameterIds must not be empty');
  }
  const requiredParameters = new Set(requiredParameterIds);
  const sources = sortedUnique(
    list(input.sources, 'sources').map(parseSource),
    (source) => source.sourceId,
    'source',
  );
  const sourceById = new Map(
    sources.map((source) => [source.sourceId, source] as const),
  );
  const countries = sortedUnique(
    list(input.countries, 'countries').map(parseCountry),
    (country) => country.countryId,
    'country',
  );
  if (countries.length !== REQUIRED_COUNTRY_COUNT) {
    fail(`countries must contain exactly ${REQUIRED_COUNTRY_COUNT} unique IDs`);
  }
  const countryIds = Object.freeze(
    countries.map((country) => country.countryId),
  );
  const structuralCountrySetFingerprint = v27StructuralCountrySetFingerprint(
    { worldId, countryIds },
    sha256Hex,
  );
  const countrySetFingerprintStatus: V27CountrySetFingerprintStatus =
    expectedCountrySetFingerprint === null
      ? 'NOT_VERIFIED'
      : expectedCountrySetFingerprint === structuralCountrySetFingerprint
        ? 'MATCH'
        : 'MISMATCH';

  const gaps: V27CountryConfigurationGap[] = [];
  for (const source of sources) {
    if (source.status === 'MISSING') {
      gaps.push(
        gap({
          code: 'DECLARED_SOURCE_MISSING',
          countryId: null,
          parameterId: null,
          sourceId: source.sourceId,
          missingFields: ['source.sourceHash'],
          message: source.missingReason!,
        }),
      );
    }
  }
  const countrySources: V27CountrySourceBinding[] = [];
  const parameterCoverage: V27CountryParameterCoverage[] = [];
  for (const country of countries) {
    const countrySource =
      country.configurationSourceId === null
        ? null
        : sourceById.get(country.configurationSourceId);
    if (country.configurationSourceId !== null && countrySource === undefined) {
      fail(
        `country ${country.countryId} references unknown configuration source ${country.configurationSourceId}`,
      );
    }
    if (country.configurationSourceId === null) {
      countrySources.push(
        Object.freeze({
          countryId: country.countryId,
          status: 'MISSING',
          sourceId: null,
          sourceHash: null,
          sourceHashVerified: false,
          missingReason: 'COUNTRY_CONFIGURATION_SOURCE_NOT_DECLARED',
        }),
      );
      gaps.push(
        gap({
          code: 'COUNTRY_SOURCE_NOT_DECLARED',
          countryId: country.countryId,
          parameterId: null,
          sourceId: null,
          missingFields: ['country.configurationSourceId'],
          message: 'Country configuration source is not declared',
        }),
      );
    } else if (countrySource!.status === 'MISSING') {
      countrySources.push(
        Object.freeze({
          countryId: country.countryId,
          status: 'MISSING',
          sourceId: countrySource!.sourceId,
          sourceHash: null,
          sourceHashVerified: false,
          missingReason: countrySource!.missingReason,
        }),
      );
      gaps.push(
        gap({
          code: 'COUNTRY_SOURCE_UNAVAILABLE',
          countryId: country.countryId,
          parameterId: null,
          sourceId: countrySource!.sourceId,
          missingFields: ['source.sourceHash'],
          message: `Country configuration source ${countrySource!.sourceId} is unavailable`,
        }),
      );
    } else {
      countrySources.push(
        Object.freeze({
          countryId: country.countryId,
          status: 'AVAILABLE',
          sourceId: countrySource!.sourceId,
          sourceHash: countrySource!.sourceHash,
          sourceHashVerified: false,
          missingReason: null,
        }),
      );
    }

    const declaredCoverage = new Map(
      country.parameters.map((parameter) => {
        if (!requiredParameters.has(parameter.parameterId)) {
          fail(
            `country ${country.countryId} declares unknown parameter ${parameter.parameterId}`,
          );
        }
        return [parameter.parameterId, parameter] as const;
      }),
    );
    for (const parameterId of requiredParameterIds) {
      const declared = declaredCoverage.get(parameterId);
      if (declared === undefined) {
        parameterCoverage.push(
          Object.freeze({
            countryId: country.countryId,
            parameterId,
            status: 'MISSING',
            sourceId: null,
            sourceHash: null,
            sourceHashVerified: false,
            missingReason: 'PARAMETER_COVERAGE_NOT_DECLARED',
          }),
        );
        gaps.push(
          gap({
            code: 'PARAMETER_COVERAGE_NOT_DECLARED',
            countryId: country.countryId,
            parameterId,
            sourceId: null,
            missingFields: ['country.parameters'],
            message: `Required parameter ${parameterId} has no coverage row`,
          }),
        );
        continue;
      }
      if (declared.status === 'MISSING') {
        parameterCoverage.push(
          Object.freeze({
            countryId: country.countryId,
            parameterId,
            status: 'MISSING',
            sourceId: null,
            sourceHash: null,
            sourceHashVerified: false,
            missingReason: declared.missingReason,
          }),
        );
        gaps.push(
          gap({
            code: 'PARAMETER_SOURCE_MISSING',
            countryId: country.countryId,
            parameterId,
            sourceId: null,
            missingFields: ['parameter.sourceId', 'source.sourceHash'],
            message: declared.missingReason!,
          }),
        );
        continue;
      }
      const parameterSource = sourceById.get(declared.sourceId!);
      if (parameterSource === undefined) {
        fail(
          `country ${country.countryId} parameter ${parameterId} references unknown source ${declared.sourceId}`,
        );
      }
      if (parameterSource.status === 'MISSING') {
        parameterCoverage.push(
          Object.freeze({
            countryId: country.countryId,
            parameterId,
            status: 'MISSING',
            sourceId: parameterSource.sourceId,
            sourceHash: null,
            sourceHashVerified: false,
            missingReason: parameterSource.missingReason,
          }),
        );
        gaps.push(
          gap({
            code: 'PARAMETER_SOURCE_UNAVAILABLE',
            countryId: country.countryId,
            parameterId,
            sourceId: parameterSource.sourceId,
            missingFields: ['source.sourceHash'],
            message: `Required parameter ${parameterId} references unavailable source ${parameterSource.sourceId}`,
          }),
        );
        continue;
      }
      parameterCoverage.push(
        Object.freeze({
          countryId: country.countryId,
          parameterId,
          status: 'COVERED',
          sourceId: parameterSource.sourceId,
          sourceHash: parameterSource.sourceHash,
          sourceHashVerified: false,
          missingReason: null,
        }),
      );
    }
  }

  const sortedCountrySources = Object.freeze(
    countrySources.sort((left, right) =>
      compare(left.countryId, right.countryId),
    ),
  );
  const sortedCoverage = Object.freeze(
    parameterCoverage.sort((left, right) =>
      compare(coverageKey(left), coverageKey(right)),
    ),
  );
  const sortedGaps = Object.freeze(
    gaps.sort((left, right) => compare(gapKey(left), gapKey(right))),
  );
  return Object.freeze({
    status:
      countrySetFingerprintStatus === 'MISMATCH'
        ? ('PREPARATION_ONLY_MISMATCH' as const)
        : sortedGaps.length > 0
          ? ('PREPARATION_ONLY_MISSING' as const)
          : countrySetFingerprintStatus === 'NOT_VERIFIED'
            ? ('PREPARATION_ONLY_NOT_VERIFIED' as const)
            : ('PREPARATION_ONLY_TRACEABLE' as const),
    worldId,
    sourceConfigurationRef,
    sourceConfigurationVersion,
    sourceConfigurationHash,
    sourceConfigurationHashVerified: false,
    structuralBindingVersion: V27_COUNTRY_SET_BINDING_VERSION,
    structuralCountrySetFingerprint,
    expectedCountrySetFingerprint,
    countrySetFingerprintStatus,
    configurationAuthorityVerified: false,
    sourceHashesVerified: false,
    generationAuthorized: false,
    formallyVerified: false,
    countryCount: REQUIRED_COUNTRY_COUNT,
    requiredParameterIds,
    countryIds,
    countrySources: sortedCountrySources,
    parameterCoverage: sortedCoverage,
    gaps: sortedGaps,
    counts: Object.freeze({
      declaredSources: sources.length,
      requiredParameters: requiredParameterIds.length,
      parameterCoverageRows: sortedCoverage.length,
      gaps: sortedGaps.length,
    }),
  });
}
