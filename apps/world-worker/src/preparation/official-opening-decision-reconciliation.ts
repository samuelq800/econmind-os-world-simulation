import { createHash } from 'node:crypto';

/** Frozen inputs only. This module has no filesystem, SQL or runtime caller. */
export const OFFICIAL_OPENING_RECONCILIATION_PINS = Object.freeze({
  packageId: 'BALANCED_2026_09_28_V1',
  checksumsSha256:
    '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315',
  mappingSha256:
    'd2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253',
  coverageSha256:
    'c42a8336b59eec986c576427c85c6db4aca986fc0632e6b572b9e997f4f835e9',
  proposalSha256:
    '15383e28d523bad7ff4fdbe14e141c7a46f21072c9bd4a81faa5a5acc378c7cb',
});

type RecordValue = Readonly<Record<string, unknown>>;
export interface OpeningReconciliationBlocker {
  readonly code: string;
  readonly field: string;
  readonly countryId: string | null;
  readonly detail: string;
}

export interface OfficialOpeningSourceBytes {
  readonly checksumsBytes: string;
  readonly mappingBytes: string;
  readonly coverageBytes: string;
  readonly proposalBytes: string;
  /** Exact data/*.json set, not a filesystem path or a fetching callback. */
  readonly datasets: Readonly<Record<string, string>>;
}

export interface OpeningDomainProvenance {
  readonly dataset: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly sourceRecordCount: number;
  readonly countryIds: readonly string[];
  readonly regionIds: readonly string[];
  readonly openingApplicability: string;
  readonly adoptionStatus: 'SOURCE_ONLY_NOT_ADOPTED' | 'PROPOSAL_ONLY';
}

export interface VerifiedOfficialOpeningSource {
  readonly status: 'VALIDATED_SOURCE_NOT_ADOPTION';
  readonly pins: typeof OFFICIAL_OPENING_RECONCILIATION_PINS;
  readonly countryIds: readonly string[];
  readonly financeOriginals: readonly RecordValue[];
  /** Already-reported expected/delta values are evidence, never adopted Money. */
  readonly financeReportedReconciliation: readonly RecordValue[];
  readonly stocks: readonly RecordValue[];
  readonly stockOriginals: readonly RecordValue[];
  readonly legalEntityProposals: readonly RecordValue[];
  readonly commodities: readonly RecordValue[];
  readonly domains: readonly OpeningDomainProvenance[];
}

const verifiedSources = new WeakSet<object>();

class SourceFailure extends Error {
  constructor(readonly blocker: OpeningReconciliationBlocker) {
    super(blocker.detail);
  }
}

function fail(
  field: string,
  detail: string,
  countryId: string | null = null,
): never {
  throw new SourceFailure({
    code: 'OFFICIAL_OPENING_SOURCE_MISMATCH',
    field,
    countryId,
    detail,
  });
}

function record(value: unknown, field: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(field, 'Expected a record');
  }
  return value as RecordValue;
}

function rows(value: unknown, field: string): readonly RecordValue[] {
  if (!Array.isArray(value)) fail(field, 'Expected an array');
  return value.map((row, index) => record(row, `${field}/${index}`));
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    fail(field, 'Expected text');
  return value;
}

