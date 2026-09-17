import {
  decimal,
  kernelInvalid,
  maximum,
  minimum,
  money,
  nonNegative,
  positive,
  quantity,
  renderMoney,
  renderQuantity,
  type ExactMoney,
  type ExactQuantity,
  type ExactUnitPrice,
} from './common.js';
import { canonicalHashInput } from '../serialization/canonical.js';

/**
 * E13/E14 foundation-only closure. Every balance supplied here is an inert
 * snapshot owned by another future authoritative subsystem. These helpers
 * calculate deterministic traces; they do not create accounts, receipts,
 * commands, events, or durable state.
 */

export const HOUSEHOLD_FISCAL_FOUNDATION_STATUS =
  'FOUNDATION_IMPLEMENTED_UNVERIFIED' as const;

export interface ExternalBalanceSnapshot {
  /** Stable reference to the Banking- or CB-owned balance; never a local copy. */
  readonly balanceRef: string;
  readonly balance: ExactMoney;
}

/**
 * Immutable source snapshot binding supplied by the future authoritative
 * owner. This pure kernel verifies internal lineage consistency only; it does
 * not attest, store, or fetch the external source.
 */
export interface ImmutableSourceSnapshotBinding {
  readonly sourceRef: string;
  readonly sourceVersion: string;
  readonly snapshotRef: string;
  readonly snapshotHash: string;
  readonly predecessorSnapshotHash: string | null;
}

/** Externally produced evidence bound to the exact closure source snapshot. */
export interface BoundFoundationEvidence {
  readonly evidenceRef: string;
  readonly lineage: ImmutableSourceSnapshotBinding;
}

/** Canonical SHA-256 preimage for an exact replay by a future owner. */
export interface FoundationReplayProof {
  readonly lineage: ImmutableSourceSnapshotBinding;
  readonly evidenceRefs: readonly string[];
  readonly traceRefs: readonly string[];
  readonly hashInput: string;
}

export interface ExactMoneyTrace {
  readonly traceRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}

export interface ExactQuantityTrace {
  readonly traceRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactQuantity;
  readonly delta: ExactQuantity;
  readonly after: ExactQuantity;
}

export type HouseholdSettlementKind =
  'WAGE' | 'TRANSFER' | 'TAX' | 'DEBT_SERVICE';

export interface SettledHouseholdReceipt {
  /** An externally issued settlement receipt reference, not a durable receipt here. */
  readonly receiptRef: string;
  readonly sourceRef: string;
  readonly evidence: BoundFoundationEvidence;
  readonly kind: HouseholdSettlementKind;
  readonly settlementState: 'SETTLED';
  readonly amount: ExactMoney;
}

export interface ApprovedUnpaidHouseholdTransfer {
  readonly claimRef: string;
  readonly paymentRequestRef: string;
  readonly state: 'APPROVED_UNPAID';
  readonly amount: ExactMoney;
}

export interface HouseholdDomesticDemandLine {
  readonly lineRef: string;
  /** Caller-declared order; this foundation never supplies a demand priority. */
  readonly priority: number;
  readonly supplyRef: string;
  readonly requestedQuantity: ExactQuantity;
  readonly availableSupply: ExactQuantity;
  readonly unitPrice: ExactUnitPrice;
}

export interface HouseholdDomesticClosureInput {
  readonly lineage: ImmutableSourceSnapshotBinding;
  readonly bankDeposit: ExternalBalanceSnapshot;
  readonly settledReceipts: readonly SettledHouseholdReceipt[];
  readonly approvedUnpaidTransfers: readonly ApprovedUnpaidHouseholdTransfer[];
  readonly demandLines: readonly HouseholdDomesticDemandLine[];
}

export interface HouseholdDemandClosureLine {
  readonly lineRef: string;
  readonly priority: number;
  readonly requestedQuantity: ExactQuantity;
  readonly fulfilledQuantity: ExactQuantity;
  readonly unmetDueToSupply: ExactQuantity;
  readonly unmetDueToCash: ExactQuantity;
  readonly paid: ExactMoney;
  readonly supplyTrace: ExactQuantityTrace;
  readonly cashTrace: ExactMoneyTrace;
}

export interface HouseholdDomesticClosureResult {
  readonly foundationStatus: typeof HOUSEHOLD_FISCAL_FOUNDATION_STATUS;
  /** Link only: Banking owns this balance and must apply any later posting. */
  readonly bankDepositRef: string;
  readonly cashAfterSettlements: ExactMoney;
  readonly cashAfterConsumption: ExactMoney;
  readonly settledCashIncome: ExactMoney;
  readonly settledTaxPaid: ExactMoney;
  readonly settledDebtServicePaid: ExactMoney;
  readonly excludedApprovedUnpaidTransfers: readonly ApprovedUnpaidHouseholdTransfer[];
  readonly receiptTraces: readonly ExactMoneyTrace[];
  readonly demandClosures: readonly HouseholdDemandClosureLine[];
  readonly replayProof: FoundationReplayProof;
}

export type TreasuryInsufficientCashDisposition =
  'ARREAR' | 'DELAYED' | 'DEFAULT';

