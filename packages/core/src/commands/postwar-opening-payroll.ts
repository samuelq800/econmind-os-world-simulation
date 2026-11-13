/** Conditional, unregistered first-day OP payroll mechanism. Canonical
 * recognition data is not an admission/permission or a work-completion issuer.
 * Opening reservations, employment and elapsed time cannot issue recognition. */
import {
  canonicalSerialize,
  canonicalHashInput,
} from '../serialization/canonical.js';
import { Money } from '../numeric/money.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import { SIMULATION_TICKS_PER_DAY } from '../time/simulation-clock.js';
import {
  createFinancialAccount,
  createFinancialPostingBatch,
  applyFinancialPostingBatch,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  type FinancialAccount,
  type FinancialLedgerState,
} from '../finance/financial-ledger.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import {
  financialPostingBatchId,
  financialPostingLegId,
  financialAccountId,
  worldId,
  countryId,
  legalEntityId,
} from '../ids.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
  type AuthoritativeEvent,
} from '../events/event.js';
import {
  validateCanonicalCommand,
  canonicalSha256,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  createAuthoritativeTransition,
  bindAuthoritativeTransition,
} from './receipt.js';
import type { V08AuthoritativeLedgerTransition } from '../opening/opening-seed.js';

export const POSTWAR_OPENING_PAYROLL_COMMAND =
  'POSTWAR_OPENING_OP_PAYROLL_SETTLE_V1';
export const POSTWAR_OPENING_PAYROLL_EVENT =
  'POSTWAR_OPENING_OP_PAYROLL_SETTLED_V1';
/** Recognition producer/authority is deliberately NOT implemented by payment. */
export const POSTWAR_PAYROLL_RECOGNITION_COMMAND =
  'POSTWAR_COMPLETED_PAYROLL_DAY_RECOGNIZE_V1';
export const POSTWAR_PAYROLL_RECOGNITION_EVENT =
  'POSTWAR_COMPLETED_PAYROLL_DAY_RECOGNIZED_V1';
