/** Pure finite first-day planning. This module issues no source authority,
 * completed WORK, paid expense, custody change or authoritative receipt. */
import {
  readPreparedFinanceSocialOpening,
  type PreparedFinanceSocialLedger,
} from '../commands/finance-social-prepared-ledger.js';
import type { Sha256Hex } from '../commands/command.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import {
  isValidatedOpeningSeed,
  type OpeningSeed,
} from '../opening/opening-seed.js';
import {
  foundationFactPayload,
  type FoundationFact,
  type FoundationTraceRequest,
} from '../engine-kernels/foundation-provenance.js';

export const INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION =
  'INDUSTRY_INTERNAL_LOGISTICS_FIRST_DAY_20261101_V1' as const;
export const INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256 =
  'de6ad8ff58ff0180706b6bc6b4d548fd2d3404c4749cf71d91845474b19fddb0';
export const INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256 =
  'a8c9a584e88c270d297c9758341b552654905af9a9489d2de3bf1b6e20b4c3ff';
export const INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION =
  'INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_FIRST_DAY_20261108_V2' as const;
export const INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256 =
  '67214ceb7fe7bce02035827ec75de21da804e35e1831da55a7e637a3f11e25eb';
const SOURCE_HASHES = Object.freeze({
  'domestic-access.json':
    '2b8e6102479031314ca91560a81f485edb671ab74d233c70e1da40da0be32a09',
  'facilities.json':
    '049e39330646048b95636d3a075fc1423ee62762999184a2326df161a198b485',
  'stocks.json':
    'd52e68856dabdda6d5488043291ee92100f22c16ea44d34d2000170402ee8153',
  'commodity-catalog.json':
    'b1f9a100bdb80627e31801ffaf1b2c7863a2996cedba0344de8a899c616eff2b',
});
export class IndustryInternalLogisticsError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
function invalid(code: string): never {
  throw new IndustryInternalLogisticsError(code);
}
const ref = (v: string) => {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(v))
    invalid('EXACT_REFERENCE_REQUIRED');
  return v;
};
type Rational = Readonly<{ n: bigint; d: bigint }>;
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
function rational(n: bigint, d = 1n): Rational {
  if (n < 0n || d <= 0n) invalid('NONNEGATIVE_EXACT_QUANTITY_REQUIRED');
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
function decimal(v: string): Rational {
  if (
    typeof v !== 'string' ||
    v.length > 100 ||
    !/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(v)
  )
    invalid('CANONICAL_DECIMAL_REQUIRED');
  const [whole, fraction = ''] = v.split('.');
  return rational(BigInt(whole! + fraction), 10n ** BigInt(fraction.length));
}
const add = (a: Rational, b: Rational) =>
  rational(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Rational, b: Rational) => rational(a.n * b.n, a.d * b.d);
const cmp = (a: Rational, b: Rational) => a.n * b.d - b.n * a.d;
function exact(v: Rational): string {
  let d = v.d,
    twos = 0,
    fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  if (d !== 1n) invalid('NONTERMINATING_DECIMAL_REQUIRES_EXACT_RATIONAL');
  const scale = Math.max(twos, fives);
  const n = v.n * (10n ** BigInt(scale) / v.d);
  if (!scale) return n.toString();
  const text = n.toString().padStart(scale + 1, '0');
  return (text.slice(0, -scale) + '.' + text.slice(-scale)).replace(
    /\.?0+$/u,
    '',
  );
}
function tick(v: string): bigint {
  if (typeof v !== 'string' || !/^(?:0|[1-9]\d{0,17})$/u.test(v))
    invalid('INTEGER_SIM_TIME_REQUIRED');
  return BigInt(v);
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('SOURCE_RECORD_REQUIRED');
  return v as Record<string, unknown>;
}
function lossless(text: string): unknown {
  const parse = JSON.parse as (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source?: string },
    ) => unknown,
  ) => unknown;
  return parse(text, (_k, v, c) => (typeof v === 'number' ? c.source : v));
}
function selected(text: string, hash: string, id: string, sha: Sha256Hex) {
  if (text.length > 16 * 1024 * 1024 || sha(text) !== hash)
    invalid('EXACT_SOURCE_BYTES_REQUIRED');
  const rows = lossless(text);
  if (!Array.isArray(rows)) invalid('SOURCE_ARRAY_REQUIRED');
  const matches = rows.map(record).filter((r) => r.id === id);
  if (matches.length !== 1) invalid('UNIQUE_ACTUAL_SOURCE_ROW_REQUIRED');
  return matches[0]!;
}
export interface IndustryInternalLogisticsSite {
  readonly facilityRef: string;
  readonly countryRef: string;
  readonly operatorRef: string;
  readonly locationRef: string;
  readonly sourceCountryId: string;
  readonly sourceOperatorId: string;
}
export interface IndustryInternalLogisticsSourceData {
  readonly classification: 'DATA_ONLY_NAMED_HANDOVER_SOURCE_NOT_AUTHORITY';
  readonly policyVersion:
    | typeof INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION
    | typeof INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION;
  readonly worldId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly countryId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly batchId: string;
  readonly commodityId: string;
  readonly unit: string;
  readonly openingAvailable: string;
  readonly titleHolderId: string;
  readonly riskBearerId: string;
  readonly economicRecognitionId: string | null;
  readonly routeRef: string;
  readonly rawRouteFromId: string;
  readonly rawRouteToId: string;
  readonly rawRouteStatus: 'NOT_SURVEYED_NOT_OPERATIONAL';
  readonly routeNature: 'SCENARIO_NAMED_HANDOVER_NOT_SURVEYED_ROAD';
  readonly distanceKm: string;
  readonly capacityTonnesPerSimDay: string;
  readonly tonnesPerUnit: string;
  readonly logisticsEmploymentSources: readonly Readonly<{
    sourceObjectId: string;
    sourceRegionId: string;
    sourceOperatorId: string;
    projectId: string;
    labourBySkill: Readonly<Record<'LOW' | 'MEDIUM' | 'HIGH', string>>;
  }>[];
  readonly rawSourceHashes: typeof SOURCE_HASHES;
}
declare const sourceBrand: unique symbol;
export interface IndustryInternalLogisticsSource {
  readonly [sourceBrand]: true;
}
const sources = new WeakMap<
  object,
  Readonly<IndustryInternalLogisticsSourceData>
