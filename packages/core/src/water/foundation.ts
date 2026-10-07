import { countryId } from '../ids.js';
import { SimTime, isSimTime } from '../numeric/sim-time.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import {
  kernelInvalid,
  ratio,
  type ExactQuantity,
  type ExactRatio,
} from '../engine-kernels/common.js';
import { SIMULATION_TICKS_PER_DAY } from '../time/simulation-clock.js';
import {
  gregorianWaterPeriod,
  monthlyWaterVolumeForInterval,
  type GregorianWaterCalendarBinding,
} from './calendar.js';
import {
  addWater,
  subtractWater,
  scaleWater,
  unscaleWater,
  ratioWater,
  minimumWater,
  compareWater,
  sumWater,
  volumeFromDecimal,
  waterFraction,
  waterScalarFromDecimal,
  zeroWater,
  type WaterVolume,
} from './exact-volume.js';

export const WATER_PRIORITY = Object.freeze([
  'DOMESTIC',
  'CRITICAL_PUBLIC',
  'FOOD_AGRICULTURE',
  'OTHER_INDUSTRY',
] as const);
export type WaterPurpose = (typeof WATER_PRIORITY)[number];
// Domestic and necessary medical/safety services have the same adopted tier.
const tier = (purpose: WaterPurpose) =>
  purpose === 'DOMESTIC' || purpose === 'CRITICAL_PUBLIC'
    ? 0
    : purpose === 'FOOD_AGRICULTURE'
      ? 1
      : 2;
function ref(value: string, label: string) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)
  )
    kernelInvalid(`${label} must be a stable reference`);
  return value;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function rate(q: ExactQuantity) {
  if (!q || q.unit !== 'm3/sim-day')
    kernelInvalid('Water rate must use m3/sim-day');
  return volumeFromDecimal(q.amount);
}
export interface WaterRight {
  readonly schema: 'WATER_RIGHT_V1';
  readonly rightRef: string;
  readonly countryRef: string;
  readonly regionRef: string;
  readonly basinRef: string;
  readonly holderRef: string;
  readonly purpose: WaterPurpose;
  readonly quotaPerDay: ExactQuantity;
  readonly sourceRef: string;
  readonly validity: Readonly<{ fromTicks: string; untilTicks: string }> | null;
  readonly transferability: 'UNRESOLVED';
}
/** Adopts only a quota basis. Null validity is explicit and never executable.
 * An authorized host must provide actual grant validity; this pure constructor
 * validates it, not the user's identity or power to grant. */
