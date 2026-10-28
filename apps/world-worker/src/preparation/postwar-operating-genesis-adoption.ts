/** Versioned generated policy adoption. Derived from the sole canonical seed;
 * never an admission signer, command dispatcher, payment or persistence API. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  canonicalHashInput,
  CANONICAL_HASH_ALGORITHM,
  createOpeningSource,
  createOpeningSeed,
  parseOpeningSeed,
  isValidatedOpeningSeed,
  rebuildV08LedgersFromLineage,
  OPENING_SOURCE_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  openingSourceId,
  openingSeedId,
  worldId,
  Money,
  canonicalDecimal,
  type OpeningSeed,
} from '@econmind/core';
import {
  prepareFinancialSupplementOpeningSeed,
  type OpeningCanonicalSeedAssemblyV2,
} from './opening-canonical-seed-bridge.js';
import type { FinancialSupplementAdoption } from './owner-non-host-source-adoption.js';
import type { FormalFinancialCandidate } from './formal-financial-opening-producer.js';
import type { SqlExecutor } from '../persistence/sql-database.js';
import { readPostwarLiquidFundingAccountsFromSeed } from './postwar-financial-genesis.js';
import {
  validatePostwarSocialEmploymentStateDocument,
  type PostwarSocialEmploymentStateDocument,
} from './postwar-social-employment-state.js';
import {
  POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID,
  validatePostwarFinancialOfficeOriginalDocument,
} from './postwar-financial-office-originals.js';

export const POSTWAR_OPERATING_USER_RECEIPT = Object.freeze({
  reference: 'Sentinel_a619bdbe25588191aa05709db76c7567',
  receivedAtReal: '2026-10-28T14:27:54.000Z',
  instruction:
    '保留现有国情与资源差异，补建工资、学生和医疗需求、住房与警务的开局规则，校验人口、资金和容量后再采用。',
});
export const POSTWAR_SELECTED_SOURCE_PINS = Object.freeze({
  regions: '42ef418d90c3f448d390ad9e62971065eb29c3d96fdb4f3dde5fc33ae0cb2bdd',
  countries: '5d493e93dfab1425731191ba7491cce47949d176e4769b33fdca48d2d31dba89',
  selection: '41f5bf1f50b761a2346de4190009ce34ffd13072ae1ed21455931566b3c88541',
  employment:
    'f5e5f79d9d0453f291c05840ee468fa71b7e021e29a79766cc75530a1986155f',
  mapping: 'd2811910a9021e68fabe894504701d6dc8d88e362fc2354b0c826e3446456253',
  regionMapping:
    '570220f9caa4dae4d52730bf2415b1a56658624982f99ec4d6e5b9d9ad27018c',
});
export interface PostwarGenesisSourceDocument {
  readonly documentId: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: string;
  readonly provenanceKind: 'GENERATED_POLICY';
}
/** Counts and ordinals are canonical nonnegative integer strings. People are
 * bounded regional cohorts, never newly minted person records. */
export interface PostwarGenesisPeopleCohort {
  readonly cohortId: string;
  readonly regionId: string;
  readonly startOrdinal: string;
  readonly count: string;
  readonly workingAge: boolean;
  readonly labourForce: boolean;
  readonly activity:
    | 'EMPLOYED'
    | 'UNEMPLOYED'
    | 'STUDENT'
    | 'DEPENDENT'
    | 'OUTSIDE_LABOUR_FORCE';
}
export interface PostwarGenesisPosition {
  readonly positionId: string;
  readonly regionId: string;
  readonly employerId: string;
  readonly sector: string;
  readonly cohortId: string;
  readonly startOrdinal: string;
  readonly filledCount: string;
  readonly requestedCount: string;
  readonly wageObligationId: string | null;
}
export interface PostwarGenesisService {
  readonly serviceId: string;
  readonly regionId: string;
  readonly kind: 'SCHOOL' | 'MEDICAL' | 'POLICE' | 'WELFARE';
  /** Eligibility/demand is not actual enrollment or inpatient occupation. */
  readonly populationUse?:
    'ELIGIBLE_SUBSET' | 'STUDENT_ENROLLMENT' | 'INPATIENT_OCCUPANCY';
  readonly measureUnit?: 'PERSON' | 'EPISODE' | 'CASE' | 'HOUSEHOLD';
  /** Independent bounded people subset, required for non-person demand units. */
  readonly populationCount?: string;
  readonly cohortIds: readonly string[];
  readonly demandCount: string;
  readonly allocatedCount: string;
  readonly unallocatedCount: string;
  readonly capacityCount: string;
  readonly capacityBounds: readonly Readonly<{
    reference: string;
    count: string;
  }>[];
  readonly staffing: readonly Readonly<{
    positionId: string;
    unitsPerStaff: string;
    capacityGroup?: string;
  }>[];
  readonly obligationIds: readonly string[];
  readonly inputAllocations?: readonly Readonly<{
    allocationId: string;
    sourceId: string;
    entryId: string;
    commodityId: string;
    unit: string;
    quantity: string;
    unitsPerService: string;
  }>[];
}
export interface PostwarGenesisHousingCohort {
  readonly housingCohortId: string;
  readonly regionId: string;
  readonly startHouseholdOrdinal: string;
  readonly households: string;
  readonly tenure: 'OWNER_OCCUPIED' | 'RENTAL' | 'SHELTER' | 'UNHOUSED';
  readonly occupiedUnits: string;
  readonly tenantEntityId: string;
  readonly landlordEntityId: string | null;
  readonly rentObligationId: string | null;
  readonly rentRuleReference: string | null;
  readonly rentState:
    'RULE_ONLY_NOT_CONTRACT' | 'OPEN_UNPAID_OBLIGATION' | 'NOT_RENTAL';
}
export interface PostwarGenesisFunding {
  readonly fundingId: string;
  readonly accountId: string;
  readonly countryId: string;
  readonly payerEntityId: string;
  readonly currency: string;
  readonly ceilingAmount: string;
}
export interface PostwarGenesisObligation {
  readonly obligationId: string;
  readonly regionId: string;
  readonly kind:
    'WAGE' | 'RENT' | 'EDUCATION' | 'MEDICAL' | 'POLICE' | 'WELFARE';
  readonly payerEntityId: string;
  readonly payeeEntityId: string;
  readonly currency: string;
  readonly unitAmount: string;
  readonly units: string;
  readonly amount: string;
  readonly periodDays: string;
  readonly dueSimDay: string;
  readonly fundingId: string;
  readonly state: 'OPEN_UNPAID';
  readonly basis?: 'FIRST_DAY_AGGREGATE_RESERVATION_NOT_ACCRUED';
  readonly coveredCount?: string;
  readonly accruedAtOpening?: '0';
  readonly exactFirstDayPayroll?: Readonly<{
    numerator: string;
    denominator: string;
  }>;
}
export interface PostwarGenesisEvent {
  readonly eventId: string;
  readonly obligationId: string;
  readonly dueSimDay: string;
  readonly state: 'INITIAL_OPEN';
}
export interface PostwarOperatingGenesisFacts {
  readonly regions: readonly Readonly<{
    regionId: string;
    countryId: string;
    sourceRegionId?: string;
  }>[];
  readonly people: readonly PostwarGenesisPeopleCohort[];
  readonly positions: readonly PostwarGenesisPosition[];
  readonly services: readonly PostwarGenesisService[];
  readonly housing: readonly PostwarGenesisHousingCohort[];
  readonly funding: readonly PostwarGenesisFunding[];
  readonly obligations: readonly PostwarGenesisObligation[];
  readonly events: readonly PostwarGenesisEvent[];
}
export interface PostwarOperatingGenesisCarrier {
  readonly schemaVersion: 'postwar-operating-genesis-v1';
  readonly provenanceKind: 'GENERATED_POLICY';
  readonly genesisVersion: string;
  readonly worldId: string;
  readonly openingSimDay: '0';
  readonly policyReceipt: typeof POSTWAR_OPERATING_USER_RECEIPT;
  readonly policyDocumentId: string;
  readonly outputDocumentId: string;
  readonly documents: readonly PostwarGenesisSourceDocument[];
  readonly sourcePins: typeof POSTWAR_SELECTED_SOURCE_PINS;
  readonly selectedSource: Readonly<{
    regionsBytes: string;
    countriesBytes: string;
    selectionBytes: string;
    employmentBytes: string;
    regionMappingBytes: string;
  }>;
  readonly facts: PostwarOperatingGenesisFacts;
  readonly socialEmployment?: PostwarSocialEmploymentStateDocument;
  readonly physicalServiceReceiptDocumentId?: string;
}

