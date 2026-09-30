import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BALANCED_CANDIDATE_ID,
  BALANCED_CANDIDATE_ROOT,
  BALANCED_POPULATION,
  loadBalancedCountryCandidate,
} from './balanced-country-candidate-intake.mjs';

export const OFFICIAL_WORLD_MAPPING_SCHEMA_VERSION =
  'OFFICIAL_WORLD_OPENING_MAPPING_V1';
export const OFFICIAL_WORLD_GAPS_SCHEMA_VERSION =
  'OFFICIAL_WORLD_OPENING_GAPS_V1';
export const OFFICIAL_WORLD_CHECKSUMS_SHA256 =
  '88dd44478f97d2e8893a4f11b3aaf96e256bdb13248aca0d08f097fabe10d315';

const EXPECTED_MAP_MANIFEST_SHA256 =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
const MAP_MANIFEST_PATH = 'artifacts/world-map-files-v1/manifest.json';
const OFFICIAL_COUNTRY_SCENE_INDEX =
  'apps/world-web/src/assets/country-scenes/index.json';
const OFFICIAL_COUNTRY_DETAIL_INDEX =
  'apps/world-web/src/assets/country-detail/index.json';
const MAPPING_OUTPUT =
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_MAPPING.json';
const GAPS_OUTPUT =
  'docs/reports/world-connection/C_OFFICIAL_WORLD_OPENING_GAPS.json';
const EXPECTED_COMMODITIES = Object.freeze([
  ['BATTERIES', 'MWh-equivalent'],
  ['COPPER', 'tonne'],
  ['CRUDE_OIL', 'barrel'],
  ['GRAIN', 'tonne'],
  ['IRON_ORE', 'tonne'],
  ['LITHIUM', 'tonne LCE'],
  ['MACHINERY', 'equipment unit'],
  ['NATURAL_GAS', 'MMBtu'],
  ['REFINED_FUEL', 'barrel equivalent'],
  ['SEMICONDUCTORS', 'standardised chip unit'],
  ['STEEL', 'tonne'],
  ['URANIUM', 'tonne U'],
]);
const REQUIRED_DATA_FILES = Object.freeze([
  'data/commodity-catalog.json',
  'data/countries.json',
  'data/deposits.json',
  'data/employment.json',
  'data/entities.json',
  'data/facilities.json',
  'data/facility-map-links.json',
  'data/finance.json',
  'data/illustration-links.json',
  'data/population-services.json',
  'data/power.json',
  'data/regions.json',
  'data/seasonal-water.json',
  'data/stocks.json',
  'data/water-allocations.json',
]);
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function reject(code, detail = '') {
  throw new Error(detail.length === 0 ? code : `${code}:${detail}`);
}

function checkedRelativePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.startsWith('../') ||
    value === '..'
  ) {
    reject('OFFICIAL_WORLD_INVALID_SOURCE_PATH');
  }
  return value;
}

function parseLosslessJson(text, label) {
  try {
    return JSON.parse(text, (_key, value, context) =>
      typeof value === 'number' ? context.source : value,
    );
  } catch (error) {
    reject('OFFICIAL_WORLD_INVALID_JSON', `${label}:${String(error)}`);
  }
}

function array(value, label) {
  if (!Array.isArray(value)) reject('OFFICIAL_WORLD_EXPECTED_ARRAY', label);
  return value;
}

function object(value, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    reject('OFFICIAL_WORLD_EXPECTED_RECORD', label);
  }
  return value;
}

function string(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    reject('OFFICIAL_WORLD_EXPECTED_STRING', label);
  }
  return value;
}

function uniqueIndex(rows, identity, label) {
  const result = new Map();
  for (const row of rows) {
    const key = identity(row);
    if (result.has(key))
      reject('OFFICIAL_WORLD_DUPLICATE_ID', `${label}:${key}`);
    result.set(key, row);
  }
  return result;
}

function canonicalSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`)
    .join(',')}}`;
}

function decimalParts(value, label) {
  const source = string(value, label);
  if (!DECIMAL.test(source)) reject('OFFICIAL_WORLD_INVALID_DECIMAL', label);
  const negative = source.startsWith('-');
  const unsigned = negative ? source.slice(1) : source;
  const [mantissa, exponentText] = unsigned.toLowerCase().split('e');
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const [whole, fraction = ''] = mantissa.split('.');
  let digits = `${whole}${fraction}`.replace(/^0+(?=\d)/u, '');
  let scale = fraction.length - exponent;
  if (scale < 0) {
    digits += '0'.repeat(-scale);
    scale = 0;
  }
  const coefficient = BigInt(digits.length === 0 ? '0' : digits);
  return {
    coefficient: negative ? -coefficient : coefficient,
    scale,
  };
}

function renderDecimal({ coefficient, scale }) {
  if (coefficient === 0n) return '0';
  const negative = coefficient < 0n;
  let digits = (negative ? -coefficient : coefficient).toString();
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  if (digits.length <= scale)
    digits = `${'0'.repeat(scale + 1 - digits.length)}${digits}`;
  const point = digits.length - scale;
  const whole = digits.slice(0, point);
  const fraction = digits.slice(point).replace(/0+$/u, '');
  return `${negative ? '-' : ''}${whole}${fraction.length === 0 ? '' : `.${fraction}`}`;
}

function align(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * 10n ** BigInt(scale - left.scale),
    right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  ];
}

function addDecimals(left, right, label = 'decimal addition') {
  const [a, b, scale] = align(
    decimalParts(left, label),
    decimalParts(right, label),
  );
  return renderDecimal({ coefficient: a + b, scale });
}

function subtractDecimals(left, right, label = 'decimal subtraction') {
  const [a, b, scale] = align(
    decimalParts(left, label),
    decimalParts(right, label),
  );
  return renderDecimal({ coefficient: a - b, scale });
}

function canonicalDecimal(value, label) {
  return renderDecimal(decimalParts(value, label));
}