>();
/** Existing admitted-site fact and genuine seed are data inputs, never an
 * admission/mandate. The future server must still protect their actual source. */
interface LogisticsSourceOriginalInput {
  readonly trace: FoundationTraceRequest;
  readonly siteFact: FoundationFact<IndustryInternalLogisticsSite>;
  readonly policyRawBytes: string;
  readonly adoptionRawBytes: string;
  readonly sourceBytes: Readonly<Record<keyof typeof SOURCE_HASHES, string>>;
  readonly sha256Hex: Sha256Hex;
}
/** Legacy full genuine seed entrance remains strict and byte-compatible. */
export function prepareIndustryInternalLogisticsSource(
  input: LogisticsSourceOriginalInput & {
    readonly seed: OpeningSeed;
    readonly openingInventoryEntryId: string;
  },
): Readonly<IndustryInternalLogisticsSource> {
  if (!isValidatedOpeningSeed(input.seed))
    invalid('GENUINE_OPENING_SEED_REQUIRED');
  return deriveSource(input, {
    worldId: input.seed.worldId,
    seedId: input.seed.seedId,
    fingerprint: input.seed.fingerprint,
    entry: input.seed.inventoryEntries.find(
      (e) => e.entryId === input.openingInventoryEntryId,
    ),
  });
}
/** The same raw originals against the private genuine paired H0 ledger. No
 * caller snapshot/boolean, full-seed retention or online raw SQL is needed. */
