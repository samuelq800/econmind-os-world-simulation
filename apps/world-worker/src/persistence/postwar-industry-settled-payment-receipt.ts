/** Fixed derivation of an EXISTING canonical payment. No new Command/Event,
 * payment, work, maintenance, ledger or purpose approval is created here. */
import { createHash } from 'node:crypto';
import {
  canonicalSerialize,
  bindAuthoritativeTransition,
  isValidatedProductionPosting,
  rebuildV08LedgersFromLineage,
  assertProductionFunding,
  selectSettledProductionFundingPayment,
  validateFinalReceiptForCommand,
  createFinalCommandReceipt,
  type OpeningSeed,
  type FinalCommandReceipt,
  type V08AuthoritativeLedgerTransition,
} from '@econmind/core';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import type { IndustryProductionCutoffRequest } from './industry-production-source-cutoff.js';
import type { SqlExecutor } from './sql-database.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(s: string): never {
  throw Error('INDUSTRY_SETTLED_PAYMENT:' + s);
}
/** These are complete canonical frames, not selected money legs. Callers with
 * a live DB view should use the same-executor entry below. Pure derivation is
 * useful for deterministic replay and never establishes DB admission. */
export function deriveIndustrySettledPaymentReceipt(
  input: Readonly<{
    seed: OpeningSeed;
    prior: readonly (V08AuthoritativeLedgerTransition & {
      readonly receipt: FinalCommandReceipt;
    })[];
    target: IndustryProductionCutoffRequest;
  }>,
) {
  const { target, prior, seed } = input,
    { command, transition, posting } = target;
  if (
    !isValidatedProductionPosting(posting) ||
    prior.length < 1 ||
    prior.length > 256
  )
    invalid('GENUINE_PRODUCTION_AND_BOUNDED_COMPLETE_PREFIX_REQUIRED');
  if (
    canonicalSerialize(
      bindAuthoritativeTransition({ command, transition }, sha),
    ) !== canonicalSerialize(posting.transitionBinding)
  )
    invalid('EXACT_TARGET_TRANSITION_REQUIRED');
  for (const frame of prior) {
    if (!frame.receipt || frame.receipt.outcome !== 'COMMITTED')
      invalid('ACTUAL_COMMITTED_RECEIPTS_REQUIRED');
    validateFinalReceiptForCommand({
      command: frame.command,
      transition: frame.transition,
      receipt: frame.receipt,
    });
    const expected = createFinalCommandReceipt({
      command: frame.command,
      transition: frame.transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: frame.command.simTime,
      recordedAtReal: frame.receipt.recordedAtReal,
    });
    if (canonicalSerialize(expected) !== canonicalSerialize(frame.receipt))
      invalid('EXACT_COMMITTED_RECEIPT_REQUIRED');
  }
  const last = prior[prior.length - 1]!,
    head = {
      worldVersion: last.transition.worldVersionAfter,
      eventSequence:
        last.transition.events[last.transition.events.length - 1]!.sequence,
    };
  if (
    seed.worldId !== command.worldId ||
    head.worldVersion !== target.expectedHead.worldVersion ||
    head.eventSequence !== target.expectedHead.eventSequence ||
    command.expectedWorldVersion !== head.worldVersion ||
    transition.worldVersionBefore !== head.worldVersion ||
    transition.events[0]!.sequence !==
      (BigInt(head.eventSequence) + 1n).toString()
  )
    invalid('EXACT_PRIOR_HEAD_REQUIRED');
  const op = posting.evidence.operating.payload;
  if (
    op.worldId !== command.worldId ||
    posting.evidence.output.countryId !== command.countryId ||
    op.worldVersion !== head.worldVersion ||
    op.fundingBatchId !== target.fundingBatchId ||
    op.fundingFingerprint !== target.fundingFingerprint ||
    op.costLegId !== target.costLegId
  )
    invalid('EXACT_SCOPE_AND_FUNDING_SELECTOR_REQUIRED');
  const matches = prior.flatMap((frame, index) =>
    frame.financialPostingBatches
      .filter(
        (b) =>
          b.batchId === op.fundingBatchId &&
          b.fingerprint === op.fundingFingerprint,
      )
      .map((batch) => ({ frame, index, batch })),
  );
  if (matches.length !== 1) invalid('ONE_ACTUAL_PRIOR_PAYMENT_REQUIRED');
  const { frame, index, batch } = matches[0]!;
  if (
    frame.command.simTime.ticks > command.simTime.ticks ||
    BigInt(frame.transition.worldVersionAfter) > BigInt(head.worldVersion)
  )
    invalid('FUTURE_PAYMENT_NOT_PRIOR_SETTLEMENT');
  // Rebuild at the real settlement and at current H: replenishment later cannot
  // turn an originally unfunded payment into a funded production cost.
  const settled = rebuildV08LedgersFromLineage({
    seed,
    transitions: prior.slice(0, index + 1),
    sha256Hex: sha,
  });
  const current = rebuildV08LedgersFromLineage({
    seed,
    transitions: prior,
    sha256Hex: sha,
  });
  assertProductionFunding(posting, [batch], settled.financial);
  assertProductionFunding(
    posting,
    prior.flatMap((f) => f.financialPostingBatches),
    current.financial,
  );
  const payment = selectSettledProductionFundingPayment(
      posting,
      batch,
      current.financial,
    ),
    expense = batch.legs.find((l) => l.legId === op.costLegId)!;
  const facts = Object.freeze({
    classification:
      'CORE_REPLAYED_SETTLED_PAYMENT_NOT_INDUSTRY_PURPOSE_OR_CURRENT_USE_AUTHORITY' as const,
    worldId: command.worldId,
    countryId: command.countryId,
    facilityId: op.facilityRef,
    operatorId: op.operatorId,
    targetCommand: Object.freeze({
      commandId: command.commandId,
      fingerprint: command.fingerprint,
    }),
    observedHead: Object.freeze(head),
    origin: Object.freeze({
      commandId: frame.command.commandId,
      commandFingerprint: frame.command.fingerprint,
      transitionId: frame.transition.transitionId,
      worldVersion: frame.transition.worldVersionAfter,
      eventIds: frame.transition.eventIds,
      simTime: frame.command.simTime.toCanonicalValue(),
      batchId: batch.batchId,
      batchFingerprint: batch.fingerprint,
    }),
    settlement: Object.freeze({
      amount: expense.amount.toCanonicalValue(),
      expenseLegId: expense.legId,
      expenseAccount: expense.account,
      paymentLegId: payment.legId,
      paymentAccount: payment.account,
    }),
    purposeQualification: 'NOT_ESTABLISHED_BY_PAYMENT' as const,
    factCanonicalPayload: canonicalSerialize(op),
  });
  return Object.freeze({
    ...facts,
    receiptRef:
      'INDUSTRY_PAYMENT_' + sha(canonicalSerialize(facts)).toUpperCase(),
  });
}
export type IndustrySettledPaymentReceipt = ReturnType<
  typeof deriveIndustrySettledPaymentReceipt