export interface PostwarNewWorldScope {
  readonly worldId: string;
  readonly disposition: 'OBSERVED_ABSENT_NEW_WORLD';
}
const newWorldScopes = new WeakSet<object>();
/** The source executor is server owned. This observation permits preparation
 * only; final bootstrap/publication must still re-read under their own locks. */
export async function readPostwarNewWorldScopeFrom(
  transaction: SqlExecutor,
  requestedWorldId: string,
): Promise<PostwarNewWorldScope> {
  worldId(requestedWorldId);
  const mode = await transaction.query<{
    read_only: unknown;
    isolation: unknown;
  }>(
    `select current_setting('transaction_read_only') as read_only,
      current_setting('transaction_isolation') as isolation`,
  );
  if (
    mode.rows.length !== 1 ||
    mode.rows[0]?.read_only !== 'on' ||
    !['repeatable read', 'serializable'].includes(
      String(mode.rows[0]?.isolation),
    )
  )
    throw Error('POSTWAR_STABLE_READ_ONLY_SOURCE_REQUIRED');
  const existing = await transaction.query<{ present: unknown }>(
    `select (exists(select 1 from world_v2.world_head where world_id=$1)
      or exists(select 1 from world_v2.opening_seed where world_id=$1)) as present`,
    [requestedWorldId],
  );
  if (existing.rows.length !== 1 || existing.rows[0]?.present !== false)
    throw Error('POSTWAR_EXISTING_WORLD_CANNOT_BE_RESET');
  const scope: PostwarNewWorldScope = Object.freeze({
    worldId: requestedWorldId,
    disposition: 'OBSERVED_ABSENT_NEW_WORLD',
  });
  newWorldScopes.add(scope);
  return scope;
}
export interface PostwarOperatingGenesisBlocker {
  readonly code: string;
  readonly field: string;
}
export interface PostwarOperatingGenesisAdoption {
  readonly status: 'PROJECT_ADOPTED_NOT_ADMITTED' | 'BLOCKED';
  readonly seed: OpeningSeed | null;
  readonly carrierSha256: string | null;
  readonly policySha256: string | null;
  readonly outputSha256: string | null;
  readonly blockers: readonly PostwarOperatingGenesisBlocker[];
  readonly admissionAllowed: false;
  readonly activationAllowed: false;
}
const adoptions = new WeakSet<object>();
export type PostwarOperatingGenesisView = Readonly<{
  schemaVersion: 'postwar-operating-genesis-derived-view-v1';
  worldId: string;
  seedFingerprint: string;
  carrierSha256: string;
  policySha256: string;
  outputSha256: string;
  facts: PostwarOperatingGenesisFacts;
  socialEmployment: PostwarSocialEmploymentStateDocument | null;
  physicalServiceReceiptDocumentId: string | null;
  financialOfficeOriginalsDocument: PostwarGenesisSourceDocument | null;
}>;
// Immutable source interpretation only. Every lookup is preceded by genuine
// immutable Core seed identity or full parsing/content-hash verification; no actor, admission or current head
// is cached. Bounds cover actual canonical UTF-8 bytes, not just entry count.
const derivedViews = new Map<
  string,
  { view: PostwarOperatingGenesisView; bytes: number }
>();
let derivedViewBytes = 0;
const DERIVED_VIEW_BYTE_LIMIT = 64 * 1024 * 1024;
function rememberDerivedView(view: PostwarOperatingGenesisView): void {
  const bytes = Buffer.byteLength(canonicalSerialize(view), 'utf8');
  if (bytes > DERIVED_VIEW_BYTE_LIMIT) return;
  const prior = derivedViews.get(view.seedFingerprint);
  if (prior) {
    derivedViewBytes -= prior.bytes;
    derivedViews.delete(view.seedFingerprint);
  }
  while (
    derivedViews.size >= 8 ||
    derivedViewBytes + bytes > DERIVED_VIEW_BYTE_LIMIT
  ) {
    const oldest = derivedViews.keys().next().value;
    if (oldest === undefined) break;
    derivedViewBytes -= derivedViews.get(oldest)!.bytes;
    derivedViews.delete(oldest);
  }
  derivedViews.set(view.seedFingerprint, { view, bytes });
  derivedViewBytes += bytes;
}
const sha = (bytes: string) =>
  createHash('sha256').update(bytes, 'utf8').digest('hex');
