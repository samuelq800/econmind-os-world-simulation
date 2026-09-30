import {
  DOMAIN_ERROR_CODES,
  DomainError,
  COMMODITY_ENTRIES,
  Quantity,
  countryId,
  parseOpeningSeed,
  rebuildV08LedgersFromLineage,
  type OpeningSeed,
  type Sha256Hex,
} from '@econmind/core';

import { WorldOpeningBootstrapReadback } from '../persistence/world-opening-bootstrap-readback.js';
import type { SqlDatabase } from '../persistence/sql-database.js';

const PACKAGE_ID = 'BALANCED_2026_09_28_V1';
const CHECKSUMS_SHA256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';
const SOURCE_LOCATOR = 'artifacts/world-balanced-candidate-v1/CHECKSUMS.json';

type JsonRecord = Readonly<Record<string, unknown>>;

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.OPENING_SEED_INVALID, message);
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${label} is not a record`);
  }
  return value as JsonRecord;
}

function rows(value: unknown, label: string): readonly JsonRecord[] {
  if (!Array.isArray(value)) invalid(`${label} is not an array`);
  return value.map((row) => record(row, label));
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} is not a non-empty string`);
  }
  return value;
}

function expectedCountryIds(): readonly string[] {
  return Object.freeze(
    Array.from(
      { length: 70 },
      (_, index) => `COUNTRY_${String(index + 1).padStart(2, '0')}`,
    ),
  );
}

// C's external evidence format permits JSON integer counts and geographic
// floats. Core's economic canonical serializer intentionally rejects JS
// numbers, so reproduce C's sorted-key JSON preimage only for report identity.
// No economic amount is derived from a JS number at this boundary.
function canonicalReportJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const rendered = JSON.stringify(value);
    if (rendered === undefined) invalid('Unsupported C report JSON value');
    return rendered;
  }
  if (Array.isArray(value)) {
    return `[${value.map((part) => canonicalReportJson(part)).join(',')}]`;
  }
  const object = record(value, 'C report JSON object');
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalReportJson(object[key])}`)
    .join(',')}}`;
}

function fingerprint(
  value: JsonRecord,
  field: string,
  sha256Hex: Sha256Hex,
): string {
  const stored = text(value[field], field);
  const body = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== field),
  );
  const reconstructed = `sha256:${sha256Hex(canonicalReportJson(body))}`;
  if (stored !== reconstructed)
    invalid(`${field} differs from canonical mapping facts`);
  return stored;
}

export interface OfficialOpeningAdmission {
  readonly status: 'BLOCKED' | 'SOURCE_READY_NOT_APPROVAL';
  readonly packageId: typeof PACKAGE_ID;
  readonly checksumsSha256: typeof CHECKSUMS_SHA256;
  readonly mappingFingerprint: string;
  readonly gapsFingerprint: string;
  readonly coverageFingerprint: string;
  readonly countryIds: readonly string[];
  readonly blockerCodes: readonly string[];
  readonly deferredCodes: readonly string[];
  readonly stocks: readonly JsonRecord[];
  readonly finance: readonly JsonRecord[];
}

/**
 * Reads C's selected-package mapping as diagnostic data. It checks exact
 * identity, canonical fingerprints and 70-country coverage before reporting
 * readiness. A ready report is still not an owner approval or a World write.
 */
