/** Conditional first-day deposit-payroll source reader. No source admission,
 * completed-work issuer, automatic permission, lease, SQL write or Clock is
 * installed. A real opening reservation remains NOT_ACCRUED until a separate
 * committed completed-day recognition exists in the held canonical lineage. */
import { createHash } from 'node:crypto';
import {
  DOMAIN_ERROR_CODES,
  DomainError,
  canonicalSerialize,
  Money,
  rebuildV08LedgersFromLineage,
  type CanonicalCommand,
  type OpeningSeed,
  type FinancialLedgerState,
} from '@econmind/core';
import {
  POSTWAR_OPENING_PAYROLL_COMMAND,
  POSTWAR_PAYROLL_RECOGNITION_COMMAND,
  POSTWAR_OPENING_PAYROLL_POLICY,
  preparePostwarOpeningPayroll,
  replayPostwarOpeningPayroll,
  validatePostwarOpeningPayrollRecognition,
  type OpeningPayrollSource,
  type OpeningPayrollRecognition,
  type OpeningPayrollResult,
} from '@econmind/core/postwar-opening-payroll';
import { readPostwarOperatingGenesisFromSeed } from '../preparation/postwar-operating-genesis-adoption.js';
import { readPostwarLiquidFundingAccountsFromSeed } from '../preparation/postwar-financial-genesis.js';
import {
  readValidatedCanonicalLineageFrom,
  type ValidatedCanonicalLineageView,
} from './validated-canonical-lineage.js';
import type { SqlExecutor } from './sql-database.js';

export const POSTWAR_PAYROLL_POLICY_BYTES_SHA256 =
  '626646ece128f7def06ccaf755675e5cd5464928d84370137ff50a02853cf835';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `POSTWAR_OPENING_PAYROLL_SOURCE:${reason}`,
  );
}
function same(a: unknown, b: unknown, reason: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(reason);
}

/** Fixed actual seed interpreter, not an accepted caller payroll DTO. This
 * opening data cannot attest employment after H0 or completed work/accrual. */
export function derivePostwarOpeningPayrollSourceFromSeed(
  seed: OpeningSeed,
  obligationId: string,
): Readonly<OpeningPayrollSource> {
  const view = readPostwarOperatingGenesisFromSeed(seed);
  const document = view.socialEmployment;
  if (!document) invalid('COMPLETE_E03_ORIGINALS_REQUIRED');
  const obligation = view.facts.obligations.find(
    (o) => o.obligationId === obligationId,
  );
  const position = view.facts.positions.find(
    (p) => p.wageObligationId === obligationId,
  );
  const wage = document.inputs.labour.positions.find(
    (p) => p.positionId === position?.positionId,
  );
  const payroll = document.inputs.positionFunding.find(
    (p) => p.positionId === position?.positionId,
  );
  if (
    !obligation ||
    !position ||
    !wage ||
    !payroll ||
    obligation.kind !== 'WAGE' ||
    obligation.state !== 'OPEN_UNPAID' ||
    obligation.basis !== 'FIRST_DAY_AGGREGATE_RESERVATION_NOT_ACCRUED' ||
    obligation.accruedAtOpening !== '0' ||
    obligation.dueSimDay !== '1' ||
    obligation.periodDays !== '1' ||
    wage.employerRole !== 'OP' ||
    wage.wagePeriod !== 'SIM_YEAR' ||
    position.filledCount === '0'
  )
    invalid('SUPPORTED_OPENING_OP_OBLIGATION_REQUIRED');
  const claims = readPostwarLiquidFundingAccountsFromSeed(seed);
  const payer = claims.find(
    (a) =>
      a.kind === 'OPERATOR_BANK_DEPOSIT' && a.accountId === payroll.accountRef,
  );
  const payee = claims.find(
    (a) =>
      a.kind === 'HOUSEHOLD_BANK_DEPOSIT' && a.countryId === payroll.countryId,
  );
  if (
    !payer ||
    !payee ||
    payer.issuerEntityId !== payee.issuerEntityId ||
    payer.ownerId !== obligation.payerEntityId ||
    payee.ownerId !== obligation.payeeEntityId ||
    payer.currency !== obligation.currency ||
    payee.currency !== obligation.currency
  )
    invalid('EXACT_SAME_BANK_OP_HOUSEHOLD_CLAIMS_REQUIRED');
  const financial = rebuildV08LedgersFromLineage({
    seed,
    sha256Hex: sha,
  }).financial;
  const account = (id: string) => {
    const p = financial.positions.find((p) => p.account.accountId === id);
    if (!p) invalid('ORIGINAL_ACCOUNT_MISSING');
    return p.account;
  };
  return Object.freeze({
    worldId: seed.worldId,
    countryId: payroll.countryId,
    seedFingerprint: seed.fingerprint,
    sourceRevision: document.sourceRevision,
    obligationId,
    positionId: position.positionId,
    coveredCount: position.filledCount,
    annualWage: wage.wageAmount,
    wageVersion: wage.wageVersion,
    currency: obligation.currency,
    reservedAmount: payroll.amount,
    payerEntityId: payer.ownerId,
    employerRole: 'OP' as const,
    payeeEntityId: payee.ownerId,
    bankEntityId: payer.issuerEntityId,
    payerAsset: account(payer.accountId),
    payerLiability: account(payer.counterpartAccountId),
    payeeAsset: account(payee.accountId),
    payeeLiability: account(payee.counterpartAccountId),
  });
}