const clone = <T>(value: T): T => JSON.parse(canonicalSerialize(value)) as T;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
class InvalidGenesis extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
  ) {
    super(`${code}:${field}`);
  }
}
function need(value: unknown, code: string, field: string): asserts value {
  if (!value) throw new InvalidGenesis(code, field);
}
function uint(value: unknown, field: string): bigint {
  need(
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value),
    'NONCANONICAL_COUNT',
    field,
  );
  need(value.length <= 24, 'COUNT_BOUND_EXCEEDED', field);
  return BigInt(value);
}
function id(value: unknown, field: string): asserts value is string {
  need(
    typeof value === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/u.test(value),
    'STABLE_ID_REQUIRED',
    field,
  );
}
function unique<T>(
  rows: readonly T[],
  key: (row: T) => string,
  field: string,
): Map<string, T> {
  need(
    Array.isArray(rows) && rows.length <= 100_000,
    'BOUNDED_ROWS_REQUIRED',
    field,
  );
  const result = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    id(value, field);
    need(!result.has(value), 'DUPLICATE_ID', field + ':' + value);
    result.set(value, row);
  }
  return result;
}
function groupBy<T>(
  rows: Iterable<T>,
  key: (row: T) => string,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row),
      group = result.get(id) ?? [];
    group.push(row);
    result.set(id, group);
  }
  return result;
}
function money(amount: string, currency: string, field: string) {
  const result = Money.from(amount, currency);
  need(
    canonicalDecimal(result.amount) === amount && !result.amount.isNegative(),
    'CANONICAL_NONNEGATIVE_MONEY_REQUIRED',
    field,
  );
  return result;
}
type RegionSource = Readonly<{
  id: string;
  countryId: string;
  initial: {
    population: number;
    workingAge: number;
    labourForce: number;
    households: number;
    housingUnits: number;
    schoolSeats: number;
    hospitalBeds: number;
  };
}>;
function sourceCount(value: unknown, field: string): bigint {
  need(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    'SELECTED_SOURCE_COUNT_INVALID',
    field,
  );
  return BigInt(value);
}
function validateCarrier(input: unknown, base: OpeningSeed) {
  need(
    input && typeof input === 'object' && !Array.isArray(input),
    'GENESIS_SCHEMA_INVALID',
    'carrier',
  );
  // Isolate mutable caller facts, while allowing the E03 validator to recognize
  // its own immutable document identity. Serialized/copied documents still take
  // its complete Core/policy re-derivation below; no caller flag is accepted.
  const { socialEmployment: employmentInput, ...carrierInput } =
    input as PostwarOperatingGenesisCarrier;
  const carrier = clone(carrierInput) as PostwarOperatingGenesisCarrier;
  need(
    carrier &&
      carrier.schemaVersion === 'postwar-operating-genesis-v1' &&
      carrier.provenanceKind === 'GENERATED_POLICY',
    'GENESIS_SCHEMA_INVALID',
    'carrier',
  );
  id(carrier.genesisVersion, 'genesisVersion');
  need(
    carrier.worldId === base.worldId && carrier.openingSimDay === '0',
    'WORLD_OR_OPENING_TIME_MISMATCH',
    'worldId',
  );
  need(
    canonicalSerialize(carrier.policyReceipt) ===
      canonicalSerialize(POSTWAR_OPERATING_USER_RECEIPT),
    'USER_RECEIPT_MISMATCH',
    'policyReceipt',
  );
  need(
    canonicalSerialize(carrier.sourcePins) ===
      canonicalSerialize(POSTWAR_SELECTED_SOURCE_PINS),
    'SELECTED_SOURCE_PIN_MISMATCH',
    'sourcePins',
  );
  for (const [key, bytes] of Object.entries({
    regions: carrier.selectedSource.regionsBytes,
    countries: carrier.selectedSource.countriesBytes,
    selection: carrier.selectedSource.selectionBytes,
    employment: carrier.selectedSource.employmentBytes,
    regionMapping: carrier.selectedSource.regionMappingBytes,
  }))
    need(
      sha(bytes) ===
        POSTWAR_SELECTED_SOURCE_PINS[
          key as keyof typeof POSTWAR_SELECTED_SOURCE_PINS
        ],
      'SELECTED_SOURCE_BYTES_MISMATCH',
      key,
    );
  const rawRegions = JSON.parse(
    carrier.selectedSource.regionsBytes,
  ) as RegionSource[];
  const rawCountries = JSON.parse(carrier.selectedSource.countriesBytes) as {
    id: string;
    number: string;
    regionIds: string[];
  }[];
  const rawEmployment = JSON.parse(carrier.selectedSource.employmentBytes) as {
    countryId: string;
    labourForce: number;
    employed: number;
    unemployed: number;
  }[];
  need(
    rawRegions.length === 122 && rawCountries.length === 70,
    'SELECTED_SOURCE_SCOPE_MISMATCH',
    'selectedSource',
  );
  const documents = unique(carrier.documents, (d) => d.documentId, 'documents');
  const financialOriginals = documents.get(
    POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID,
  );
  if (financialOriginals)
    validatePostwarFinancialOfficeOriginalDocument(financialOriginals, base);
  const paths = new Set<string>();
  for (const d of documents.values()) {
    need(
      d.provenanceKind === 'GENERATED_POLICY' &&
        /^[a-zA-Z0-9_./-]+$/u.test(d.path) &&
        !d.path.startsWith('/') &&
        !d.path.split('/').includes('..') &&
        !paths.has(d.path),
      'GENERATED_DOCUMENT_PATH_INVALID',
      d.documentId,
    );
    paths.add(d.path);
    need(
      sha(d.bytes) === d.sha256,
      'GENERATED_DOCUMENT_HASH_MISMATCH',
      d.documentId,
    );
  }
  const policy = documents.get(carrier.policyDocumentId),
    output = documents.get(carrier.outputDocumentId);
  need(
    policy && output && policy !== output,
    'POLICY_AND_OUTPUT_DOCUMENTS_REQUIRED',
    'documents',
  );
  need(
    canonicalSerialize(JSON.parse(output.bytes)) ===
      canonicalSerialize(carrier.facts),
    'OUTPUT_FACTS_DIFFER_FROM_DOCUMENT',
    'facts',
  );
  need(policy.bytes.length > 0, 'EMPTY_GENERATION_POLICY', 'policy');
  const facts = carrier.facts;
  const regions = unique(facts.regions, (r) => r.regionId, 'regions');
  need(regions.size === 122, 'EXACT_REGION_SCOPE_REQUIRED', 'regions');
  const compactMapping = JSON.parse(
    carrier.selectedSource.regionMappingBytes,
  ) as {
    schemaVersion: string;
    fullMappingSha256: string;
    mappings: {
      sourceRegionId: string;
      normalizedRegionId: string;
      coreCountryId: string;
    }[];
  };
  need(
    compactMapping.schemaVersion === 'postwar-pinned-region-mapping-v1' &&
      compactMapping.fullMappingSha256 ===
        POSTWAR_SELECTED_SOURCE_PINS.mapping &&
      compactMapping.mappings.length === 122,
    'PINNED_REGION_MAPPING_PROJECTION_REQUIRED',
    'regionMapping',
  );
  const mappedRegions = compactMapping.mappings;
  const sourceByRegion = new Map<string, RegionSource>();
  const physicalRegions = new Set<string>();
  for (const region of regions.values()) {
    const mapping = mappedRegions.find(
      (r) =>
        r.sourceRegionId === region.regionId ||
        r.normalizedRegionId === region.regionId,
    );
    const source = rawRegions.find((r) => r.id === mapping?.sourceRegionId),
      country = rawCountries.find((c) =>
        c.regionIds.includes(source?.id ?? ''),
      );
    need(
      source &&
        country &&
        source.countryId === country.id &&
        region.countryId === `COUNTRY_${country.number}` &&
        mapping?.coreCountryId === region.countryId &&
        !physicalRegions.has(source.id) &&
        (region.sourceRegionId === undefined ||
          region.sourceRegionId === source.id),
      'REGION_COUNTRY_SOURCE_MISMATCH',
      region.regionId,
    );
    physicalRegions.add(source.id);
    sourceByRegion.set(region.regionId, source);
  }
  const people = unique(facts.people, (p) => p.cohortId, 'people');
  const positions = unique(facts.positions, (p) => p.positionId, 'positions');
  const housing = unique(facts.housing, (h) => h.housingCohortId, 'housing');
  const services = unique(facts.services, (s) => s.serviceId, 'services');
  const obligations = unique(
    facts.obligations,
    (o) => o.obligationId,
    'obligations',
  );
  const funding = unique(facts.funding, (f) => f.fundingId, 'funding');
  const events = unique(facts.events, (e) => e.eventId, 'events');
  const peopleByRegion = groupBy(people.values(), (p) => p.regionId);
  const positionsByCohort = groupBy(
    [...positions.values()].filter(
      (p) => uint(p.filledCount, p.positionId) > 0n,
    ),
    (p) => p.cohortId,
  );
  const wageBindings = new Set<string>();
  const serviceStaffUsed = new Map<string, { n: bigint; d: bigint }>();
  const inventoryReservations = new Map<string, bigint>();
  const inventoryAllocationIds = new Set<string>();
  for (const region of regions.values()) {
    const selected = sourceByRegion.get(region.regionId)!;
    const cohorts = (peopleByRegion.get(region.regionId) ?? []).sort((a, b) =>
      uint(a.startOrdinal, 'people') < uint(b.startOrdinal, 'people') ? -1 : 1,
    );
    let cursor = 0n,
      working = 0n,
      labour = 0n;
    for (const c of cohorts) {
      const count = uint(c.count, c.cohortId),
        start = uint(c.startOrdinal, c.cohortId);
      need(
        count > 0n &&
          start === cursor &&
          typeof c.workingAge === 'boolean' &&
          typeof c.labourForce === 'boolean',
        'POPULATION_PARTITION_GAP_OR_OVERLAP',
        c.cohortId,
      );
      need(
        [
          'EMPLOYED',
          'UNEMPLOYED',
          'STUDENT',
          'DEPENDENT',
          'OUTSIDE_LABOUR_FORCE',
        ].includes(c.activity) &&
          (!c.labourForce || c.workingAge) &&
          c.labourForce === ['EMPLOYED', 'UNEMPLOYED'].includes(c.activity),
        'POPULATION_ACTIVITY_MISMATCH',
        c.cohortId,
      );
      cursor += count;
      if (c.workingAge) working += count;
      if (c.labourForce) labour += count;
      const allocations = (positionsByCohort.get(c.cohortId) ?? []).sort(
        (a, b) =>
          uint(a.startOrdinal, 'positions') < uint(b.startOrdinal, 'positions')
            ? -1
            : 1,
      );
      let employedCursor = start;
      for (const p of allocations) {
        need(
          c.activity === 'EMPLOYED' &&
            p.regionId === c.regionId &&
            uint(p.startOrdinal, p.positionId) === employedCursor,
          'EMPLOYMENT_RANGE_OVERLAP_OR_WRONG_POOL',
          p.positionId,
        );
        employedCursor += uint(p.filledCount, p.positionId);
        need(
          employedCursor <= start + count,
          'WORKER_DOUBLE_ALLOCATION',
          p.positionId,
        );
      }
      need(
        c.activity === 'EMPLOYED'
          ? employedCursor === start + count
          : allocations.length === 0,
        'EMPLOYMENT_PARTITION_MISMATCH',
        c.cohortId,
      );
    }
    need(
      cursor === sourceCount(selected.initial.population, 'population') &&
        working === sourceCount(selected.initial.workingAge, 'workingAge') &&
        labour === sourceCount(selected.initial.labourForce, 'labourForce'),
      'SOURCE_POPULATION_OR_LABOUR_CONSERVATION_FAILED',
      region.regionId,
    );
    const homes = [...housing.values()]
      .filter((h) => h.regionId === region.regionId)
      .sort((a, b) =>
        uint(a.startHouseholdOrdinal, 'housing') <
        uint(b.startHouseholdOrdinal, 'housing')
          ? -1
          : 1,
      );
    let householdCursor = 0n,
      units = 0n;
    for (const h of homes) {
      const count = uint(h.households, h.housingCohortId),
        occupied = uint(h.occupiedUnits, h.housingCohortId);
      need(
        count > 0n &&
          uint(h.startHouseholdOrdinal, h.housingCohortId) === householdCursor,
        'HOUSEHOLD_PARTITION_GAP_OR_OVERLAP',
        h.housingCohortId,
      );
      need(
        ['OWNER_OCCUPIED', 'RENTAL', 'SHELTER', 'UNHOUSED'].includes(
          h.tenure,
        ) &&
          occupied <= count &&
          (h.tenure === 'UNHOUSED' ? occupied === 0n : occupied === count),
        'HOUSING_OCCUPANCY_INVALID',
        h.housingCohortId,
      );
      id(h.tenantEntityId, h.housingCohortId);
      if (h.tenure === 'RENTAL') {
        id(h.rentRuleReference, h.housingCohortId);
        need(
          h.rentObligationId === null
            ? h.rentState === 'RULE_ONLY_NOT_CONTRACT'
            : h.rentState === 'OPEN_UNPAID_OBLIGATION',
          'RENT_RULE_OR_OBLIGATION_STATE_REQUIRED',
          h.housingCohortId,
        );
      } else
        need(
          h.rentRuleReference === null &&
            h.rentObligationId === null &&
            h.rentState === 'NOT_RENTAL',
          'NONRENTAL_CANNOT_OWE_RENT',
          h.housingCohortId,
        );
      if (h.rentObligationId !== null) {
        const rent = obligations.get(h.rentObligationId);
        need(
          h.tenure === 'RENTAL' &&
            rent?.kind === 'RENT' &&
            rent.regionId === h.regionId &&
            rent.payerEntityId === h.tenantEntityId &&
            rent.payeeEntityId === h.landlordEntityId &&
            h.landlordEntityId !== h.tenantEntityId &&
            uint(rent.units, rent.obligationId) === count,
          'RENT_PARTIES_OR_COHORT_MISMATCH',
          h.housingCohortId,
        );
      }
      householdCursor += count;
      units += occupied;
    }
    need(
      householdCursor ===
        sourceCount(selected.initial.households, 'households') &&
        units <= sourceCount(selected.initial.housingUnits, 'housingUnits'),
      'HOUSEHOLD_OR_HOUSING_CAPACITY_FAILED',
      region.regionId,
    );
    for (const kind of ['SCHOOL', 'MEDICAL', 'POLICE', 'WELFARE'])
      need(
        [...services.values()].some(
          (s) => s.regionId === region.regionId && s.kind === kind,
        ),
        'OFFICE_SERVICE_SCOPE_MISSING',
        region.regionId + ':' + kind,
      );
  }
  for (const c of people.values())
    need(regions.has(c.regionId), 'UNKNOWN_REGION', c.cohortId);
  for (const p of positions.values()) {
    const filled = uint(p.filledCount, p.positionId);
    need(
      regions.has(p.regionId) &&
        people.has(p.cohortId) &&
        filled <= uint(p.requestedCount, p.positionId),
      'POSITION_SCOPE_OR_CAPACITY_INVALID',
      p.positionId,
    );
    id(p.employerId, p.positionId);
    id(p.sector, p.positionId);
    if (filled > 0n) {
      const wage =
        p.wageObligationId === null
          ? null
          : obligations.get(p.wageObligationId);
      need(
        wage?.kind === 'WAGE' &&
          wage.regionId === p.regionId &&
          wage.payerEntityId === p.employerId &&
          (wage.basis === 'FIRST_DAY_AGGREGATE_RESERVATION_NOT_ACCRUED'
            ? uint(wage.coveredCount, wage.obligationId)
            : uint(wage.units, wage.obligationId)) === filled,
        'FILLED_POSITION_WAGE_BINDING_REQUIRED',
        p.positionId,
      );
      need(
        !wageBindings.has(wage.obligationId),
        'WAGE_OBLIGATION_REUSED_FOR_MULTIPLE_JOBS',
        p.positionId,
      );
      wageBindings.add(wage.obligationId);
    } else
      need(
        p.wageObligationId === null,
        'EMPTY_POSITION_CANNOT_OWE_WAGES',
        p.positionId,
      );
  }
  for (const h of housing.values())
    need(regions.has(h.regionId), 'UNKNOWN_REGION', h.housingCohortId);
  for (const s of services.values()) {
    need(
      regions.has(s.regionId) &&
        ['SCHOOL', 'MEDICAL', 'POLICE', 'WELFARE'].includes(s.kind),
      'SERVICE_SCOPE_INVALID',
      s.serviceId,
    );
    const demand = uint(s.demandCount, s.serviceId),
      allocated = uint(s.allocatedCount, s.serviceId),
      capacity = uint(s.capacityCount, s.serviceId);
    need(
      allocated + uint(s.unallocatedCount, s.serviceId) === demand &&
        allocated <= capacity,
      'SERVICE_DEMAND_OR_CAPACITY_FAILED',
      s.serviceId,
    );
    const refs = new Set(s.cohortIds);
    need(
      refs.size === s.cohortIds.length && refs.size > 0,
      'SERVICE_COHORT_REFS_REQUIRED',
      s.serviceId,
    );
    let possible = 0n;
    for (const ref of refs) {
      const p = people.get(ref);
      need(
        p && p.regionId === s.regionId,
        'SERVICE_PEOPLE_SCOPE_MISMATCH',
        s.serviceId,
      );
      possible += uint(p.count, ref);
      if (s.populationUse === 'STUDENT_ENROLLMENT')
        need(
          s.kind === 'SCHOOL' && p.activity === 'STUDENT',
          'SCHOOL_DEMAND_NOT_FROM_STUDENT_COHORT',
          s.serviceId,
        );
      if (s.populationUse === 'INPATIENT_OCCUPANCY')
        need(
          s.kind === 'MEDICAL' && !p.labourForce && p.activity !== 'STUDENT',
          'MEDICAL_DEMAND_OVERLAPS_LABOUR_OR_STUDENTS',
          s.serviceId,
        );
      if (s.kind === 'SCHOOL')
        need(
          !p.labourForce,
          'SCHOOL_APPLICANT_OVERLAPS_LABOUR_POOL',
          s.serviceId,
        );
    }
    const measureUnit = s.measureUnit ?? 'PERSON';
    need(
      ['PERSON', 'EPISODE', 'CASE', 'HOUSEHOLD'].includes(measureUnit),
      'SERVICE_UNIT_INVALID',
      s.serviceId,
    );
    need(
      !s.populationUse ||
        [
          'ELIGIBLE_SUBSET',
          'STUDENT_ENROLLMENT',
          'INPATIENT_OCCUPANCY',
        ].includes(s.populationUse),
      'SERVICE_POPULATION_USE_INVALID',
      s.serviceId,
    );
    if (measureUnit === 'PERSON')
      need(demand <= possible, 'SERVICE_DEMAND_EXCEEDS_PEOPLE', s.serviceId);
    else {
      need(
        s.populationCount !== undefined &&
          uint(s.populationCount, s.serviceId) <= possible,
        'SERVICE_POPULATION_SUBSET_REQUIRED',
        s.serviceId,
      );
      if (measureUnit === 'HOUSEHOLD')
        need(
          demand <=
            sourceCount(
              sourceByRegion.get(s.regionId)!.initial.households,
              'households',
            ),
          'SERVICE_HOUSEHOLD_SUBSET_EXCEEDED',
          s.serviceId,
        );
    }
    if (s.kind === 'SCHOOL' || s.populationUse === 'INPATIENT_OCCUPANCY')
      need(
        measureUnit === 'PERSON',
        'SERVICE_PERSON_UNIT_REQUIRED',
        s.serviceId,
      );
    for (const allocation of s.inputAllocations ?? []) {
      const stock = base.inventoryEntries.find(
        (entry) => entry.entryId === allocation.entryId,
      );
      const quantity = uint(allocation.quantity, s.serviceId),
        unitsPerService = uint(allocation.unitsPerService, s.serviceId);
      need(
        stock &&
          stock.sourceId === allocation.sourceId &&
          stock.account.worldId === base.worldId &&
          stock.account.countryId === regions.get(s.regionId)!.countryId &&
          stock.account.commodityId === allocation.commodityId &&
          stock.quantity.unit === allocation.unit &&
          unitsPerService > 0n &&
          !inventoryAllocationIds.has(allocation.allocationId),
        'SERVICE_FINITE_INPUT_BINDING_INVALID',
        s.serviceId,
      );
      inventoryAllocationIds.add(allocation.allocationId);
      const reserved =
        (inventoryReservations.get(stock.entryId) ?? 0n) + quantity;
      need(
        stock.quantity.amount.greaterThanOrEqualTo(reserved.toString()) &&
          quantity / unitsPerService >= capacity,
        'SERVICE_PHYSICAL_INPUT_DOUBLE_RESERVED_OR_INSUFFICIENT',
        s.serviceId,
      );
      inventoryReservations.set(stock.entryId, reserved);
    }
    if (
      carrier.socialEmployment &&
      (s.kind === 'SCHOOL' || s.kind === 'MEDICAL') &&
      capacity > 0n
    )
      need(
        (s.inputAllocations?.length ?? 0) > 0,
        'ACTUAL_SCHOOL_OR_MEDICAL_INPUT_REQUIRED',
        s.serviceId,
      );
    need(
      s.capacityBounds.length > 0,
      'SERVICE_CAPACITY_BOUNDS_REQUIRED',
      s.serviceId,
    );
    let bound: bigint | null = null;
    for (const b of s.capacityBounds) {
      id(b.reference, s.serviceId);
      const n = uint(b.count, s.serviceId);
      bound = bound === null || n < bound ? n : bound;
    }
    need(
      capacity === bound,
      'SERVICE_CAPACITY_NOT_RECOMPUTED_MINIMUM',
      s.serviceId,
    );
    const selected = sourceByRegion.get(s.regionId)!;
    if (s.kind === 'SCHOOL')
      need(
        capacity <= sourceCount(selected.initial.schoolSeats, 'schoolSeats'),
        'SCHOOL_SEAT_CAPACITY_EXCEEDED',
        s.serviceId,
      );
    if (
      s.kind === 'MEDICAL' &&
      (s.populationUse === 'INPATIENT_OCCUPANCY' ||
        s.measureUnit === undefined ||
        s.measureUnit === 'PERSON')
    )
      need(
        allocated <= sourceCount(selected.initial.hospitalBeds, 'hospitalBeds'),
        'HOSPITAL_BED_CAPACITY_EXCEEDED',
        s.serviceId,
      );
    const staffIds = new Set<string>();
    const capacityGroups = new Map<
      string,
      { positionId: string; perStaff: bigint }[]
    >();
    for (const staff of s.staffing) {
      need(
        !staffIds.has(staff.positionId),
        'DUPLICATE_SERVICE_STAFF',
        s.serviceId,
      );
      staffIds.add(staff.positionId);
      const p = positions.get(staff.positionId);
      const perStaff = uint(staff.unitsPerStaff, s.serviceId);
      need(
        p && p.regionId === s.regionId && perStaff > 0n,
        'ACTUAL_STAFF_CAPACITY_FAILED',
        s.serviceId,
      );
      const key = staff.capacityGroup ?? staff.positionId;
      id(key, s.serviceId);
      const group = capacityGroups.get(key) ?? [];
      group.push({ positionId: p.positionId, perStaff });
      capacityGroups.set(key, group);
    }
    for (const group of capacityGroups.values()) {
      let remaining = capacity;
      for (const staff of group.sort((a, b) =>
        a.positionId.localeCompare(b.positionId, 'en'),
      )) {
        const p = positions.get(staff.positionId)!;
        const used = serviceStaffUsed.get(p.positionId) ?? { n: 0n, d: 1n };
        const available =
          ((uint(p.filledCount, p.positionId) * used.d - used.n) *
            staff.perStaff) /
          used.d;
        const assigned = remaining < available ? remaining : available;
        const n = used.n * staff.perStaff + assigned * used.d,
          d = used.d * staff.perStaff;
        const gcd = (a: bigint, b: bigint): bigint =>
          b === 0n ? a : gcd(b, a % b);
        const divisor = gcd(n, d);
        serviceStaffUsed.set(p.positionId, { n: n / divisor, d: d / divisor });
        remaining -= assigned;
        if (remaining === 0n) break;
      }
      need(remaining === 0n, 'STAFF_CAPACITY_DOUBLE_ALLOCATED', s.serviceId);
    }
    need(
      capacity === 0n || s.staffing.length > 0,
      'UNSTAFFED_SERVICE_CAPACITY',
      s.serviceId,
    );
    for (const obligationId of s.obligationIds)
      need(
        obligations.has(obligationId) &&
          obligations.get(obligationId)!.regionId === s.regionId,
        'SERVICE_OBLIGATION_MISMATCH',
        s.serviceId,
      );
  }
  for (const kind of ['SCHOOL', 'MEDICAL', 'POLICE', 'WELFARE'])
    need(
      [...services.values()].some(
        (s) => s.kind === kind && uint(s.demandCount, s.serviceId) > 0n,
      ),
      'EMPTY_SERVICE_GENESIS_SHORTCUT',
      kind,
    );
  for (const region of regions.values()) {
    const students = [...people.values()]
      .filter((p) => p.regionId === region.regionId && p.activity === 'STUDENT')
      .reduce((sum, p) => sum + uint(p.count, p.cohortId), 0n);
    const enrolled = [...services.values()]
      .filter((s) => s.regionId === region.regionId && s.kind === 'SCHOOL')
      .reduce((sum, s) => sum + uint(s.allocatedCount, s.serviceId), 0n);
    need(
      enrolled <= students,
      'STUDENT_DEMAND_DOUBLE_ALLOCATED',
      region.regionId,
    );
  }
  for (const country of rawCountries) {
    const employment = rawEmployment.find((e) => e.countryId === country.id);
    need(employment, 'COUNTRY_EMPLOYMENT_SOURCE_MISSING', country.id);
    let employed = 0n,
      unemployed = 0n;
    for (const cohort of people.values()) {
      if (
        regions.get(cohort.regionId)?.countryId !== `COUNTRY_${country.number}`
      )
        continue;
      if (cohort.activity === 'EMPLOYED')
        employed += uint(cohort.count, cohort.cohortId);
      if (cohort.activity === 'UNEMPLOYED')
        unemployed += uint(cohort.count, cohort.cohortId);
    }
    need(
      employed === sourceCount(employment.employed, 'employed') &&
        unemployed === sourceCount(employment.unemployed, 'unemployed') &&
        employed + unemployed ===
          sourceCount(employment.labourForce, 'labourForce'),
      'SOURCE_EMPLOYMENT_TARGETS_CHANGED',
      country.id,
    );
  }
  const ledger = rebuildV08LedgersFromLineage({ seed: base, sha256Hex: sha });
  const issuedLiquidClaims = new Map(
    readPostwarLiquidFundingAccountsFromSeed(base).map((account) => [
      account.accountId,
      account,
    ]),
  );
  const accountCommitted = new Map<string, ReturnType<typeof Money.from>>();
  const fundingSpent = new Map<string, ReturnType<typeof Money.from>>();
  for (const f of funding.values()) {
    const ceiling = money(f.ceilingAmount, f.currency, f.fundingId);
    const position = ledger.financial.positions.find(
      (p) => p.account.accountId === f.accountId,
    );
    need(
      position &&
        position.account.ownerId === f.payerEntityId &&
        position.account.countryId === f.countryId &&
        position.account.currency === f.currency &&
        (['CASH', 'DEPOSIT'].includes(position.account.accountClass) ||
          (position.account.accountClass === 'ASSET' &&
            issuedLiquidClaims.has(position.account.accountId))) &&
        !position.netDebitBalance.amount.isNegative(),
      'FUNDING_NOT_ACTUAL_LIQUID_SEED_BALANCE',
      f.fundingId,
    );
    const committed = (
      accountCommitted.get(f.accountId) ?? Money.from('0', f.currency)
    ).add(ceiling);
    need(
      committed.amount.lessThanOrEqualTo(position.netDebitBalance.amount),
      'LIQUID_FUNDS_DOUBLE_RESERVED_OR_INSUFFICIENT',
      f.fundingId,
    );
    accountCommitted.set(f.accountId, committed);
  }
  const paidRefs = new Set<string>();
  for (const o of obligations.values()) {
    need(
      regions.has(o.regionId) &&
        ['WAGE', 'RENT', 'EDUCATION', 'MEDICAL', 'POLICE', 'WELFARE'].includes(
          o.kind,
        ) &&
        o.state === 'OPEN_UNPAID' &&
        o.payerEntityId !== o.payeeEntityId,
      'OBLIGATION_STATE_OR_PARTIES_INVALID',
      o.obligationId,
    );
    const amount = money(o.amount, o.currency, o.obligationId),
      unit = money(o.unitAmount, o.currency, o.obligationId);
    need(
      unit.amount
        .times(uint(o.units, o.obligationId).toString())
        .equals(amount.amount) &&
        amount.amount.isPositive() &&
        uint(o.periodDays, o.obligationId) > 0n &&
        uint(o.dueSimDay, o.obligationId) > 0n,
      'OBLIGATION_AMOUNT_OR_FUTURE_PERIOD_INVALID',
      o.obligationId,
    );
    const f = funding.get(o.fundingId);
    if (o.basis === 'FIRST_DAY_AGGREGATE_RESERVATION_NOT_ACCRUED') {
      const rational = o.exactFirstDayPayroll;
      need(
        o.kind === 'WAGE' &&
          o.periodDays === '1' &&
          o.dueSimDay === '1' &&
          o.accruedAtOpening === '0' &&
          o.units === '1' &&
          rational &&
          uint(rational.denominator, o.obligationId) > 0n &&
          uint(o.coveredCount, o.obligationId) > 0n,
        'FIRST_DAY_PAYROLL_BASIS_INVALID',
        o.obligationId,
      );
      const n = uint(rational.numerator, o.obligationId),
        d = uint(rational.denominator, o.obligationId);
      const cents = (n * 100n + d - 1n) / d;
      need(
        amount.amount.equals(
          Money.from(
            `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`,
            o.currency,
          ).amount,
        ),
        'FIRST_DAY_PAYROLL_CEILING_MISMATCH',
        o.obligationId,
      );
    }
    need(
      f &&
        f.payerEntityId === o.payerEntityId &&
        f.countryId === regions.get(o.regionId)!.countryId &&
        f.currency === o.currency,
      'OBLIGATION_FUNDING_SCOPE_MISMATCH',
      o.obligationId,
    );
    const spent = (
      fundingSpent.get(f.fundingId) ?? Money.from('0', f.currency)
    ).add(amount);
    need(
      spent.amount.lessThanOrEqualTo(
        money(f.ceilingAmount, f.currency, f.fundingId).amount,
      ),
      'PERIOD_FUNDS_INSUFFICIENT',
      o.obligationId,
    );
    fundingSpent.set(f.fundingId, spent);
  }
  for (const event of events.values()) {
    const obligation = obligations.get(event.obligationId);
    need(
      obligation &&
        event.state === 'INITIAL_OPEN' &&
        event.dueSimDay === obligation.dueSimDay &&
        !paidRefs.has(event.obligationId),
      'EVENT_QUEUE_DUPLICATE_OR_BINDING_MISMATCH',
      event.eventId,
    );
    paidRefs.add(event.obligationId);
  }
  need(
    paidRefs.size === obligations.size,
    'OBLIGATION_INITIAL_EVENT_MISSING',
    'events',
  );
  if (employmentInput !== undefined) {
    const employment =
      validatePostwarSocialEmploymentStateDocument(employmentInput);
    // Preserve the validator's immutable checked document in the derived
    // view. Its canonical bytes were compared exactly; returning the original
    // structural copy would force country selectors to rebuild all 70 again.
    Object.assign(carrier, { socialEmployment: employment });
    const employmentPopulationRefs = new Map(
      employment.inputs.populationPositionRefs.map((r) => [r.positionId, r]),
    );
    const employmentPayroll = new Map(
      employment.inputs.positionFunding.map((f) => [f.positionId, f]),
    );
    need(
      employment.inputs.worldId === base.worldId &&
        employment.inputs.seedId === base.seedId,
      'SOCIAL_EMPLOYMENT_SEED_SCOPE_MISMATCH',
      'socialEmployment',
    );
    need(
      employment.inputs.sourcePositions.length === positions.size,
      'SOCIAL_EMPLOYMENT_POSITION_COVERAGE_MISMATCH',
      'socialEmployment',
    );
    for (const original of employment.inputs.sourcePositions) {
      const p = positions.get(original.positionId),
        reference = employmentPopulationRefs.get(original.positionId);
      const payroll = employmentPayroll.get(original.positionId);
      need(
        p &&
          reference &&
          p.regionId === original.locationId &&
          p.employerId === original.employerId &&
          p.filledCount === original.filledCount &&
          p.cohortId === reference.cohortId &&
          p.startOrdinal === reference.startOrdinal,
        'SOCIAL_EMPLOYMENT_POSITION_FACT_MISMATCH',
        original.positionId,
      );
      if (uint(p.filledCount, p.positionId) > 0n) {
        const obligation = obligations.get(p.wageObligationId!);
        need(
          payroll &&
            obligation?.basis ===
              'FIRST_DAY_AGGREGATE_RESERVATION_NOT_ACCRUED' &&
            money(
              obligation.amount,
              obligation.currency,
              p.positionId,
            ).amount.equals(
              Money.from(payroll.amount, payroll.currency).amount,
            ) &&
            canonicalSerialize(obligation.exactFirstDayPayroll) ===
              canonicalSerialize(payroll.exactFirstDayPayrollLC),
          'SOCIAL_EMPLOYMENT_PAYROLL_RESERVATION_MISMATCH',
          p.positionId,
        );
      }
    }
  }
  return {
    carrier: freeze(carrier),
    policySha256: policy.sha256,
    outputSha256: output.sha256,
    carrierSha256: sha(canonicalSerialize(carrier)),
  };
}