export function createWaterRight(
  input: Omit<WaterRight, 'schema' | 'transferability'>,
): WaterRight {
  ref(input.rightRef, 'rightRef');
  countryId(input.countryRef);
  for (const [name, value] of [
    ['regionRef', input.regionRef],
    ['basinRef', input.basinRef],
    ['holderRef', input.holderRef],
    ['sourceRef', input.sourceRef],
  ])
    ref(value!, name!);
  if (!WATER_PRIORITY.includes(input.purpose))
    kernelInvalid('Unknown adopted water purpose');
  rate(input.quotaPerDay);
  if (input.validity !== null) {
    const from = SimTime.fromTicks(input.validity.fromTicks),
      until = SimTime.fromTicks(input.validity.untilTicks);
    if (until.ticks <= from.ticks)
      kernelInvalid('Water right validity must be positive');
  }
  return freeze({
    ...input,
    schema: 'WATER_RIGHT_V1' as const,
    transferability: 'UNRESOLVED' as const,
  });
}
export interface WaterDemand {
  readonly demandRef: string;
  readonly rightRef: string;
  readonly countryRef: string;
  readonly regionRef: string;
  readonly holderRef: string;
  readonly purpose: WaterPurpose;
  readonly approvedDemandPerDay: ExactQuantity;
  readonly networkLimitPerDay: ExactQuantity;
  readonly sourceRef: string;
}
export interface WaterOperation {
  readonly operationRef: string;
  readonly sourceRef: string;
  readonly predecessorRef: string;
  readonly until: SimTime;
  readonly capacities: Readonly<{
    facilityRef: string;
    operatingEvidenceRef: string;
    abstractionPerDay: ExactQuantity;
    treatmentPerDay: ExactQuantity;
    networkPerDay: ExactQuantity;
    deliveryEfficiency: ExactRatio;
  }>;
  readonly demands: readonly WaterDemand[];
}
export interface WaterAllocationRecord {
  readonly operationRef: string;
  readonly requestCanonical: string;
  readonly sourceRef: string;
  readonly predecessorRef: string;
  readonly successorRef: string;
  readonly fromTicks: string;
  readonly untilTicks: string;
  readonly grossRunoff: WaterVolume;
  readonly ecologicalReserve: WaterVolume;
  readonly rawWithdrawn: WaterVolume;
  readonly delivered: WaterVolume;
  readonly deliveryLoss: WaterVolume;
  readonly unusedRaw: WaterVolume;
  readonly deliveries: readonly Readonly<{
    demandRef: string;
    rightRef: string;
    requested: WaterVolume;
    legalAndNetworkLimit: WaterVolume;
    delivered: WaterVolume;
    unmet: WaterVolume;
  }>[];
}
export function createWaterOperation(input: WaterOperation): WaterOperation {
  ref(input.operationRef, 'operationRef');
  ref(input.sourceRef, 'sourceRef');
  ref(input.predecessorRef, 'predecessorRef');
  if (!isSimTime(input.until))
    kernelInvalid('Water operation requires canonical simulation time');
  const c = input.capacities;
  ref(c.facilityRef, 'facilityRef');
  ref(c.operatingEvidenceRef, 'operatingEvidenceRef');
  rate(c.abstractionPerDay);
  rate(c.treatmentPerDay);
  rate(c.networkPerDay);
  ratio(c.deliveryEfficiency, 'deliveryEfficiency');
  if (
    new Set(input.demands.map((d) => d.demandRef)).size !==
      input.demands.length ||
    new Set(input.demands.map((d) => d.rightRef)).size !== input.demands.length
  )
    kernelInvalid('Duplicate demand or repeated water right consumption');
  for (const d of input.demands) {
    ref(d.demandRef, 'demandRef');
    ref(d.rightRef, 'rightRef');
    ref(d.regionRef, 'regionRef');
    ref(d.holderRef, 'holderRef');
    ref(d.sourceRef, 'demand source');
    countryId(d.countryRef);
    if (!WATER_PRIORITY.includes(d.purpose))
      kernelInvalid('Unknown adopted water purpose');
    rate(d.approvedDemandPerDay);
    rate(d.networkLimitPerDay);
  }
  return freeze({
    ...input,
    capacities: { ...c },
    demands: [...input.demands].sort((a, b) =>
      a.demandRef < b.demandRef ? -1 : a.demandRef > b.demandRef ? 1 : 0,
    ),
  });
}
export interface WaterAllocationState {
  readonly schema: 'WATER_ALLOCATION_V1';
  readonly lineageRef: string;
  readonly basinRef: string;
  readonly calendar: GregorianWaterCalendarBinding;
  readonly openingTicks: string;
  readonly cursorTicks: string;
  readonly monthEndTicks: string;
  readonly monthlyRunoffM3: string;
  readonly ecologicalReserveShare: ExactRatio;
  readonly rights: readonly WaterRight[];
  /** Cumulative flows since this explicit opening, not lake/reservoir stocks. */
  readonly totals: Readonly<{
    grossRunoff: WaterVolume;
    ecologicalReserve: WaterVolume;
    rawWithdrawn: WaterVolume;
    delivered: WaterVolume;
    deliveryLoss: WaterVolume;
    unusedRaw: WaterVolume;
  }>;
  readonly records: readonly WaterAllocationRecord[];
}
const states = new WeakSet<object>();
export function createWaterAllocationState(input: {
  readonly originRef: string;
  readonly basinRef: string;
  readonly calendar: GregorianWaterCalendarBinding;
  readonly openingTimestamp: SimTime;
  readonly monthlyRunoffM3: string;
  readonly ecologicalReserveShare: ExactRatio;
  readonly rights: readonly WaterRight[];
}): WaterAllocationState {
  ref(input.originRef, 'originRef');
  ref(input.basinRef, 'basinRef');
  const period = gregorianWaterPeriod(input.calendar, input.openingTimestamp);
  volumeFromDecimal(input.monthlyRunoffM3);
  ratio(input.ecologicalReserveShare, 'ecologicalReserveShare');
  const rights = input.rights.map((r) => {
    if (r.schema !== 'WATER_RIGHT_V1' || r.transferability !== 'UNRESOLVED')
      kernelInvalid('Unsupported water right');
    return createWaterRight(r);
  });
  if (
    new Set(rights.map((r) => r.rightRef)).size !== rights.length ||
    new Set(rights.map((r) => `${r.basinRef}/${r.regionRef}/${r.purpose}`))
      .size !== rights.length
  )
    kernelInvalid('Duplicate water right ID or overlapping source scope');
  if (rights.some((r) => r.basinRef !== input.basinRef))
    kernelInvalid('Water rights belong to a different basin');
  const state: WaterAllocationState = freeze({
    schema: 'WATER_ALLOCATION_V1',
    lineageRef: input.originRef,
    basinRef: input.basinRef,
    calendar: input.calendar,
    openingTicks: input.openingTimestamp.toCanonicalValue(),
    cursorTicks: input.openingTimestamp.toCanonicalValue(),
    monthEndTicks: period.simulationEndTicks,
    monthlyRunoffM3: input.monthlyRunoffM3,
    ecologicalReserveShare: input.ecologicalReserveShare,
    rights,
    totals: {
      grossRunoff: zeroWater(),
      ecologicalReserve: zeroWater(),
      rawWithdrawn: zeroWater(),
      delivered: zeroWater(),
      deliveryLoss: zeroWater(),
      unusedRaw: zeroWater(),
    },
    records: [],
  });
  states.add(state);
  return state;
}
/** Demand-weighted, capped proportional allocation. Saturated legal/network
 * caps are removed then residual supply is redistributed, never wasted just
 * because one participant cannot use its initial proportion. */
