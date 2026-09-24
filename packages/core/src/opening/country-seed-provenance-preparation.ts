import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  canonicalDecimal,
  parseWorldDecimal,
} from '../numeric/world-decimal.js';
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';

/** V27.1 source/assumption validation only; never an authoritative OpeningSeed. */
export const COUNTRY_SEED_PROVENANCE_STATUS = 'PREPARATION_ONLY' as const;
export const COUNTRY_SEED_PROVENANCE_SCHEMA =
  'country-seed-provenance-v1' as const;

export type CountrySeedDomain =
  | 'POPULATION'
  | 'RESOURCES'
  | 'FACILITIES'
  | 'TECHNOLOGY'
  | 'ACCOUNTS'
  | 'TRADE_DEPENDENCY';
export type SeedNumericKind = 'COUNT' | 'QUANTITY' | 'MONEY' | 'SHARE';
export type SeedSourceKind =
  'OBSERVED_SNAPSHOT' | 'DESIGN_ASSUMPTION' | 'LEGACY_INDEX';
export type SeedValueOrigin = 'OBSERVED' | 'DERIVED' | 'DESIGN_ASSUMPTION';

export interface CountrySeedSource {
  readonly sourceRef: string;
  readonly sourceKind: SeedSourceKind;
  readonly locator: string;
  readonly sourceVersion: string;
  /** Declared content hash, not verified by this pure parser. */
  readonly contentSha256: string;
  readonly periodRef: string | null;
  readonly geographyRef: string | null;
}

interface CountrySeedFieldScope {
  readonly domain: CountrySeedDomain;
  readonly metricRef: string;
  readonly subjectRef: string | null;
  readonly counterpartyCountryId: string | null;
}

export interface CountrySeedExactValue extends CountrySeedFieldScope {
  readonly status: 'VALUE';
  readonly numericKind: SeedNumericKind;
  readonly amount: string;
  readonly unit: string;
  readonly sourceRef: string;
  readonly valueOrigin: SeedValueOrigin;
  readonly derivationRef: string | null;
  readonly assumptionRef: string | null;
}

export interface CountrySeedMissing extends CountrySeedFieldScope {
  readonly status: 'MISSING';
  readonly numericKind: SeedNumericKind;
  readonly unit: string;
  readonly reason: 'SOURCE_NOT_AVAILABLE' | 'NOT_CALIBRATED' | 'NOT_APPLICABLE';
  readonly sourceRef: null;
}

export interface CountrySeedLegacyIndex extends CountrySeedFieldScope {
  readonly status: 'LEGACY_INDEX_ONLY';
  readonly indexScore: string;
  readonly sourceRef: string;
  readonly conversionProhibited: true;
}

export type CountrySeedField =
  CountrySeedExactValue | CountrySeedMissing | CountrySeedLegacyIndex;

export interface CountrySeedRecord {
  readonly countryId: string;
  readonly fields: readonly CountrySeedField[];
}

export interface CountrySeedProvenancePreparation {
  readonly schemaVersion: typeof COUNTRY_SEED_PROVENANCE_SCHEMA;
  readonly status: typeof COUNTRY_SEED_PROVENANCE_STATUS;
  readonly dataCompleteness: 'INCOMPLETE' | 'UNVERIFIED_VALUES_ONLY';
  readonly worldId: string;
  readonly seasonRef: string;
  /** Country count and identities come only from Season configuration. */
  readonly configuredCountryIds: readonly string[];
  readonly sources: readonly CountrySeedSource[];
  readonly countries: readonly CountrySeedRecord[];
  /** Canonical SHA-256 preimage for later review, not a seed fingerprint. */
  readonly hashInput: string;
}

type InputRecord = Record<string, unknown>;
const ID = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const UNIT = /^[a-z][a-z0-9_]*$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DOMAINS: readonly CountrySeedDomain[] = Object.freeze([
  'POPULATION',
  'RESOURCES',
  'FACILITIES',
  'TECHNOLOGY',
  'ACCOUNTS',
  'TRADE_DEPENDENCY',
]);
const SOURCE_KINDS: readonly SeedSourceKind[] = Object.freeze([
  'OBSERVED_SNAPSHOT',
  'DESIGN_ASSUMPTION',
  'LEGACY_INDEX',
]);
const VALUE_ORIGINS: readonly SeedValueOrigin[] = Object.freeze([
  'OBSERVED',
  'DERIVED',
  'DESIGN_ASSUMPTION',
]);
const NUMERIC_KINDS: readonly SeedNumericKind[] = Object.freeze([
  'COUNT',
  'QUANTITY',
  'MONEY',
  'SHARE',
]);

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.OPENING_SEED_INVALID, message);
}