export const POSTWAR_OPENING_PAYROLL_POLICY = Object.freeze({
  version: 'POSTWAR_OPENING_OP_PAYROLL_20261028_V1',
  classification: 'GENERATED_POLICY',
  authorizationReference: 'Sentinel_a619bdbe25588191aa05709db76c7567',
  sourceRule: 'MASTER_U1263_DAILY_ACCRUED_PAID_ACCORDING_TO_PAYROLL_SCHEDULE',
  scope: 'FIRST_COMPLETED_SIM_DAY_OPENING_OP_POSITIONS_SAME_COMMERCIAL_BANK',
  paymentInstrument: 'LC_BANK_DEPOSIT_CLAIM_NOT_CASH',
  simulationDaysPerYear: '360',
  depositQuantumDecimalPlaces: '6',
  quantization:
    'FLOOR_AGGREGATE_PAYMENT_RETAIN_EXACT_UNPAID_RATIONAL_REMAINDER',
  reservationRelease: 'NO_RELEASE_BEYOND_ACTUAL_PAYMENT',
  recognition:
    'REQUIRE_DISTINCT_COMMITTED_COMPLETED_DAY_RECOGNITION_NOT_TIME_OR_FILLED_COUNT',
  accounting:
    'SIX_LEGS_DEPOSIT_CLAIM_MIRRORS_AND_EXPLICIT_GENERATED_WAGE_EXPENSE_REVENUE',
  taxes: 'GROSS_WAGE_ONLY_NO_TAX_RATE_OR_WITHHOLDING_INFERRED',
});
export interface OpeningPayrollSource {
  readonly worldId: string;
  readonly countryId: string;
  readonly seedFingerprint: string;
  readonly sourceRevision: string;
  readonly obligationId: string;
  readonly positionId: string;
  readonly coveredCount: string;
  readonly annualWage: string;
  readonly wageVersion: string;
  readonly currency: string;
  readonly reservedAmount: string;
  readonly payerEntityId: string;
  readonly employerRole: 'OP';
  readonly payeeEntityId: string;
  readonly bankEntityId: string;
  readonly payerAsset: Readonly<FinancialAccount>;
  readonly payerLiability: Readonly<FinancialAccount>;
  readonly payeeAsset: Readonly<FinancialAccount>;
  readonly payeeLiability: Readonly<FinancialAccount>;
}
export interface OpeningPayrollRecognition {
  readonly evidenceClass:
    'TEST_ONLY' | 'DURABLE_CANONICAL_RECOGNITION_NOT_AUTHORITY';
  readonly step: V08AuthoritativeLedgerTransition;
}
export interface OpeningPayrollResult {
  readonly classification: 'CONDITIONAL_PAYROLL_DATA_NOT_COMMIT_AUTHORITY';
  readonly evidenceClass: OpeningPayrollRecognition['evidenceClass'];
  readonly step: V08AuthoritativeLedgerTransition;
  readonly financial: Readonly<FinancialLedgerState>;
  readonly paidDepositClaimAmount: string;
  readonly exactEarned: Readonly<{ numerator: string; denominator: string }>;
  readonly unpaidRemainder: Readonly<{
    numerator: string;
    denominator: string;
  }>;
  readonly obligationState: 'SETTLED' | 'PARTIALLY_PAID_EXACT_REMAINDER_OPEN';
}
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    `POSTWAR_OPENING_PAYROLL:${reason}`,
  );
}
function same(a: unknown, b: unknown, reason: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(reason);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function uint(s: string): bigint {
  if (typeof s !== 'string' || !/^(0|[1-9]\d*)$/u.test(s))
    invalid('CANONICAL_INTEGER_REQUIRED');
  return BigInt(s);
}
function ratio(n: bigint, d: bigint) {
  if (d <= 0n) invalid('POSITIVE_DENOMINATOR_REQUIRED');
  let a = n,
    b = d;
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return Object.freeze({
    numerator: (n / a).toString(),
    denominator: (d / a).toString(),
  });
}
function value(n: bigint, currency: string): string {
  return canonicalDecimal(
    Money.from(
      `${n / 1000000n}.${(n % 1000000n).toString().padStart(6, '0')}`,
      currency,
    ).amount,
  );
}
function earned(source: OpeningPayrollSource) {
  const amount = Money.from(source.annualWage, source.currency);
  if (
    !amount.amount.isPositive() ||
    canonicalDecimal(amount.amount) !== source.annualWage
  )
    invalid('POSITIVE_CANONICAL_WAGE_REQUIRED');
  const [whole, fraction = ''] = source.annualWage.split('.');
  if (fraction.length > 6 || uint(source.coveredCount) === 0n)
    invalid('OPENING_SIX_DECIMAL_WAGE_AND_FILLED_COHORT_REQUIRED');
  const n = BigInt(whole! + fraction) * uint(source.coveredCount);
  const d = 360n * 10n ** BigInt(fraction.length);
  const micros = (n * 1000000n) / d;
  if (micros === 0n) invalid('NO_POSITIVE_REPRESENTABLE_DEPOSIT_PAYMENT');
  return {
    amount: value(micros, source.currency),
    exact: ratio(n, d),
    remainder: ratio(n * 1000000n - micros * d, d * 1000000n),
  };
}
function sourceAccounts(
  source: OpeningPayrollSource,
  financial: FinancialLedgerState,
) {
  if (
    source.employerRole !== 'OP' ||
    !/^sha256:[a-f0-9]{64}$/u.test(source.seedFingerprint) ||
    !/^POSTWAR_E03_[a-f0-9]{64}$/u.test(source.sourceRevision)
  )
    invalid('EXACT_OPENING_OP_SOURCE_REQUIRED');
  if (
    !isAuthoritativeFinancialLedgerState(financial) ||
    financial.worldId !== source.worldId
  )
    invalid('ACTUAL_FINANCIAL_LEDGER_REQUIRED');
  if (source.payerEntityId === source.payeeEntityId)
    invalid('DISTINCT_EMPLOYER_AND_HOUSEHOLDS_REQUIRED');
  for (const [asset, liability, owner] of [
    [source.payerAsset, source.payerLiability, source.payerEntityId],
    [source.payeeAsset, source.payeeLiability, source.payeeEntityId],
  ] as const) {
    if (
      asset.accountClass !== 'ASSET' ||
      liability.accountClass !== 'LIABILITY' ||
      asset.ownerId !== owner ||
      liability.ownerId !== source.bankEntityId ||
      asset.counterpartyEntityId !== source.bankEntityId ||
      liability.counterpartyEntityId !== owner ||
      !asset.claimId ||
      asset.claimId !== liability.claimId
    )
      invalid('EXACT_SAME_BANK_DEPOSIT_CLAIM_ROLES_REQUIRED');
    for (const account of [asset, liability]) {
      if (
        account.worldId !== source.worldId ||
        account.countryId !== source.countryId ||
        account.currency !== source.currency
      )
        invalid('ACCOUNT_SCOPE_MISMATCH');
      const actual = financial.positions.find(
        (p) => p.account.accountId === account.accountId,
      );
      if (!actual) invalid('SOURCE_ACCOUNT_NOT_IN_ACTUAL_LEDGER');
      same(actual.account, account, 'SOURCE_ACCOUNT_IDENTITY_DIFFERS');
    }
    const a = financial.positions.find(
      (p) => p.account.accountId === asset.accountId,
    )!;
    const l = financial.positions.find(
      (p) => p.account.accountId === liability.accountId,
    )!;
    if (
      a.netDebitBalance.amount.isNegative() ||
      !a.netDebitBalance.amount.equals(l.netDebitBalance.amount.negated())
    )
      invalid('DEPOSIT_CLAIM_MIRROR_DIFFERS');
  }
  if (source.payerAsset.claimId === source.payeeAsset.claimId)
    invalid('DISTINCT_DEPOSIT_CLAIMS_REQUIRED');
}
export function validatePostwarOpeningPayrollRecognition(
  input: {
    source: OpeningPayrollSource;
    recognition: OpeningPayrollRecognition;
    command: CanonicalCommand;
  },
  sha: Sha256Hex,
): Readonly<AuthoritativeEvent> {
  const { source, recognition: evidence, command } = input;
  if (
    !evidence ||
    !['TEST_ONLY', 'DURABLE_CANONICAL_RECOGNITION_NOT_AUTHORITY'].includes(
      evidence.evidenceClass,
    )
  )
    invalid('COMPLETED_DAY_RECOGNITION_REQUIRED');
  const step = evidence.step;
  const original = validateCanonicalCommand(step.command, sha);
  bindAuthoritativeTransition(
    { command: original, transition: step.transition },
    sha,
  );
  if (
    original.commandType !== POSTWAR_PAYROLL_RECOGNITION_COMMAND ||
    original.worldId !== source.worldId ||
    original.countryId !== source.countryId ||
    step.transition.events.length !== 1 ||
    step.transition.events[0]!.eventType !==
      POSTWAR_PAYROLL_RECOGNITION_EVENT ||
    step.transition.events[0]!.correctsEventId !== null ||
    original.simTime.ticks < BigInt(SIMULATION_TICKS_PER_DAY) ||
    original.simTime.ticks > command.simTime.ticks ||
    BigInt(step.transition.worldVersionAfter) >
      BigInt(command.expectedWorldVersion!)
  )
    invalid('COMPLETED_DAY_RECOGNITION_SCOPE_OR_CAUSATION_INVALID');
  same(step.inventoryPostings, [], 'RECOGNITION_HAS_INVENTORY_EFFECT');
  same(step.financialPostingBatches, [], 'RECOGNITION_IS_NOT_PAYMENT');
  const payload: unknown = JSON.parse(
    step.transition.events[0]!.canonicalPayload,
  );
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    invalid('RECOGNITION_RECORD_REQUIRED');
  const row = payload as Record<string, unknown>;
  if (
    typeof row.workOriginalRef !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/u.test(row.workOriginalRef)
  )
    invalid('COMPLETED_WORK_ORIGINAL_REFERENCE_REQUIRED');
  const expected = {
    schemaVersion: 'postwar-completed-payroll-day-recognition-v1',
    worldId: source.worldId,
    countryId: source.countryId,
    seedFingerprint: source.seedFingerprint,
    sourceRevision: source.sourceRevision,
    obligationId: source.obligationId,
    positionId: source.positionId,
    coveredCount: source.coveredCount,
    periodStartSimTime: '0',
    periodEndSimTime: SIMULATION_TICKS_PER_DAY,
    workOriginalRef: row.workOriginalRef,
  };
  same(row, expected, 'RECOGNITION_ORIGINAL_SCOPE_DIFFERS');
  same(
    JSON.parse(original.canonicalPayload),
    expected,
    'RECOGNITION_COMMAND_DIFFERS',
  );
  return step.transition.events[0]!;
}

/** Pure conditional mechanism. Only a server custody/authority guard can admit
 * its source and completion originals. TEST_ONLY positives grant no authority. */
export function preparePostwarOpeningPayroll(input: {
  readonly command: CanonicalCommand;
  readonly source: OpeningPayrollSource;
  readonly recognition: OpeningPayrollRecognition;
  readonly financial: FinancialLedgerState;
  readonly eventSequence: string;
  readonly observedAtReal: string;
  readonly sha256Hex: Sha256Hex;
}): Readonly<OpeningPayrollResult> {
  const { source, financial, sha256Hex: sha } = input;
  const command = validateCanonicalCommand(input.command, sha);
  if (
    command.commandType !== POSTWAR_OPENING_PAYROLL_COMMAND ||
    command.worldId !== source.worldId ||
    command.countryId !== source.countryId ||
    command.expectedWorldVersion !== financial.worldVersion ||
    command.officeId !== null
  )
    invalid('COMMAND_SCOPE_OR_HEAD_INVALID');
  if (command.simTime.ticks < BigInt(SIMULATION_TICKS_PER_DAY))
    invalid('FIRST_COMPLETED_DAY_NOT_DUE');
  sourceAccounts(source, financial);
  const completion = validatePostwarOpeningPayrollRecognition(
    { source, recognition: input.recognition, command },
    sha,
  );
  const payment = earned(source);
  const amount = Money.from(payment.amount, source.currency);
  const reserve = Money.from(source.reservedAmount, source.currency);
  const payer = financial.positions.find(
    (p) => p.account.accountId === source.payerAsset.accountId,
  )!;
  if (
    reserve.amount.lessThan(amount.amount) ||
    payer.netDebitBalance.amount.lessThan(amount.amount)
  )
    invalid('ACTUAL_EMPLOYER_FUNDS_OR_RESERVATION_INSUFFICIENT');
  const logical = canonicalSha256(
    canonicalHashInput({
      seed: source.seedFingerprint,
      obligation: source.obligationId,
      policy: POSTWAR_OPENING_PAYROLL_POLICY.version,
    }),
    sha,
  )
    .slice(7)
    .toUpperCase();
  if (command.idempotencyKey !== `PAYROLL_${logical}`)
    invalid('EXACT_PAYMENT_IDEMPOTENCY_REQUIRED');
  same(
    JSON.parse(command.canonicalPayload),
    {
      schemaVersion: 'postwar-opening-payroll-command-v1',
      obligationId: source.obligationId,
      recognitionEventId: completion.eventId,
      policyVersion: POSTWAR_OPENING_PAYROLL_POLICY.version,
    },
    'PAYMENT_INTENT_DIFFERS',
  );
  const expense = createFinancialAccount({
    worldId: worldId(source.worldId),
    countryId: countryId(source.countryId),
    ownerId: legalEntityId(source.payerEntityId),
    accountId: financialAccountId(
      `PAYROLL_EXPENSE_${canonicalSha256(
        canonicalHashInput([
          source.worldId,
          source.countryId,
          source.payerEntityId,
          source.currency,
          POSTWAR_OPENING_PAYROLL_POLICY.version,
        ]),
        sha,
      )
        .slice(7)
        .toUpperCase()}`,
    ),
    accountClass: 'EXPENSE',
    currency: source.currency,
    claimId: null,
    counterpartyEntityId: null,
  });
  const revenue = createFinancialAccount({
    worldId: worldId(source.worldId),
    countryId: countryId(source.countryId),
    ownerId: legalEntityId(source.payeeEntityId),
    accountId: financialAccountId(
      `PAYROLL_REVENUE_${canonicalSha256(
        canonicalHashInput([
          source.worldId,
          source.countryId,
          source.payeeEntityId,
          source.currency,
          POSTWAR_OPENING_PAYROLL_POLICY.version,
        ]),
        sha,
      )
        .slice(7)
        .toUpperCase()}`,
    ),
    accountClass: 'REVENUE',
    currency: source.currency,
    claimId: null,
    counterpartyEntityId: null,
  });
  const payload = {
    schemaVersion: 'postwar-opening-payroll-event-v1',
    policy: POSTWAR_OPENING_PAYROLL_POLICY,
    source,
    recognitionCommandFingerprint: input.recognition.step.command.fingerprint,
    recognitionEventId: completion.eventId,
    recognitionEventFingerprint: completion.fingerprint,
    paidDepositClaimAmount: payment.amount,
    exactEarned: payment.exact,
    unpaidRemainder: payment.remainder,
    generatedBookkeepingAccounts: [expense, revenue],
  };
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventType: POSTWAR_OPENING_PAYROLL_EVENT,
      eventId: `PAYROLL_EVENT_${command.commandId}`,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: (BigInt(financial.worldVersion) + 1n).toString(),
      sequence: input.eventSequence,
      simTime: command.simTime.toCanonicalValue(),
      correctsEventId: null,
      recordedAtReal: input.observedAtReal,
      payload,
    },
    sha,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: financial.worldVersion,
    worldVersionAfter: event.worldVersion,
    events: [event],
  });
  const batchId = financialPostingBatchId(`PAYROLL_BATCH_${logical}`);
  const legs = [
    [source.payerAsset, 'CREDIT', source.payerLiability.accountId],
    [source.payerLiability, 'DEBIT', source.payerAsset.accountId],
    [source.payeeAsset, 'DEBIT', source.payeeLiability.accountId],
    [source.payeeLiability, 'CREDIT', source.payeeAsset.accountId],
    [expense, 'DEBIT', revenue.accountId],
    [revenue, 'CREDIT', expense.accountId],
  ] as const;
  const posting = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: transition.worldVersionBefore,
      worldVersionAfter: transition.worldVersionAfter,
      simTime: command.simTime,
      command,
      transition,
      settlementCurrency: source.currency,
      legs: legs.map(([account, direction, counterpartyAccountId], index) => ({
        legId: financialPostingLegId(`${batchId}_LEG_${index}`),
        account,
        direction,
        counterpartyAccountId,
        amount,
      })),
    },
    sha,
  );
  const applied = applyFinancialPostingBatch(financial, posting);
  if (applied.receipt.outcome !== 'APPLIED')
    invalid('ALREADY_PAID_OBLIGATION_REQUIRES_FINAL_RECOVERY');
  sourceAccounts(source, applied.state);
  return freeze({
    classification: 'CONDITIONAL_PAYROLL_DATA_NOT_COMMIT_AUTHORITY',
    evidenceClass: input.recognition.evidenceClass,
    step: {
      command,
      transition,
      financialPostingBatches: [posting],
      inventoryPostings: [],
    },
    financial: applied.state,
    paidDepositClaimAmount: payment.amount,
    exactEarned: payment.exact,
    unpaidRemainder: payment.remainder,
    obligationState:
      payment.remainder.numerator === '0'
        ? 'SETTLED'
        : 'PARTIALLY_PAID_EXACT_REMAINDER_OPEN',
  });
}

/** Recompute every arithmetic/account/event/posting field; a stored result or
 * parsed completion payload alone never replaces the actual source originals. */
export function replayPostwarOpeningPayroll(
  input: Omit<
    Parameters<typeof preparePostwarOpeningPayroll>[0],
    'eventSequence' | 'observedAtReal'
  > & {
    readonly step: V08AuthoritativeLedgerTransition;
  },
): Readonly<OpeningPayrollResult> {
  if (input.step.transition.events.length !== 1)
    invalid('EXACT_PAYROLL_EVENT_REQUIRED');
  const event = input.step.transition.events[0]!;
  same(input.command, input.step.command, 'REPLAY_COMMAND_DIFFERS');
  const result = preparePostwarOpeningPayroll({
    ...input,
    eventSequence: event.sequence,
    observedAtReal: event.recordedAtReal,
  });
  same(result.step, input.step, 'PAYROLL_REPLAY_DIFFERS');
  return result;
}