/** Immutable data reuse only. Core identity cannot authenticate a DI digest:
 * verify the real outer and every nested source SHA before reusing a seed.
 * DTOs retain the complete canonical parser path. No authority/head is cached. */
export function requirePostwarSha256OpeningSeed(input: unknown): OpeningSeed {
  if (
    !input ||
    typeof input !== 'object' ||
    !isValidatedOpeningSeed(input) ||
    !Object.isFrozen(input)
  )
    return parseOpeningSeed(clone(input), sha);
  for (const source of input.sources) {
    const payloadHash = createHash('sha256')
      .update(`${CANONICAL_HASH_ALGORITHM}\n{"payload":`)
      .update(source.canonicalPayload)
      .update('}')
      .digest('hex');
    need(
      source.payloadHash === `sha256:${payloadHash}`,
      'CORE_SOURCE_HASH_BINDING_MISMATCH',
      source.sourceId,
    );
  }
  const { fingerprint, ...intent } = input;
  need(
    fingerprint === `sha256:${sha(canonicalHashInput(intent))}`,
    'CORE_SEED_HASH_BINDING_MISMATCH',
    'seed.fingerprint',
  );
  return input;
}

function blocked(error: unknown): PostwarOperatingGenesisAdoption {
  const known = error instanceof InvalidGenesis;
  return freeze({
    status: 'BLOCKED',
    seed: null,
    carrierSha256: null,
    policySha256: null,
    outputSha256: null,
    blockers: [
      {
        code: known ? error.code : 'GENESIS_OR_CORE_CONTRACT_REJECTED',
        field: known
          ? error.field
          : error instanceof Error
            ? error.message
            : 'input',
      },
    ],
    admissionAllowed: false,
    activationAllowed: false,
  });
}
/** Attach validated operating rules to the existing canonical seed, without
 * altering any inventory/financial opening batch or creating a historical event.
 * This lower boundary grants no financial/admission authority to its caller. */