export function inspectOfficialWorldOpeningAdmission(input: {
  readonly selectionBytes: string;
  readonly mapping: unknown;
  readonly gaps: unknown;
  readonly coverage: unknown;
  readonly sha256Hex: Sha256Hex;
}): Readonly<OfficialOpeningAdmission> {
  let selection: JsonRecord;
  try {
    selection = record(
      JSON.parse(input.selectionBytes),
      'World data selection',
    );
  } catch {
    invalid('World data selection is not valid JSON');
  }
  const selected = record(selection.balancedData, 'Selected balanced data');
  if (
    selection.decision !== 'OWNER_SELECTED_OFFICIAL_WORLD_V2_DATA_BASELINE' ||
    selected.packageId !== PACKAGE_ID ||
    selected.checksumsSha256 !== CHECKSUMS_SHA256 ||
    selected.countryCount !== 70 ||
    selected.populationTotal !== 14_712_146_434
  ) {
    invalid('Selected World dataset differs from exact owner selection');
  }
  const mapping = record(input.mapping, 'C opening mapping');
  const gaps = record(input.gaps, 'C opening gaps');
  const coverage = record(input.coverage, 'C complete coverage');
  const source = record(mapping.source, 'C mapping source');
  const authority = record(mapping.authority, 'C mapping authority');
  const invariants = record(mapping.invariants, 'C mapping invariants');
  const mapped = record(mapping.mappings, 'C mapping identities');
  const records = record(mapping.records, 'C mapping records');
  const dataFiles = record(source.dataFiles, 'C source data files');
  const mapPackage = record(source.mapPackage, 'C map package');
  const countryRows = rows(mapped.countries, 'C countries');
  const countryReports = rows(mapping.countryReports, 'C country reports');
  const stockRows = rows(records.stocks, 'C stocks');
  const financeRows = rows(records.finance, 'C finance');
  const allDatasets = rows(
    records.allOfficialDatasets,
    'C complete structured datasets',
  );
  const gapCountries = rows(gaps.countries, 'C gap countries');
  const expected = expectedCountryIds();
  const mappingFingerprint = fingerprint(
    mapping,
    'mappingFingerprint',
    input.sha256Hex,
  );
  const gapsFingerprint = fingerprint(gaps, 'gapsFingerprint', input.sha256Hex);
  const coverageFingerprint = fingerprint(
    coverage,
    'coverageFingerprint',
    input.sha256Hex,
  );
  if (
    mapping.schemaVersion !== 'OFFICIAL_WORLD_OPENING_MAPPING_V2' ||
    gaps.schemaVersion !== 'OFFICIAL_WORLD_OPENING_GAPS_V1' ||
    source.selectionSha256 !== input.sha256Hex(input.selectionBytes) ||
    source.packageId !== PACKAGE_ID ||
    source.checksumsSha256 !== CHECKSUMS_SHA256 ||
    gaps.sourcePackageId !== PACKAGE_ID ||
    gaps.sourceChecksumsSha256 !== CHECKSUMS_SHA256 ||
    gaps.mappingFingerprint !== mappingFingerprint ||
    authority.officialSelectedSourceDataset !== true ||
    authority.sourceProposalLabelsPreserved !== true ||
    authority.proposalRecordsExecuted !== false ||
    authority.workerStarted !== false ||
    authority.productionDatabaseMutated !== false ||
    source.checksumEntries !== 86 ||
    source.verifiedArtifactsIncludingChecksumManifest !== 87 ||
    mapPackage.filesVerified !== 203 ||
    mapPackage.authority !== 'VERSIONED_FILE_ASSETS_ONLY_NOT_WORLD_STATE' ||
    invariants.countryCount !== 70 ||
    invariants.populationTotal !== '14712146434' ||
    invariants.stockCellCount !== 840 ||
    invariants.positiveStockCellCount !== 619 ||
    invariants.financeRowCount !== 70 ||
    invariants.completeStructuredDatasetCount !== 34 ||
    invariants.candidateArtifactsEnumerated !== 87 ||
    invariants.mapPackageFilesEnumerated !== 203 ||
    Object.keys(dataFiles).length !== 34 ||
    allDatasets.length !== 34 ||
    countryRows.length !== 70 ||
    countryReports.length !== 70 ||
    stockRows.length !== 840 ||
    financeRows.length !== 70 ||
    gapCountries.length !== 70
  ) {
    invalid('C opening mapping does not bind the selected 70-country package');
  }
  const observedDatasets = new Set<string>();
  for (const dataset of allDatasets) {
    const sourcePath = text(dataset.sourcePath, 'Structured source path');
    const sourceFile = record(dataFiles[sourcePath], 'Structured source file');
    if (
      observedDatasets.has(sourcePath) ||
      !sourcePath.startsWith('data/') ||
      !sourcePath.endsWith('.json') ||
      dataset.sourceSha256 !== sourceFile.sha256 ||
      dataset.sourceBytes !== sourceFile.bytes ||
      dataset.structuredMappingStatus !==
        'FULL_SOURCE_RECORDS_INCLUDED_LOSSLESS' ||
      !Array.isArray(dataset.records)
    ) {
      invalid('C complete dataset coverage differs from source manifest');
    }
    observedDatasets.add(sourcePath);
  }
  if (Object.keys(dataFiles).some((path) => !observedDatasets.has(path))) {
    invalid('C complete dataset coverage omits source files');
  }
  const coverageCounts = record(coverage.counts, 'C coverage counts');
  const omissions = record(coverage.omissions, 'C coverage omissions');
  const coverageDatasets = rows(
    coverage.structuredDatasets,
    'C coverage structured datasets',
  );
  if (
    coverage.schemaVersion !== 'OFFICIAL_WORLD_COMPLETE_COVERAGE_V1' ||
    coverage.mappingFingerprint !== mappingFingerprint ||
    coverage.gapsFingerprint !== gapsFingerprint ||
    coverageCounts.checksumManifestEntries !== 86 ||
    coverageCounts.sourceArtifactsIncludingChecksumManifest !== 87 ||
    coverageCounts.structuredJsonDatasets !== 34 ||
    coverageCounts.mapPackageFiles !== 203 ||
    coverageCounts.countries !== 70 ||
    coverageCounts.omittedSourceArtifacts !== 0 ||
    coverageCounts.omittedStructuredDatasets !== 0 ||
    coverageCounts.omittedMapPackageFiles !== 0 ||
    rows(coverage.sourceArtifacts, 'C coverage source artifacts').length !==
      87 ||
    coverageDatasets.length !== 34 ||
    rows(coverage.mapAssets, 'C coverage map assets').length !== 203 ||
    rows(coverage.countries, 'C coverage countries').length !== 70 ||
    rows(omissions.sourceArtifacts, 'C omitted source artifacts').length !==
      0 ||
    rows(omissions.structuredDatasets, 'C omitted structured datasets')
      .length !== 0 ||
    rows(omissions.mapPackageFiles, 'C omitted map files').length !== 0
  ) {
    invalid('C complete coverage ledger does not bind all selected sources');
  }
  const coveragePaths = new Set<string>();
  for (const dataset of coverageDatasets) {
    const sourcePath = text(dataset.sourcePath, 'Coverage source path');
    const sourceFile = record(dataFiles[sourcePath], 'Coverage source file');
    if (
      coveragePaths.has(sourcePath) ||
      dataset.sourceSha256 !== sourceFile.sha256 ||
      dataset.sourceBytes !== sourceFile.bytes ||
      dataset.sourceRecordsIncludedInMappingV2 !== true
    ) {
      invalid('C coverage dataset differs from complete mapping');
    }
    coveragePaths.add(sourcePath);
  }
  if ([...observedDatasets].some((path) => !coveragePaths.has(path))) {
    invalid('C coverage ledger omits a structured dataset');
  }
  const observed = countryRows.map((country, index) => {
    const number = String(index + 1).padStart(2, '0');
    const sourceId = `visual-territory-${number}`;
    const coreId = countryId(text(country.coreCountryId, 'Core Country ID'));
    if (country.sourceCountryId !== sourceId || coreId !== expected[index]) {
      invalid('C opening country mapping is missing, reordered or changed');
    }
    return coreId;
  });
  const countrySet = new Set<string>(observed);
  const population = countryReports.reduce((sum, country, index) => {
    if (
      country.coreCountryId !== expected[index] ||
      country.sourceCountryId !== countryRows[index]?.sourceCountryId
    ) {
      invalid('C country report roster differs from selected mapping');
    }
    return sum + BigInt(text(country.population, 'Country population'));
  }, 0n);
  if (population !== 14_712_146_434n) {
    invalid('C population no longer matches the official 70-country total');
  }
  const commodityUnits = new Map(
    COMMODITY_ENTRIES.map((entry) => [entry.id, entry.unit]),
  );
  const expectedCells = new Set(
    observed.flatMap((country) =>
      COMMODITY_ENTRIES.map((commodity) => `${country}/${commodity.id}`),
    ),
  );
  const stockCells = new Set<string>();
  let positive = 0;
  for (const stock of stockRows) {
    const country = text(stock.coreCountryId, 'Stock Core Country ID');
    const sourceCountry = text(
      stock.sourceCountryId,
      'Stock source Country ID',
    );
    const commodity = text(stock.commodityId, 'Stock commodity ID');
    const unit = text(stock.unit, 'Stock unit');
    const key = `${country}/${commodity}`;
    if (
      !countrySet.has(country) ||
      sourceCountry !==
        countryRows[expected.indexOf(country)]?.sourceCountryId ||
      commodityUnits.get(commodity) !== unit ||
      !expectedCells.has(key) ||
      stockCells.has(key) ||
      stock.reserved !== '0' ||
      stock.inTransit !== '0'
    ) {
      invalid('C opening stock cells are duplicated or outside source scope');
    }
    const amount = Quantity.from(
      text(stock.available, 'Stock available'),
      unit,
    );
    if (amount.amount.isNegative())
      invalid('Opening stock available is negative');
    if (
      amount.toCanonicalValue().amount !==
      Quantity.from(text(stock.total, 'Stock total'), unit).toCanonicalValue()
        .amount
    ) {
      invalid(
        'C stock total differs from available plus zero nonavailable stock',
      );
    }
    if (!amount.amount.isZero()) positive += 1;
    stockCells.add(key);
  }
  if (
    positive !== 619 ||
    stockCells.size !== 840 ||
    [...expectedCells].some((cell) => !stockCells.has(cell))
  ) {
    invalid('C opening stock cell coverage or positive count changed');
  }
  const financeCountries = new Set<string>();
  for (const finance of financeRows) {
    const country = text(finance.coreCountryId, 'Finance Core Country ID');
    if (!countrySet.has(country) || financeCountries.has(country)) {
      invalid('C opening finance country coverage is invalid');
    }
    financeCountries.add(country);
  }
  const gapCodes = new Set<string>();
  const deferredCodes = new Set<string>();
  const collectGap = (gap: JsonRecord) => {
    const code = text(gap.code, 'Gap code');
    const target = text(gap.blockingTarget, 'Gap target');
    (target.startsWith('OPENING_SEED') ? gapCodes : deferredCodes).add(code);
  };
  for (const gap of rows(gaps.globalGaps, 'Global opening gaps')) {
    collectGap(gap);
  }
  for (const [index, country] of gapCountries.entries()) {
    if (country.coreCountryId !== expected[index]) {
      invalid('C gap report references an unknown country');
    }
    for (const gap of rows(country.gaps, 'Country opening gaps')) {
      collectGap(gap);
    }
  }
  const ready =
    authority.openingSeedReady === true && gaps.openingSeedReady === true;
  if (
    (ready && gapCodes.size !== 0) ||
    (authority.openingSeedReady === true) !== (gaps.openingSeedReady === true)
  ) {
    invalid('C opening readiness contradicts blocking-gap evidence');
  }
  if (ready) {
    for (const stock of stockRows) {
      if (
        stock.available !== '0' &&
        (typeof stock.titleHolderId !== 'string' ||
          typeof stock.riskBearerId !== 'string')
      ) {
        invalid('Opening-ready stock lacks approved owner or risk bearer');
      }
    }
    for (const finance of financeRows) {
      if (
        finance.coreSettlementCurrency !== 'GCU' ||
        finance.currencyAuthority !== 'APPROVED' ||
        finance.treasuryCentralBankBoundary !== 'SPLIT_APPROVED'
      ) {
        invalid('Opening-ready finance lacks approved Core currency or split');
      }
    }
  }
  return Object.freeze({
    status: ready ? 'SOURCE_READY_NOT_APPROVAL' : 'BLOCKED',
    packageId: PACKAGE_ID,
    checksumsSha256: CHECKSUMS_SHA256,
    mappingFingerprint,
    gapsFingerprint,
    coverageFingerprint,
    countryIds: Object.freeze(observed),
    blockerCodes: Object.freeze([...gapCodes].sort()),
    deferredCodes: Object.freeze([...deferredCodes].sort()),
    stocks: Object.freeze(stockRows),
    finance: Object.freeze(financeRows),
  });
}