export function prepareIndustryInternalLogisticsSourceFromPreparedOpening(
  input: LogisticsSourceOriginalInput & {
    readonly prepared: PreparedFinanceSocialLedger;
    readonly openingInventoryAccountSha256: string;
  },
): Readonly<IndustryInternalLogisticsSource> {
  const opening = readPreparedFinanceSocialOpening(input.prepared);
  const matches = opening.inventory.balances.filter(
    (b) =>
      input.sha256Hex(canonicalSerialize(b.account)) ===
      input.openingInventoryAccountSha256,
  );
  if (matches.length !== 1)
    invalid('EXACT_GENUINE_OPENING_STOCK_ACCOUNT_REQUIRED');
  return deriveSource(input, {
    worldId: opening.inventory.worldId,
    seedId: opening.seedId,
    fingerprint: opening.seedFingerprint,
    entry: matches[0],
  });
}
function deriveSource(
  input: LogisticsSourceOriginalInput,
  seed: Readonly<{
    worldId: string;
    seedId: string;
    fingerprint: string;
    entry:
      | Pick<OpeningSeed['inventoryEntries'][number], 'account' | 'quantity'>
      | undefined;
  }>,
): Readonly<IndustryInternalLogisticsSource> {
  const policySha = input.sha256Hex(input.policyRawBytes),
    multiCountry =
      policySha === INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_RAW_SHA256;
  if (
    !multiCountry &&
    policySha !== INDUSTRY_INTERNAL_LOGISTICS_POLICY_RAW_SHA256
  )
    invalid('EXACT_VERSIONED_LOGISTICS_POLICY_REQUIRED');
  if (
    input.sha256Hex(input.adoptionRawBytes) !==
    INDUSTRY_INTERNAL_LOGISTICS_ADOPTION_RAW_SHA256
  )
    invalid('EXACT_UTILITY_USER_ADOPTION_REQUIRED');
  if (
    input.trace.snapshot.snapshotHash !== seed.fingerprint.slice(7) ||
    input.trace.snapshot.sourceVersion !== seed.seedId
  )
    invalid('ACTUAL_SEED_SNAPSHOT_REQUIRED');
  const site = foundationFactPayload(
    input.trace,
    input.siteFact,
    'actualSiteFact',
  );
  Object.values(site).forEach(ref);
  const countrySuffix = multiCountry
    ? /^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.exec(site.countryRef)?.[1]
    : '02';
  if (!countrySuffix) invalid('ACTUAL_FINITE_LOGISTICS_COUNTRY_REQUIRED');
  const warehouseId = 'WAREHOUSE-' + countrySuffix,
    gateId = 'GATE-' + countrySuffix;

  const facility = selected(
    input.sourceBytes['facilities.json'],
    SOURCE_HASHES['facilities.json'],
    site.facilityRef,
    input.sha256Hex,
  );
  if (
    site.facilityRef !== 'OPEN-' + countrySuffix + '-REFINED_FUEL' ||
    site.countryRef !== 'COUNTRY_' + countrySuffix ||
    (multiCountry &&
      (site.sourceCountryId !== 'visual-territory-' + countrySuffix ||
        site.sourceOperatorId !== 'OP-' + countrySuffix ||
        facility.projectId !== 'PROJECT-15')) ||
    facility.countryId !== site.sourceCountryId ||
    facility.operatorId !== site.sourceOperatorId ||
    facility.constructionStatusProposal !== 'OPENING_EXISTING_ASSET'
  )
    invalid(
      multiCountry
        ? 'ADOPTED_EXISTING_COUNTRY_REFINERY_REQUIRED'
        : 'ADOPTED_EXISTING_C2_SITE_REQUIRED',
    );
  const route = selected(
    input.sourceBytes['domestic-access.json'],
    SOURCE_HASHES['domestic-access.json'],
    'DOM-' + site.facilityRef,
    input.sha256Hex,
  );
  const stock = selected(
    input.sourceBytes['stocks.json'],
    SOURCE_HASHES['stocks.json'],
    'STOCK-' + countrySuffix + '-CRUDE_OIL',
    input.sha256Hex,
  );
  if (multiCountry && /^0(?:[.]0+)?$/u.test(String(route.distanceKmEstimate)))
    invalid('POSITIVE_SOURCE_CAPACITY_MASS_DISTANCE_REQUIRED');
  const logisticsEmploymentSources = Object.freeze(
    [warehouseId, gateId].map((id) => {
      const row = selected(
        input.sourceBytes['facilities.json'],
        SOURCE_HASHES['facilities.json'],
        id,
        input.sha256Hex,
      );
      if (
        row.countryId !== site.sourceCountryId ||
        row.operatorId !== site.sourceOperatorId ||
        row.constructionStatusProposal !== 'OPENING_EXISTING_ASSET' ||
        !['PROJECT-21', 'PROJECT-26'].includes(String(row.projectId))
      )
        invalid('EXISTING_SAME_OP_LOGISTICS_EMPLOYMENT_SOURCE_REQUIRED');
      const bySkill = record(row.labourBySkill),
        counts = {
          LOW: String(bySkill.low),
          MEDIUM: String(bySkill.medium),
          HIGH: String(bySkill.high),
        };
      if (
        Object.values(counts).reduce((n, c) => n + tick(c), 0n) !==
        tick(String(row.requiredWorkers))
      )
        invalid('ACTUAL_LOGISTICS_EMPLOYMENT_SKILL_TOTAL_REQUIRED');
      return Object.freeze({
        sourceObjectId: String(row.id),
        sourceRegionId: String(row.regionId),
        sourceOperatorId: String(row.operatorId),
        projectId: String(row.projectId),
        labourBySkill: Object.freeze(counts),
      });
    }),
  );
  const commodity = selected(
    input.sourceBytes['commodity-catalog.json'],
    SOURCE_HASHES['commodity-catalog.json'],
    'CRUDE_OIL',
    input.sha256Hex,
  );
  if (
    route.countryId !== site.sourceCountryId ||
    route.fromId !== site.facilityRef ||
    route.toId !== gateId ||
    route.status !== 'NOT_SURVEYED_NOT_OPERATIONAL' ||
    stock.countryId !== site.sourceCountryId ||
    stock.ownerId !== site.sourceOperatorId ||
    stock.warehouseId !== warehouseId ||
    stock.commodityId !== commodity.id ||
    stock.unit !== commodity.unit
  )
    invalid('EXACT_DOMESTIC_SOURCE_AND_SAME_OP_REQUIRED');
  const entry = seed.entry,
    a = entry?.account;
  if (
    !a ||
    a.countryId !== site.countryRef ||
    a.commodityId !== commodity.id ||
    a.unit !== commodity.unit ||
    a.physicalLocationId !== 'LOCATION_WAREHOUSE_' + countrySuffix ||
    a.bucket !== 'AVAILABLE' ||
    a.titleHolderId !== site.operatorRef ||
    a.riskBearerId !== site.operatorRef ||
    a.reservationId !== null ||
    a.shipmentId !== null ||
    entry?.quantity.toCanonicalValue().amount !== stock.available
  )
    invalid('ACTUAL_SAME_OP_OPENING_STOCK_REQUIRED');
  if (site.locationRef === a.physicalLocationId)
    invalid('REAL_DISTINCT_FACILITY_HANDOVER_LOCATION_REQUIRED');
  const data: Readonly<IndustryInternalLogisticsSourceData> = Object.freeze({
    classification: 'DATA_ONLY_NAMED_HANDOVER_SOURCE_NOT_AUTHORITY',
    policyVersion: multiCountry
      ? INDUSTRY_INTERNAL_LOGISTICS_MULTICOUNTRY_POLICY_VERSION
      : INDUSTRY_INTERNAL_LOGISTICS_POLICY_VERSION,
    worldId: seed.worldId,
    seedId: seed.seedId,
    seedFingerprint: seed.fingerprint,
    countryId: site.countryRef,
    facilityId: site.facilityRef,
    operatorId: site.operatorRef,
    fromLocationId: a.physicalLocationId,
    toLocationId: site.locationRef,
    batchId: a.batchId,
    commodityId: a.commodityId,
    unit: a.unit,
    openingAvailable: String(stock.available),
    titleHolderId: a.titleHolderId,
    riskBearerId: a.riskBearerId,
    economicRecognitionId: a.economicRecognitionId,
    routeRef: String(route.id),
    rawRouteFromId: String(route.fromId),
    rawRouteToId: String(route.toId),
    rawRouteStatus: 'NOT_SURVEYED_NOT_OPERATIONAL',
    routeNature: 'SCENARIO_NAMED_HANDOVER_NOT_SURVEYED_ROAD',
    distanceKm: exact(decimal(String(route.distanceKmEstimate))),
    capacityTonnesPerSimDay: exact(
      decimal(String(route.capacityTonnesDayProposal)),
    ),
    tonnesPerUnit: exact(decimal(String(commodity.freightTonnesPerUnit))),
    logisticsEmploymentSources,
    rawSourceHashes: SOURCE_HASHES,
  });
  if (
    !decimal(data.capacityTonnesPerSimDay).n ||
    !decimal(data.tonnesPerUnit).n ||
    !decimal(data.distanceKm).n
  )
    invalid('POSITIVE_SOURCE_CAPACITY_MASS_DISTANCE_REQUIRED');
  const token = Object.freeze({}) as IndustryInternalLogisticsSource;
  sources.set(token, data);
  return token;
}
export function readIndustryInternalLogisticsSource(
  source: IndustryInternalLogisticsSource,
) {
  const value = sources.get(source);
  if (!value) invalid('GENUINE_LOGISTICS_DATA_SOURCE_REQUIRED');
  return value;
}
export interface IndustryInternalLogisticsRequest {
  readonly transferId: string;
  readonly runId: string;
  readonly direction: 'WAREHOUSE_TO_EXISTING_FACILITY';
  readonly quantity: Readonly<{ amount: string; unit: string }>;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
}
export interface IndustryInternalLogisticsPlanData {
  readonly classification: 'PLAN_BOOKING_NOT_COMPLETED_WORK_PAYMENT_OR_CUSTODY';
  readonly request: IndustryInternalLogisticsRequest;
  readonly source: Readonly<IndustryInternalLogisticsSourceData>;
  readonly tonnes: string;
  readonly tonneKilometres: string;
  readonly capacityRateTonnesPerSimDay: Readonly<{
    numerator: string;
    denominator: string;
  }>;
  readonly budgetReference: Readonly<{
    amount: string;
    currency: 'GCU';
    isPriceOrExpense: false;
  }>;
  readonly actualQualifiedExpense: null;
  readonly requiresSameTransactionSourceAndInventoryRecheck: true;
}
declare const planBrand: unique symbol;
export interface IndustryInternalLogisticsPlan {
  readonly [planBrand]: true;
}
declare const stateBrand: unique symbol;
export interface IndustryInternalLogisticsPlanningState {
  readonly [stateBrand]: true;
}
const plans = new WeakMap<
  object,
  Readonly<IndustryInternalLogisticsPlanData>
