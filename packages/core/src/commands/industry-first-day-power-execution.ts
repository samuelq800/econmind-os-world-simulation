/** Fixed adopted storage execution. Drafts and BOOK are never delivery. Only
 * replay of the full committed group followed by genuine complete-prefix
 * membership can issue the private delivery witness. SQL/actor/Clock/lease
 * authority remains the owning runtime's responsibility. */
import {
  canonicalHashInput,
  canonicalSerialize,
} from '../serialization/canonical.js';
import {
  canonicalSha256,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  createAuthoritativeTransition,
  bindAuthoritativeTransition,
  createFinalCommandReceipt,
  type AuthoritativeTransition,
} from './receipt.js';
import {
  parseAuthoritativeEvent,
  EVENT_SCHEMA_VERSION,
} from '../events/event.js';
import { eventId } from '../ids.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import {
  createFinancialPostingBatch,
  type FinancialLedgerState,
  type FinancialPostingBatch,
} from '../finance/financial-ledger.js';
import { isSettledOriginalProductionDeposit } from '../finance/production-deposit-funding.js';
import {
  readIndustryCompletedWork,
  readIndustryFirstDayWorkState,
  type IndustryFirstDayWorkState,
} from '../industry/industry-first-day-work.js';
import type { IndustryOperatingWageState } from './industry-operating-wage-payment.js';
import type { FinanceNativeBudgetCanonicalFrame } from './finance-budget-native.js';
import {
  readFinanceSocialReplayContinuationView,
  type FinanceSocialReplayContinuationView,
} from './finance-social-replay-continuation.js';
import {
  INDUSTRY_UTILITY_COMMANDS,
  INDUSTRY_UTILITY_EVENTS,
  INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT,
  parseIndustryUtilityIntent,
  readIndustryUtilityExecution,
  industryUtilityOperatingReceiptFromRun,
  type IndustryUtilitySource,
  type IndustryUtilityExecutionPreparation,
} from './industry-utility-execution.js';
import {
  DAY_ONE_STORAGE_SELF_USE_POLICY,
  createDayOneStorageSelfUseLedger,
  forkDayOneStorageSelfUseLedger,
  bookDayOneStorageSelfUse,
  settleDayOneStorageSelfUse,
  readDayOneStorageSelfUseLedger,
  type DayOneStorageOpening,
  type DayOneStorageRequest,
  type DayOneStorageSelfUseLedger,
  type DayOneStorageSettlementData,
} from '../engine-kernels/postwar-day-one-storage-self-use.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
const hash = (v: unknown, sha: Sha256Hex) =>
  canonicalSha256(canonicalHashInput(v), sha);
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_POWER_EXECUTION:' + s,
  );
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('EXACT_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function exact(v: object, keys: readonly string[]) {
  if (Object.keys(v).sort().join('|') !== [...keys].sort().join('|'))
    invalid('EXACT_FIXED_OPERATION_REQUIRED');
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) invalid('EXACT_TEXT_REQUIRED');
  return v;
}
const immutable = <T>(v: T): Readonly<T> => {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(immutable);
    Object.freeze(v);
  }
  return v;
};
export interface IndustryFirstDayPowerOriginal {
  readonly source: IndustryUtilitySource;
  readonly opening: DayOneStorageOpening;
  readonly serviceFacilityId: string;
  readonly serviceRunId: string;
  readonly serviceWorkSourceRef: string;
  readonly serviceWorkSourceRawSha256: string;
  /** Selected actual past WAGE frames, DATA until matched to the current genuine
   * financial ledger's applied batch and genuine completed service WORK. */
  readonly paymentFrames: readonly FinanceNativeBudgetCanonicalFrame[];
}
type Original = Omit<IndustryFirstDayPowerOriginal, 'paymentFrames'>;
type ProductionRun = ReturnType<
  typeof readIndustryFirstDayWorkState