/**
 * Explicit E-owned command, never invoked by service startup. Expected hashes
 * are deployment inputs from an independently reviewed package; matching them
 * checks identity, not approval. Current C V1 mapping is BLOCKED and cannot
 * pass this boundary. No source amounts, rights or finance are synthesized.
 */
export class OfficialWorldOpeningBootstrapper {
  readonly #readback: WorldOpeningBootstrapReadback;
  readonly #sha256Hex: Sha256Hex;

  constructor(input: {
    readonly database: SqlDatabase;
    readonly sha256Hex: Sha256Hex;
  }) {
    this.#readback = new WorldOpeningBootstrapReadback(input);
    this.#sha256Hex = input.sha256Hex;
  }

  async bootstrap(input: {
    readonly selectionBytes: string;
    readonly mapping: unknown;
    readonly gaps: unknown;
    readonly coverage: unknown;
    readonly expectedMappingFingerprint: string;
    readonly expectedGapsFingerprint: string;
    readonly expectedCoverageFingerprint: string;
    readonly expectedSeedFingerprint: string;
    readonly seed: unknown;
    readonly bootstrappedAtReal: string;
  }) {
    const admission = inspectOfficialWorldOpeningAdmission({
      selectionBytes: input.selectionBytes,
      mapping: input.mapping,
      gaps: input.gaps,
      coverage: input.coverage,
      sha256Hex: this.#sha256Hex,
    });
    if (admission.status !== 'SOURCE_READY_NOT_APPROVAL') {
      invalid(
        `Official opening is blocked: ${admission.blockerCodes.join(',')}`,
      );
    }
    if (
      admission.mappingFingerprint !== input.expectedMappingFingerprint ||
      admission.gapsFingerprint !== input.expectedGapsFingerprint ||
      admission.coverageFingerprint !== input.expectedCoverageFingerprint
    ) {
      invalid('Opening handoff differs from independently pinned fingerprints');
    }
    const seed = parseOpeningSeed(input.seed, this.#sha256Hex);
    if (seed.fingerprint !== input.expectedSeedFingerprint) {
      invalid('Opening seed differs from independently pinned fingerprint');
    }
    assertSelectedOpening(seed, admission, this.#sha256Hex);
    return this.#readback.bootstrapAndReadback({
      seed,
      bootstrappedAtReal: input.bootstrappedAtReal,
    });
  }
}