>;
/** Only a real live validated-lineage view supplies the DB-origin data. The
 * receipt remains a projection; the mandatory protected guard decides purpose. */
export function produceIndustrySettledPaymentReceiptFrom(
  tx: SqlExecutor,
  view: ValidatedCanonicalLineageView,
  target: IndustryProductionCutoffRequest,
): Readonly<IndustrySettledPaymentReceipt> {
  const data = readValidatedCanonicalLineageFrom(tx, view);
  if (
    data.worldId !== target.command.worldId ||
    data.headWorldVersion !== target.expectedHead.worldVersion ||
    data.headEventSequence !== target.expectedHead.eventSequence
  )
    invalid('LIVE_SAME_EXECUTOR_HEAD_REQUIRED');
  return deriveIndustrySettledPaymentReceipt({
    seed: data.seed,
    prior: data.transitions,
    target,
  });
}

export type IndustrySettledPaymentInput = Parameters<
  typeof deriveIndustrySettledPaymentReceipt
>[0];
/** Exact expected DB bytes/independent table metadata for the COMPLETE prefix.
 * SQL independently builds the same projection before returning its digest. */
export function industrySettledPaymentPrefixText(
  prior: IndustrySettledPaymentInput['prior'],
): string {
  const order = <T extends { readonly fingerprint: string }>(
    items: readonly T[],
  ) =>
    [...items].sort((a, b) =>
      a.fingerprint < b.fingerprint
        ? -1
        : a.fingerprint > b.fingerprint
          ? 1
          : 0,
    );
  const posting = (
    p:
      | IndustrySettledPaymentInput['prior'][number]['inventoryPostings'][number]
      | IndustrySettledPaymentInput['prior'][number]['financialPostingBatches'][number],
  ) => {
    const { fingerprint, ...intent } = p;
    return {
      intent: canonicalSerialize(intent),
      fingerprint,
      metadata: {
        worldId: p.worldId,
        causationCommandId: p.causationCommandId,
        worldVersionBefore: p.worldVersionBefore,
        worldVersionAfter: p.worldVersionAfter,
        simTime: p.simTime.toCanonicalValue(),
        causationEventIds: p.causationEventIds,
        transitionBinding: canonicalSerialize(p.transitionBinding),
        ...('batchId' in p
          ? { batchId: p.batchId, settlementCurrency: p.settlementCurrency }
          : { postingId: p.postingId, operation: p.operation }),
      },
    };
  };
  return canonicalSerialize(
    prior.map((f) => ({
      command: f.command,
      events: f.transition.events,
      receipt: f.receipt,
      inventoryPostings: order(f.inventoryPostings).map(posting),
      financialPostingBatches: order(f.financialPostingBatches).map(posting),
    })),
  );
}

