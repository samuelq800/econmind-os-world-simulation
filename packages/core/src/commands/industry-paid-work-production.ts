/** Existing paid WORK -> conditional production cost DATA only. Source,
 * actor, lease, OP rights, actual deliveries and production writes stay Worker-owned. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import { Money } from '../numeric/money.js';
import {
  createFinancialPostingBatch,
  type FinancialPostingBatch,
} from '../finance/financial-ledger.js';
import { isSettledOriginalProductionDeposit } from '../finance/production-deposit-funding.js';
import {
  readIndustryFirstDayWorkState,
  readIndustryCompletedWork,
} from '../industry/industry-first-day-work.js';
import {
  readFinanceNativeBudgetMixedPrefix,
  type FinanceNativeBudgetMixedPrefixEvidence,
  type FinanceNativeBudgetCanonicalFrame,
} from './finance-budget-native.js';
import {
  createFinalCommandReceipt,
  bindAuthoritativeTransition,
} from './receipt.js';
import {
  INDUSTRY_OPERATING_WAGE_COMMAND,
  INDUSTRY_OPERATING_WAGE_EVENT,
} from './industry-operating-wage-payment.js';
import type { Sha256Hex } from './command.js';
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_PAID_WORK_PRODUCTION:' + s,
  );
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    invalid('EXACT_OBJECT_REQUIRED');
  return v as Record<string, unknown>;
}
function array(v: unknown): readonly unknown[] {
  if (!Array.isArray(v)) invalid('EXACT_ARRAY_REQUIRED');
  return v;
}
function text(v: unknown): string {
  if (typeof v !== 'string' || !v) invalid('EXACT_TEXT_REQUIRED');
  return v;
}
function fingerprint(v: unknown): `sha256:${string}` {
  const raw = text(v);
  if (!/^sha256:[a-f0-9]{64}$/u.test(raw))
    invalid('EXACT_CANONICAL_WORK_FINGERPRINT_REQUIRED');
  return `sha256:${raw.slice(7)}`;
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
export interface IndustryPaidWorkProductionInput {
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly head: Readonly<{ worldVersion: string; eventSequence: string }>;
  readonly mixedPrefixEvidence: FinanceNativeBudgetMixedPrefixEvidence;
  /** Last page binds the private cumulative Core fold; never an all-history array. */
  readonly lastPageFrames: readonly FinanceNativeBudgetCanonicalFrame[];
  readonly paymentFrame: FinanceNativeBudgetCanonicalFrame;
  readonly target: Readonly<{
    countryId: string;
    facilityId: string;
    runId: string;
    workEventFingerprint: string;
  }>;
}
function derive(input: IndustryPaidWorkProductionInput, sha: Sha256Hex) {
  const result = readFinanceNativeBudgetMixedPrefix(
      input.mixedPrefixEvidence,
      input.worldId,
      input.lastPageFrames,
      sha,
    ),
    financial = result.financialState,
    inventory = result.inventoryState,
    workState = result.industryWorkState,
    wageState = result.industryWageState;
  if (
    !financial ||
    !inventory ||
    !workState ||
    !wageState ||
    result.budgetState.worldVersion !== input.head.worldVersion ||
    result.budgetState.eventSequence !== input.head.eventSequence
  )
    invalid('GENUINE_CURRENT_COMPLETE_WORK_WAGE_PREFIX_REQUIRED');
  const known = readIndustryFirstDayWorkState(workState),
    completed = known.completedWorks.filter((w) =>
      readIndustryCompletedWork(w).frame.events.some(
        (e) => e.fingerprint === input.target.workEventFingerprint,
      ),
    );
  if (completed.length !== 1)
    invalid('ACTUAL_DISTINCT_COMPLETED_WORK_REQUIRED');
  const work = completed[0]!,
    w = readIndustryCompletedWork(work),
    d = w.data;
  const runWorks = known.completedWorks.filter((v) => {
    const data = readIndustryCompletedWork(v).data;
    return (
      data.worldId === d.worldId &&
      data.countryId === d.countryId &&
      data.operatorId === d.operatorId &&
      data.facilityId === d.facilityId &&
      data.runId === d.runId &&
      data.seedFingerprint === d.seedFingerprint &&
      data.admissionRef === d.admissionRef
    );
  });
  const runWorkFingerprints = new Set(
    runWorks.map(
      (v) => readIndustryCompletedWork(v).frame.events[0]!.fingerprint,
    ),
  );
  if (
    d.worldId !== input.worldId ||
    d.seedFingerprint !== input.seedFingerprint ||
    d.countryId !== input.target.countryId ||
    d.facilityId !== input.target.facilityId ||
    d.runId !== input.target.runId
  )
    invalid('EXACT_CURRENT_WORK_RUN_AND_SEED_REQUIRED');
  const run = known.runs.filter(
    (r) =>
      r.terms.facilityId === d.facilityId &&
      r.terms.runId === d.runId &&
      r.frame.command.countryId === d.countryId,
  );
  if (
    run.length !== 1 ||
    !wageState.paidWork.includes(input.target.workEventFingerprint)
  )
    invalid('ACTUAL_SCHEDULE_AND_PAID_WORK_REQUIRED');
  const frame = input.paymentFrame,
    event = frame.events[0];
  if (
    frame.command.worldId !== input.worldId ||
    frame.command.countryId !== d.countryId ||
    frame.command.commandType !== INDUSTRY_OPERATING_WAGE_COMMAND ||
    frame.events.length !== 1 ||
    !event ||
    event.eventType !== INDUSTRY_OPERATING_WAGE_EVENT ||
    event.correctsEventId !== null ||
    frame.financialPostingBatches.length !== 1 ||
    frame.inventoryPostings.length !== 0 ||
    !same(frame.events, frame.transition.events) ||
    BigInt(frame.transition.worldVersionAfter) >
      BigInt(input.head.worldVersion) ||
    BigInt(event.sequence) > BigInt(input.head.eventSequence)
  )
    invalid('EXACT_ACTUAL_PRIOR_WAGE_FRAME_REQUIRED');
  bindAuthoritativeTransition(
    { command: frame.command, transition: frame.transition },
    sha,
  );
  const receipt = createFinalCommandReceipt({
    command: frame.command,
    transition: frame.transition,
    outcome: 'COMMITTED',
    reasonCode: null,
    simTime: frame.command.simTime,
    recordedAtReal: frame.receipt.recordedAtReal,
  });
  if (!same(receipt, frame.receipt))
    invalid('EXACT_COMMITTED_PAYMENT_RECEIPT_REQUIRED');
  const body = object(JSON.parse(event.canonicalPayload)),
    source = object(body.source);
  if (
    body.schemaVersion !== 'industry-operating-wage-paid-v1' ||
    body.workEventFingerprint !== input.target.workEventFingerprint ||
    body.workEventId !== w.frame.events[0]!.eventId ||
    source.worldId !== d.worldId ||
    source.countryId !== d.countryId ||
    source.facilityId !== d.facilityId ||
    source.operatorId !== d.operatorId ||
    source.runId !== d.runId ||
    source.seedFingerprint !== d.seedFingerprint ||
    source.admissionRef !== d.admissionRef
  )
    invalid('EXACT_ACTUAL_WAGE_WORK_SOURCE_REQUIRED');
  const batch = frame.financialPostingBatches[0] as FinancialPostingBatch;
  const rebuilt = createFinancialPostingBatch(
    {
      ...batch,
      command: frame.command,
      transition: frame.transition,
      legs: batch.legs,
    },
    sha,
  );
  if (
    !same(rebuilt, batch) ||
    financial.appliedBatches.filter(
      (b) =>
        b.batchId === rebuilt.batchId && b.fingerprint === rebuilt.fingerprint,
    ).length !== 1
  )
    invalid('ACTUAL_BATCH_NOT_IN_GENUINE_CURRENT_FINANCIAL_LINEAGE');
  const amount = Money.from(text(body.paidAmount), text(body.currency));
  if (
    !amount.amount.isPositive() ||
    amount.toCanonicalValue().amount !== body.paidAmount ||
    batch.settlementCurrency !== amount.currency
  )
    invalid('POSITIVE_EXACT_ACTUAL_PAID_COST_REQUIRED');
  const expenses = batch.legs.filter(
      (l) =>
        l.account.ownerId === d.operatorId &&
        l.account.accountClass === 'EXPENSE' &&
        l.direction === 'DEBIT',
    ),
    payments = batch.legs.filter(
      (l) =>
        l.account.ownerId === d.operatorId &&
        l.direction === 'CREDIT' &&
        l.account.accountClass === 'ASSET',
    );
  if (
    expenses.length !== 1 ||
    payments.length !== 1 ||
    !expenses[0]!.amount.amount.equals(amount.amount) ||
    !payments[0]!.amount.amount.equals(amount.amount) ||
    !isSettledOriginalProductionDeposit({
      financial,
      batch,
      payment: payments[0]!,
      expense: expenses[0]!,
    })
  )
    invalid('EXACT_SETTLED_OP_EXPENSE_DEPOSIT_AND_MIRROR_REQUIRED');
  let n = 0n,
    den = 1n;
  for (const recipient of array(body.recipientSettlements))
    for (const raw of array(object(recipient).settledWorkLiabilities)) {
      const origin = object(raw),
        r = object(origin.amount),
        a = text(r.numerator),
        b = text(r.denominator);
      if (
        origin.runId !== d.runId ||
        origin.facilityId !== d.facilityId ||
        !runWorkFingerprints.has(fingerprint(origin.workEventFingerprint)) ||
        !same(origin.maximumExpense, run[0]!.terms.maximumExpense)
      )
        invalid('MIXED_RUN_OR_WORK_CARRY_CANNOT_BECOME_THIS_RUN_COST');
      if (!/^(?:0|[1-9]\d*)$/u.test(a) || !/^[1-9]\d*$/u.test(b))
        invalid('EXACT_PAID_LIABILITY_RATIONAL_REQUIRED');
      n = n * BigInt(b) + BigInt(a) * den;
      den *= BigInt(b);
    }
  const raw = amount.toCanonicalValue().amount,
    [integer, fraction = ''] = raw.split('.'),
    paidN = BigInt(integer! + fraction),
    paidD = 10n ** BigInt(fraction.length);
  if (n * paidD !== paidN * den)
    invalid('THIS_WORK_PAID_ALLOCATION_DIFFERS_FROM_ACTUAL_EXPENSE');
  const runPaid = wageState.runPayments.filter(
    (v) =>
      v.countryId === d.countryId &&
      v.operatorId === d.operatorId &&
      v.facilityId === d.facilityId &&
      v.runId === d.runId &&
      v.currency === amount.currency,
  );
  if (
    runPaid.length !== 1 ||
    BigInt(runPaid[0]!.amount.numerator) * paidD !==
      paidN * BigInt(runPaid[0]!.amount.denominator)
  )
    invalid('MULTIPLE_PAYMENT_BATCH_RUN_COST_COMPOSITION_REQUIRED');
  return Object.freeze({
    classification:
      'CORE_VERIFIED_PAID_WORK_COST_NOT_DELIVERY_OR_OPERATING_AUTHORITY' as const,
    worldId: input.worldId,
    seedFingerprint: input.seedFingerprint,
    head: Object.freeze({ ...input.head }),
    work,
    workData: d,
    completedRunWorks: Object.freeze(runWorks),
    run: run[0]!,
    financial,
    inventory,
    paymentFrame: frame,
    paymentBatch: rebuilt,
    expenseLegId: expenses[0]!.legId,
    paymentLegId: payments[0]!.legId,
    paidAmount: amount.toCanonicalValue(),
    unpaidWageLiabilities: wageState.unpaidWageLiabilities.filter(
      (v) => v.countryId === d.countryId && v.operatorId === d.operatorId,
    ),
    purpose: 'ACTUAL_SAME_RUN_WORK_WAGE_COST_ONLY' as const,
  });
}
declare const paidWorkProduction: unique symbol;
export interface IndustryPaidWorkProductionPreparation {
  readonly [paidWorkProduction]: true;
}
const preparations = new WeakMap<
  object,
  {
    readonly data: Readonly<ReturnType<typeof derive>>;
    readonly paymentText: string;
  }
>();
export function prepareIndustryPaidWorkProduction(
  input: IndustryPaidWorkProductionInput,
  sha: Sha256Hex,
): IndustryPaidWorkProductionPreparation {
  const data = derive(input, sha),
    token = Object.freeze({}) as IndustryPaidWorkProductionPreparation;
  preparations.set(token, {
    data,
    paymentText: canonicalSerialize(data.paymentFrame),
  });
  return token;
}
export function readIndustryPaidWorkProduction(
  preparation: IndustryPaidWorkProductionPreparation,
): Readonly<ReturnType<typeof derive>> {
  const row = preparations.get(preparation);
  if (!row) invalid('GENUINE_LIVE_PAID_WORK_PREPARATION_REQUIRED');
  if (canonicalSerialize(row.data.paymentFrame) !== row.paymentText)
    invalid('PREPARED_ACTUAL_PAYMENT_FRAME_CHANGED');
  return row.data;
}
export function retireIndustryPaidWorkProduction(
  preparation: IndustryPaidWorkProductionPreparation,
): void {
  preparations.delete(preparation);
}