>();
const states = new WeakMap<
  object,
  Readonly<{
    source: IndustryInternalLogisticsSource;
    bookings: readonly IndustryInternalLogisticsPlan[];
  }>
>();
export function createIndustryInternalLogisticsPlanningState(
  source: IndustryInternalLogisticsSource,
): IndustryInternalLogisticsPlanningState {
  readIndustryInternalLogisticsSource(source);
  const state = Object.freeze({}) as IndustryInternalLogisticsPlanningState;
  states.set(state, { source, bookings: Object.freeze([]) });
  return state;
}
export function readIndustryInternalLogisticsPlan(
  plan: IndustryInternalLogisticsPlan,
) {
  const data = plans.get(plan);
  if (!data) invalid('GENUINE_LOGISTICS_PLAN_REQUIRED');
  return data;
}
/** Exact uniform-rate interval booking; capacity is shared by all runs using
 * this sealed source, rather than independently granting a full day's quota. */
export function prepareIndustryInternalLogisticsPlan(input: {
  readonly state: IndustryInternalLogisticsPlanningState;
  readonly source: IndustryInternalLogisticsSource;
  readonly request: IndustryInternalLogisticsRequest;
}) {
  const current = states.get(input.state),
    source = readIndustryInternalLogisticsSource(input.source),
    request = input.request;
  if (!current || current.source !== input.source)
    invalid('SAME_SOURCE_PLANNING_STATE_REQUIRED');
  ref(request.transferId);
  ref(request.runId);
  if (
    request.direction !== 'WAREHOUSE_TO_EXISTING_FACILITY' ||
    request.quantity.unit !== source.unit
  )
    invalid('ACTUAL_DIRECTION_AND_UNIT_REQUIRED');
  const prior = current.bookings.find(
    (p) =>
      readIndustryInternalLogisticsPlan(p).request.transferId ===
      request.transferId,
  );
  if (prior) {
    if (
      canonicalSerialize(readIndustryInternalLogisticsPlan(prior).request) !==
      canonicalSerialize(request)
    )
      invalid('TRANSFER_IDEMPOTENCY_CONFLICT');
    return Object.freeze({
      outcome: 'EXACT_DUPLICATE' as const,
      state: input.state,
      plan: prior,
    });
  }
  const start = tick(request.startsAtSimTime),
    end = tick(request.endsAtSimTime),
    q = decimal(request.quantity.amount);
  if (end <= start || end > 86400000n || !q.n)
    invalid('POSITIVE_FIRST_DAY_WINDOW_AND_QUANTITY_REQUIRED');
  let booked = q;
  for (const b of current.bookings)
    booked = add(
      booked,
      decimal(readIndustryInternalLogisticsPlan(b).request.quantity.amount),
    );
  if (cmp(booked, decimal(source.openingAvailable)) > 0n)
    invalid('OPENING_STOCK_PLANNING_CAPACITY_EXCEEDED');
  const tonnes = mul(q, decimal(source.tonnesPerUnit)),
    rate = mul(tonnes, rational(86400000n, end - start));
  const boundaries = new Set([start, end]);
  for (const b of current.bookings) {
    const r = readIndustryInternalLogisticsPlan(b).request;
    boundaries.add(tick(r.startsAtSimTime));
    boundaries.add(tick(r.endsAtSimTime));
  }
  for (const at of boundaries) {
    let total = start <= at && at < end ? rate : rational(0n);
    for (const b of current.bookings) {
      const p = readIndustryInternalLogisticsPlan(b),
        r = p.request;
      if (tick(r.startsAtSimTime) <= at && at < tick(r.endsAtSimTime))
        total = add(
          total,
          rational(
            BigInt(p.capacityRateTonnesPerSimDay.numerator),
            BigInt(p.capacityRateTonnesPerSimDay.denominator),
          ),
        );
    }
    if (cmp(total, decimal(source.capacityTonnesPerSimDay)) > 0n)
      invalid('INTERVAL_LOGISTICS_THROUGHPUT_EXCEEDED');
  }
  const tonneKm = mul(tonnes, decimal(source.distanceKm));
  const data: Readonly<IndustryInternalLogisticsPlanData> = Object.freeze({
    classification: 'PLAN_BOOKING_NOT_COMPLETED_WORK_PAYMENT_OR_CUSTODY',
    request: Object.freeze({
      ...request,
      quantity: Object.freeze({ ...request.quantity }),
    }),
    source,
    tonnes: exact(tonnes),
    tonneKilometres: exact(tonneKm),
    capacityRateTonnesPerSimDay: Object.freeze({
      numerator: rate.n.toString(),
      denominator: rate.d.toString(),
    }),
    budgetReference: Object.freeze({
      amount: exact(mul(tonneKm, decimal('0.015'))),
      currency: 'GCU',
      isPriceOrExpense: false,
    }),
    actualQualifiedExpense: null,
    requiresSameTransactionSourceAndInventoryRecheck: true,
  });
  const plan = Object.freeze({}) as IndustryInternalLogisticsPlan;
  plans.set(plan, data);
  const state = Object.freeze({}) as IndustryInternalLogisticsPlanningState;
  states.set(
    state,
    Object.freeze({
      source: input.source,
      bookings: Object.freeze([...current.bookings, plan]),
    }),
  );
  return Object.freeze({
    outcome: 'BOOKED_NOT_EXECUTED' as const,
    state,
    plan,
  });
}
/** No independent logistics WORK/payment issuer is installed in this pure
 * preparation batch. Neither caller refs, manufacturing WORK nor a budget can
 * upgrade a plan to a handover. A later fixed issuer must consume actual,
 * separately committed service and purpose-qualified expense originals. */