function absoluteLessThanOrEqual(value, threshold, label) {
  const [left, right] = align(
    decimalParts(value, label),
    decimalParts(threshold, label),
  );
  return (left < 0n ? -left : left) <= (right < 0n ? -right : right);
}

function maxAbsoluteDecimal(values, label) {
  return values.reduce((maximum, value) => {
    const [left, right] = align(
      decimalParts(value, label),
      decimalParts(maximum, label),
    );
    return (left < 0n ? -left : left) > (right < 0n ? -right : right)
      ? renderDecimal(decimalParts(value, label)).replace(/^-/, '')
      : maximum;
  }, '0');
}

function sumDecimals(values, label) {
  return values.reduce(
    (sum, value) => addDecimals(sum, canonicalDecimal(value, label), label),
    '0',
  );
}

function sourceCountryNumber(sourceCountryId) {
  const match = /^visual-territory-(\d{2})$/u.exec(sourceCountryId);
  if (match === null)
    reject('OFFICIAL_WORLD_INVALID_COUNTRY_ID', sourceCountryId);
  return match[1];
}

function coreCountryId(sourceCountryId) {
  return `COUNTRY_${sourceCountryNumber(sourceCountryId)}`;
}

function normalizedRegionId(sourceRegionId, expectedCountryId) {
  const match = /^visual-territory-(\d{2})-E([1-9]\d*)$/u.exec(sourceRegionId);
  if (match === null || `visual-territory-${match[1]}` !== expectedCountryId) {
    reject('OFFICIAL_WORLD_INVALID_REGION_BINDING', sourceRegionId);
  }
  return `REGION_${match[1]}_E${match[2]}`;
}

function proposedLegalEntityId(entity) {
  const number = sourceCountryNumber(entity.countryId);
  const role = {
    GOV: 'GOVERNMENT',
    OP: 'OPERATOR',
    HOUSEHOLDS: 'HOUSEHOLDS',
    BANK: 'BANK',
    'CENTRAL-BANK': 'CENTRAL_BANK',
  }[entity.role];
  if (role === undefined)
    reject('OFFICIAL_WORLD_UNKNOWN_ENTITY_ROLE', entity.role);
  return `ENTITY_${role}_${number}`;
}

function group(rows, identity) {
  const result = new Map();
  for (const row of rows) {
    const key = identity(row);
    const existing = result.get(key);
    if (existing === undefined) result.set(key, [row]);
    else existing.push(row);
  }
  return result;
}

function requireReference(index, key, label) {
  const value = index.get(key);
  if (value === undefined)
    reject('OFFICIAL_WORLD_UNKNOWN_REFERENCE', `${label}:${key}`);
  return value;
}

function sourceArtifact(candidate, relativePath) {
  const artifact = candidate.artifacts.find(
    (item) => item.sourcePath === relativePath,
  );
  if (artifact === undefined)
    reject('OFFICIAL_WORLD_MISSING_SOURCE', relativePath);
  return artifact;
}

async function verifyMapPackage(repositoryRoot, selection) {
  const selected = object(selection.mapFiles, 'selection.mapFiles');
  if (
    selected.packageId !== 'WORLD_MAP_FILES_V1_2026_09_28' ||
    selected.manifestPath !== MAP_MANIFEST_PATH ||
    selected.manifestSha256 !== EXPECTED_MAP_MANIFEST_SHA256 ||
    selected.fileCount !== '203'
  ) {
    reject('OFFICIAL_WORLD_MAP_SELECTION_MISMATCH');
  }
  const manifestBytes = await readFile(
    path.join(repositoryRoot, checkedRelativePath(MAP_MANIFEST_PATH)),
  );
  if (sha256(manifestBytes) !== EXPECTED_MAP_MANIFEST_SHA256) {
    reject('OFFICIAL_WORLD_MAP_MANIFEST_HASH_MISMATCH');
  }
  const manifest = parseLosslessJson(
    manifestBytes.toString('utf8'),
    MAP_MANIFEST_PATH,
  );
  const files = array(manifest.files, 'map manifest files');
  if (
    manifest.packageId !== selected.packageId ||
    manifest.authority !== 'VERSIONED_FILE_ASSETS_ONLY_NOT_WORLD_STATE' ||
    files.length !== 203
  ) {
    reject('OFFICIAL_WORLD_MAP_MANIFEST_INVALID');
  }
  uniqueIndex(
    files,
    (entry) => string(entry.path, 'map file path'),
    'map file',
  );
  for (const entry of files) {
    const relativePath = checkedRelativePath(entry.path);
    const bytes = await readFile(path.join(repositoryRoot, relativePath));
    if (
      String(bytes.length) !== entry.bytes ||
      sha256(bytes) !== entry.sha256
    ) {
      reject('OFFICIAL_WORLD_MAP_FILE_MISMATCH', relativePath);
    }
  }
  return Object.freeze({
    packageId: selected.packageId,
    manifestPath: MAP_MANIFEST_PATH,
    manifestSha256: EXPECTED_MAP_MANIFEST_SHA256,
    filesVerified: files.length,
    authority: manifest.authority,
  });
}

function gap(code, domain, blockingTarget, message) {
  return Object.freeze({ code, domain, blockingTarget, message });
}