>['runs'][number];
interface Booking {
  readonly originalKey: string;
  readonly physicalKey: string;
  readonly request: DayOneStorageRequest;
  readonly productionRun: ProductionRun;
}
export interface IndustryFirstDayPowerReplayDelivery {
  readonly classification: 'CORE_REPLAYED_COMMITTED_POWER_DATA_NOT_DB_AUTHORITY';
  readonly source: IndustryUtilitySource;
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly countryId: string;
  readonly operatorId: string;
  readonly facilityId: string;
  readonly runId: string;
  readonly purpose: DayOneStorageRequest['purpose'];
  readonly fromSimTime: string;
  readonly throughSimTime: string;
  readonly deliveredMWh: DayOneStorageSettlementData['deliveredMWh'];
  readonly settlement: DayOneStorageSettlementData;
  readonly frame: FinanceNativeBudgetCanonicalFrame;
  readonly operatingFactCanonicalPayload: string;
  readonly validFromTicks: string;
  readonly validUntilTicks: string;
  readonly actualPaidInput: Readonly<{
    workEventFingerprint: string;
    paymentEventFingerprint: string;
    batchFingerprint: string;
    amount: string;
    currency: string;
  }>;
}
declare const powerState: unique symbol;
export interface IndustryFirstDayPowerState {
  readonly [powerState]: true;
}
interface State {
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly originals: ReadonlyMap<string, Original>;
  readonly physical: ReadonlyMap<string, DayOneStorageSelfUseLedger>;
  readonly payments: ReadonlyMap<
    string,
    Readonly<{ frame: FinanceNativeBudgetCanonicalFrame; text: string }>
  >;
  readonly bookings: ReadonlyMap<string, Booking>;
  readonly entries: ReadonlyMap<string, IndustryFirstDayPowerReplayDelivery>;
  readonly usedPaidInputs: ReadonlySet<string>;
  readonly commands: ReadonlyMap<string, string>;
}
const states = new WeakMap<object, State>();
function lookup(v: IndustryFirstDayPowerState) {
  const s = states.get(v);
  if (!s) invalid('GENUINE_POWER_REPLAY_STATE_REQUIRED');
  return s;
}
function issue(s: State) {
  const v = Object.freeze({}) as IndustryFirstDayPowerState;
  states.set(v, s);
  return v;
}
const originalKey = (
  s: Pick<
    IndustryUtilitySource,
    'countryId' | 'facilityId' | 'runId' | 'sourceRef'
  >,
) => canonicalSerialize([s.countryId, s.facilityId, s.runId, s.sourceRef]);
const physicalKey = (s: DayOneStorageOpening) =>
  canonicalSerialize([s.worldId, s.countryId, s.storageId, s.gridId]);