function cappedProportions(
  rows: readonly { id: string; weight: WaterVolume; cap: WaterVolume }[],
  available: WaterVolume,
) {
  const result = new Map<string, WaterVolume>(
    rows.map((r) => [r.id, zeroWater()]),
  );
  let remaining = minimumWater(available, sumWater(rows.map((r) => r.cap)));
  let active = rows.filter(
    (r) => r.weight.numerator !== '0' && r.cap.numerator !== '0',
  );
  while (active.length && remaining.numerator !== '0') {
    const weights = sumWater(active.map((r) => r.weight));
    const proposals = active.map((r) => ({
      ...r,
      share: scaleWater(remaining, ratioWater(r.weight, weights)),
    }));
    const saturated = proposals.filter(
      (r) => compareWater(r.share, r.cap) >= 0,
    );
    if (!saturated.length) {
      for (const r of proposals) result.set(r.id, r.share);
      break;
    }
    for (const r of saturated) {
      result.set(r.id, r.cap);
      remaining = subtractWater(remaining, r.cap);
    }
    const ids = new Set(saturated.map((r) => r.id));
    active = active.filter((r) => !ids.has(r.id));
  }
  return result;
}
export function allocateWaterPeriod(
  state: WaterAllocationState,
  input: WaterOperation,
): Readonly<{
  state: WaterAllocationState;
  record: WaterAllocationRecord;
  replayed: boolean;
}> {
  if (!states.has(state))
    kernelInvalid(
      'Water state must come from the actual constructor/transition',
    );
  const operation = createWaterOperation(input);
  ref(operation.operationRef, 'operationRef');
  ref(operation.sourceRef, 'sourceRef');
  if (!isSimTime(operation.until))
    kernelInvalid('Water operation requires canonical simulation time');
  const requestCanonical = canonicalSerialize({
    ...operation,
    until: operation.until.toCanonicalValue(),
  });
  const existing = state.records.find(
    (r) => r.operationRef === operation.operationRef,
  );
  if (existing) {
    if (existing.requestCanonical !== requestCanonical)
      kernelInvalid('Water idempotency reference reused with changed request');
    return freeze({ state, record: existing, replayed: true });
  }
  if (operation.predecessorRef !== state.lineageRef)
    kernelInvalid('Water predecessor does not match');
  const from = SimTime.fromTicks(state.cursorTicks);
  if (
    operation.until.ticks <= from.ticks ||
    operation.until.ticks > BigInt(state.monthEndTicks)
  )
    kernelInvalid(
      'Water interval overlaps, reverses or crosses its Gregorian month',
    );
  const interval = waterFraction(
    (operation.until.ticks - from.ticks).toString(),
    SIMULATION_TICKS_PER_DAY,
  );
  const asVolume = (q: ExactQuantity) => scaleWater(rate(q), interval);
  const c = operation.capacities;
  ref(c.facilityRef, 'facilityRef');
  ref(c.operatingEvidenceRef, 'operatingEvidenceRef');
  ratio(c.deliveryEfficiency, 'deliveryEfficiency');
  const efficiency = waterScalarFromDecimal(c.deliveryEfficiency.amount);
  const grossRunoff = monthlyWaterVolumeForInterval({
    binding: state.calendar,
    simulationStart: from,
    simulationEnd: operation.until,
    monthlyVolumeM3: state.monthlyRunoffM3,
  });
  const ecologicalReserve = scaleWater(
    grossRunoff,
    waterScalarFromDecimal(state.ecologicalReserveShare.amount),
  );
  const netRaw = subtractWater(grossRunoff, ecologicalReserve);
  const rawCapacity = minimumWater(
    netRaw,
    asVolume(c.abstractionPerDay),
    asVolume(c.treatmentPerDay),
  );
  let supply = minimumWater(
    scaleWater(rawCapacity, efficiency),
    asVolume(c.networkPerDay),
  );
  if (
    new Set(operation.demands.map((d) => d.demandRef)).size !==
      operation.demands.length ||
    new Set(operation.demands.map((d) => d.rightRef)).size !==
      operation.demands.length
  )
    kernelInvalid('Duplicate demand or repeated water right consumption');
  const rows = operation.demands
    .map((d) => {
      ref(d.demandRef, 'demandRef');
      ref(d.sourceRef, 'demand source');
      const right = state.rights.find((r) => r.rightRef === d.rightRef);
      if (
        !right ||
        d.countryRef !== right.countryRef ||
        d.regionRef !== right.regionRef ||
        d.holderRef !== right.holderRef ||
        d.purpose !== right.purpose
      )
        kernelInvalid('Water demand does not match scoped right/holder');
      if (
        !right.validity ||
        from.ticks < BigInt(right.validity.fromTicks) ||
        operation.until.ticks > BigInt(right.validity.untilTicks)
      )
        kernelInvalid(
          'Water right grant validity missing, expired or out of scope',
        );
      const requested = asVolume(d.approvedDemandPerDay);
      return {
        id: d.demandRef,
        right,
        requested,
        cap: minimumWater(
          requested,
          asVolume(right.quotaPerDay),
          asVolume(d.networkLimitPerDay),
        ),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const allocations = new Map<string, WaterVolume>();
  for (const t of [0, 1, 2]) {
    const group = rows.filter((r) => tier(r.right.purpose) === t);
    const shares = cappedProportions(
      group.map((r) => ({ id: r.id, weight: r.requested, cap: r.cap })),
      supply,
    );
    for (const [id, value] of shares) allocations.set(id, value);
    supply = subtractWater(supply, sumWater([...shares.values()]));
  }
  const deliveries = rows.map((r) => {
    const delivered = allocations.get(r.id)!;
    return {
      demandRef: r.id,
      rightRef: r.right.rightRef,
      requested: r.requested,
      legalAndNetworkLimit: r.cap,
      delivered,
      unmet: subtractWater(r.requested, delivered),
    };
  });
  const delivered = sumWater(deliveries.map((d) => d.delivered));
  const rawWithdrawn =
    efficiency.numerator === '0'
      ? zeroWater()
      : unscaleWater(delivered, efficiency);
  const deliveryLoss = subtractWater(rawWithdrawn, delivered);
  const unusedRaw = subtractWater(netRaw, rawWithdrawn);
  if (
    compareWater(
      grossRunoff,
      sumWater([ecologicalReserve, delivered, deliveryLoss, unusedRaw]),
    ) !== 0
  )
    kernelInvalid('Water flow conservation failed');
  const successorRef = `${state.basinRef}:${operation.operationRef}`;
  ref(successorRef, 'successorRef');
  const record: WaterAllocationRecord = freeze({
    operationRef: operation.operationRef,
    requestCanonical,
    sourceRef: operation.sourceRef,
    predecessorRef: state.lineageRef,
    successorRef,
    fromTicks: from.toCanonicalValue(),
    untilTicks: operation.until.toCanonicalValue(),
    grossRunoff,
    ecologicalReserve,
    rawWithdrawn,
    delivered,
    deliveryLoss,
    unusedRaw,
    deliveries,
  });
  const totals = {
    grossRunoff: addWater(state.totals.grossRunoff, grossRunoff),
    ecologicalReserve: addWater(
      state.totals.ecologicalReserve,
      ecologicalReserve,
    ),
    rawWithdrawn: addWater(state.totals.rawWithdrawn, rawWithdrawn),
    delivered: addWater(state.totals.delivered, delivered),
    deliveryLoss: addWater(state.totals.deliveryLoss, deliveryLoss),
    unusedRaw: addWater(state.totals.unusedRaw, unusedRaw),
  };
  const next = freeze({
    ...state,
    lineageRef: successorRef,
    cursorTicks: operation.until.toCanonicalValue(),
    totals,
    records: [...state.records, record],
  });
  states.add(next);
  return freeze({ state: next, record, replayed: false });
}