export function adoptPostwarOperatingGenesis(input: {
  readonly carrier: unknown;
  readonly baselineSeed: OpeningSeed;
  readonly sourceId: string;
  readonly newWorldScope: PostwarNewWorldScope;
}): PostwarOperatingGenesisAdoption {
  try {
    const baseline = requirePostwarSha256OpeningSeed(input.baselineSeed);
    need(
      newWorldScopes.has(input.newWorldScope) &&
        input.newWorldScope.worldId === baseline.worldId,
      'REAL_NEW_WORLD_SOURCE_OBSERVATION_REQUIRED',
      'newWorldScope',
    );
    need(
      !baseline.sources.some((s) => {
        const payload = JSON.parse(s.canonicalPayload) as {
          schemaVersion?: unknown;
        };
        return (
          payload.schemaVersion === 'postwar-operating-genesis-seed-source-v1'
        );
      }),
      'OPERATING_SOURCE_ALREADY_ATTACHED',
      'baselineSeed.sources',
    );
    const verified = validateCarrier(input.carrier, baseline);
    const source = createOpeningSource(
      {
        schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
        sourceId: openingSourceId(input.sourceId),
        sourceKind: 'DOCUMENTED_ASSUMPTION',
        locator: `generated/postwar-operating/${verified.carrier.genesisVersion}/${baseline.worldId}.json`,
        sourceVersion: verified.carrier.genesisVersion,
        payload: {
          schemaVersion: 'postwar-operating-genesis-seed-source-v1',
          provenanceKind: 'GENERATED_POLICY',
          baselineSeedFingerprint: baseline.fingerprint,
          carrierSha256: verified.carrierSha256,
          policySha256: verified.policySha256,
          outputSha256: verified.outputSha256,
          projectAdoption: POSTWAR_OPERATING_USER_RECEIPT,
          carrier: verified.carrier,
        },
      },
      sha,
    );
    const seed = createOpeningSeed(
      {
        schemaVersion: OPENING_SEED_SCHEMA_VERSION,
        seedId: openingSeedId(baseline.seedId),
        worldId: worldId(baseline.worldId),
        openingWorldVersion: '0',
        replayBinding: baseline.replayBinding,
        sources: [...baseline.sources, source],
        inventoryEntries: baseline.inventoryEntries,
        financialBatches: baseline.financialBatches,
      },
      sha,
    );
    rebuildV08LedgersFromLineage({ seed, sha256Hex: sha });
    // Full validation preceded the genuine Core constructor with our fixed
    // SHA-256 implementation, followed by the unchanged Core ledger rebuild.
    // Re-parsing a JSON clone would repeat the same checks and discard all
    // immutable identities; the fixed reader still checks actual source hashes.
    rememberDerivedView(
      freeze({
        schemaVersion: 'postwar-operating-genesis-derived-view-v1',
        worldId: seed.worldId,
        seedFingerprint: seed.fingerprint,
        carrierSha256: verified.carrierSha256,
        policySha256: verified.policySha256,
        outputSha256: verified.outputSha256,
        facts: verified.carrier.facts,
        socialEmployment: verified.carrier.socialEmployment ?? null,
        physicalServiceReceiptDocumentId:
          verified.carrier.physicalServiceReceiptDocumentId ?? null,
        financialOfficeOriginalsDocument:
          verified.carrier.documents.find(
            (document) =>
              document.documentId === POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID,
          ) ?? null,
      }),
    );
    readPostwarOperatingGenesisFromSeed(seed);
    const result: PostwarOperatingGenesisAdoption = freeze({
      status: 'PROJECT_ADOPTED_NOT_ADMITTED',
      seed,
      carrierSha256: verified.carrierSha256,
      policySha256: verified.policySha256,
      outputSha256: verified.outputSha256,
      blockers: [],
      admissionAllowed: false,
      activationAllowed: false,
    });
    adoptions.add(result);
    return result;
  } catch (error) {
    return blocked(error);
  }
}
export function isPostwarOperatingGenesisAdoption(
  value: unknown,
): value is PostwarOperatingGenesisAdoption {
  return typeof value === 'object' && value !== null && adoptions.has(value);
}
/** The V2 path actually calls its existing branded financial bridge before
 * operating policy adoption. Missing/forged proof yields no candidate seed. */