function extend(
  s: State,
  inputs: readonly IndustryFirstDayPowerOriginal[],
  sha: Sha256Hex,
): State {
  const originals = new Map(s.originals),
    physical = new Map(s.physical),
    payments = new Map(s.payments);
  for (const row of inputs) {
    exact(row, [
      'source',
      'opening',
      'serviceFacilityId',
      'serviceRunId',
      'serviceWorkSourceRef',
      'serviceWorkSourceRawSha256',
      'paymentFrames',
    ]);
    const { paymentFrames, ...base } = row,
      original = immutable(JSON.parse(canonicalSerialize(base)) as Original),
      o = original.opening,
      u = original.source;
    exact(u, [
      'worldId',
      'countryId',
      'locationId',
      'facilityId',
      'operatorId',
      'runId',
      'seedId',
      'seedFingerprint',
      'admissionRef',
      'sourceRef',
      'sourceRawSha256',
      'policyVersion',
      'policyRawSha256',
      'userAdoptionRawSha256',
      'originals',
    ]);
    if (
      !Array.isArray(u.originals) ||
      !u.originals.length ||
      u.originals.length > 64
    )
      invalid('BOUNDED_EXACT_SOURCE_ORIGINALS_REQUIRED');
    const sourceReferences = new Set<string>();
    for (const r of u.originals) {
      exact(r, ['kind', 'reference', 'rawSha256']);
      const key = r.kind + '\n' + r.reference;
      if (
        !r.kind ||
        !r.reference ||
        !/^[a-f0-9]{64}$/u.test(r.rawSha256) ||
        sourceReferences.has(key)
      )
        invalid('EXACT_UNIQUE_SOURCE_ORIGINAL_REQUIRED');
      sourceReferences.add(key);
    }
    if (
      u.worldId !== s.worldId ||
      u.seedFingerprint !== s.seedFingerprint ||
      u.admissionRef !== s.admissionRef ||
      o.worldId !== u.worldId ||
      o.seedFingerprint !== u.seedFingerprint ||
      o.countryId !== u.countryId ||
      o.operatorId !== u.operatorId ||
      u.policyVersion !== DAY_ONE_STORAGE_SELF_USE_POLICY.policyVersion ||
      u.policyRawSha256 !== DAY_ONE_STORAGE_SELF_USE_POLICY.policyRawSha256 ||
      u.userAdoptionRawSha256 !==
        DAY_ONE_STORAGE_SELF_USE_POLICY.adoptionRawSha256 ||
      ![o.storageId, o.gridId].includes(original.serviceFacilityId) ||
      !original.serviceRunId ||
      !original.serviceWorkSourceRef ||
      !/^[a-f0-9]{64}$/u.test(original.serviceWorkSourceRawSha256)
    )
      invalid('EXACT_ADOPTED_POWER_ORIGINALS_REQUIRED');
    if (
      !u.originals.some(
        (x) =>
          x.kind === 'STORAGE_PHYSICAL_ORIGINAL' &&
          x.reference === o.sourceRef &&
          x.rawSha256 === o.sourceRawSha256,
      ) ||
      !u.originals.some(
        (x) =>
          x.kind === 'POWER_SERVICE_WORK_SITE' &&
          x.reference === original.serviceWorkSourceRef &&
          x.rawSha256 === original.serviceWorkSourceRawSha256,
      )
    )
      invalid('STORAGE_AND_SERVICE_WORK_ORIGINALS_REQUIRED');
    const key = originalKey(u),
      old = originals.get(key),
      pk = physicalKey(o),
      existing = physical.get(pk);
    if (old && !same(old, original))
      invalid('REGISTERED_POWER_ORIGINAL_CHANGED');
    if (existing && !same(readDayOneStorageSelfUseLedger(existing).source, o))
      invalid('SHARED_PHYSICAL_OPENING_OR_PROTECTION_CHANGED');
    if (!existing) physical.set(pk, createDayOneStorageSelfUseLedger(o, sha));
    originals.set(key, original);
    if (!Array.isArray(paymentFrames))
      invalid('EXPLICIT_SELECTED_PAYMENT_FRAMES_REQUIRED');
    for (const frame of paymentFrames) {
      const e = frame.events[0];
      if (!e || frame.command.worldId !== s.worldId)
        invalid('EXACT_SELECTED_PAYMENT_FRAME_REQUIRED');
      const encoded = canonicalSerialize(frame),
        prior = payments.get(e.fingerprint);
      if (prior && prior.text !== encoded)
        invalid('SELECTED_PAYMENT_FRAME_CHANGED');
      payments.set(e.fingerprint, { frame, text: encoded });
    }
  }
  return { ...s, originals, physical, payments };
}
export function createIndustryFirstDayPowerState(
  inputs: readonly IndustryFirstDayPowerOriginal[],
  sha: Sha256Hex,
): IndustryFirstDayPowerState {
  if (!inputs.length) invalid('POWER_ORIGINALS_REQUIRED');
  const first = inputs[0]!.source;
  return issue(
    extend(
      {
        worldId: first.worldId,
        seedFingerprint: first.seedFingerprint,
        admissionRef: first.admissionRef,
        originals: new Map(),
        physical: new Map(),
        payments: new Map(),
        bookings: new Map(),
        entries: new Map(),
        usedPaidInputs: new Set(),
        commands: new Map(),
      },
      inputs,
      sha,
    ),
  );
}
export function extendIndustryFirstDayPowerOriginals(
  state: IndustryFirstDayPowerState,
  inputs: readonly IndustryFirstDayPowerOriginal[],
  sha: Sha256Hex,
): IndustryFirstDayPowerState {
  return issue(extend(lookup(state), inputs, sha));
}
export function readIndustryFirstDayPowerState(
  state: IndustryFirstDayPowerState,
  sha: Sha256Hex,
) {
  const s = lookup(state),
    originals = [...s.originals.values()];
  return immutable({
    classification: 'POWER_REPLAY_STATE_DATA_NOT_AUTHORITY' as const,
    worldId: s.worldId,
    seedFingerprint: s.seedFingerprint,
    admissionRef: s.admissionRef,
    originals,
    originalsFingerprint: hash(originals, sha),
    physicalLedgerSnapshots: [...s.physical.values()].map(
      readDayOneStorageSelfUseLedger,
    ),
    committedDeliveryEventFingerprints: [...s.entries.keys()],
  });
}
export interface IndustryFirstDayPowerReplayContext {
  readonly financial: FinancialLedgerState;
  readonly industryWorkState: IndustryFirstDayWorkState;
  readonly industryWageState: IndustryOperatingWageState;
}
function servicePayment(
  s: State,
  o: Original,
  booking: Booking,
  operation: Record<string, unknown>,
  ctx: IndustryFirstDayPowerReplayContext,
  now: bigint,
  sha: Sha256Hex,
) {
  const workFingerprint = text(operation.workEventFingerprint),
    paymentFingerprint = text(operation.paymentEventFingerprint),
    known = readIndustryFirstDayWorkState(ctx.industryWorkState);
  const works = known.completedWorks.filter(
    (w) =>
      readIndustryCompletedWork(w).frame.events[0]?.fingerprint ===
      workFingerprint,
  );
  if (
    works.length !== 1 ||
    !ctx.industryWageState.paidWork.includes(workFingerprint)
  )
    invalid('ACTUAL_DISTINCT_PAID_POWER_SERVICE_WORK_REQUIRED');
  const w = readIndustryCompletedWork(works[0]!),
    d = w.data,
    runs = known.runs.filter(
      (r) =>
        r.terms.facilityId === o.serviceFacilityId &&
        r.terms.runId === o.serviceRunId &&
        r.source.countryId === o.source.countryId,
    );
  if (
    runs.length !== 1 ||
    d.worldId !== s.worldId ||
    d.seedFingerprint !== s.seedFingerprint ||
    d.admissionRef !== s.admissionRef ||
    d.operatorId !== o.source.operatorId ||
    d.countryId !== o.source.countryId ||
    d.facilityId !== o.serviceFacilityId ||
    d.runId !== o.serviceRunId ||
    runs[0]!.source.sourceRef !== o.serviceWorkSourceRef ||
    runs[0]!.source.sourceRawSha256 !== o.serviceWorkSourceRawSha256 ||
    BigInt(d.completedAtSimTime) > now
  )
    invalid('EXACT_STORAGE_GRID_SERVICE_WORK_NOT_MANUFACTURING_REQUIRED');
  const from = BigInt(booking.request.fromSimTime),
    through = BigInt(booking.request.throughSimTime),
    points = [
      ...new Set([
        from,
        through,
        ...d.allocations
          .flatMap((a) => [BigInt(a.startsAtSimTime), BigInt(a.endsAtSimTime)])
          .filter((t) => t > from && t < through),
      ]),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const t of points)
    if (
      t < through &&
      !d.allocations.some(
        (a) =>
          BigInt(a.count) > 0n &&
          BigInt(a.startsAtSimTime) <= t &&
          BigInt(a.endsAtSimTime) > t,
      )
    )
      invalid('ACTUAL_SERVICE_WORK_MUST_COVER_DISCHARGE_INTERVAL');
  const selected = s.payments.get(paymentFingerprint);
  if (!selected || canonicalSerialize(selected.frame) !== selected.text)
    invalid('ACTUAL_SELECTED_PAYMENT_FRAME_REQUIRED');
  const p = selected.frame,
    e = p.events[0];
  if (
    !e ||
    p.events.length !== 1 ||
    e.eventType !== 'INDUSTRY_OPERATING_WAGE_PAID_V1' ||
    p.command.commandType !== 'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1' ||
    p.financialPostingBatches.length !== 1 ||
    p.inventoryPostings.length !== 0 ||
    p.command.simTime.ticks > now ||
    BigInt(p.transition.worldVersionAfter) > BigInt(ctx.financial.worldVersion)
  )
    invalid('ACTUAL_PRIOR_WAGE_PAYMENT_REQUIRED');
  bindAuthoritativeTransition(
    { command: p.command, transition: p.transition },
    sha,
  );
  const final = createFinalCommandReceipt({
    command: p.command,
    transition: p.transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: p.command.simTime,
    recordedAtReal: p.receipt.recordedAtReal,
  });
  if (!same(final, p.receipt) || !same(p.events, p.transition.events))
    invalid('EXACT_COMMITTED_PAYMENT_RECEIPT_REQUIRED');
  const body = record(JSON.parse(e.canonicalPayload)),
    src = record(body.source);
  if (
    body.workEventFingerprint !== workFingerprint ||
    body.workEventId !== w.frame.events[0]!.eventId ||
    src.facilityId !== d.facilityId ||
    src.runId !== d.runId ||
    src.operatorId !== d.operatorId ||
    src.countryId !== d.countryId ||
    src.seedFingerprint !== s.seedFingerprint ||
    src.admissionRef !== s.admissionRef
  )
    invalid('EXACT_PAID_SERVICE_WORK_ORIGIN_REQUIRED');
  const batch = p.financialPostingBatches[0] as FinancialPostingBatch,
    rebuilt = createFinancialPostingBatch(
      {
        ...batch,
        command: p.command,
        transition: p.transition,
        legs: batch.legs,
      },
      sha,
    );
  if (
    !same(rebuilt, batch) ||
    ctx.financial.appliedBatches.filter(
      (b) => b.batchId === batch.batchId && b.fingerprint === batch.fingerprint,
    ).length !== 1
  )
    invalid('PAYMENT_MUST_ALREADY_BE_IN_GENUINE_FINANCIAL_PREFIX');
  const expense = batch.legs.filter(
      (l) =>
        l.account.ownerId === o.source.operatorId &&
        l.account.accountClass === 'EXPENSE' &&
        l.direction === 'DEBIT',
    ),
    payment = batch.legs.filter(
      (l) =>
        l.account.ownerId === o.source.operatorId &&
        l.account.accountClass === 'ASSET' &&
        l.direction === 'CREDIT',
    );
  if (
    expense.length !== 1 ||
    payment.length !== 1 ||
    !expense[0]!.amount.amount.isPositive() ||
    !expense[0]!.amount.amount.equals(payment[0]!.amount.amount) ||
    body.paidAmount !== expense[0]!.amount.toCanonicalValue().amount ||
    !isSettledOriginalProductionDeposit({
      financial: ctx.financial,
      batch,
      payment: payment[0]!,
      expense: expense[0]!,
    })
  )
    invalid('EXACT_ACTUAL_PAID_EXPENSE_DEPOSIT_MIRRORS_REQUIRED');
  if (
    s.usedPaidInputs.has(workFingerprint) ||
    s.usedPaidInputs.has(paymentFingerprint)
  )
    invalid('POWER_SERVICE_PAID_INPUT_ALREADY_ASSIGNED');
  return immutable({
    workEventFingerprint: workFingerprint,
    paymentEventFingerprint: paymentFingerprint,
    batchFingerprint: batch.fingerprint,
    amount: expense[0]!.amount.toCanonicalValue().amount,
    currency: batch.settlementCurrency,
  });
}
interface Calculation {
  readonly next: State;
  readonly payload: unknown;
  readonly receipt: ReturnType<
    typeof industryUtilityOperatingReceiptFromRun
  > | null;
  readonly delivered: Omit<IndustryFirstDayPowerReplayDelivery, 'frame'> | null;
}
function calculate(
  state: IndustryFirstDayPowerState,
  command: CanonicalCommand,
  ctx: IndustryFirstDayPowerReplayContext,
  sha: Sha256Hex,
): Calculation {
  const s = lookup(state),
    intent = parseIndustryUtilityIntent(command, sha),
    operation = record(intent.operation),
    o = s.originals.get(
      originalKey({ ...intent, countryId: command.countryId }),
    );
  if (
    intent.serviceKind !== 'POWER' ||
    command.commandType !== INDUSTRY_UTILITY_COMMANDS.POWER ||
    !o ||
    o.source.sourceRef !== intent.sourceRef ||
    o.source.sourceRawSha256 !== intent.sourceRawSha256 ||
    command.worldId !== s.worldId ||
    !isAuthoritativeFinancialLedgerState(ctx.financial) ||
    ctx.financial.worldId !== s.worldId ||
    ctx.financial.worldVersion !== command.expectedWorldVersion
  )
    invalid('EXACT_POWER_SOURCE_GENUINE_FINANCIAL_AND_HEAD_REQUIRED');
  const runs = readIndustryFirstDayWorkState(ctx.industryWorkState).runs.filter(
    (r) =>
      r.terms.facilityId === intent.facilityId &&
      r.terms.runId === intent.runId &&
      r.source.worldId === s.worldId &&
      r.source.countryId === o.source.countryId &&
      r.source.operatorId === o.source.operatorId &&
      r.source.seedFingerprint === s.seedFingerprint &&
      r.source.admissionRef === s.admissionRef,
  );
  if (runs.length !== 1) invalid('ACTUAL_TARGET_PRODUCTION_RUN_REQUIRED');
  const pk = physicalKey(o.opening),
    live = s.physical.get(pk)!;
  const before = readDayOneStorageSelfUseLedger(live),
    physical = new Map(s.physical),
    bookings = new Map(s.bookings),
    usedPaidInputs = new Set(s.usedPaidInputs);
  let after: ReturnType<typeof readDayOneStorageSelfUseLedger>,
    receipt: Calculation['receipt'] = null,
    delivered: Calculation['delivered'] = null;
  const sourceFingerprint = hash(o.source, sha),
    base = {
      schemaVersion: 'industry-first-day-power-executed-v1',
      policy: DAY_ONE_STORAGE_SELF_USE_POLICY,
      source: o.source,
      sourceFingerprint,
      storageOpeningFingerprint: before.openingFingerprint,
      operation,
    };
  let payload: unknown;
  if (operation.action === 'BOOK') {
    exact(operation, [
      'action',
      'bookingRef',
      'purpose',
      'fromSimTime',
      'throughSimTime',
      'outputMWh',
    ]);
    const request: DayOneStorageRequest = {
      bookingRef: text(operation.bookingRef),
      runRef: intent.runId,
      worldId: s.worldId,
      countryId: o.source.countryId,
      operatorId: o.source.operatorId,
      storageId: o.opening.storageId,
      gridId: o.opening.gridId,
      purpose: operation.purpose as DayOneStorageRequest['purpose'],
      fromSimTime: text(operation.fromSimTime),
      throughSimTime: text(operation.throughSimTime),
      outputMWh: operation.outputMWh as DayOneStorageRequest['outputMWh'],
    };
    if (bookings.has(request.bookingRef))
      invalid('POWER_BOOKING_ALREADY_COMMITTED');
    const booked = bookDayOneStorageSelfUse({
      ledger: forkDayOneStorageSelfUseLedger(live),
      operationRef: intent.operationRef,
      observedSimTime: command.simTime.toCanonicalValue(),
      request,
    });
    if (booked.outcome !== 'BOOKED_NOT_DELIVERED')
      invalid('NEW_CANONICAL_BOOKING_REQUIRED');
    physical.set(pk, booked.ledger);
    bookings.set(request.bookingRef, {
      originalKey: originalKey(o.source),
      physicalKey: pk,
      request,
      productionRun: runs[0]!,
    });
    after = readDayOneStorageSelfUseLedger(booked.ledger);
    payload = {
      ...base,
      status: 'BOOKED_NOT_DELIVERED',
      before: {
        remainingSocMWh: before.remainingSocMWh,
        pendingStoredEnergyMWh: before.pendingStoredEnergyMWh,
      },
      after: {
        remainingSocMWh: after.remainingSocMWh,
        pendingStoredEnergyMWh: after.pendingStoredEnergyMWh,
      },
    };
  } else if (operation.action === 'DELIVER') {
    exact(operation, [
      'action',
      'bookingRef',
      'workEventFingerprint',
      'paymentEventFingerprint',
    ]);
    const booking = bookings.get(text(operation.bookingRef));
    if (
      !booking ||
      booking.originalKey !== originalKey(o.source) ||
      booking.physicalKey !== pk
    )
      invalid('EXACT_PRIOR_COMMITTED_BOOKING_REQUIRED');
    const paid = servicePayment(
        s,
        o,
        booking,
        operation,
        ctx,
        command.simTime.ticks,
        sha,
      ),
      settled = settleDayOneStorageSelfUse({
        ledger: forkDayOneStorageSelfUseLedger(live),
        operationRef: intent.operationRef,
        observedSimTime: command.simTime.toCanonicalValue(),
        bookingRef: booking.request.bookingRef,
      });
    if (settled.outcome !== 'SETTLED_PROPOSED_DATA')
      invalid('EXACT_ONCE_NEW_PHYSICAL_SETTLEMENT_REQUIRED');
    physical.set(pk, settled.ledger);
    usedPaidInputs.add(paid.workEventFingerprint);
    usedPaidInputs.add(paid.paymentEventFingerprint);
    after = readDayOneStorageSelfUseLedger(settled.ledger);
    const fact = {
      schemaVersion: 'industry-power-delivered-fact-v1',
      worldId: s.worldId,
      countryId: o.source.countryId,
      facilityId: o.source.facilityId,
      operatorId: o.source.operatorId,
      runId: o.source.runId,
      sourceRef: o.source.sourceRef,
      sourceRawSha256: o.source.sourceRawSha256,
      purpose: booking.request.purpose,
      settlement: settled.settlement,
      actualPaidInput: paid,
    };
    const validFromTicks = booking.request.fromSimTime,
      validUntilTicks = '86400000',
      operatingFactCanonicalPayload = canonicalSerialize(fact);
    receipt = industryUtilityOperatingReceiptFromRun(
      {
        command,
        source: o.source,
        productionRun: runs[0]!,
        validFromTicks,
        validUntilTicks,
        factCanonicalPayload: operatingFactCanonicalPayload,
      },
      sha,
    );
    payload = {
      ...base,
      status: 'PHYSICAL_SETTLEMENT_RECOMPUTED',
      settlement: settled.settlement,
      actualPaidInput: paid,
      before: {
        remainingSocMWh: before.remainingSocMWh,
        pendingStoredEnergyMWh: before.pendingStoredEnergyMWh,
      },
      after: {
        remainingSocMWh: after.remainingSocMWh,
        pendingStoredEnergyMWh: after.pendingStoredEnergyMWh,
      },
    };
    delivered = immutable({
      classification:
        'CORE_REPLAYED_COMMITTED_POWER_DATA_NOT_DB_AUTHORITY' as const,
      source: o.source,
      worldId: s.worldId,
      seedFingerprint: s.seedFingerprint,
      admissionRef: s.admissionRef,
      countryId: o.source.countryId,
      operatorId: o.source.operatorId,
      facilityId: o.source.facilityId,
      runId: o.source.runId,
      purpose: booking.request.purpose,
      fromSimTime: booking.request.fromSimTime,
      throughSimTime: booking.request.throughSimTime,
      deliveredMWh: settled.settlement.deliveredMWh,
      settlement: settled.settlement,
      operatingFactCanonicalPayload,
      validFromTicks,
      validUntilTicks,
      actualPaidInput: paid,
    });
  } else invalid('FIXED_BOOK_OR_DELIVER_ACTION_REQUIRED');
  return {
    next: { ...s, physical, bookings, usedPaidInputs },
    payload,
    receipt,
    delivered,
  };
}
function transition(
  command: CanonicalCommand,
  sequenceBefore: string,
  recordedAtReal: string,
  c: Calculation,
  sha: Sha256Hex,
) {
  const bodies = [
    { eventType: INDUSTRY_UTILITY_EVENTS.POWER, payload: c.payload },
    ...(c.receipt
      ? [
          {
            eventType: INDUSTRY_UTILITY_OPERATING_RECEIPT_EVENT,
            payload: { operatingReceipt: c.receipt },
          },
        ]
      : []),
  ];
  const events = bodies.map((b, i) =>
    parseAuthoritativeEvent(
      {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventId: eventId(
          'POWER_EVENT_' +
            hash([command.fingerprint, i.toString(), b.payload], sha)
              .slice(7)
              .toUpperCase(),
        ),
        eventType: b.eventType,
        worldId: command.worldId,
        causationCommandId: command.commandId,
        correlationId: command.correlationId,
        worldVersion: String(BigInt(command.expectedWorldVersion!) + 1n),
        sequence: String(BigInt(sequenceBefore) + BigInt(i) + 1n),
        simTime: command.simTime.toCanonicalValue(),
        recordedAtReal,
        correctsEventId: null,
        payload: b.payload,
      },
      sha,
    ),
  );
  return createAuthoritativeTransition({
    command,
    events,
    worldVersionBefore: command.expectedWorldVersion!,
    worldVersionAfter: String(BigInt(command.expectedWorldVersion!) + 1n),
  });
}
declare const powerCommitBinding: unique symbol;
export interface IndustryFirstDayPowerCommitBinding {
  readonly [powerCommitBinding]: true;
}
const commitBindings = new WeakMap<
  object,
  Readonly<{
    preparation: IndustryUtilityExecutionPreparation;
    state: IndustryFirstDayPowerState;
    stepText: string;
  }>