export async function buildOfficialWorldOpeningMapping(repositoryRoot) {
  const selectionPath = path.join(
    repositoryRoot,
    'status/world-data-selection.json',
  );
  const selectionBytes = await readFile(selectionPath);
  const selection = parseLosslessJson(
    selectionBytes.toString('utf8'),
    'status/world-data-selection.json',
  );
  const balanced = object(selection.balancedData, 'selection.balancedData');
  const runtime = object(selection.runtime, 'selection.runtime');
  if (
    selection.decision !== 'OWNER_SELECTED_OFFICIAL_WORLD_V2_DATA_BASELINE' ||
    balanced.packageId !== BALANCED_CANDIDATE_ID ||
    balanced.path !== BALANCED_CANDIDATE_ROOT ||
    balanced.checksumsSha256 !== OFFICIAL_WORLD_CHECKSUMS_SHA256 ||
    balanced.countryCount !== '70' ||
    balanced.populationTotal !== String(BALANCED_POPULATION) ||
    runtime.worldId !== null ||
    runtime.openingSeedCommitted !== false ||
    runtime.workerStarted !== false ||
    runtime.productionDatabaseMutatedByThisDecision !== false
  ) {
    reject('OFFICIAL_WORLD_SELECTION_MISMATCH');
  }

  const candidate = await loadBalancedCountryCandidate(repositoryRoot);
  if (
    candidate.candidateId !== BALANCED_CANDIDATE_ID ||
    candidate.manifestSha256 !== OFFICIAL_WORLD_CHECKSUMS_SHA256 ||
    candidate.countries.length !== 70 ||
    candidate.population !== BALANCED_POPULATION ||
    candidate.activationAllowed !== false
  ) {
    reject('OFFICIAL_WORLD_BALANCED_INTAKE_MISMATCH');
  }
  const mapPackage = await verifyMapPackage(repositoryRoot, selection);

  const sourceMeta = Object.fromEntries(
    REQUIRED_DATA_FILES.map((relativePath) => {
      const artifact = sourceArtifact(candidate, relativePath);
      return [
        relativePath,
        Object.freeze({
          sha256: artifact.sha256,
          bytes: Buffer.byteLength(artifact.content),
        }),
      ];
    }),
  );
  const readData = (relativePath) => {
    const artifact = sourceArtifact(candidate, relativePath);
    return parseLosslessJson(artifact.content, relativePath);
  };

  const countries = array(readData('data/countries.json'), 'countries');
  const regions = array(readData('data/regions.json'), 'regions');
  const entities = array(readData('data/entities.json'), 'entities');
  const commodities = array(
    readData('data/commodity-catalog.json'),
    'commodity catalog',
  );
  const stocks = array(readData('data/stocks.json'), 'stocks');
  const finance = array(readData('data/finance.json'), 'finance');
  const facilities = array(readData('data/facilities.json'), 'facilities');
  const facilityMapLinks = array(
    readData('data/facility-map-links.json'),
    'facility map links',
  );
  const deposits = array(readData('data/deposits.json'), 'deposits');
  const power = array(readData('data/power.json'), 'power');
  const employment = array(readData('data/employment.json'), 'employment');
  const populationServices = array(
    readData('data/population-services.json'),
    'population services',
  );
  const waterAllocations = array(
    readData('data/water-allocations.json'),
    'water allocations',
  );
  const seasonalWater = array(
    readData('data/seasonal-water.json'),
    'seasonal water',
  );
  const illustrationLinks = object(
    readData('data/illustration-links.json'),
    'illustration links',
  );
  const officialSceneBytes = await readFile(
    path.join(repositoryRoot, OFFICIAL_COUNTRY_SCENE_INDEX),
  );
  const officialDetailBytes = await readFile(
    path.join(repositoryRoot, OFFICIAL_COUNTRY_DETAIL_INDEX),
  );
  const officialCountryScenes = array(
    parseLosslessJson(
      officialSceneBytes.toString('utf8'),
      OFFICIAL_COUNTRY_SCENE_INDEX,
    ),
    'official country scene index',
  );
  const officialCountryDetails = array(
    parseLosslessJson(
      officialDetailBytes.toString('utf8'),
      OFFICIAL_COUNTRY_DETAIL_INDEX,
    ),
    'official country detail index',
  );

  const countryById = uniqueIndex(countries, (row) => row.id, 'country');
  const regionById = uniqueIndex(regions, (row) => row.id, 'region');
  const entityById = uniqueIndex(entities, (row) => row.id, 'entity');
  const facilityById = uniqueIndex(facilities, (row) => row.id, 'facility');
  const facilityMapById = uniqueIndex(
    facilityMapLinks,
    (row) => row.facilityId,
    'facility map link',
  );
  uniqueIndex(stocks, (row) => row.id, 'stock');
  uniqueIndex(deposits, (row) => row.id, 'deposit');
  uniqueIndex(power, (row) => row.countryId, 'power country');
  uniqueIndex(employment, (row) => row.countryId, 'employment country');
  uniqueIndex(finance, (row) => row.countryId, 'finance country');
  uniqueIndex(waterAllocations, (row) => row.regionId, 'water region');
  uniqueIndex(seasonalWater, (row) => row.regionId, 'seasonal water region');

  const expectedCountryIds = Array.from(
    { length: 70 },
    (_, index) => `visual-territory-${String(index + 1).padStart(2, '0')}`,
  );
  if (
    countries.length !== 70 ||
    countries.some((country, index) => country.id !== expectedCountryIds[index])
  ) {
    reject('OFFICIAL_WORLD_COUNTRY_ORDER_MISMATCH');
  }
  const populationTotal = sumDecimals(
    countries.map((country) => country.population),
    'country population',
  );
  if (populationTotal !== String(BALANCED_POPULATION)) {
    reject('OFFICIAL_WORLD_POPULATION_MISMATCH');
  }

  const commodityPairs = commodities
    .map((row) => [row.id, row.unit])
    .sort((left, right) => left[0].localeCompare(right[0]));
  if (
    canonicalSerialize(commodityPairs) !==
    canonicalSerialize(EXPECTED_COMMODITIES)
  ) {
    reject('OFFICIAL_WORLD_COMMODITY_CATALOG_MISMATCH');
  }
  const commodityById = uniqueIndex(commodities, (row) => row.id, 'commodity');

  const regionsByCountry = group(regions, (row) => row.countryId);
  const entitiesByCountry = group(entities, (row) => row.countryId);
  const stocksByCountry = group(stocks, (row) => row.countryId);
  const financeByCountry = group(finance, (row) => row.countryId);
  const facilitiesByCountry = group(facilities, (row) => row.countryId);
  const depositsByCountry = group(deposits, (row) => row.countryId);
  const powerByCountry = group(power, (row) => row.countryId);
  const employmentByCountry = group(employment, (row) => row.countryId);
  const servicesByCountry = group(populationServices, (row) => row.countryId);
  const waterByCountry = group(waterAllocations, (row) => row.countryId);
  const balancedFrozenCountryScenes = array(
    illustrationLinks.countryScenes,
    'balanced frozen illustration country scenes',
  );
  const balancedFrozenSceneByCountry = uniqueIndex(
    balancedFrozenCountryScenes,
    (row) => row.id,
    'balanced frozen country scene',
  );
  const officialSceneByCountry = uniqueIndex(
    officialCountryScenes,
    (row) => row.id,
    'official country scene',
  );
  const officialDetailByCountry = uniqueIndex(
    officialCountryDetails,
    (row) => row.id,
    'official country detail',
  );
  if (
    officialCountryScenes.length !== 70 ||
    officialCountryDetails.length !== 70 ||
    expectedCountryIds.some(
      (countryId) =>
        !officialSceneByCountry.has(countryId) ||
        !officialDetailByCountry.has(countryId),
    )
  ) {
    reject('OFFICIAL_WORLD_MAP_COUNTRY_COVERAGE_MISMATCH');
  }

  const normalizedEntities = entities.map((entity) => {
    requireReference(countryById, entity.countryId, 'entity country');
    if (
      entity.realTeamBinding !== null ||
      entity.bindingMode !== 'UNASSIGNED_TEAM_WITH_CANDIDATE_NPC_ADMINISTRATION'
    ) {
      reject('OFFICIAL_WORLD_UNEXPECTED_EXECUTED_ENTITY_BINDING', entity.id);
    }
    return Object.freeze({
      sourceEntityId: entity.id,
      sourceCountryId: entity.countryId,
      coreCountryId: coreCountryId(entity.countryId),
      role: entity.role,
      proposedCoreLegalEntityId: proposedLegalEntityId(entity),
      realTeamBinding: null,
      bindingMode: entity.bindingMode,
      authority: 'PROPOSAL_NOT_EXECUTED',
    });
  });

  const normalizedStocks = stocks.map((stock) => {
    const country = requireReference(
      countryById,
      stock.countryId,
      'stock country',
    );
    const owner = requireReference(entityById, stock.ownerId, 'stock owner');
    const commodity = requireReference(
      commodityById,
      stock.commodityId,
      'stock commodity',
    );
    if (owner.countryId !== country.id || commodity.unit !== stock.unit) {
      reject('OFFICIAL_WORLD_STOCK_BINDING_MISMATCH', stock.id);
    }
    const number = sourceCountryNumber(country.id);
    const available = canonicalDecimal(
      stock.available,
      `${stock.id}.available`,
    );
    const reserved = canonicalDecimal(stock.reserved, `${stock.id}.reserved`);
    const inTransit = canonicalDecimal(
      stock.inTransit,
      `${stock.id}.inTransit`,
    );
    for (const [label, value] of [
      ['available', available],
      ['reserved', reserved],
      ['inTransit', inTransit],
    ]) {
      if (decimalParts(value, label).coefficient < 0n) {
        reject('OFFICIAL_WORLD_NEGATIVE_STOCK', `${stock.id}.${label}`);
      }
    }
    return Object.freeze({
      sourceStockId: stock.id,
      sourceCountryId: stock.countryId,
      coreCountryId: coreCountryId(stock.countryId),
      sourceOwnerId: stock.ownerId,
      proposedCoreTitleHolderId: proposedLegalEntityId(owner),
      titleHolderId: null,
      riskBearerId: null,
      ownershipAuthority: 'REQUIRED_NOT_INFERRED',
      sourceWarehouseId: stock.warehouseId,
      proposedInventoryLocationId: `LOCATION_${stock.warehouseId.replaceAll('-', '_')}`,
      commodityId: stock.commodityId,
      unit: stock.unit,
      available,
      reserved,
      inTransit,
      total: sumDecimals([available, reserved, inTransit], `${stock.id}.total`),
      bufferDays: canonicalDecimal(stock.bufferDays, `${stock.id}.bufferDays`),
      origin: stock.origin,
      proposedInventoryEntryId: `OPENING_STOCK_${number}_${stock.commodityId}`,
      proposedBatchId: `BATCH_OPENING_${number}_${stock.commodityId}`,
    });
  });

  const expectedStockCells = new Set(
    expectedCountryIds.flatMap((countryId) =>
      commodities.map((commodity) => `${countryId}/${commodity.id}`),
    ),
  );
  const actualStockCells = new Set(
    normalizedStocks.map(
      (stock) => `${stock.sourceCountryId}/${stock.commodityId}`,
    ),
  );
  if (
    stocks.length !== 840 ||
    actualStockCells.size !== expectedStockCells.size ||
    [...expectedStockCells].some((cell) => !actualStockCells.has(cell))
  ) {
    reject('OFFICIAL_WORLD_STOCK_COVERAGE_MISMATCH');
  }

  const normalizedFinance = finance.map((row) => {
    requireReference(countryById, row.countryId, 'finance country');
    if (
      row.currency !== 'GCU_SCENARIO_ACCOUNTING_UNIT' ||
      !Array.isArray(row.existingContracts) ||
      row.existingContracts.length !== 0 ||
      !Array.isArray(row.historicalClaims) ||
      row.historicalClaims.length !== 0
    ) {
      reject('OFFICIAL_WORLD_FINANCE_SOURCE_MISMATCH', row.countryId);
    }
    const numericFields = [
      'dailyLabourIncomeReference',
      'treasuryCentralBankBalance',
      'householdBankDeposits',
      'businessBankDeposits',
      'bankReserveAssets',
      'bankLoanAssets',
      'bankEquity',
      'bankDepositLiabilities',
      'publicDebt',
      'dailyReferenceTradeNet',
      'taxRateProposal',
      'openingPhysicalAssetBookValueGcu',
      'dailyMaintenanceBudgetGcu',
      'dailyInboundFreightBudgetGcu',
      'dailyTaxRevenueReferenceGcu',
      'dailyNetCashDrainGcu',
      'cashRunwayDays',
    ];
    const values = Object.fromEntries(
      numericFields.map((field) => [
        field,
        canonicalDecimal(row[field], `${row.countryId}.${field}`),
      ]),
    );
    const expectedDepositLiabilities = addDecimals(
      values.householdBankDeposits,
      values.businessBankDeposits,
      `${row.countryId}.deposit liabilities`,
    );
    const depositLiabilityDelta = subtractDecimals(
      values.bankDepositLiabilities,
      expectedDepositLiabilities,
      `${row.countryId}.deposit liability delta`,
    );
    const expectedBankEquity = subtractDecimals(
      addDecimals(
        values.bankReserveAssets,
        values.bankLoanAssets,
        `${row.countryId}.bank assets`,
      ),
      expectedDepositLiabilities,
      `${row.countryId}.expected equity`,
    );
    const bankEquityDelta = subtractDecimals(
      values.bankEquity,
      expectedBankEquity,
      `${row.countryId}.bank equity delta`,
    );
    const depositLiabilityDeltaClassification =
      depositLiabilityDelta === '0'
        ? 'EXACT'
        : absoluteLessThanOrEqual(
              depositLiabilityDelta,
              '0.0001',
              `${row.countryId}.deposit liability delta classification`,
            )
          ? 'FLOATING_TAIL_SOURCE_PRECISION'
          : 'ECONOMIC_SEMANTIC_DIFFERENCE';
    const bankEquityDeltaClassification =
      bankEquityDelta === '0'
        ? 'EXACT'
        : absoluteLessThanOrEqual(
              bankEquityDelta,
              '0.0001',
              `${row.countryId}.bank equity delta classification`,
            )
          ? 'FLOATING_TAIL_SOURCE_PRECISION'
          : 'ECONOMIC_SEMANTIC_DIFFERENCE';
    return Object.freeze({
      sourceCountryId: row.countryId,
      coreCountryId: coreCountryId(row.countryId),
      currency: row.currency,
      coreSettlementCurrency: null,
      currencyAuthority: 'REQUIRED_NOT_INFERRED',
      treasuryCentralBankBoundary: 'MERGED_SOURCE_BALANCE_SPLIT_REQUIRED',
      values: Object.freeze(values),
      sourceText: Object.freeze({
        openingMoneyOrigin: row.openingMoneyOrigin,
        taxBase: row.taxBase,
        priceAuthority: row.priceAuthority,
        assetFunding: row.assetFunding,
        reserveBasis: row.reserveBasis,
        cashRunwayStatus: row.cashRunwayStatus,
      }),
      sourceEmptyCollections: Object.freeze({
        existingContracts: Object.freeze([]),
        historicalClaims: Object.freeze([]),
      }),
      reconciliation: Object.freeze({
        expectedDepositLiabilities,
        sourceBankDepositLiabilities: values.bankDepositLiabilities,
        depositLiabilityDelta,
        depositLiabilityDeltaClassification,
        expectedBankEquity,
        sourceBankEquity: values.bankEquity,
        bankEquityDelta,
        bankEquityDeltaClassification,
        correctedOrRounded: false,
      }),
    });
  });

  const normalizedRegions = regions.map((region) => {
    requireReference(countryById, region.countryId, 'region country');
    return Object.freeze({
      sourceRegionId: region.id,
      normalizedRegionId: normalizedRegionId(region.id, region.countryId),
      sourceCountryId: region.countryId,
      coreCountryId: coreCountryId(region.countryId),
      source: region,
    });
  });
  const normalizedFacilities = facilities.map((facility) => {
    requireReference(countryById, facility.countryId, 'facility country');
    requireReference(regionById, facility.regionId, 'facility region');
    requireReference(entityById, facility.ownerId, 'facility owner');
    requireReference(entityById, facility.operatorId, 'facility operator');
    const mapLink = requireReference(
      facilityMapById,
      facility.id,
      'facility map link',
    );
    if (
      facility.runtimeOperational !== false ||
      facility.status !== 'UNAPPROVED_SCENARIO_ASSET' ||
      mapLink.countryId !== facility.countryId ||
      mapLink.scenePointAuthority !== 'DISPLAY_ONLY'
    ) {
      reject('OFFICIAL_WORLD_FACILITY_AUTHORITY_MISMATCH', facility.id);
    }
    return Object.freeze({
      sourceFacilityId: facility.id,
      sourceCountryId: facility.countryId,
      coreCountryId: coreCountryId(facility.countryId),
      sourceRegionId: facility.regionId,
      normalizedRegionId: normalizedRegionId(
        facility.regionId,
        facility.countryId,
      ),
      sourceOwnerId: facility.ownerId,
      sourceOperatorId: facility.operatorId,
      runtimeOperational: false,
      executionAuthorized: false,
      source: facility,
      mapLink,
    });
  });
  if (
    normalizedFacilities.length !== facilityMapLinks.length ||
    [...facilityMapById.keys()].some((id) => !facilityById.has(id))
  ) {
    reject('OFFICIAL_WORLD_FACILITY_MAP_COVERAGE_MISMATCH');
  }

  const normalizedDeposits = deposits.map((deposit) => {
    requireReference(countryById, deposit.countryId, 'deposit country');
    requireReference(regionById, deposit.regionId, 'deposit region');
    requireReference(commodityById, deposit.commodityId, 'deposit commodity');
    if (
      deposit.visibility !== 'PUBLIC_SCENARIO_CANDIDATE' ||
      deposit.developedReserveInterpretation !==
        'CONDITIONAL_ON_OPENING_FACILITY_AND_LICENSE_ADOPTION'
    ) {
      reject('OFFICIAL_WORLD_DEPOSIT_AUTHORITY_MISMATCH', deposit.id);
    }
    return Object.freeze({
      sourceDepositId: deposit.id,
      sourceCountryId: deposit.countryId,
      coreCountryId: coreCountryId(deposit.countryId),
      sourceRegionId: deposit.regionId,
      normalizedRegionId: normalizedRegionId(
        deposit.regionId,
        deposit.countryId,
      ),
      runtimeAuthorized: false,
      source: deposit,
    });
  });

  const normalizeRegionalRecord = (row, label) => {
    const countryId =
      row.countryId ??
      requireReference(regionById, row.regionId, label).countryId;
    requireReference(countryById, countryId, `${label} country`);
    requireReference(regionById, row.regionId, `${label} region`);
    return Object.freeze({
      sourceCountryId: countryId,
      coreCountryId: coreCountryId(countryId),
      sourceRegionId: row.regionId,
      normalizedRegionId: normalizedRegionId(row.regionId, countryId),
      source: row,
    });
  };
  const normalizedWater = waterAllocations.map((row) => {
    if (row.rightsStatus !== 'ALLOCATION_PROPOSAL_NOT_GRANTED') {
      reject('OFFICIAL_WORLD_WATER_AUTHORITY_MISMATCH', row.regionId);
    }
    return Object.freeze({
      ...normalizeRegionalRecord(row, 'water allocation'),
      rightsGranted: false,
    });
  });
  const normalizedSeasonalWater = seasonalWater.map((row) =>
    normalizeRegionalRecord(row, 'seasonal water'),
  );
  const normalizedServices = populationServices.map((row) => {
    if (row.sourceStatus !== 'OPENING_SOCIAL_ASSET_PROPOSAL') {
      reject('OFFICIAL_WORLD_SOCIAL_ASSET_AUTHORITY_MISMATCH', row.id);
    }
    return Object.freeze({
      ...normalizeRegionalRecord(row, 'population service'),
      executionAuthorized: false,
    });
  });
  const normalizedPower = power.map((row) => {
    requireReference(countryById, row.countryId, 'power country');
    if (
      row.status !== 'CANDIDATE_NOT_ENERGIZED' ||
      row.hourlyDispatchValidated !== false
    ) {
      reject('OFFICIAL_WORLD_POWER_AUTHORITY_MISMATCH', row.countryId);
    }
    return Object.freeze({
      sourceCountryId: row.countryId,
      coreCountryId: coreCountryId(row.countryId),
      energized: false,
      source: row,
    });
  });
  const normalizedEmployment = employment.map((row) => {
    requireReference(countryById, row.countryId, 'employment country');
    if (row.interpretation !== 'Candidate allocated posts; not runtime jobs') {
      reject('OFFICIAL_WORLD_EMPLOYMENT_AUTHORITY_MISMATCH', row.countryId);
    }
    return Object.freeze({
      sourceCountryId: row.countryId,
      coreCountryId: coreCountryId(row.countryId),
      runtimeJobsCreated: false,
      source: row,
    });
  });
  const normalizedScenes = officialCountryScenes.map((scene) => {
    const country = requireReference(countryById, scene.id, 'country scene');
    const detail = requireReference(
      officialDetailByCountry,
      scene.id,
      'country detail',
    );
    if (
      scene.number !== country.number ||
      detail.number !== country.number ||
      scene.name !== country.name ||
      detail.name !== country.name
    ) {
      reject('OFFICIAL_WORLD_MAP_COUNTRY_IDENTITY_MISMATCH', scene.id);
    }
    return Object.freeze({
      sourceCountryId: scene.id,
      coreCountryId: coreCountryId(scene.id),
      displayOnly: true,
      officialMapPackageScene: scene,
      officialMapPackageDetail: detail,
      balancedFrozenIllustrationLink:
        balancedFrozenSceneByCountry.get(scene.id) ?? null,
    });
  });

  const globalGaps = Object.freeze([
    gap(
      'WORLD_ID_BINDING_REQUIRED',
      'WORLD',
      'OPENING_SEED',
      'The selected source deliberately has no production World ID; the sole existing World must be bound externally.',
    ),
  ]);
  const countryGaps = [];
  const countryReports = [];
  for (const country of countries) {
    const countryId = country.id;
    const financeRow = financeByCountry.get(countryId)?.[0];
    const normalizedFinanceRow = normalizedFinance.find(
      (row) => row.sourceCountryId === countryId,
    );
    if (financeRow === undefined || normalizedFinanceRow === undefined) {
      reject('OFFICIAL_WORLD_MISSING_COUNTRY_FINANCE', countryId);
    }
    const gaps = [
      gap(
        'OWNER_LEGAL_ENTITY_BINDING_REQUIRED',
        'INVENTORY',
        'OPENING_SEED_INVENTORY',
        'Source OP/GOV records are unbound NPC proposals, not approved title-holder or risk-bearer identities.',
      ),
      gap(
        'SCENARIO_CURRENCY_CORE_BINDING_REQUIRED',
        'FINANCE',
        'OPENING_SEED_FINANCE',
        'GCU_SCENARIO_ACCOUNTING_UNIT has not been approved as Core settlement currency GCU.',
      ),
      gap(
        'TREASURY_CENTRAL_BANK_SPLIT_REQUIRED',
        'FINANCE',
        'OPENING_SEED_FINANCE',
        'The source supplies one merged Treasury/Central-Bank balance and no approved split rule.',
      ),
      gap(
        'TEAM_ASSIGNMENT_DEFERRED',
        'IDENTITY',
        'TEAM_AND_ROLE_ASSIGNMENT',
        'The user explicitly deferred team, country and role assignment.',
      ),
      gap(
        'FACILITY_EXECUTION_AUTHORITY_REQUIRED',
        'FACILITIES',
        'FACILITY_RUNTIME',
        'All source facilities remain unapproved scenario assets.',
      ),
      gap(
        'DEPOSIT_RUNTIME_AUTHORITY_REQUIRED',
        'DEPOSITS',
        'RESOURCE_RUNTIME',
        'Developed reserves remain conditional on facility and licence adoption.',
      ),
      gap(
        'WATER_RIGHTS_GRANT_REQUIRED',
        'WATER',
        'WATER_RUNTIME',
        'Water allocations remain proposals and no rights are granted.',
      ),
      gap(
        'POWER_ENERGIZATION_REQUIRED',
        'POWER',
        'POWER_RUNTIME',
        'The grid is candidate data, not energized or hourly-dispatch validated.',
      ),
      gap(
        'EMPLOYMENT_RUNTIME_BINDING_REQUIRED',
        'EMPLOYMENT',
        'LABOUR_RUNTIME',
        'Allocated posts are candidate records, not runtime jobs.',
      ),
      gap(
        'SOCIAL_ASSET_EXECUTION_AUTHORITY_REQUIRED',
        'POPULATION_SERVICES',
        'SOCIAL_RUNTIME',
        'Population-service records remain opening social-asset proposals.',
      ),
    ];
    if (normalizedFinanceRow.reconciliation.depositLiabilityDelta !== '0') {
      gaps.push(
        gap(
          'SOURCE_BANK_DEPOSIT_LIABILITY_RECONCILIATION_REQUIRED',
          'FINANCE',
          'OPENING_SEED_FINANCE',
          `Source liability differs from exact household plus business deposits by ${normalizedFinanceRow.reconciliation.depositLiabilityDelta} (${normalizedFinanceRow.reconciliation.depositLiabilityDeltaClassification}); source values were not changed.`,
        ),
      );
    }
    if (normalizedFinanceRow.reconciliation.bankEquityDelta !== '0') {
      gaps.push(
        gap(
          'SOURCE_BANK_EQUITY_RECONCILIATION_REQUIRED',
          'FINANCE',
          'OPENING_SEED_FINANCE',
          `Source equity differs from exact assets minus derived deposits by ${normalizedFinanceRow.reconciliation.bankEquityDelta} (${normalizedFinanceRow.reconciliation.bankEquityDeltaClassification}); source values were not changed.`,
        ),
      );
    }
    countryGaps.push(
      Object.freeze({
        sourceCountryId: countryId,
        coreCountryId: coreCountryId(countryId),
        gaps: Object.freeze(gaps),
      }),
    );
    countryReports.push(
      Object.freeze({
        sourceCountryId: countryId,
        coreCountryId: coreCountryId(countryId),
        countryName: country.name,
        population: canonicalDecimal(
          country.population,
          `${countryId}.population`,
        ),
        sourceRegionIds: Object.freeze(
          (regionsByCountry.get(countryId) ?? []).map((row) => row.id).sort(),
        ),
        sourceEntityIds: Object.freeze(
          (entitiesByCountry.get(countryId) ?? []).map((row) => row.id).sort(),
        ),
        warehouseIds: Object.freeze(
          [
            ...new Set(
              (stocksByCountry.get(countryId) ?? []).map(
                (row) => row.warehouseId,
              ),
            ),
          ].sort(),
        ),
        counts: Object.freeze({
          stockCells: (stocksByCountry.get(countryId) ?? []).length,
          financeRows: (financeByCountry.get(countryId) ?? []).length,
          facilities: (facilitiesByCountry.get(countryId) ?? []).length,
          deposits: (depositsByCountry.get(countryId) ?? []).length,
          powerRows: (powerByCountry.get(countryId) ?? []).length,
          employmentRows: (employmentByCountry.get(countryId) ?? []).length,
          populationServiceRows: (servicesByCountry.get(countryId) ?? [])
            .length,
          waterAllocationRows: (waterByCountry.get(countryId) ?? []).length,
          sceneRows: officialSceneByCountry.has(countryId) ? 1 : 0,
          blockingOrDeferredGaps: gaps.length,
        }),
      }),
    );
  }

  const openingPortfolioFacilities = normalizedFacilities.filter(
    (row) => row.source.scenarioRole === 'OPENING_PORTFOLIO',
  ).length;
  const developmentOptionFacilities = normalizedFacilities.filter(
    (row) => row.source.scenarioRole === 'DEVELOPMENT_OPTION',
  ).length;
  const positiveStocks = normalizedStocks.filter(
    (row) => decimalParts(row.available, 'positive stock').coefficient > 0n,
  ).length;
  const financeDepositMismatches = normalizedFinance.filter(
    (row) => row.reconciliation.depositLiabilityDelta !== '0',
  ).length;
  const financeEquityMismatches = normalizedFinance.filter(
    (row) => row.reconciliation.bankEquityDelta !== '0',
  ).length;
  const financeEconomicSemanticArithmeticMismatches = normalizedFinance.filter(
    (row) =>
      row.reconciliation.depositLiabilityDeltaClassification ===
        'ECONOMIC_SEMANTIC_DIFFERENCE' ||
      row.reconciliation.bankEquityDeltaClassification ===
        'ECONOMIC_SEMANTIC_DIFFERENCE',
  ).length;
  const maximumAbsoluteDepositLiabilityDelta = maxAbsoluteDecimal(
    normalizedFinance.map(
      (row) => row.reconciliation.depositLiabilityDelta,
    ),
    'maximum deposit liability delta',
  );
  const maximumAbsoluteBankEquityDelta = maxAbsoluteDecimal(
    normalizedFinance.map((row) => row.reconciliation.bankEquityDelta),
    'maximum bank equity delta',
  );

  const mappingBody = Object.freeze({
    schemaVersion: OFFICIAL_WORLD_MAPPING_SCHEMA_VERSION,
    status: 'MAPPED_WITH_BLOCKING_GAPS',
    source: Object.freeze({
      selectionPath: 'status/world-data-selection.json',
      selectionSha256: sha256(selectionBytes),
      packageId: BALANCED_CANDIDATE_ID,
      packageRoot: BALANCED_CANDIDATE_ROOT,
      checksumsSha256: OFFICIAL_WORLD_CHECKSUMS_SHA256,
      checksumEntries: 86,
      verifiedArtifactsIncludingChecksumManifest: candidate.artifacts.length,
      frozenSourceDrift: candidate.sourceDrift,
      dataFiles: Object.freeze(sourceMeta),
      mapPackage,
      officialMapIndexes: Object.freeze({
        countryScenes: Object.freeze({
          path: OFFICIAL_COUNTRY_SCENE_INDEX,
          sha256: sha256(officialSceneBytes),
          records: officialCountryScenes.length,
        }),
        countryDetails: Object.freeze({
          path: OFFICIAL_COUNTRY_DETAIL_INDEX,
          sha256: sha256(officialDetailBytes),
          records: officialCountryDetails.length,
        }),
      }),
    }),
    authority: Object.freeze({
      officialSelectedSourceDataset: true,
      sourceProposalLabelsPreserved: true,
      proposalRecordsExecuted: false,
      openingSeedReady: false,
      worldId: null,
      teamAssignmentsExecuted: false,
      workerStarted: false,
      productionDatabaseMutated: false,
    }),
    mappings: Object.freeze({
      countries: Object.freeze(
        countries.map((country) => ({
          sourceCountryId: country.id,
          coreCountryId: coreCountryId(country.id),
          number: country.number,
          name: country.name,
          sourceEconomyIdProposal: country.economyIdProposal,
          sourceGovernmentId: country.governmentId,
          sourceOperatorId: country.operatorId,
          teamAssignment: country.teamAssignment,
          administrationProposal: country.administrationProposal,
          climateMix: country.climateMix,
        })),
      ),
      regions: Object.freeze(normalizedRegions),
      entityProposals: Object.freeze(normalizedEntities),
      commodities: Object.freeze(
        commodities.map((commodity) => ({
          sourceCommodityId: commodity.id,
          coreCommodityId: commodity.id,
          unit: commodity.unit,
          source: commodity,
        })),
      ),
      warehouses: Object.freeze(
        expectedCountryIds.map((countryId) => {
          const number = sourceCountryNumber(countryId);
          return {
            sourceCountryId: countryId,
            coreCountryId: coreCountryId(countryId),
            sourceWarehouseId: `WAREHOUSE-${number}`,
            proposedInventoryLocationId: `LOCATION_WAREHOUSE_${number}`,
          };
        }),
      ),
    }),
    records: Object.freeze({
      stocks: Object.freeze(normalizedStocks),
      finance: Object.freeze(normalizedFinance),
      facilities: Object.freeze(normalizedFacilities),
      deposits: Object.freeze(normalizedDeposits),
      climateAndRegions: Object.freeze(normalizedRegions),
      waterAllocations: Object.freeze(normalizedWater),
      seasonalWater: Object.freeze(normalizedSeasonalWater),
      power: Object.freeze(normalizedPower),
      employment: Object.freeze(normalizedEmployment),
      populationServices: Object.freeze(normalizedServices),
      countryScenes: Object.freeze(normalizedScenes),
    }),
    countryReports: Object.freeze(countryReports),
    invariants: Object.freeze({
      countryCount: countries.length,
      populationTotal,
      regionCount: regions.length,
      entityProposalCount: entities.length,
      commodityCount: commodities.length,
      stockCellCount: normalizedStocks.length,
      positiveStockCellCount: positiveStocks,
      zeroAvailableStockCellCount: normalizedStocks.length - positiveStocks,
      financeRowCount: normalizedFinance.length,
      financeDepositMismatchCountries: financeDepositMismatches,
      financeEquityMismatchCountries: financeEquityMismatches,
      financeEconomicSemanticArithmeticMismatchCountries:
        financeEconomicSemanticArithmeticMismatches,
      maximumAbsoluteDepositLiabilityDelta,
      maximumAbsoluteBankEquityDelta,
      facilityCount: normalizedFacilities.length,
      openingPortfolioFacilityProposals: openingPortfolioFacilities,
      developmentOptionFacilityProposals: developmentOptionFacilities,
      depositCount: normalizedDeposits.length,
      waterAllocationCount: normalizedWater.length,
      powerRowCount: normalizedPower.length,
      employmentRowCount: normalizedEmployment.length,
      populationServiceRowCount: normalizedServices.length,
      countrySceneCount: normalizedScenes.length,
      balancedFrozenIllustrationSceneCount: balancedFrozenCountryScenes.length,
      stockSourceValuesCorrectedOrRounded: false,
      financeSourceValuesCorrectedOrRounded: false,
    }),
  });
  const mappingFingerprint = `sha256:${sha256(canonicalSerialize(mappingBody))}`;
  const mapping = Object.freeze({ ...mappingBody, mappingFingerprint });
  const gapsBody = Object.freeze({
    schemaVersion: OFFICIAL_WORLD_GAPS_SCHEMA_VERSION,
    status: 'BLOCKING_GAPS_PRESENT',
    sourcePackageId: BALANCED_CANDIDATE_ID,
    sourceChecksumsSha256: OFFICIAL_WORLD_CHECKSUMS_SHA256,
    mappingFingerprint,
    openingSeedReady: false,
    globalGaps,
    countries: Object.freeze(countryGaps),
    rejections: Object.freeze([]),
  });
  const gaps = Object.freeze({
    ...gapsBody,
    gapsFingerprint: `sha256:${sha256(canonicalSerialize(gapsBody))}`,
  });
  return Object.freeze({ mapping, gaps });
}

export async function writeOfficialWorldOpeningMapping(repositoryRoot) {
  const result = await buildOfficialWorldOpeningMapping(repositoryRoot);
  for (const [relativePath, value] of [
    [MAPPING_OUTPUT, result.mapping],
    [GAPS_OUTPUT, result.gaps],
  ]) {
    const outputPath = path.join(repositoryRoot, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }
  return result;
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  if (!process.argv.includes('--write')) {
    reject('OFFICIAL_WORLD_WRITE_FLAG_REQUIRED');
  }
  const result = await writeOfficialWorldOpeningMapping(repositoryRoot);
  process.stdout.write(
    `${JSON.stringify({
      status: result.mapping.status,
      mappingFingerprint: result.mapping.mappingFingerprint,
      gapsFingerprint: result.gaps.gapsFingerprint,
      countries: result.mapping.invariants.countryCount,
      stockCells: result.mapping.invariants.stockCellCount,
      openingSeedReady: result.mapping.authority.openingSeedReady,
    })}\n`,
  );
}