export function preparePostwarOperatingGenesisFromFinancialSupplement(input: {
  readonly carrier: unknown;
  readonly assembly: OpeningCanonicalSeedAssemblyV2;
  readonly proof: FinancialSupplementAdoption;
  readonly candidate: FormalFinancialCandidate;
  readonly sourceId: string;
  readonly newWorldScope: PostwarNewWorldScope;
}): PostwarOperatingGenesisAdoption {
  try {
    const baselineSeed = prepareFinancialSupplementOpeningSeed(input);
    return adoptPostwarOperatingGenesis({ ...input, baselineSeed });
  } catch (error) {
    return blocked(error);
  }
}
/** Re-derive from the sole canonical seed. Runtime consumers may combine this
 * immutable opening view with subsequent authorized events; neither this view
 * nor a serialized adoption/result object is an admission/current-state proof. */
export function readPostwarOperatingGenesisFromSeed(
  input: unknown,
): PostwarOperatingGenesisView {
  // Core constructors/parsers own the WeakSet identity and freeze the seed,
  // sources and ledger inputs. Reuse only that exact immutable object; copied
  // DTOs/proxies still take full canonical parsing and fingerprint verification
  // before a derived-view cache lookup. This is data reuse, never admission,
  // current-head, transaction or authorization reuse.
  const seed =
    input !== null &&
    typeof input === 'object' &&
    isValidatedOpeningSeed(input) &&
    Object.isFrozen(input)
      ? input
      : parseOpeningSeed(clone(input), sha);
  // Core constructors deliberately accept an injected digest implementation.
  // Identity proves immutable structure, not that that injected implementation
  // was SHA-256. Verify the actual intent hash before looking up by fingerprint;
  // this still avoids cloning and reparsing the entire immutable seed.
  if (seed === input) {
    for (const source of seed.sources) {
      // A genuine source already owns canonical immutable payload bytes. Hash
      // the same one-key canonical envelope without parsing those bytes again.
      const payloadHash = createHash('sha256')
        .update(`${CANONICAL_HASH_ALGORITHM}\n{"payload":`)
        .update(source.canonicalPayload)
        .update('}')
        .digest('hex');
      need(
        source.payloadHash === `sha256:${payloadHash}`,
        'CORE_SOURCE_HASH_BINDING_MISMATCH',
        source.sourceId,
      );
    }
    const { fingerprint, ...intent } = seed;
    need(
      fingerprint === `sha256:${sha(canonicalHashInput(intent))}`,
      'CORE_SEED_HASH_BINDING_MISMATCH',
      'seed.fingerprint',
    );
  }
  const cached = derivedViews.get(seed.fingerprint);
  if (cached) {
    derivedViews.delete(seed.fingerprint);
    derivedViews.set(seed.fingerprint, cached);
    return cached.view;
  }
  const sources = seed.sources.filter((s) => {
    const payload = JSON.parse(s.canonicalPayload) as {
      schemaVersion?: unknown;
    };
    return payload.schemaVersion === 'postwar-operating-genesis-seed-source-v1';
  });
  need(sources.length === 1, 'EXACT_OPERATING_SOURCE_REQUIRED', 'seed.sources');
  const source = sources[0]!;
  const payload = JSON.parse(source.canonicalPayload) as {
    provenanceKind: unknown;
    baselineSeedFingerprint: unknown;
    carrierSha256: unknown;
    policySha256: unknown;
    outputSha256: unknown;
    projectAdoption: unknown;
    carrier: unknown;
  };
  need(
    source.sourceKind === 'DOCUMENTED_ASSUMPTION' &&
      payload.provenanceKind === 'GENERATED_POLICY' &&
      canonicalSerialize(payload.projectAdoption) ===
        canonicalSerialize(POSTWAR_OPERATING_USER_RECEIPT),
    'GENERATED_POLICY_PROVENANCE_REQUIRED',
    'source',
  );
  const baseline = createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: seed.seedId,
      worldId: seed.worldId,
      openingWorldVersion: '0',
      replayBinding: seed.replayBinding,
      sources: seed.sources.filter((s) => s !== source),
      inventoryEntries: seed.inventoryEntries,
      financialBatches: seed.financialBatches,
    },
    sha,
  );
  need(
    baseline.fingerprint === payload.baselineSeedFingerprint,
    'BASELINE_SEED_BINDING_MISMATCH',
    'source',
  );
  const verified = validateCarrier(payload.carrier, baseline);
  need(
    payload.carrierSha256 === verified.carrierSha256 &&
      payload.policySha256 === verified.policySha256 &&
      payload.outputSha256 === verified.outputSha256 &&
      source.sourceVersion === verified.carrier.genesisVersion &&
      source.locator ===
        `generated/postwar-operating/${verified.carrier.genesisVersion}/${seed.worldId}.json`,
    'OPERATING_SOURCE_HASH_OR_VERSION_MISMATCH',
    'source',
  );
  const view: PostwarOperatingGenesisView = freeze({
    schemaVersion: 'postwar-operating-genesis-derived-view-v1',
    worldId: seed.worldId,
    seedFingerprint: seed.fingerprint,
    carrierSha256: verified.carrierSha256,
    policySha256: verified.policySha256,
    outputSha256: verified.outputSha256,
    facts: verified.carrier.facts,
    socialEmployment: verified.carrier.socialEmployment ?? null,
    physicalServiceReceiptDocumentId:
      verified.carrier.physicalServiceReceiptDocumentId ?? null,
    financialOfficeOriginalsDocument:
      verified.carrier.documents.find(
        (document) =>
          document.documentId === POSTWAR_FINANCIAL_OFFICE_ORIGINALS_ID,
      ) ?? null,
  });
  rememberDerivedView(view);
  return view;
}