>();
export function prepareIndustryFirstDayPowerExecution(
  input: Readonly<{
    preparation: IndustryUtilityExecutionPreparation;
    state: IndustryFirstDayPowerState;
    observedAtReal?: string;
  }>,
  sha: Sha256Hex,
) {
  const d = readIndustryUtilityExecution(input.preparation, sha);
  if (d.replay.result.industryPowerState !== input.state)
    invalid('EXACT_POWER_STATE_IN_GENUINE_BEFORE_PREFIX_REQUIRED');
  const original = lookup(input.state).originals.get(originalKey(d.source));
  if (!original || !same(original.source, d.source))
    invalid('EXACT_PREPARED_REGISTERED_POWER_SOURCE_REQUIRED');
  const r = d.replay.result;
  if (!r.financialState || !r.industryWorkState || !r.industryWageState)
    invalid('ACTUAL_WORK_WAGE_FINANCIAL_PREFIX_REQUIRED');
  const c = calculate(
      input.state,
      d.command,
      {
        financial: r.financialState,
        industryWorkState: r.industryWorkState,
        industryWageState: r.industryWageState,
      },
      sha,
    ),
    tr = transition(
      d.command,
      d.replay.head.eventSequence,
      input.observedAtReal ?? d.command.submittedAtReal,
      c,
      sha,
    );
  const step = Object.freeze({
    command: d.command,
    transition: tr,
    financialPostingBatches: Object.freeze([]),
    inventoryPostings: Object.freeze([]),
  });
  const binding = Object.freeze({}) as IndustryFirstDayPowerCommitBinding;
  commitBindings.set(binding, {
    preparation: input.preparation,
    state: input.state,
    stepText: canonicalSerialize(step),
  });
  return Object.freeze({
    classification: 'DRAFT_POWER_TRANSITION_NOT_COMMITTED_DELIVERY' as const,
    step,
    commitBinding: binding,
  });
}
/** Exact Core candidate binding, not actor/custody/Clock/DB permission. */
export function assertIndustryFirstDayPowerCommitBinding(
  input: Readonly<{
    binding: IndustryFirstDayPowerCommitBinding;
    command: CanonicalCommand;
    transition: AuthoritativeTransition;
    financialPostingBatches: readonly unknown[];
    inventoryPostings: readonly unknown[];
  }>,
  sha: Sha256Hex,
): void {
  const b = commitBindings.get(input.binding);
  if (!b) invalid('GENUINE_POWER_COMMIT_BINDING_REQUIRED');
  const d = readIndustryUtilityExecution(b.preparation, sha);
  if (
    d.replay.result.industryPowerState !== b.state ||
    canonicalSerialize({
      command: input.command,
      transition: input.transition,
      financialPostingBatches: input.financialPostingBatches,
      inventoryPostings: input.inventoryPostings,
    }) !== b.stepText
  )
    invalid('EXACT_ISSUED_POWER_CANDIDATE_REQUIRED');
  bindAuthoritativeTransition(
    { command: input.command, transition: input.transition },
    sha,
  );
}
export function replayIndustryFirstDayPowerFrame(
  input: Readonly<
    {
      state: IndustryFirstDayPowerState;
      frame: FinanceNativeBudgetCanonicalFrame;
    } & IndustryFirstDayPowerReplayContext
  >,
  sha: Sha256Hex,
): IndustryFirstDayPowerState {
  const { frame } = input,
    s = lookup(input.state);
  if (
    frame.events.length === 0 ||
    frame.financialPostingBatches.length !== 0 ||
    frame.inventoryPostings.length !== 0 ||
    !same(frame.events, frame.transition.events)
  )
    invalid('EXACT_POWER_CANONICAL_GROUP_WITH_ZERO_JOURNALS_REQUIRED');
  bindAuthoritativeTransition(
    { command: frame.command, transition: frame.transition },
    sha,
  );
  const final = createFinalCommandReceipt({
    command: frame.command,
    transition: frame.transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: frame.command.simTime,
    recordedAtReal: frame.receipt.recordedAtReal,
  });
  if (!same(final, frame.receipt))
    invalid('ACTUAL_COMMITTED_POWER_RECEIPT_REQUIRED');
  const key = frame.command.commandId,
    fp = hash(frame, sha),
    prior = s.commands.get(key);
  if (prior) {
    if (prior !== fp) invalid('POWER_COMMAND_REPLAY_CONFLICT');
    return input.state;
  }
  const c = calculate(input.state, frame.command, input, sha),
    actual = transition(
      frame.command,
      String(BigInt(frame.events[0]!.sequence) - 1n),
      frame.events[0]!.recordedAtReal,
      c,
      sha,
    );
  if (!same(actual, frame.transition))
    invalid('POWER_EVENT_OR_PHYSICAL_EFFECT_REPLAY_DIFFERS');
  const entries = new Map(s.entries),
    commands = new Map(s.commands);
  commands.set(key, fp);
  if (c.delivered) {
    if (frame.events.length !== 2)
      invalid('ACTUAL_DELIVERY_RECEIPT_EVENT_REQUIRED');
    entries.set(
      frame.events[0]!.fingerprint,
      immutable({ ...c.delivered, frame }),
    );
  }
  return issue({ ...c.next, entries, commands });
}
export function readIndustryFirstDayPowerReplayDelivery(
  state: IndustryFirstDayPowerState,
  eventFingerprint: string,
  sha: Sha256Hex,
): IndustryFirstDayPowerReplayDelivery {
  const s = lookup(state),
    entry = s.entries.get(eventFingerprint);
  if (!entry) invalid('ACTUAL_REPLAYED_POWER_DELIVERY_REQUIRED');
  const registered = s.commands.get(entry.frame.command.commandId);
  if (registered !== hash(entry.frame, sha))
    invalid('REPLAYED_POWER_FRAME_CHANGED');
  return entry;
}
declare const actualPower: unique symbol;
export interface IndustryFirstDayPowerExecution {
  readonly [actualPower]: true;
}
const deliveries = new WeakMap<
  object,
  Readonly<{
    view: FinanceSocialReplayContinuationView;
    state: IndustryFirstDayPowerState;
    data: IndustryFirstDayPowerReplayDelivery;
  }>