export function inspectIndustryInternalLogisticsExecution(input: {
  readonly plan: IndustryInternalLogisticsPlan;
  readonly independentServiceWork?: unknown;
  readonly paidInputs?: unknown;
  readonly manufacturingWork?: unknown;
}) {
  const plan = readIndustryInternalLogisticsPlan(input.plan);
  const missing: (
    | 'INDEPENDENT_LOGISTICS_SERVICE_WORK_REQUIRED'
    | 'QUALIFIED_PAID_LOGISTICS_INPUT_REQUIRED'
    | 'MANUFACTURING_WORK_IS_NOT_LOGISTICS_WORK'
    | 'FIXED_LOGISTICS_ORIGINALS_ISSUER_NOT_INSTALLED'
  )[] = [];
  if (input.manufacturingWork != null)
    missing.push('MANUFACTURING_WORK_IS_NOT_LOGISTICS_WORK');
  if (input.independentServiceWork == null)
    missing.push('INDEPENDENT_LOGISTICS_SERVICE_WORK_REQUIRED');
  if (input.paidInputs == null)
    missing.push('QUALIFIED_PAID_LOGISTICS_INPUT_REQUIRED');
  if (input.independentServiceWork != null || input.paidInputs != null)
    missing.push('FIXED_LOGISTICS_ORIGINALS_ISSUER_NOT_INSTALLED');
  return Object.freeze({
    status: 'MISSING_EXECUTION_ORIGINALS' as const,
    transferId: plan.request.transferId,
    missing: Object.freeze(missing),
    handover: null,
    actualQualifiedExpense: null,
    inventoryPostings: Object.freeze([]),
    financialPostingBatches: Object.freeze([]),
  });
}