export interface FiscalTaxCollectionInput {
  readonly taxRef: string;
  /** External assessment reference; this kernel never creates a tax assessment. */
  readonly assessmentRef: string;
  /** Required exactly when a non-zero credit is supplied. */
  readonly creditRef: string | null;
  readonly settlementReceiptRef: string | null;
  readonly assessedLiability: ExactMoney;
  readonly credit: ExactMoney;
  /** Only a settled collection receipt may add this amount to the TGA trace. */
  readonly cashCollected: ExactMoney;
}

export interface FiscalBudgetCommitmentInput {
  readonly budgetLineRef: string;
  readonly commitmentRef: string;
  readonly predecessorCommitmentRef: string | null;
  readonly newCommitment: ExactMoney;
  readonly evidence: BoundFoundationEvidence;
}

/** Immutable budget-line snapshot with its complete submitted commitment chain. */
export interface FiscalBudgetLineSnapshot {
  readonly budgetLineRef: string;
  readonly lineage: ImmutableSourceSnapshotBinding;
  readonly appropriation: ExactMoney;
  readonly commitmentHeadRef: string | null;
  readonly committed: readonly FiscalSubmittedCommitment[];
}

export interface FiscalSubmittedCommitment {
  readonly commitmentRef: string;
  readonly predecessorCommitmentRef: string | null;
  readonly amount: ExactMoney;
  readonly evidence: BoundFoundationEvidence;
}

export interface TreasuryPaymentRequest {
  readonly paymentRef: string;
  readonly obligationRef: string;
  readonly evidence: BoundFoundationEvidence;
  /** Strictly ascending and caller-declared. This foundation adds no policy. */
  readonly priority: number;
  readonly duePayment: ExactMoney;
  readonly insufficientCashDisposition: TreasuryInsufficientCashDisposition;
}

export interface FiscalTreasuryClosureInput {
  readonly lineage: ImmutableSourceSnapshotBinding;
  readonly treasuryGeneralAccount: ExternalBalanceSnapshot;
  readonly taxes: readonly FiscalTaxCollectionInput[];
  readonly budgetLineSnapshots: readonly FiscalBudgetLineSnapshot[];
  readonly commitments: readonly FiscalBudgetCommitmentInput[];
  readonly payments: readonly TreasuryPaymentRequest[];
}

export interface FiscalTaxCollectionResult {
  readonly taxRef: string;
  readonly assessmentRef: string;
  readonly creditRef: string | null;
  readonly settlementReceiptRef: string | null;
  readonly grossLiability: ExactMoney;
  readonly credit: ExactMoney;
  readonly netLiability: ExactMoney;
  readonly cashCollected: ExactMoney;
  readonly unpaidReceivable: ExactMoney;
  /** Gross assessment less an explicitly sourced credit. */
  readonly liabilityTrace: ExactMoneyTrace;
  /** Net liability less cash actually collected. */
  readonly receivableTrace: ExactMoneyTrace;
  readonly tgaTrace: ExactMoneyTrace;
}

export interface FiscalBudgetCommitmentResult {
  readonly budgetLineRef: string;
  readonly appropriation: ExactMoney;
  readonly committedBefore: ExactMoney;
  readonly commitmentTrace: ExactMoneyTrace;
  readonly remainingAppropriation: ExactMoney;
}

export interface TreasuryPaymentResult {
  readonly paymentRef: string;
  readonly obligationRef: string;
  readonly priority: number;
  readonly status: 'PAID' | TreasuryInsufficientCashDisposition;
  readonly paid: ExactMoney;
  readonly unpaid: ExactMoney;
  readonly blockedByHigherPriorityPaymentRef: string | null;
  readonly tgaTrace: ExactMoneyTrace;
}

export interface FiscalTreasuryClosureResult {
  readonly foundationStatus: typeof HOUSEHOLD_FISCAL_FOUNDATION_STATUS;
  /** Link only: the CB-owned TGA must apply any future posting. */
  readonly treasuryGeneralAccountRef: string;
  readonly cashAfterTaxCollections: ExactMoney;
  readonly cashAfterPayments: ExactMoney;
  readonly taxCollections: readonly FiscalTaxCollectionResult[];
  readonly commitments: readonly FiscalBudgetCommitmentResult[];
  readonly paymentResults: readonly TreasuryPaymentResult[];
  readonly replayProof: FoundationReplayProof;
}

const STABLE_REFERENCE = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

function stableReference(value: string, label: string): string {
  if (!STABLE_REFERENCE.test(value)) {
    kernelInvalid(`${label} must be a stable reference`);
  }
  return value;
}

function stableReferences(values: readonly string[], label: string) {
  if (values.length === 0)
    kernelInvalid(`${label} requires an input reference`);
  return Object.freeze(
    values.map((value, index) =>
      stableReference(value, `${label} input reference ${index}`),
    ),
  );
}