function assertSelectedOpening(
  seed: OpeningSeed,
  admission: OfficialOpeningAdmission,
  sha256Hex: Sha256Hex,
): void {
  if (
    seed.sources.length === 0 ||
    seed.sources.some(
      (source) =>
        source.sourceKind !== 'AUTHORITATIVE_DATASET' ||
        source.locator !== SOURCE_LOCATOR ||
        source.sourceVersion !== CHECKSUMS_SHA256,
    )
  ) {
    invalid(
      'Opening seed provenance does not bind the selected official package',
    );
  }
  const countryIds = new Set(admission.countryIds);
  const expected = new Map<string, string>();
  for (const stock of admission.stocks) {
    const country = text(stock.coreCountryId, 'Stock Core Country ID');
    const commodity = text(stock.commodityId, 'Stock commodity ID');
    const unit = text(stock.unit, 'Stock unit');
    expected.set(
      `${country}/${commodity}/${unit}`,
      Quantity.from(
        text(stock.available, 'Stock available'),
        unit,
      ).toCanonicalValue().amount,
    );
  }
  const actual = new Map<string, Quantity>();
  const sourceStockByKey = new Map(
    admission.stocks.map((stock) => [
      `${String(stock.coreCountryId)}/${String(stock.commodityId)}/${String(stock.unit)}`,
      stock,
    ]),
  );
  const inventoryCountries = new Set<string>();
  for (const entry of seed.inventoryEntries) {
    const account = entry.account;
    const key = `${account.countryId}/${account.commodityId}/${account.unit}`;
    if (
      !countryIds.has(account.countryId) ||
      !expected.has(key) ||
      account.bucket !== 'AVAILABLE' ||
      account.reservationId !== null ||
      account.shipmentId !== null
    ) {
      invalid('Opening inventory contains an unselected or non-available fact');
    }
    const stock = sourceStockByKey.get(key);
    if (
      stock === undefined ||
      account.titleHolderId !== stock.titleHolderId ||
      account.riskBearerId !== stock.riskBearerId
    ) {
      invalid('Opening inventory rights differ from approved stock binding');
    }
    actual.set(
      key,
      (actual.get(key) ?? Quantity.from('0', account.unit)).add(entry.quantity),
    );
    inventoryCountries.add(account.countryId);
  }
  for (const [key, amount] of expected) {
    const actualAmount = actual.get(key)?.toCanonicalValue().amount ?? '0';
    if (actualAmount !== amount)
      invalid(`Opening inventory differs from selected stock: ${key}`);
  }
  if (inventoryCountries.size !== 70 || seed.financialBatches.length !== 70) {
    invalid('Opening ledger does not cover all 70 countries');
  }
  const financeCountries = new Set<string>();
  for (const batch of seed.financialBatches) {
    if (batch.settlementCurrency !== 'GCU') {
      invalid('Opening financial batch is not in Core GCU');
    }
    const countries = new Set(batch.legs.map((leg) => leg.account.countryId));
    if (countries.size !== 1)
      invalid('Opening financial batch spans multiple countries');
    const country = countries.values().next().value;
    if (
      country === undefined ||
      !countryIds.has(country) ||
      financeCountries.has(country)
    ) {
      invalid('Opening finance country coverage is duplicated or missing');
    }
    financeCountries.add(country);
  }
  if (financeCountries.size !== 70)
    invalid('Opening finance lacks a selected country');
  rebuildV08LedgersFromLineage({ seed, sha256Hex });
}