declare const paymentPreparation: unique symbol;
export interface IndustrySettledPaymentDataPreparation {
  readonly [paymentPreparation]: true;
}
const preparedPayments = new WeakMap<
  object,
  { input: IndustrySettledPaymentInput; prefixText: string; targetText: string }
>();
function targetText(target: IndustryProductionCutoffRequest) {
  return canonicalSerialize({
    command: target.command,
    transition: target.transition,
    posting: target.posting,
    expectedHead: target.expectedHead,
    fundingBatchId: target.fundingBatchId,
    fundingFingerprint: target.fundingFingerprint,
    costLegId: target.costLegId,
  });
}
/** Immutable calculation data ONLY. No DB/admission/head/actor is cached here. */
export function prepareIndustrySettledPaymentData(
  input: IndustrySettledPaymentInput,
): IndustrySettledPaymentDataPreparation {
  deriveIndustrySettledPaymentReceipt(input);
  const target = Object.freeze({
      ...input.target,
      expectedHead: Object.freeze({ ...input.target.expectedHead }),
    }),
    prior = Object.freeze(
      input.prior.map((frame) =>
        Object.freeze({
          ...frame,
          inventoryPostings: Object.freeze([...frame.inventoryPostings]),
          financialPostingBatches: Object.freeze([
            ...frame.financialPostingBatches,
          ]),
        }),
      ),
    ),
    snapshot = Object.freeze({ seed: input.seed, prior, target });
  const token = Object.freeze({}) as IndustrySettledPaymentDataPreparation;
  preparedPayments.set(token, {
    input: snapshot,
    prefixText: industrySettledPaymentPrefixText(prior),
    targetText: targetText(target),
  });
  return token;
}
export function readPreparedIndustrySettledPaymentData(
  preparation: IndustrySettledPaymentDataPreparation,
  target: IndustryProductionCutoffRequest,
): IndustrySettledPaymentInput {
  const prepared = preparedPayments.get(preparation);
  if (
    !prepared ||
    prepared.targetText !== targetText(target) ||
    prepared.prefixText !==
      industrySettledPaymentPrefixText(prepared.input.prior)
  )
    invalid('GENUINE_UNCHANGED_PAYMENT_DATA_PREPARATION_REQUIRED');
  return prepared.input;
}

export function isIndustrySettledPaymentDataPreparation(
  value: unknown,
): value is IndustrySettledPaymentDataPreparation {
  return (
    value !== null && typeof value === 'object' && preparedPayments.has(value)
  );
}
export function readIndustrySettledPaymentDataForCommand(
  preparation: IndustrySettledPaymentDataPreparation,
  command: IndustryProductionCutoffRequest['command'],
): IndustrySettledPaymentInput {
  const row = preparedPayments.get(preparation);
  if (
    !row ||
    canonicalSerialize(row.input.target.command) !== canonicalSerialize(command)
  )
    invalid('EXACT_PREPARED_COMMAND_REQUIRED');
  return readPreparedIndustrySettledPaymentData(preparation, row.input.target);
}
