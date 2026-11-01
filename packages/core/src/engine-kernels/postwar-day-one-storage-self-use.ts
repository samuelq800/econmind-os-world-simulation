/** Adopted first-day simulation, not the unresolved meaning of the raw 0.9.
 * This private deterministic ledger proposes physical bookings/settlements.
 * It is DATA, not custody, a grant, a metered delivery, or command authority.
 * A future authoritative adapter must bind every source and protected booking
 * to the actual admitted World and commit the result through the one consumer.
 */
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import { canonicalSha256, type Sha256Hex } from '../commands/command.js';
import { SIMULATION_TICKS_PER_DAY } from '../time/simulation-clock.js';
import { kernelInvalid } from './common.js';

export const DAY_ONE_STORAGE_SELF_USE_POLICY = Object.freeze({
  schemaVersion: 'postwar-day-one-storage-self-use-policy-v1',
  policyVersion: 'POSTWAR_DAY_ONE_OP_STORAGE_SELF_USE_V1',
  policyRawSha256:
    'c8566d90a03513dc3ac61667cdafe8edad07e06acac34a8d0ea60132391f62d3',
  classification:
    'ADOPTED_NEW_SCENARIO_SIMULATION_POLICY_NOT_PHYSICAL_CALIBRATION',
  adoptionRawSha256:
    'de6ad8ff58ff0180706b6bc6b4d548fd2d3404c4749cf71d91845474b19fddb0',
  sourceEfficiencyMeaning: 'UNKNOWN_IN_ORIGINAL',
  oneWayDischargeEfficiency: '0.9',
  scope: 'NEW_SCENARIO_FIRST_SIMULATED_DAY_ONLY',
} as const);

export interface StorageExactRational {
  readonly numerator: string;
  readonly denominator: string;
}
export type StorageExactEnergyInput = string | StorageExactRational;
interface Q {
  readonly n: bigint;
  readonly d: bigint;
}
const q = (n: bigint, d = 1n): Q => {
  if (d <= 0n || n < 0n) fail('NONNEGATIVE_EXACT_QUANTITY_REQUIRED');
  let a = n,
    b = d;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  const divisor = a || 1n;
  return { n: n / divisor, d: d / divisor };
};
const plus = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const minus = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const times = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const divide = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const atMost = (a: Q, b: Q) => a.n * b.d <= b.n * a.d;
const same = (a: Q, b: Q) => a.n === b.n && a.d === b.d;
const zero = q(0n),
  efficiency = q(9n, 10n);
const day = BigInt(SIMULATION_TICKS_PER_DAY),
  hour = day / 24n;
function fail(code: string): never {
  return kernelInvalid('Storage self-use: ' + code);
}
function decimal(v: string): Q {
  if (!/^(0|[1-9]\d*)(\.\d*[1-9])?$/u.test(v) || v.length > 96)
    fail('CANONICAL_NONNEGATIVE_DECIMAL_REQUIRED');
  const [whole, fraction = ''] = v.split('.');
  return q(BigInt(whole! + fraction), 10n ** BigInt(fraction.length));
}
function ticks(v: string): bigint {
  if (!/^(0|[1-9]\d*)$/u.test(v) || v.length > 32)
    fail('CANONICAL_SIM_TICKS_REQUIRED');
  return BigInt(v);
}
function ref(v: string): string {
  if (typeof v !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/u.test(v))
    fail('EXACT_REFERENCE_REQUIRED');
  return v;
}
function exactKeys(value: object, expected: readonly string[]) {
  if (Object.keys(value).sort().join('|') !== [...expected].sort().join('|'))
    fail('EXACT_CLOSED_SCHEMA_REQUIRED');
}
/** Exact pump demand divided by (1-loss) may recur. No unapproved output
 * quantum or rounding away energy is introduced at this boundary. */
function energy(value: StorageExactEnergyInput): Q {
  if (typeof value === 'string') return decimal(value);
  if (!value || typeof value !== 'object') fail('EXACT_ENERGY_REQUIRED');
  exactKeys(value, ['numerator', 'denominator']);
  if (
    !/^(0|[1-9]\d*)$/u.test(value.numerator) ||
    !/^[1-9]\d*$/u.test(value.denominator) ||
    value.numerator.length > 192 ||
    value.denominator.length > 192
  )
    fail('CANONICAL_ENERGY_FRACTION_REQUIRED');
  const parsed = q(BigInt(value.numerator), BigInt(value.denominator));
  if (
    parsed.n.toString() !== value.numerator ||
    parsed.d.toString() !== value.denominator
  )
    fail('REDUCED_ENERGY_FRACTION_REQUIRED');
  return parsed;
}
const render = (v: Q): StorageExactRational =>
  Object.freeze({ numerator: v.n.toString(), denominator: v.d.toString() });