function record(value: unknown, label: string): InputRecord {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid(`${label} must be a plain record`);
  return value as InputRecord;
}

function keys(
  value: InputRecord,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  )
    invalid(`${label} has missing or unknown fields`);
}

function list(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value)
    invalid(`${label} must be a non-empty canonical string`);
  return value;
}

function id(value: unknown, label: string): string {
  const result = text(value, label);
  if (!ID.test(result)) invalid(`${label} must be a canonical ID`);
  return result;
}

function nullableId(value: unknown, label: string): string | null {
  return value === null ? null : id(value, label);
}

function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    invalid(`${label} is unsupported`);
  return value as T;
}

function decimal(value: unknown, label: string): string {
  const raw = text(value, label);
  let parsed;
  try {
    parsed = parseWorldDecimal(raw);
  } catch {
    return invalid(`${label} must be an exact decimal string`);
  }
  if (parsed.isNegative() || canonicalDecimal(parsed) !== raw)
    invalid(`${label} must be canonical and non-negative`);
  return raw;
}

function numericKind(
  value: unknown,
  domain: CountrySeedDomain,
): SeedNumericKind {
  const kind = choice(value, NUMERIC_KINDS, 'seed numeric kind');
  const allowed: Readonly<
    Record<CountrySeedDomain, readonly SeedNumericKind[]>
  > = {
    POPULATION: ['COUNT'],
    RESOURCES: ['QUANTITY'],
    FACILITIES: ['COUNT', 'QUANTITY'],
    TECHNOLOGY: ['COUNT', 'QUANTITY'],
    ACCOUNTS: ['MONEY'],
    TRADE_DEPENDENCY: ['SHARE'],
  };
  if (!allowed[domain].includes(kind))
    invalid('Numeric kind does not match opening domain');
  return kind;
}

function numericUnit(value: unknown, kind: SeedNumericKind): string {
  const unit = text(value, 'seed unit');
  if (kind === 'MONEY') {
    if (!CURRENCY.test(unit))
      invalid('Money must state an ISO-style currency code');
  } else if (kind === 'SHARE') {
    if (unit !== 'ratio') invalid('Trade dependency share must use ratio');
  } else if (!UNIT.test(unit) || /(?:index|score|point|percent)/u.test(unit)) {
    invalid('Measured unit cannot be an index, score or percentage label');
  }
  return unit;
}

function source(value: unknown): CountrySeedSource {
  const raw = record(value, 'seed source');
  keys(
    raw,
    [
      'sourceRef',
      'sourceKind',
      'locator',
      'sourceVersion',
      'contentSha256',
      'periodRef',
      'geographyRef',
    ],
    'seed source',
  );
  const sourceKind = choice(raw.sourceKind, SOURCE_KINDS, 'source kind');
  const periodRef = nullableId(raw.periodRef, 'source periodRef');
  const geographyRef = nullableId(raw.geographyRef, 'source geographyRef');
  if (
    sourceKind !== 'DESIGN_ASSUMPTION' &&
    (periodRef === null || geographyRef === null)
  )
    invalid('Observed/index source requires period and geography');
  if (sourceKind === 'DESIGN_ASSUMPTION' && periodRef !== null)
    invalid('Design assumption cannot claim an observation period');
  const contentSha256 = text(raw.contentSha256, 'source digest');
  if (!SHA256.test(contentSha256))
    invalid('Source digest must be lowercase SHA-256 hex');
  return Object.freeze({
    sourceRef: id(raw.sourceRef, 'sourceRef'),
    sourceKind,
    locator: text(raw.locator, 'source locator'),
    sourceVersion: text(raw.sourceVersion, 'source version'),
    contentSha256,
    periodRef,
    geographyRef,
  });
}

function scope(
  raw: InputRecord,
  countryId: string,
  countries: ReadonlySet<string>,
): CountrySeedFieldScope {
  const domain = choice(raw.domain, DOMAINS, 'seed domain');
  const counterpartyCountryId = nullableId(
    raw.counterpartyCountryId,
    'counterparty country',
  );
  if (domain === 'TRADE_DEPENDENCY') {
    if (
      counterpartyCountryId === null ||
      !countries.has(counterpartyCountryId) ||
      counterpartyCountryId === countryId
    )
      invalid('Trade dependency requires a distinct configured counterparty');
  } else if (counterpartyCountryId !== null)
    invalid('Only trade dependency may name a counterparty');
  return {
    domain,
    metricRef: id(raw.metricRef, 'metricRef'),
    subjectRef: nullableId(raw.subjectRef, 'subjectRef'),
    counterpartyCountryId,
  };
}