function hash(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const item = value as RecordValue;
    return `{${Object.keys(item)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function pinned(bytes: string, expected: string, field: string): unknown {
  if (typeof bytes !== 'string' || hash(bytes) !== expected) {
    fail(field, 'Bytes differ from independently fixed input');
  }
  try {
    return JSON.parse(bytes) as unknown;
  } catch {
    return fail(field, 'Invalid JSON');
  }
}

/** The Node 24 context.source primitive used by the existing mapping script.
 * Never stringify an already-parsed Number or use a numeric fallback. */
function lossless(bytes: string, field: string): unknown {
  const parse = JSON.parse as (
    input: string,
    reviver: (
      key: string,
      value: unknown,
      context: { readonly source?: string },
    ) => unknown,
  ) => unknown;
  try {
    return parse(bytes, (_key, value, context) => {
      if (typeof value !== 'number') return value;
      if (typeof context?.source !== 'string')
        fail(field, 'Lossless JSON context is unavailable');
      return context.source;
    });
  } catch (error) {
    if (error instanceof SourceFailure) throw error;
    return fail(field, 'Invalid source JSON');
  }
}

function equal(
  actual: unknown,
  expected: unknown,
  field: string,
  countryId: string | null = null,
): void {
  if (canonical(actual) !== canonical(expected))
    fail(field, 'Original source/mapping equality failed', countryId);
}

// The legacy per-field view removes insignificant trailing zeroes. Its full
// source-record view above must still match the original lexeme byte-for-byte.
// This comparison changes no value and performs no rounding or adoption.
function decimalLexeme(value: unknown, field: string): string {
  const raw = text(value, field);
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(raw)) {
    fail(field, 'Exact decimal lexeme required');
  }
  const normalized = raw.includes('.')
    ? raw.replace(/0+$/u, '').replace(/\.$/u, '')
    : raw;
  return normalized === '-0' ? '0' : normalized;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function checkedCountries(
  value: unknown,
  field: string,
): readonly RecordValue[] {
  const countries = rows(value, field);
  if (countries.length !== 70)
    fail(field, 'Exactly 70 unique countries required');
  const expected = new Set(
    Array.from({ length: 70 }, (_, index) =>
      String(index + 1).padStart(2, '0'),
    ),
  );
  for (const item of countries) {
    const coreId = text(item.coreCountryId, `${field}/coreCountryId`);
    const number = coreId.replace(/^COUNTRY_/u, '');
    if (
      !expected.delete(number) ||
      coreId !== `COUNTRY_${number}` ||
      item.sourceCountryId !== `visual-territory-${number}`
    ) {
      fail(field, 'Unknown, duplicate or cross-country binding', coreId);
    }
  }
  return countries;
}

function inspectSource(
  input: OfficialOpeningSourceBytes,
): VerifiedOfficialOpeningSource {
  const pins = OFFICIAL_OPENING_RECONCILIATION_PINS;
  const checksums = rows(
    pinned(input.checksumsBytes, pins.checksumsSha256, 'checksumsBytes'),
    'checksums',
  );
  const mapping = record(
    pinned(input.mappingBytes, pins.mappingSha256, 'mappingBytes'),
    'mapping',
  );
  const coverage = record(
    pinned(input.coverageBytes, pins.coverageSha256, 'coverageBytes'),
    'coverage',
  );
  if (
    typeof input.proposalBytes !== 'string' ||
    hash(input.proposalBytes) !== pins.proposalSha256
  ) {
    fail(
      'proposalBytes',
      'Sole E proposal identity is required; a matching hash is not adoption',
    );
  }
  equal(
    mapping.schemaVersion,
    'OFFICIAL_WORLD_OPENING_MAPPING_V2',
    'mapping/schemaVersion',
  );
  const source = record(mapping.source, 'mapping/source');
  equal(source.packageId, pins.packageId, 'mapping/source/packageId');
  equal(
    source.checksumsSha256,
    pins.checksumsSha256,
    'mapping/source/checksumsSha256',
  );
  equal(
    coverage.mappingFingerprint,
    mapping.mappingFingerprint,
    'coverage/mappingFingerprint',
  );
  const mapped = record(mapping.mappings, 'mapping/mappings');
  const countryRows = checkedCountries(
    mapped.countries,
    'mapping/mappings/countries',
  );
  const coverageCountries = checkedCountries(
    coverage.countries,
    'coverage/countries',
  );
  equal(
    countryRows.map((row) => row.coreCountryId).sort(),
    coverageCountries.map((row) => row.coreCountryId).sort(),
    'coverage/countries',
  );
  const countryIds = countryRows
    .map((row) => text(row.coreCountryId, 'countryId'))
    .sort();
  const records = record(mapping.records, 'mapping/records');
  const datasets = rows(
    records.allOfficialDatasets,
    'mapping/records/allOfficialDatasets',
  );
  const paths = datasets
    .map((row) => text(row.sourcePath, 'dataset/sourcePath'))
    .sort();
  if (datasets.length !== 34 || new Set(paths).size !== 34)
    fail('datasets', 'Exactly 34 unique structured datasets required');
  equal(Object.keys(input.datasets).sort(), paths, 'datasets/paths');
  const dataFiles = record(source.dataFiles, 'mapping/source/dataFiles');
  const coverageDatasets = rows(
    coverage.structuredDatasets,
    'coverage/structuredDatasets',
  );
  const parsed = new Map<string, unknown>();
  const domains: OpeningDomainProvenance[] = [];
  for (const dataset of datasets) {
    const sourcePath = text(dataset.sourcePath, 'dataset/sourcePath');
    const bytes = input.datasets[sourcePath];
    if (bytes === undefined)
      fail(`datasets/${sourcePath}`, 'Missing exact source bytes');
    const sha = hash(bytes),
      size = Buffer.byteLength(bytes, 'utf8');
    const entry = checksums.find((row) => row.path === sourcePath);
    if (entry === undefined)
      fail(
        `checksums/${sourcePath}`,
        'Dataset is not in pinned checksum manifest',
      );
    equal(
      { sha256: sha, bytes: size },
      { sha256: entry.sha256, bytes: entry.bytes },
      `datasets/${sourcePath}/identity`,
    );
    equal(
      { sha256: sha, bytes: size },
      dataFiles[sourcePath],
      `mapping/source/dataFiles/${sourcePath}`,
    );
    equal(
      { sha256: sha, bytes: size },
      { sha256: dataset.sourceSha256, bytes: dataset.sourceBytes },
      `mapping/datasets/${sourcePath}/identity`,
    );
    const raw = lossless(bytes, `datasets/${sourcePath}`);
    const originalRows = Array.isArray(raw) ? raw : [raw];
    const mappedRows = rows(
      dataset.records,
      `mapping/datasets/${sourcePath}/records`,
    );
    equal(
      mappedRows.map((row) => row.source),
      originalRows,
      `mapping/datasets/${sourcePath}/originals`,
    );
    equal(
      dataset.sourceRecordCount,
      originalRows.length,
      `mapping/datasets/${sourcePath}/count`,
    );
    const cover = coverageDatasets.find((row) => row.sourcePath === sourcePath);
    if (cover === undefined)
      fail(`coverage/${sourcePath}`, 'Dataset coverage missing');
    equal(
      { hash: cover.sourceSha256, count: cover.sourceRecordCount },
      { hash: sha, count: originalRows.length },
      `coverage/${sourcePath}`,
    );
    const countryRefs = new Set<string>(),
      regionRefs = new Set<string>();
    for (const row of mappedRows) {
      for (const binding of rows(row.countryBindings, 'countryBindings')) {
        const id = text(binding.coreCountryId, 'coreCountryId');
        if (!countryIds.includes(id))
          fail(
            `mapping/datasets/${sourcePath}/countryBindings`,
            'Unknown country',
            id,
          );
        equal(
          binding.sourceCountryId,
          `visual-territory-${id.slice(-2)}`,
          `mapping/datasets/${sourcePath}/countryBindings`,
          id,
        );
        countryRefs.add(id);
      }
      for (const binding of rows(row.regionBindings, 'regionBindings'))
        regionRefs.add(text(binding.normalizedRegionId, 'normalizedRegionId'));
    }
    const applicability = text(
      dataset.openingApplicability,
      'openingApplicability',
    );
    domains.push({
      dataset: text(dataset.dataset, 'dataset'),
      sourcePath,
      sourceSha256: sha,
      sourceBytes: size,
      sourceRecordCount: originalRows.length,
      countryIds: [...countryRefs].sort(),
      regionIds: [...regionRefs].sort(),
      openingApplicability: applicability,
      adoptionStatus:
        applicability === 'PROPOSAL_READ_ONLY'
          ? 'PROPOSAL_ONLY'
          : 'SOURCE_ONLY_NOT_ADOPTED',
    });
    parsed.set(sourcePath, raw);
  }
  const finance = checkedCountries(records.finance, 'mapping/records/finance');
  const originals = rows(parsed.get('data/finance.json'), 'data/finance.json');
  const originalByCountry = new Map(
    originals.map((row) => [row.countryId, row]),
  );
  if (originalByCountry.size !== 70 || originals.length !== 70)
    fail('data/finance.json', 'Duplicate or missing country');
  for (const row of finance) {
    const id = text(row.coreCountryId, 'finance/coreCountryId');
    const raw = originalByCountry.get(row.sourceCountryId);
    if (raw === undefined)
      fail('finance/sourceCountryId', 'Unbound source finance', id);
    equal(raw.currency, 'GCU_SCENARIO_ACCOUNTING_UNIT', 'finance/currency', id);
    equal(row.currency, raw.currency, 'finance/currency', id);
    for (const [field, value] of Object.entries(
      record(row.values, 'finance/values'),
    )) {
      if (
        typeof value !== 'string' ||
        !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)
      )
        fail(`finance/${field}`, 'Decimal lexeme required', id);
      equal(
        decimalLexeme(value, `finance/${field}`),
        decimalLexeme(raw[field], `finance/${field}`),
        `finance/${field}`,
        id,
      );
    }
  }
  const stocks = rows(records.stocks, 'stocks');
  const sourceStocks = rows(parsed.get('data/stocks.json'), 'data/stocks.json');
  const byStock = new Map(sourceStocks.map((row) => [row.id, row]));
  if (stocks.length !== 840 || byStock.size !== 840)
    fail('stocks', '840 unique source stock cells required');
  for (const row of stocks) {
    const raw = byStock.get(row.sourceStockId);
    if (raw === undefined) fail('stocks/sourceStockId', 'Source stock missing');
    for (const field of ['commodityId', 'unit']) {
      equal(
        row[field],
        raw[field],
        `stocks/${field}`,
        String(row.coreCountryId),
      );
    }
    // total is an existing report derivation, not a field in raw stocks.json.
    for (const field of ['available', 'reserved', 'inTransit'])
      equal(
        decimalLexeme(row[field], `stocks/${field}`),
        decimalLexeme(raw[field], `stocks/${field}`),
        `stocks/${field}`,
        String(row.coreCountryId),
      );
  }
  const result = freeze({
    status: 'VALIDATED_SOURCE_NOT_ADOPTION' as const,
    pins,
    countryIds,
    financeOriginals: originals,
    financeReportedReconciliation: finance.map((row) => ({
      coreCountryId: row.coreCountryId,
      ...record(row.reconciliation, 'finance/reconciliation'),
    })),
    stocks,
    stockOriginals: sourceStocks,
    legalEntityProposals: rows(mapped.entityProposals, 'entityProposals'),
    commodities: rows(mapped.commodities, 'commodities'),
    domains,
  });
  verifiedSources.add(result);
  return result;
}

export function inspectOfficialOpeningDecisionSource(
  input: OfficialOpeningSourceBytes,
):
  | Readonly<{
      status: 'INVALID_SOURCE';
      blockers: readonly OpeningReconciliationBlocker[];
      source: null;
    }>
  | Readonly<{
      status: 'VALIDATED_SOURCE_NOT_ADOPTION';
      blockers: readonly [];
      source: VerifiedOfficialOpeningSource;
    }> {
  try {
    const source = inspectSource(input);
    return Object.freeze({
      status: source.status,
      blockers: Object.freeze([]) as readonly [],
      source,
    });
  } catch (error) {
    if (!(error instanceof SourceFailure)) throw error;
    return freeze({
      status: 'INVALID_SOURCE' as const,
      blockers: [error.blocker],
      source: null,
    });
  }
}

/** Consumers cannot substitute a fabricated or mutated source inspection. */
export function isVerifiedOfficialOpeningDecisionSource(
  value: unknown,
): value is VerifiedOfficialOpeningSource {
  return (
    value !== null && typeof value === 'object' && verifiedSources.has(value)
  );
}