export interface PostwarOpeningPayrollPrepareRequest {
  readonly executor: SqlExecutor;
  readonly lineage: ValidatedCanonicalLineageView;
  readonly command: CanonicalCommand;
  readonly observedAtReal: string;
}
export interface PostwarOpeningPayrollConsumer {
  readonly classification: 'CONDITIONAL_SOURCE_CONSUMER_NOT_ADMISSION_OR_EXECUTION_AUTHORITY';
  prepareFrom(
    input: PostwarOpeningPayrollPrepareRequest,
  ): Readonly<OpeningPayrollResult>;
}
/** Only the existing reader's active same-executor lexical lineage token is
 * accepted. It still supplies no source-lock/permission/recognition authority;
 * this consumer is intentionally not registered with Atomic or durable intake. */
export function createPostwarOpeningPayrollConsumer(input: {
  readonly policyBytes: string;
}): Readonly<PostwarOpeningPayrollConsumer> {
  if (sha(input.policyBytes) !== POSTWAR_PAYROLL_POLICY_BYTES_SHA256)
    invalid('FIXED_POLICY_BYTES_REQUIRED');
  same(
    JSON.parse(input.policyBytes),
    POSTWAR_OPENING_PAYROLL_POLICY,
    'POLICY_CONTRACT_DIFFERS',
  );
  return Object.freeze({
    classification:
      'CONDITIONAL_SOURCE_CONSUMER_NOT_ADMISSION_OR_EXECUTION_AUTHORITY' as const,
    prepareFrom(
      request: PostwarOpeningPayrollPrepareRequest,
    ): Readonly<OpeningPayrollResult> {
      const data = readValidatedCanonicalLineageFrom(
        request.executor,
        request.lineage,
      );
      if (
        data.worldId !== request.command.worldId ||
        data.headWorldVersion !== request.command.expectedWorldVersion ||
        data.ledgers.worldVersion !== data.headWorldVersion
      )
        invalid('CURRENT_CANONICAL_HEAD_REQUIRED');
      if (data.transitions.length > 256)
        invalid('BOUNDED_PREFIX_CAPACITY_EXCEEDED');
      const intent: unknown = JSON.parse(request.command.canonicalPayload);
      if (
        !intent ||
        typeof intent !== 'object' ||
        Array.isArray(intent) ||
        !('obligationId' in intent) ||
        typeof intent.obligationId !== 'string'
      )
        invalid('EXACT_PAYMENT_INTENT_REQUIRED');
      if (
        !data.transitions.some(
          (step) =>
            step.command.commandType === POSTWAR_PAYROLL_RECOGNITION_COMMAND,
        )
      )
        invalid('COMPLETED_DAY_RECOGNITION_MISSING');
      const source = derivePostwarOpeningPayrollSourceFromSeed(
        data.seed,
        intent.obligationId,
      );
      const recognitions = new Map<string, OpeningPayrollRecognition>();
      const prefix: (typeof data.transitions)[number][] = [];
      let financial: Readonly<FinancialLedgerState> =
        rebuildV08LedgersFromLineage({
          seed: data.seed,
          sha256Hex: sha,
        }).financial;
      for (const step of data.transitions) {
        if (step.receipt.outcome !== 'COMMITTED')
          invalid('COMMITTED_CANONICAL_RECEIPT_REQUIRED');
        const body = JSON.parse(step.command.canonicalPayload) as Record<
          string,
          unknown
        >;
        if (typeof body.obligationId !== 'string')
          invalid('UNKNOWN_PREFIX_OBLIGATION');
        const original = derivePostwarOpeningPayrollSourceFromSeed(
          data.seed,
          body.obligationId,
        );
        if (step.command.commandType === POSTWAR_PAYROLL_RECOGNITION_COMMAND) {
          if (recognitions.has(original.obligationId))
            invalid('DUPLICATE_RECOGNITION_ORIGINAL');
          const evidence: OpeningPayrollRecognition = {
            evidenceClass: 'DURABLE_CANONICAL_RECOGNITION_NOT_AUTHORITY',
            step,
          };
          validatePostwarOpeningPayrollRecognition(
            {
              source: original,
              recognition: evidence,
              command: request.command,
            },
            sha,
          );
          recognitions.set(original.obligationId, evidence);
        } else if (
          step.command.commandType === POSTWAR_OPENING_PAYROLL_COMMAND
        ) {
          const evidence = recognitions.get(original.obligationId);
          if (!evidence) invalid('COMPLETED_DAY_RECOGNITION_MISSING');
          replayPostwarOpeningPayroll({
            command: step.command,
            source: original,
            recognition: evidence,
            financial,
            step,
            sha256Hex: sha,
          });
        } else invalid('UNSUPPORTED_COMPLETE_PREFIX_FAMILY');
        prefix.push(step);
        financial = rebuildV08LedgersFromLineage({
          seed: data.seed,
          transitions: prefix,
          sha256Hex: sha,
        }).financial;
      }
      same(financial, data.ledgers.financial, 'ACTUAL_LEDGER_REPLAY_DIFFERS');
      const evidence = recognitions.get(source.obligationId);
      // In particular, source OPEN_UNPAID/dueSimDay1 + a later command time
      // never mints completion or accrual from the NOT_ACCRUED opening row.
      if (!evidence) invalid('COMPLETED_DAY_RECOGNITION_MISSING');
      const document = readPostwarOperatingGenesisFromSeed(
        data.seed,
      ).socialEmployment!;
      const initial = document.inputs.fundingAccounts.find(
        (a) => a.accountRef === source.payerAsset.accountId,
      );
      if (!initial) invalid('SHARED_OPENING_RESERVATIONS_REQUIRED');
      let paid = Money.from('0', source.currency);
      for (const step of prefix)
        if (step.command.commandType === POSTWAR_OPENING_PAYROLL_COMMAND) {
          for (const batch of step.financialPostingBatches)
            for (const leg of batch.legs)
              if (
                leg.account.accountId === source.payerAsset.accountId &&
                leg.direction === 'CREDIT'
              )
                paid = paid.add(leg.amount);
        }
      const retained = Money.from(
        initial.reservedAmount,
        source.currency,
      ).subtract(paid);
      const actual = financial.positions.find(
        (p) => p.account.accountId === source.payerAsset.accountId,
      )!;
      if (
        retained.amount.isNegative() ||
        actual.netDebitBalance.amount.lessThan(retained.amount)
      )
        invalid('OTHER_OBLIGATIONS_NOT_BACKED');
      return preparePostwarOpeningPayroll({
        command: request.command,
        source,
        recognition: evidence,
        financial,
        eventSequence: (BigInt(data.headEventSequence) + 1n).toString(),
        observedAtReal: request.observedAtReal,
        sha256Hex: sha,
      });
    },
  });
}