function field(
  value: unknown,
  countryId: string,
  countries: ReadonlySet<string>,
  sources: ReadonlyMap<string, CountrySeedSource>,
): CountrySeedField {
  const raw = record(value, 'country seed field');
  const status = choice(
    raw.status,
    ['VALUE', 'MISSING', 'LEGACY_INDEX_ONLY'] as const,
    'seed field status',
  );
  const common = scope(raw, countryId, countries);
  const commonKeys = [
    'status',
    'domain',
    'metricRef',
    'subjectRef',
    'counterpartyCountryId',
  ];
  if (status === 'MISSING') {
    keys(
      raw,
      [...commonKeys, 'numericKind', 'unit', 'reason', 'sourceRef'],
      'missing field',
    );
    if (raw.sourceRef !== null)
      invalid('Missing value cannot claim a numeric source');
    const kind = numericKind(raw.numericKind, common.domain);
    return Object.freeze({
      status,
      ...common,
      numericKind: kind,
      unit: numericUnit(raw.unit, kind),
      reason: choice(
        raw.reason,
        ['SOURCE_NOT_AVAILABLE', 'NOT_CALIBRATED', 'NOT_APPLICABLE'] as const,
        'missing reason',
      ),
      sourceRef: null,
    });
  }
  const sourceRef = id(raw.sourceRef, 'field sourceRef');
  const evidence = sources.get(sourceRef);
  if (evidence === undefined) invalid('Field references an unknown source');
  if (status === 'LEGACY_INDEX_ONLY') {
    keys(
      raw,
      [...commonKeys, 'indexScore', 'sourceRef', 'conversionProhibited'],
      'legacy index field',
    );
    if (
      evidence.sourceKind !== 'LEGACY_INDEX' ||
      evidence.geographyRef !== countryId ||
      raw.conversionProhibited !== true
    )
      invalid('Legacy index must remain quarantined for its own country');
    const indexScore = decimal(raw.indexScore, 'legacy index score');
    if (parseWorldDecimal(indexScore).greaterThan(100))
      invalid('Legacy index score must be within 0–100');
    return Object.freeze({
      status,
      ...common,
      indexScore,
      sourceRef,
      conversionProhibited: true,
    });
  }
  keys(
    raw,
    [
      ...commonKeys,
      'numericKind',
      'amount',
      'unit',
      'sourceRef',
      'valueOrigin',
      'derivationRef',
      'assumptionRef',
    ],
    'exact-value field',
  );
  const valueOrigin = choice(raw.valueOrigin, VALUE_ORIGINS, 'value origin');
  const derivationRef = nullableId(raw.derivationRef, 'derivationRef');
  const assumptionRef = nullableId(raw.assumptionRef, 'assumptionRef');
  if (evidence.sourceKind === 'LEGACY_INDEX')
    invalid('Legacy 0–100 index cannot become a measured value');
  if (valueOrigin === 'DESIGN_ASSUMPTION') {
    if (
      evidence.sourceKind !== 'DESIGN_ASSUMPTION' ||
      assumptionRef === null ||
      derivationRef !== null
    )
      invalid(
        'Design value requires a documented assumption source and reference',
      );
  } else if (valueOrigin === 'DERIVED') {
    if (
      evidence.sourceKind !== 'OBSERVED_SNAPSHOT' ||
      derivationRef === null ||
      assumptionRef !== null
    )
      invalid(
        'Derived value requires observed source and transformation reference',
      );
  } else if (
    evidence.sourceKind !== 'OBSERVED_SNAPSHOT' ||
    evidence.geographyRef !== countryId ||
    derivationRef !== null ||
    assumptionRef !== null
  ) {
    invalid(
      'Observed value requires same-country snapshot without assumption or derivation',
    );
  }
  const kind = numericKind(raw.numericKind, common.domain);
  const amount = decimal(raw.amount, 'seed amount');
  const parsed = parseWorldDecimal(amount);
  if (kind === 'COUNT' && !parsed.isInteger())
    invalid('Count must be an integer exact value');
  if (kind === 'SHARE' && parsed.greaterThan(1))
    invalid('Share must be within [0,1]');
  return Object.freeze({
    status,
    ...common,
    numericKind: kind,
    amount,
    unit: numericUnit(raw.unit, kind),
    sourceRef,
    valueOrigin,
    derivationRef,
    assumptionRef,
  });
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Strict, deterministic evidence preparation; it does not populate World State. */
export function parseCountrySeedProvenance(
  value: unknown,
): CountrySeedProvenancePreparation {
  // Canonical serialization first rejects numbers, proxies, accessors, sparse
  // arrays and non-JSON objects before any field can be silently ignored.
  const raw = record(
    JSON.parse(canonicalSerialize(value)),
    'country seed provenance',
  );
  keys(
    raw,
    [
      'schemaVersion',
      'worldId',
      'seasonRef',
      'configuredCountryIds',
      'sources',
      'countries',
    ],
    'country seed provenance',
  );
  if (raw.schemaVersion !== COUNTRY_SEED_PROVENANCE_SCHEMA)
    invalid('Unsupported country seed provenance schema');
  const configuredCountryIds = list(
    raw.configuredCountryIds,
    'configured countries',
  )
    .map((entry) => id(entry, 'configured country'))
    .sort(compare);
  if (
    configuredCountryIds.length < 1 ||
    configuredCountryIds.length > 70 ||
    new Set(configuredCountryIds).size !== configuredCountryIds.length
  )
    invalid(
      'Country count/identities must come from a unique Season configuration within the design cap',
    );
  const configured = new Set(configuredCountryIds);
  const sources = list(raw.sources, 'sources')
    .map(source)
    .sort((a, b) => compare(a.sourceRef, b.sourceRef));
  if (new Set(sources.map((entry) => entry.sourceRef)).size !== sources.length)
    invalid('Source references must be unique');
  const sourceMap = new Map(
    sources.map((entry) => [entry.sourceRef, entry] as const),
  );
  const countries = list(raw.countries, 'country records')
    .map((entry) => {
      const country = record(entry, 'country record');
      keys(country, ['countryId', 'fields'], 'country record');
      const countryId = id(country.countryId, 'countryId');
      if (!configured.has(countryId))
        invalid('Country record is not in Season configuration');
      const fields = list(country.fields, 'country fields').map((item) =>
        field(item, countryId, configured, sourceMap),
      );
      const fieldKeys = fields.map((item) =>
        canonicalSerialize([
          item.domain,
          item.metricRef,
          item.subjectRef,
          item.counterpartyCountryId,
        ]),
      );
      if (new Set(fieldKeys).size !== fieldKeys.length)
        invalid('Country opening metric identities must be unique');
      if (
        DOMAINS.some((domain) => !fields.some((item) => item.domain === domain))
      )
        invalid(
          'Country must declare all six opening domains, including explicit MISSING',
        );
      fields.sort((a, b) =>
        compare(
          canonicalSerialize([
            a.domain,
            a.metricRef,
            a.subjectRef,
            a.counterpartyCountryId,
          ]),
          canonicalSerialize([
            b.domain,
            b.metricRef,
            b.subjectRef,
            b.counterpartyCountryId,
          ]),
        ),
      );
      return Object.freeze({ countryId, fields: Object.freeze(fields) });
    })
    .sort((a, b) => compare(a.countryId, b.countryId));
  if (
    countries.length !== configuredCountryIds.length ||
    new Set(countries.map((entry) => entry.countryId)).size !== countries.length
  )
    invalid('Country records must exactly cover Season configuration');
  const allFields = countries.flatMap((country) => country.fields);
  const usedSourceRefs = new Set(
    allFields
      .filter((entry) => entry.status !== 'MISSING')
      .map((entry) => entry.sourceRef),
  );
  if (sources.some((entry) => !usedSourceRefs.has(entry.sourceRef)))
    invalid('Every declared source must bind at least one country field');
  const body = Object.freeze({
    schemaVersion: COUNTRY_SEED_PROVENANCE_SCHEMA,
    status: COUNTRY_SEED_PROVENANCE_STATUS,
    dataCompleteness: allFields.some((entry) => entry.status !== 'VALUE')
      ? ('INCOMPLETE' as const)
      : ('UNVERIFIED_VALUES_ONLY' as const),
    worldId: id(raw.worldId, 'worldId'),
    seasonRef: id(raw.seasonRef, 'seasonRef'),
    configuredCountryIds: Object.freeze(configuredCountryIds),
    sources: Object.freeze(sources),
    countries: Object.freeze(countries),
  });
  return Object.freeze({ ...body, hashInput: canonicalHashInput(body) });
}