const sum = (values: readonly Q[]) => values.reduce(plus, zero);
const hash = (v: unknown, sha: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), sha);
const freeze = <T>(v: T): Readonly<T> => {
  if (v && typeof v === 'object') {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
};

export interface DayOneStorageProtection {
  readonly reservationRef: string;
  readonly kind: 'EXISTING_RESERVATION' | 'PUBLIC_PRIORITY';
  readonly fromSimTime: string;
  readonly throughSimTime: string;
  /** Retained actual reservation draw, not reinterpreted using the new 0.9. */
  readonly storedEnergyMWh: StorageExactEnergyInput;
  readonly outputMWh: StorageExactEnergyInput;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
}
export interface DayOneStorageOpening {
  readonly scenarioRef: string;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly countryId: string;
  readonly storageId: string;
  readonly gridId: string;
  readonly operatorId: string;
  readonly storageOwnerId: string;
  readonly gridOwnerId: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly originalEnergyCapacityMWh: string;
  readonly originalOpeningSocMWh: string;
  readonly originalStorageDischargeMW: string;
  readonly originalGridMW: string;
  readonly originalLossFraction: string;
  readonly originalEfficiency: '0.9';
  readonly protectedReservations: readonly DayOneStorageProtection[];
}
export interface DayOneStorageRequest {
  readonly bookingRef: string;
  readonly runRef: string;
  readonly worldId: string;
  readonly countryId: string;
  readonly operatorId: string;
  readonly storageId: string;
  readonly gridId: string;
  readonly purpose: 'INDUSTRY_SELF_USE' | 'PROCESS_WATER_PUMPING_SELF_USE';
  readonly fromSimTime: string;
  readonly throughSimTime: string;
  /** Output before the retained route loss, never a delivered quantity. */
  readonly outputMWh: StorageExactEnergyInput;
}
interface Booking {
  readonly request: Readonly<DayOneStorageRequest>;
  readonly requestFingerprint: string;
  readonly status: 'BOOKED_NOT_DELIVERED' | 'SETTLED';
  readonly storedDraw: Q;
  readonly output: Q;
}
export interface DayOneStorageSettlementData {
  readonly classification: 'PROPOSED_PHYSICAL_SETTLEMENT_DATA_NOT_DELIVERY_AUTHORITY';
  readonly openingFingerprint: string;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly countryId: string;
  readonly operatorId: string;
  readonly storageId: string;
  readonly gridId: string;
  readonly sourceRef: string;
  readonly sourceRawSha256: string;
  readonly observedSimTime: string;
  readonly bookingRef: string;
  readonly runRef: string;
  readonly purpose: DayOneStorageRequest['purpose'];
  readonly fromSimTime: string;
  readonly throughSimTime: string;
  readonly storedEnergyWithdrawalMWh: StorageExactRational;
  readonly outputMWh: StorageExactRational;
  readonly deliveredMWh: StorageExactRational;
  readonly storageConversionLossMWh: StorageExactRational;
  readonly routeLossMWh: StorageExactRational;
}
declare const storageLedgerBrand: unique symbol;
export interface DayOneStorageSelfUseLedger {
  readonly [storageLedgerBrand]: true;
}
interface State {
  readonly source: Readonly<DayOneStorageOpening>;
  readonly openingFingerprint: string;
  readonly remainingSoc: Q;
  readonly through: bigint;
  readonly version: bigint;
  readonly bookings: readonly Booking[];
  readonly settled: readonly DayOneStorageSettlementData[];
  readonly operations: ReadonlyMap<
    string,
    Readonly<{
      fingerprint: string;
      receipt: DayOneStorageSettlementData | null;
    }>
  >;
  readonly sha: Sha256Hex;
}
const issued = new WeakMap<object, State>();
function state(value: DayOneStorageSelfUseLedger): State {
  const s = issued.get(value);
  if (!s) fail('GENUINE_LIVE_PURE_LEDGER_REQUIRED');
  return s;
}
function issue(s: State): DayOneStorageSelfUseLedger {
  const token = Object.freeze({}) as DayOneStorageSelfUseLedger;
  issued.set(token, s);
  return token;
}
function window(v: { fromSimTime: string; throughSimTime: string }) {
  const from = ticks(v.fromSimTime),
    through = ticks(v.throughSimTime);
  if (from >= through || through > day)
    fail('ACTUAL_FIRST_DAY_INTERVAL_REQUIRED');
  return { from, through, hours: q(through - from, hour) };
}
function rawHash(v: string) {
  if (!/^[a-f0-9]{64}$/u.test(v)) fail('SOURCE_RAW_SHA256_REQUIRED');
}
function protectedDraw(s: State) {
  return sum(
    s.source.protectedReservations.map((r) => energy(r.storedEnergyMWh)),
  );
}
function pendingDraw(s: State) {
  return sum(
    s.bookings
      .filter((b) => b.status === 'BOOKED_NOT_DELIVERED')
      .map((b) => b.storedDraw),
  );
}
/** Sweep all source-protected and self-use intervals, including foreign runs
 * on this same physical source; no run-local capacity reset is possible. */
function checkPower(s: State, bookings: readonly Booking[]) {
  const uses = [
    ...s.source.protectedReservations.map((r) => ({
      ...window(r),
      output: energy(r.outputMWh),
    })),
    ...bookings.map((b) => ({ ...window(b.request), output: b.output })),
  ];
  const boundaries = [
    ...new Set(uses.flatMap((u) => [u.from, u.through])),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const storageMW = decimal(s.source.originalStorageDischargeMW),
    gridMW = decimal(s.source.originalGridMW);
  for (const t of boundaries) {
    const power = sum(
      uses
        .filter((u) => u.from <= t && t < u.through)
        .map((u) => divide(u.output, u.hours)),
    );
    if (!atMost(power, storageMW) || !atMost(power, gridMW))
      fail('SHARED_STORAGE_OR_GRID_POWER_ALREADY_BOOKED');
  }
}
export function createDayOneStorageSelfUseLedger(
  input: DayOneStorageOpening,
  sha256Hex: Sha256Hex,
): DayOneStorageSelfUseLedger {
  const source = freeze(
    JSON.parse(canonicalSerialize(input)) as DayOneStorageOpening,
  );
  exactKeys(source, [
    'scenarioRef',
    'worldId',
    'seedFingerprint',
    'countryId',
    'storageId',
    'gridId',
    'operatorId',
    'storageOwnerId',
    'gridOwnerId',
    'sourceRef',
    'sourceRawSha256',
    'originalEnergyCapacityMWh',
    'originalOpeningSocMWh',
    'originalStorageDischargeMW',
    'originalGridMW',
    'originalLossFraction',
    'originalEfficiency',
    'protectedReservations',
  ]);
  if (!Array.isArray(source.protectedReservations))
    fail('EXPLICIT_ALL_PROTECTED_RESERVATIONS_REQUIRED');
  for (const r of [
    source.scenarioRef,
    source.worldId,
    source.countryId,
    source.storageId,
    source.gridId,
    source.operatorId,
    source.sourceRef,
  ])
    ref(r);
  if (
    !/^COUNTRY_(0[1-9]|[1-6][0-9]|70)$/u.test(source.countryId) ||
    !/^sha256:[a-f0-9]{64}$/u.test(source.seedFingerprint)
  )
    fail('EXACT_WORLD_SEED_COUNTRY_REQUIRED');
  rawHash(source.sourceRawSha256);
  if (
    source.operatorId !== source.storageOwnerId ||
    source.operatorId !== source.gridOwnerId
  )
    fail('SAME_OP_TITLE_REQUIRED');
  if (source.originalEfficiency !== '0.9')
    fail('RETAINED_SOURCE_EFFICIENCY_REQUIRED');
  const opening = decimal(source.originalOpeningSocMWh),
    capacity = decimal(source.originalEnergyCapacityMWh),
    loss = decimal(source.originalLossFraction);
  if (!atMost(opening, capacity) || !atMost(loss, q(1n)) || same(loss, q(1n)))
    fail('FINITE_SOURCE_ENERGY_OR_ROUTE_REQUIRED');
  decimal(source.originalStorageDischargeMW);
  decimal(source.originalGridMW);
  const refs = new Set<string>();
  for (const r of source.protectedReservations) {
    exactKeys(r, [
      'reservationRef',
      'kind',
      'fromSimTime',
      'throughSimTime',
      'storedEnergyMWh',
      'outputMWh',
      'sourceRef',
      'sourceRawSha256',
    ]);
    ref(r.reservationRef);
    ref(r.sourceRef);
    rawHash(r.sourceRawSha256);
    window(r);
    if (
      !['EXISTING_RESERVATION', 'PUBLIC_PRIORITY'].includes(r.kind) ||
      refs.has(r.reservationRef)
    )
      fail('EXACT_UNIQUE_PROTECTION_REQUIRED');
    refs.add(r.reservationRef);
    if (!atMost(energy(r.outputMWh), energy(r.storedEnergyMWh)))
      fail('PROTECTED_OUTPUT_CANNOT_CREATE_ENERGY');
  }
  const s: State = {
    source,
    openingFingerprint: hash(
      { policy: DAY_ONE_STORAGE_SELF_USE_POLICY, source },
      sha256Hex,
    ),
    remainingSoc: opening,
    version: 0n,
    through: 0n,
    bookings: [],
    settled: [],
    operations: new Map(),
    sha: sha256Hex,
  };
  if (!atMost(protectedDraw(s), opening))
    fail('EXISTING_PROTECTION_EXCEEDS_SOC');
  checkPower(s, []);
  return issue(s);
}
function observe(s: State, at: string) {
  const t = ticks(at);
  if (t < s.through || t > day)
    fail('MONOTONIC_FIRST_DAY_OBSERVATION_REQUIRED');
  return t;
}
export function bookDayOneStorageSelfUse(input: {
  ledger: DayOneStorageSelfUseLedger;
  operationRef: string;
  observedSimTime: string;
  request: DayOneStorageRequest;
}) {
  const s = state(input.ledger),
    operationRef = ref(input.operationRef),
    request = freeze(
      JSON.parse(canonicalSerialize(input.request)) as DayOneStorageRequest,
    );
  exactKeys(request, [
    'bookingRef',
    'runRef',
    'worldId',
    'countryId',
    'operatorId',
    'storageId',
    'gridId',
    'purpose',
    'fromSimTime',
    'throughSimTime',
    'outputMWh',
  ]);
  const fingerprint = hash({ operation: 'BOOK', request }, s.sha),
    previous = s.operations.get(operationRef);
  if (previous) {
    if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_KEY_CONFLICT');
    return Object.freeze({
      ledger: input.ledger,
      outcome: 'EXACT_DUPLICATE' as const,
    });
  }
  const at = observe(s, input.observedSimTime),
    w = window(request);
  for (const r of [request.bookingRef, request.runRef]) ref(r);
  if (
    request.worldId !== s.source.worldId ||
    request.countryId !== s.source.countryId ||
    request.operatorId !== s.source.operatorId ||
    request.storageId !== s.source.storageId ||
    request.gridId !== s.source.gridId
  )
    fail('EXACT_SAME_OP_LOCAL_SOURCE_SCOPE_REQUIRED');
  if (
    !['INDUSTRY_SELF_USE', 'PROCESS_WATER_PUMPING_SELF_USE'].includes(
      request.purpose,
    ) ||
    w.from < at
  )
    fail('EXPLICIT_SELF_USE_FUTURE_BOOKING_REQUIRED');
  if (
    s.bookings.some(
      (b) =>
        b.request.bookingRef === request.bookingRef ||
        (b.request.runRef === request.runRef &&
          b.request.purpose === request.purpose),
    )
  )
    fail('RUN_PURPOSE_ALREADY_BOOKED');
  const output = energy(request.outputMWh),
    storedDraw = divide(output, efficiency);
  if (!output.n) fail('POSITIVE_SELF_USE_REQUIRED');
  if (
    !atMost(
      plus(plus(pendingDraw(s), protectedDraw(s)), storedDraw),
      s.remainingSoc,
    )
  )
    fail('SOC_PROTECTED_OR_ALREADY_BOOKED');
  const booking: Booking = {
    request,
    requestFingerprint: hash(request, s.sha),
    status: 'BOOKED_NOT_DELIVERED',
    output,
    storedDraw,
  };
  const bookings = [...s.bookings, booking];
  checkPower(s, bookings);
  const operations = new Map(s.operations);
  operations.set(operationRef, { fingerprint, receipt: null });
  const next = issue({
    ...s,
    bookings,
    operations,
    version: s.version + 1n,
    through: at,
  });
  issued.delete(input.ledger);
  return Object.freeze({
    ledger: next,
    outcome: 'BOOKED_NOT_DELIVERED' as const,
  });
}
export function settleDayOneStorageSelfUse(input: {
  ledger: DayOneStorageSelfUseLedger;
  operationRef: string;
  observedSimTime: string;
  bookingRef: string;
}) {
  const s = state(input.ledger),
    operationRef = ref(input.operationRef),
    bookingRef = ref(input.bookingRef);
  const fingerprint = hash({ operation: 'SETTLE', bookingRef }, s.sha),
    previous = s.operations.get(operationRef);
  if (previous) {
    if (previous.fingerprint !== fingerprint || !previous.receipt)
      fail('IDEMPOTENCY_KEY_CONFLICT');
    return Object.freeze({
      ledger: input.ledger,
      outcome: 'EXACT_DUPLICATE' as const,
      settlement: previous.receipt,
    });
  }
  const at = observe(s, input.observedSimTime),
    b = s.bookings.find((v) => v.request.bookingRef === bookingRef);
  if (!b || b.status !== 'BOOKED_NOT_DELIVERED')
    fail('EXACT_PENDING_BOOKING_REQUIRED');
  if (at < ticks(b.request.throughSimTime)) fail('ACTUAL_INTERVAL_NOT_ELAPSED');
  const loss = decimal(s.source.originalLossFraction),
    delivered = times(b.output, minus(q(1n), loss));
  const receipt = freeze({
    classification:
      'PROPOSED_PHYSICAL_SETTLEMENT_DATA_NOT_DELIVERY_AUTHORITY' as const,
    openingFingerprint: s.openingFingerprint,
    worldId: s.source.worldId,
    seedFingerprint: s.source.seedFingerprint,
    countryId: s.source.countryId,
    operatorId: s.source.operatorId,
    storageId: s.source.storageId,
    gridId: s.source.gridId,
    sourceRef: s.source.sourceRef,
    sourceRawSha256: s.source.sourceRawSha256,
    observedSimTime: at.toString(),
    bookingRef,
    runRef: b.request.runRef,
    purpose: b.request.purpose,
    fromSimTime: b.request.fromSimTime,
    throughSimTime: b.request.throughSimTime,
    storedEnergyWithdrawalMWh: render(b.storedDraw),
    outputMWh: render(b.output),
    deliveredMWh: render(delivered),
    storageConversionLossMWh: render(minus(b.storedDraw, b.output)),
    routeLossMWh: render(times(b.output, loss)),
  });
  const remainingSoc = minus(s.remainingSoc, b.storedDraw),
    bookings = s.bookings.map((v) =>
      v === b ? { ...v, status: 'SETTLED' as const } : v,
    ),
    operations = new Map(s.operations);
  operations.set(operationRef, { fingerprint, receipt });
  const next = issue({
    ...s,
    remainingSoc,
    bookings,
    operations,
    settled: [...s.settled, receipt],
    version: s.version + 1n,
    through: at,
  });
  issued.delete(input.ledger);
  return Object.freeze({
    ledger: next,
    outcome: 'SETTLED_PROPOSED_DATA' as const,
    settlement: receipt,
  });
}
export function readDayOneStorageSelfUseLedger(
  value: DayOneStorageSelfUseLedger,
) {
  const s = state(value),
    withdrawn = sum(
      s.bookings.filter((b) => b.status === 'SETTLED').map((b) => b.storedDraw),
    );
  if (
    !same(
      plus(s.remainingSoc, withdrawn),
      decimal(s.source.originalOpeningSocMWh),
    )
  )
    fail('STORED_ENERGY_CONSERVATION_REQUIRED');
  return freeze({
    classification: 'PURE_SCENARIO_PHYSICAL_LEDGER_DATA_NOT_AUTHORITY' as const,
    policy: DAY_ONE_STORAGE_SELF_USE_POLICY,
    openingFingerprint: s.openingFingerprint,
    source: s.source,
    version: s.version.toString(),
    observedThroughSimTime: s.through.toString(),
    remainingSocMWh: render(s.remainingSoc),
    pendingStoredEnergyMWh: render(pendingDraw(s)),
    protectedStoredEnergyMWh: render(protectedDraw(s)),
    settlements: s.settled,
    bookings: s.bookings.map((b) => ({
      request: b.request,
      requestFingerprint: b.requestFingerprint,
      status: b.status,
    })),
  });
}