function snapshotHash(value: string, label: string): string {
  if (!SHA256_HEX.test(value)) {
    kernelInvalid(`${label} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

function immutableSourceSnapshotBinding(
  value: ImmutableSourceSnapshotBinding,
  label: string,
): ImmutableSourceSnapshotBinding {
  return Object.freeze({
    sourceRef: stableReference(value.sourceRef, `${label} source`),
    sourceVersion: stableReference(value.sourceVersion, `${label} version`),
    snapshotRef: stableReference(value.snapshotRef, `${label} snapshot`),
    snapshotHash: snapshotHash(value.snapshotHash, `${label} snapshot hash`),
    predecessorSnapshotHash:
      value.predecessorSnapshotHash === null
        ? null
        : snapshotHash(
            value.predecessorSnapshotHash,
            `${label} predecessor snapshot hash`,
          ),
  });
}

function sameLineage(
  expected: ImmutableSourceSnapshotBinding,
  actual: ImmutableSourceSnapshotBinding,
  label: string,
): void {
  if (
    expected.sourceRef !== actual.sourceRef ||
    expected.sourceVersion !== actual.sourceVersion ||
    expected.snapshotRef !== actual.snapshotRef ||
    expected.snapshotHash !== actual.snapshotHash ||
    expected.predecessorSnapshotHash !== actual.predecessorSnapshotHash
  ) {
    kernelInvalid(`${label} must bind to the closure source snapshot lineage`);
  }
}

function boundEvidence(
  value: BoundFoundationEvidence,
  expectedLineage: ImmutableSourceSnapshotBinding,
  label: string,
): BoundFoundationEvidence {
  const lineage = immutableSourceSnapshotBinding(
    value.lineage,
    `${label} lineage`,
  );
  sameLineage(expectedLineage, lineage, label);
  return Object.freeze({
    evidenceRef: stableReference(value.evidenceRef, `${label} reference`),
    lineage,
  });
}

function replayProof(input: {
  readonly closure: 'HOUSEHOLD_DOMESTIC' | 'FISCAL_TREASURY';
  readonly lineage: ImmutableSourceSnapshotBinding;
  readonly evidenceRefs: readonly string[];
  readonly traces: readonly (ExactMoneyTrace | ExactQuantityTrace)[];
}): FoundationReplayProof {
  const evidenceRefs = Object.freeze(
    input.evidenceRefs.map((reference, index) =>
      stableReference(reference, `replay proof evidence reference ${index}`),
    ),
  );
  assertUniqueReferences(evidenceRefs, 'replay proof evidence reference');
  const traceRefs = Object.freeze(
    input.traces.map((trace) =>
      stableReference(trace.traceRef, 'replay trace'),
    ),
  );
  assertUniqueReferences(traceRefs, 'replay proof trace reference');
  const lineage = immutableSourceSnapshotBinding(input.lineage, 'replay proof');
  return Object.freeze({
    lineage,
    evidenceRefs,
    traceRefs,
    hashInput: canonicalHashInput({
      closure: input.closure,
      lineage,
      evidenceRefs,
      traces: input.traces,
    }),
  });
}

function nonNegativeMoney(value: ExactMoney, label: string) {
  const parsed = money(value, label);
  return Object.freeze({
    amount: nonNegative(value.amount, label),
    currency: parsed.currency,
  });
}

function nonNegativeQuantity(value: ExactQuantity, label: string) {
  const parsed = quantity(value, label);
  return Object.freeze({
    amount: nonNegative(value.amount, label),
    unit: parsed.unit,
  });
}

function moneyTrace(input: {
  readonly traceRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactMoney;
  readonly delta: ExactMoney;
  readonly after: ExactMoney;
}): ExactMoneyTrace {
  const before = money(input.before, 'money trace before');
  const delta = money(input.delta, 'money trace delta');
  const after = money(input.after, 'money trace after');
  if (
    before.currency !== delta.currency ||
    before.currency !== after.currency ||
    !before.amount.plus(delta.amount).equals(after.amount)
  ) {
    kernelInvalid('Money trace must conserve currency and before plus delta');
  }
  return Object.freeze({
    traceRef: stableReference(input.traceRef, 'money trace'),
    inputRefs: stableReferences(input.inputRefs, 'money trace'),
    outputRef: stableReference(input.outputRef, 'money trace output'),
    before: renderMoney(before.amount, before.currency),
    delta: renderMoney(delta.amount, before.currency),
    after: renderMoney(after.amount, before.currency),
  });
}

function quantityTrace(input: {
  readonly traceRef: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly before: ExactQuantity;
  readonly delta: ExactQuantity;
  readonly after: ExactQuantity;
}): ExactQuantityTrace {
  const before = quantity(input.before, 'quantity trace before');
  const delta = quantity(input.delta, 'quantity trace delta');
  const after = quantity(input.after, 'quantity trace after');
  if (
    before.unit !== delta.unit ||
    before.unit !== after.unit ||
    !before.amount.plus(delta.amount).equals(after.amount)
  ) {
    kernelInvalid('Quantity trace must conserve unit and before plus delta');
  }
  return Object.freeze({
    traceRef: stableReference(input.traceRef, 'quantity trace'),
    inputRefs: stableReferences(input.inputRefs, 'quantity trace'),
    outputRef: stableReference(input.outputRef, 'quantity trace output'),
    before: renderQuantity(before.amount, before.unit),
    delta: renderQuantity(delta.amount, before.unit),
    after: renderQuantity(after.amount, before.unit),
  });
}

function sameCurrency(expected: string, actual: string, label: string): void {
  if (expected !== actual) kernelInvalid(`${label} currency must match`);
}

function assertUniqueReferences(
  values: readonly string[],
  label: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const canonical = stableReference(value, label);
    if (seen.has(canonical)) kernelInvalid(`${label} must be unique`);
    seen.add(canonical);
  }
}

function settlementDelta(
  kind: HouseholdSettlementKind,
  amount: ReturnType<typeof nonNegative>,
) {
  return kind === 'WAGE' || kind === 'TRANSFER' ? amount : amount.negated();
}

function householdSettlementKind(value: unknown): HouseholdSettlementKind {
  if (
    value === 'WAGE' ||
    value === 'TRANSFER' ||
    value === 'TAX' ||
    value === 'DEBT_SERVICE'
  ) {
    return value;
  }
  return kernelInvalid(
    'Household settlement kind must be WAGE, TRANSFER, TAX, or DEBT_SERVICE',
  );
}

function assertStrictPriorities(
  payments: readonly TreasuryPaymentRequest[],
): void {
  let previous = 0;
  for (const payment of payments) {
    if (!Number.isSafeInteger(payment.priority) || payment.priority <= 0) {
      kernelInvalid(
        'Treasury payment priority must be a positive safe integer',
      );
    }
    if (payment.priority <= previous) {
      kernelInvalid('Treasury payment priorities must be strictly ascending');
    }
    previous = payment.priority;
  }
}

function insufficientCashDisposition(
  value: unknown,
): TreasuryInsufficientCashDisposition {
  if (value === 'ARREAR' || value === 'DELAYED' || value === 'DEFAULT') {
    return value;
  }
  return kernelInvalid(
    'Treasury insufficient cash disposition must be ARREAR, DELAYED, or DEFAULT',
  );
}

interface BudgetLineClosureState {
  readonly budgetLineRef: string;
  readonly appropriation: ReturnType<typeof nonNegative>;
  readonly currency: string;
  committed: ReturnType<typeof nonNegative>;
  commitmentHeadRef: string | null;
}

function fiscalBudgetLineStates(
  snapshots: readonly FiscalBudgetLineSnapshot[],
  lineage: ImmutableSourceSnapshotBinding,
  currency: string,
): {
  readonly states: Map<string, BudgetLineClosureState>;
  readonly commitmentRefs: ReadonlySet<string>;
  readonly evidenceRefs: readonly string[];
} {
  assertUniqueReferences(
    snapshots.map((snapshot) => snapshot.budgetLineRef),
    'Fiscal budget-line snapshot reference',
  );
  const states = new Map<string, BudgetLineClosureState>();
  const commitmentRefs = new Set<string>();
  const evidenceRefs: string[] = [];
  for (const snapshot of snapshots) {
    const budgetLineRef = stableReference(
      snapshot.budgetLineRef,
      'fiscal budget line snapshot',
    );
    const snapshotLineage = immutableSourceSnapshotBinding(
      snapshot.lineage,
      'fiscal budget line snapshot',
    );
    sameLineage(lineage, snapshotLineage, 'fiscal budget line snapshot');
    const appropriation = nonNegativeMoney(
      snapshot.appropriation,
      'budget appropriation',
    );
    sameCurrency(currency, appropriation.currency, 'budget appropriation');
    let committed = decimal('0', 'submitted budget commitments');
    let expectedPredecessor: string | null = null;
    for (const submitted of snapshot.committed) {
      const commitmentRef = stableReference(
        submitted.commitmentRef,
        'submitted budget commitment',
      );
      if (commitmentRefs.has(commitmentRef)) {
        kernelInvalid('Submitted budget commitment reference must be unique');
      }
      const predecessor =
        submitted.predecessorCommitmentRef === null
          ? null
          : stableReference(
              submitted.predecessorCommitmentRef,
              'submitted budget commitment predecessor',
            );
      if (predecessor !== expectedPredecessor) {
        kernelInvalid(
          'Submitted budget commitment predecessor does not match authoritative lineage',
        );
      }
      const amount = nonNegativeMoney(
        submitted.amount,
        'submitted budget commitment amount',
      );
      sameCurrency(
        appropriation.currency,
        amount.currency,
        'submitted budget commitment amount',
      );
      if (amount.amount.isZero()) {
        kernelInvalid('Submitted budget commitment amount must be positive');
      }
      const evidence = boundEvidence(
        submitted.evidence,
        lineage,
        'submitted budget commitment evidence',
      );
      commitmentRefs.add(commitmentRef);
      evidenceRefs.push(evidence.evidenceRef);
      committed = committed.plus(amount.amount);
      if (committed.greaterThan(appropriation.amount)) {
        kernelInvalid(
          'Submitted budget commitments cannot exceed appropriation',
        );
      }
      expectedPredecessor = commitmentRef;
    }
    const commitmentHeadRef =
      snapshot.commitmentHeadRef === null
        ? null
        : stableReference(
            snapshot.commitmentHeadRef,
            'fiscal budget-line commitment head',
          );
    if (commitmentHeadRef !== expectedPredecessor) {
      kernelInvalid(
        'Fiscal budget-line commitment head does not match submitted lineage',
      );
    }
    states.set(budgetLineRef, {
      budgetLineRef,
      appropriation: appropriation.amount,
      currency: appropriation.currency,
      committed,
      commitmentHeadRef,
    });
  }
  assertUniqueReferences(evidenceRefs, 'Submitted budget commitment evidence');
  return Object.freeze({
    states,
    commitmentRefs,
    evidenceRefs: Object.freeze(evidenceRefs),
  });
}

/**
 * Closes only externally settled household cash and explicitly allocated final
 * demand. The returned cash values are an inert Banking-account trace, not a
 * Household-owned deposit balance.
 */
export function closeHouseholdDomesticClosure(
  input: HouseholdDomesticClosureInput,
): HouseholdDomesticClosureResult {
  const lineage = immutableSourceSnapshotBinding(
    input.lineage,
    'household closure',
  );
  const bankDepositRef = stableReference(
    input.bankDeposit.balanceRef,
    'bank deposit balance',
  );
  const openingCash = nonNegativeMoney(
    input.bankDeposit.balance,
    'bank deposit balance',
  );
  assertUniqueReferences(
    input.settledReceipts.map((receipt) => receipt.receiptRef),
    'Household settlement receipt reference',
  );
  assertUniqueReferences(
    input.approvedUnpaidTransfers.map((transfer) => transfer.claimRef),
    'Approved unpaid transfer claim reference',
  );
  assertUniqueReferences(
    input.demandLines.map((line) => line.lineRef),
    'Household demand line reference',
  );
  let cash = openingCash.amount;
  let cashIncome = decimal('0', 'settled cash income');
  let taxPaid = decimal('0', 'settled tax paid');
  let debtServicePaid = decimal('0', 'settled debt service paid');
  const receiptTraces: ExactMoneyTrace[] = [];
  const receiptEvidenceRefs: string[] = [];
  for (const receipt of input.settledReceipts) {
    if (receipt.settlementState !== 'SETTLED') {
      kernelInvalid('Household cash path requires an explicit settled receipt');
    }
    const amount = nonNegativeMoney(receipt.amount, 'household receipt amount');
    const kind = householdSettlementKind(receipt.kind);
    const evidence = boundEvidence(
      receipt.evidence,
      lineage,
      'household settlement evidence',
    );
    receiptEvidenceRefs.push(evidence.evidenceRef);
    sameCurrency(
      openingCash.currency,
      amount.currency,
      'Household receipt amount',
    );
    const delta = settlementDelta(kind, amount.amount);
    const after = cash.plus(delta);
    if (after.isNegative()) {
      kernelInvalid('A settled household debit cannot exceed available cash');
    }
    receiptTraces.push(
      moneyTrace({
        traceRef: receipt.receiptRef,
        inputRefs: [
          receipt.receiptRef,
          receipt.sourceRef,
          evidence.evidenceRef,
        ],
        outputRef: bankDepositRef,
        before: renderMoney(cash, openingCash.currency),
        delta: renderMoney(delta, openingCash.currency),
        after: renderMoney(after, openingCash.currency),
      }),
    );
    if (kind === 'WAGE' || kind === 'TRANSFER') {
      cashIncome = cashIncome.plus(amount.amount);
    } else if (kind === 'TAX') {
      taxPaid = taxPaid.plus(amount.amount);
    } else {
      debtServicePaid = debtServicePaid.plus(amount.amount);
    }
    cash = after;
  }
  assertUniqueReferences(
    receiptEvidenceRefs,
    'Household settlement evidence reference',
  );
  const excludedApprovedUnpaidTransfers = Object.freeze(
    input.approvedUnpaidTransfers.map((transfer) => {
      if (transfer.state !== 'APPROVED_UNPAID') {
        kernelInvalid(
          'Only approved unpaid transfers may be excluded from cash',
        );
      }
      const amount = nonNegativeMoney(
        transfer.amount,
        'approved unpaid transfer amount',
      );
      sameCurrency(
        openingCash.currency,
        amount.currency,
        'Approved unpaid transfer amount',
      );
      return Object.freeze({
        claimRef: stableReference(
          transfer.claimRef,
          'approved unpaid transfer',
        ),
        paymentRequestRef: stableReference(
          transfer.paymentRequestRef,
          'approved unpaid transfer payment request',
        ),
        state: 'APPROVED_UNPAID' as const,
        amount: renderMoney(amount.amount, amount.currency),
      });
    }),
  );
  const cashAfterSettlements = renderMoney(cash, openingCash.currency);
  let previousPriority = 0;
  const demandClosures: HouseholdDemandClosureLine[] = [];
  for (const line of input.demandLines) {
    if (!Number.isSafeInteger(line.priority) || line.priority <= 0) {
      kernelInvalid(
        'Household demand priority must be a positive safe integer',
      );
    }
    if (line.priority <= previousPriority) {
      kernelInvalid('Household demand priorities must be strictly ascending');
    }
    previousPriority = line.priority;
    const requested = nonNegativeQuantity(
      line.requestedQuantity,
      'household requested quantity',
    );
    const available = nonNegativeQuantity(
      line.availableSupply,
      'household available supply',
    );
    if (requested.unit !== available.unit) {
      kernelInvalid('Household requested quantity and supply units must match');
    }
    const price = money(
      { amount: line.unitPrice.amount, currency: line.unitPrice.currency },
      'household unit price',
    );
    const pricePerUnit = quantity(
      { amount: '0', unit: line.unitPrice.perUnit },
      'household unit price denominator',
    ).unit;
    if (pricePerUnit !== requested.unit) {
      kernelInvalid('Household unit price must use the demand quantity unit');
    }
    sameCurrency(openingCash.currency, price.currency, 'Household unit price');
    const priceAmount = positive(line.unitPrice.amount, 'household unit price');
    const supplyConstrained = minimum(
      [requested.amount, available.amount],
      'household demand and supply',
    );
    const supplyConstrainedCost = supplyConstrained.times(priceAmount);
    let fulfilled = supplyConstrained;
    let paid = supplyConstrainedCost;
    if (cash.lessThan(supplyConstrainedCost)) {
      const cashConstrained = cash.dividedBy(priceAmount);
      if (!cashConstrained.times(priceAmount).equals(cash)) {
        kernelInvalid(
          'Household cash-constrained quantity cannot be represented exactly',
        );
      }
      fulfilled = cashConstrained;
      paid = cash;
    }
    const afterCash = cash.minus(paid);
    const supplyAfter = available.amount.minus(fulfilled);
    const unmetDueToSupply = maximum(
      [requested.amount.minus(available.amount), decimal('0', 'zero')],
      'household unmet demand due to supply',
    );
    const unmetDueToCash = maximum(
      [supplyConstrained.minus(fulfilled), decimal('0', 'zero')],
      'household unmet demand due to cash',
    );
    const lineRef = stableReference(line.lineRef, 'household demand line');
    const supplyRef = stableReference(line.supplyRef, 'household supply');
    const fulfilledQuantity = renderQuantity(fulfilled, requested.unit);
    const paidMoney = renderMoney(paid, openingCash.currency);
    demandClosures.push(
      Object.freeze({
        lineRef,
        priority: line.priority,
        requestedQuantity: renderQuantity(requested.amount, requested.unit),
        fulfilledQuantity,
        unmetDueToSupply: renderQuantity(unmetDueToSupply, requested.unit),
        unmetDueToCash: renderQuantity(unmetDueToCash, requested.unit),
        paid: paidMoney,
        supplyTrace: quantityTrace({
          traceRef: `${lineRef}:SUPPLY`,
          inputRefs: [lineRef, supplyRef],
          outputRef: supplyRef,
          before: renderQuantity(available.amount, available.unit),
          delta: renderQuantity(fulfilled.negated(), available.unit),
          after: renderQuantity(supplyAfter, available.unit),
        }),
        cashTrace: moneyTrace({
          traceRef: `${lineRef}:PAYMENT`,
          inputRefs: [lineRef, supplyRef, bankDepositRef],
          outputRef: bankDepositRef,
          before: renderMoney(cash, openingCash.currency),
          delta: renderMoney(paid.negated(), openingCash.currency),
          after: renderMoney(afterCash, openingCash.currency),
        }),
      }),
    );
    cash = afterCash;
  }
  const frozenReceiptTraces = Object.freeze(receiptTraces);
  const frozenDemandClosures = Object.freeze(demandClosures);
  return Object.freeze({
    foundationStatus: HOUSEHOLD_FISCAL_FOUNDATION_STATUS,
    bankDepositRef,
    cashAfterSettlements,
    cashAfterConsumption: renderMoney(cash, openingCash.currency),
    settledCashIncome: renderMoney(cashIncome, openingCash.currency),
    settledTaxPaid: renderMoney(taxPaid, openingCash.currency),
    settledDebtServicePaid: renderMoney(debtServicePaid, openingCash.currency),
    excludedApprovedUnpaidTransfers,
    receiptTraces: frozenReceiptTraces,
    demandClosures: frozenDemandClosures,
    replayProof: replayProof({
      closure: 'HOUSEHOLD_DOMESTIC',
      lineage,
      evidenceRefs: receiptEvidenceRefs,
      traces: [
        ...frozenReceiptTraces,
        ...frozenDemandClosures.flatMap((closure) => [
          closure.supplyTrace,
          closure.cashTrace,
        ]),
      ],
    }),
  });
}

/**
 * Closes exact fiscal receipts, commitments, and payment attempts against an
 * externally owned TGA snapshot. It never chooses policy, creates debt, or
 * records a durable tax/payment/arrear fact.
 */
export function closeFiscalTreasury(
  input: FiscalTreasuryClosureInput,
): FiscalTreasuryClosureResult {
  const lineage = immutableSourceSnapshotBinding(
    input.lineage,
    'fiscal closure',
  );
  const tgaRef = stableReference(
    input.treasuryGeneralAccount.balanceRef,
    'Treasury General Account',
  );
  const openingCash = nonNegativeMoney(
    input.treasuryGeneralAccount.balance,
    'Treasury General Account cash',
  );
  assertUniqueReferences(
    input.taxes.map((tax) => tax.taxRef),
    'Fiscal tax reference',
  );
  assertUniqueReferences(
    input.commitments.map((commitment) => commitment.commitmentRef),
    'Fiscal commitment reference',
  );
  assertUniqueReferences(
    input.payments.map((payment) => payment.paymentRef),
    'Treasury payment reference',
  );
  assertStrictPriorities(input.payments);
  const budgetLineState = fiscalBudgetLineStates(
    input.budgetLineSnapshots,
    lineage,
    openingCash.currency,
  );
  const submittedEvidenceRefs = [...budgetLineState.evidenceRefs];
  let cash = openingCash.amount;
  const taxCollections: FiscalTaxCollectionResult[] = [];
  for (const tax of input.taxes) {
    const assessed = nonNegativeMoney(tax.assessedLiability, 'tax assessment');
    const credit = nonNegativeMoney(tax.credit, 'tax credit');
    const collected = nonNegativeMoney(
      tax.cashCollected,
      'tax cash collection',
    );
    for (const [label, value] of [
      ['tax credit', credit],
      ['tax cash collection', collected],
    ] as const) {
      sameCurrency(openingCash.currency, value.currency, label);
    }
    sameCurrency(openingCash.currency, assessed.currency, 'tax assessment');
    if (credit.amount.greaterThan(assessed.amount)) {
      kernelInvalid(
        'Tax credit cannot exceed assessed liability in this foundation',
      );
    }
    const netLiability = assessed.amount.minus(credit.amount);
    if (collected.amount.greaterThan(netLiability)) {
      kernelInvalid('Tax collection cannot exceed net tax liability');
    }
    if (collected.amount.isZero() !== (tax.settlementReceiptRef === null)) {
      kernelInvalid(
        'Tax cash collection requires exactly one settled receipt reference',
      );
    }
    if (credit.amount.isZero() !== (tax.creditRef === null)) {
      kernelInvalid(
        'Tax credit requires exactly one source reference when non-zero',
      );
    }
    const after = cash.plus(collected.amount);
    const taxRef = stableReference(tax.taxRef, 'tax collection');
    const assessmentRef = stableReference(tax.assessmentRef, 'tax assessment');
    const creditRef =
      tax.creditRef === null
        ? null
        : stableReference(tax.creditRef, 'tax credit source');
    const receiptRef =
      tax.settlementReceiptRef === null
        ? null
        : stableReference(tax.settlementReceiptRef, 'tax settlement receipt');
    taxCollections.push(
      Object.freeze({
        taxRef,
        assessmentRef,
        creditRef,
        settlementReceiptRef: receiptRef,
        grossLiability: renderMoney(assessed.amount, assessed.currency),
        credit: renderMoney(credit.amount, credit.currency),
        netLiability: renderMoney(netLiability, assessed.currency),
        cashCollected: renderMoney(collected.amount, collected.currency),
        unpaidReceivable: renderMoney(
          netLiability.minus(collected.amount),
          assessed.currency,
        ),
        liabilityTrace: moneyTrace({
          traceRef: `${taxRef}:NET_LIABILITY`,
          inputRefs:
            creditRef === null
              ? [taxRef, assessmentRef]
              : [taxRef, assessmentRef, creditRef],
          outputRef: `${taxRef}:NET_LIABILITY`,
          before: renderMoney(assessed.amount, assessed.currency),
          delta: renderMoney(credit.amount.negated(), assessed.currency),
          after: renderMoney(netLiability, assessed.currency),
        }),
        receivableTrace: moneyTrace({
          traceRef: `${taxRef}:UNPAID_RECEIVABLE`,
          inputRefs:
            receiptRef === null
              ? [taxRef, assessmentRef]
              : [taxRef, assessmentRef, receiptRef],
          outputRef: `${taxRef}:UNPAID_RECEIVABLE`,
          before: renderMoney(netLiability, assessed.currency),
          delta: renderMoney(collected.amount.negated(), assessed.currency),
          after: renderMoney(
            netLiability.minus(collected.amount),
            assessed.currency,
          ),
        }),
        tgaTrace: moneyTrace({
          traceRef: `${taxRef}:COLLECTION`,
          inputRefs: receiptRef === null ? [taxRef] : [taxRef, receiptRef],
          outputRef: tgaRef,
          before: renderMoney(cash, openingCash.currency),
          delta: renderMoney(collected.amount, openingCash.currency),
          after: renderMoney(after, openingCash.currency),
        }),
      }),
    );
    cash = after;
  }
  const cashAfterTaxCollections = renderMoney(cash, openingCash.currency);
  const commitments: FiscalBudgetCommitmentResult[] = [];
  for (const commitment of input.commitments) {
    if ('committedBefore' in commitment) {
      kernelInvalid(
        'Budget commitment cannot supply a caller-owned committed before amount',
      );
    }
    const budgetLineRef = stableReference(
      commitment.budgetLineRef,
      'budget line',
    );
    const state = budgetLineState.states.get(budgetLineRef);
    if (state === undefined) {
      kernelInvalid(
        'Budget commitment requires an authoritative budget-line snapshot',
      );
    }
    const commitmentRef = stableReference(
      commitment.commitmentRef,
      'budget commitment',
    );
    if (budgetLineState.commitmentRefs.has(commitmentRef)) {
      kernelInvalid('Budget commitment reference replays submitted lineage');
    }
    const predecessor =
      commitment.predecessorCommitmentRef === null
        ? null
        : stableReference(
            commitment.predecessorCommitmentRef,
            'budget commitment predecessor',
          );
    if (predecessor !== state.commitmentHeadRef) {
      kernelInvalid(
        'Budget commitment predecessor does not match submitted lineage',
      );
    }
    const newCommitment = nonNegativeMoney(
      commitment.newCommitment,
      'new budget commitment',
    );
    sameCurrency(
      state.currency,
      newCommitment.currency,
      'new budget commitment',
    );
    if (newCommitment.amount.isZero()) {
      kernelInvalid('New budget commitment must be positive');
    }
    const evidence = boundEvidence(
      commitment.evidence,
      lineage,
      'budget commitment evidence',
    );
    submittedEvidenceRefs.push(evidence.evidenceRef);
    const committedBefore = state.committed;
    const committedAfter = committedBefore.plus(newCommitment.amount);
    if (committedAfter.greaterThan(state.appropriation)) {
      kernelInvalid('Budget commitment cannot exceed appropriation');
    }
    commitments.push(
      Object.freeze({
        budgetLineRef,
        appropriation: renderMoney(state.appropriation, state.currency),
        committedBefore: renderMoney(committedBefore, state.currency),
        commitmentTrace: moneyTrace({
          traceRef: commitmentRef,
          inputRefs: [
            budgetLineRef,
            lineage.snapshotRef,
            commitmentRef,
            evidence.evidenceRef,
          ],
          outputRef: `${budgetLineRef}:COMMITMENT`,
          before: renderMoney(committedBefore, state.currency),
          delta: renderMoney(newCommitment.amount, state.currency),
          after: renderMoney(committedAfter, state.currency),
        }),
        remainingAppropriation: renderMoney(
          state.appropriation.minus(committedAfter),
          state.currency,
        ),
      }),
    );
    state.committed = committedAfter;
    state.commitmentHeadRef = commitmentRef;
  }
  assertUniqueReferences(
    submittedEvidenceRefs,
    'Fiscal submitted evidence reference',
  );
  let unpaidHigherPriority: string | null = null;
  const paymentResults: TreasuryPaymentResult[] = [];
  for (const payment of input.payments) {
    const disposition = insufficientCashDisposition(
      payment.insufficientCashDisposition,
    );
    const due = nonNegativeMoney(payment.duePayment, 'Treasury due payment');
    sameCurrency(openingCash.currency, due.currency, 'Treasury due payment');
    if (due.amount.isZero())
      kernelInvalid('Treasury due payment must be positive');
    const paymentRef = stableReference(payment.paymentRef, 'Treasury payment');
    const obligationRef = stableReference(
      payment.obligationRef,
      'Treasury payment obligation',
    );
    const evidence = boundEvidence(
      payment.evidence,
      lineage,
      'Treasury payment evidence',
    );
    submittedEvidenceRefs.push(evidence.evidenceRef);
    const before = cash;
    let paid = decimal('0', 'Treasury paid amount');
    let status: TreasuryPaymentResult['status'];
    let blockedByHigherPriorityPaymentRef: string | null = unpaidHigherPriority;
    if (unpaidHigherPriority !== null) {
      status = 'DELAYED';
    } else if (cash.greaterThanOrEqualTo(due.amount)) {
      paid = due.amount;
      status = 'PAID';
    } else {
      status = disposition;
      unpaidHigherPriority = paymentRef;
      blockedByHigherPriorityPaymentRef = null;
    }
    const after = cash.minus(paid);
    paymentResults.push(
      Object.freeze({
        paymentRef,
        obligationRef,
        priority: payment.priority,
        status,
        paid: renderMoney(paid, openingCash.currency),
        unpaid: renderMoney(due.amount.minus(paid), openingCash.currency),
        blockedByHigherPriorityPaymentRef,
        tgaTrace: moneyTrace({
          traceRef: `${paymentRef}:SETTLEMENT`,
          inputRefs: [paymentRef, obligationRef, evidence.evidenceRef, tgaRef],
          outputRef: tgaRef,
          before: renderMoney(before, openingCash.currency),
          delta: renderMoney(paid.negated(), openingCash.currency),
          after: renderMoney(after, openingCash.currency),
        }),
      }),
    );
    cash = after;
  }
  assertUniqueReferences(
    submittedEvidenceRefs,
    'Fiscal submitted evidence reference',
  );
  const frozenTaxCollections = Object.freeze(taxCollections);
  const frozenCommitments = Object.freeze(commitments);
  const frozenPaymentResults = Object.freeze(paymentResults);
  return Object.freeze({
    foundationStatus: HOUSEHOLD_FISCAL_FOUNDATION_STATUS,
    treasuryGeneralAccountRef: tgaRef,
    cashAfterTaxCollections,
    cashAfterPayments: renderMoney(cash, openingCash.currency),
    taxCollections: frozenTaxCollections,
    commitments: frozenCommitments,
    paymentResults: frozenPaymentResults,
    replayProof: replayProof({
      closure: 'FISCAL_TREASURY',
      lineage,
      evidenceRefs: submittedEvidenceRefs,
      traces: [
        ...frozenTaxCollections.flatMap((tax) => [
          tax.liabilityTrace,
          tax.receivableTrace,
          tax.tgaTrace,
        ]),
        ...frozenCommitments.map((commitment) => commitment.commitmentTrace),
        ...frozenPaymentResults.map((payment) => payment.tgaTrace),
      ],
    }),
  });
}