>();
export function confirmIndustryFirstDayPowerExecution(
  input: Readonly<{
    replay: FinanceSocialReplayContinuationView;
    eventFingerprint: string;
  }>,
  sha: Sha256Hex,
): IndustryFirstDayPowerExecution {
  const view = readFinanceSocialReplayContinuationView(input.replay, sha),
    state = view.result.industryPowerState;
  if (!view.complete || !state)
    invalid('GENUINE_COMPLETE_POWER_PREFIX_REQUIRED');
  const data = readIndustryFirstDayPowerReplayDelivery(
    state,
    input.eventFingerprint,
    sha,
  );
  if (
    data.worldId !== view.worldId ||
    data.seedFingerprint !== view.seedFingerprint ||
    BigInt(data.frame.transition.worldVersionAfter) >
      BigInt(view.head.worldVersion) ||
    BigInt(data.frame.events.at(-1)!.sequence) > BigInt(view.head.eventSequence)
  )
    invalid('EXACT_DELIVERY_IN_COMPLETE_PREFIX_REQUIRED');
  const token = Object.freeze({}) as IndustryFirstDayPowerExecution;
  deliveries.set(token, { view, state, data });
  return token;
}
export function readIndustryFirstDayPowerExecution(
  token: IndustryFirstDayPowerExecution,
  sha: Sha256Hex,
) {
  const d = deliveries.get(token);
  if (!d) invalid('GENUINE_CONFIRMED_POWER_EXECUTION_REQUIRED');
  const view = readFinanceSocialReplayContinuationView(d.view, sha);
  if (view.result.industryPowerState !== d.state)
    invalid('POWER_COMPLETE_PREFIX_STATE_CHANGED');
  const data = readIndustryFirstDayPowerReplayDelivery(
    d.state,
    d.data.frame.events[0]!.fingerprint,
    sha,
  );
  return Object.freeze({ ...data, preparation: view });
}
