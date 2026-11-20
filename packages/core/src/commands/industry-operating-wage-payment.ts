/** Conditional deterministic settlement of ACTUAL completed Industry WORK.
 * Neither a demand, filled job, elapsed clock nor this data kernel issues work,
 * admission or payment permission. Worker must protect the exact originals. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import {
  readIndustryCompletedWork,
  type IndustryCompletedWork,
} from '../industry/industry-first-day-work.js';
import { Money } from '../numeric/money.js';
import { canonicalDecimal } from '../numeric/world-decimal.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import {
  countryId,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  legalEntityId,
  worldId,
} from '../ids.js';
import {
  EVENT_SCHEMA_VERSION,
  parseAuthoritativeEvent,
} from '../events/event.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import type { V08AuthoritativeLedgerTransition } from '../opening/opening-seed.js';
import {
  aggregateBeneficialHousingLiquidClaim,
  type BeneficialHousingReclassificationReceipt,
} from '../finance/beneficial-housing-rent.js';
import {
  bindBeneficialProductionDepositRecipients,
  isSettledOriginalProductionDeposit,
  readProductionWageDepositAccounts,
} from '../finance/production-deposit-funding.js';
import {
  applyFinancialPostingBatch,
  createFinancialAccount,
  createFinancialPostingBatch,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingLeg,
} from '../finance/financial-ledger.js';
import {
  canonicalSha256,
  validateCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from './command.js';
import {
  bindAuthoritativeTransition,
  createAuthoritativeTransition,
  createFinalCommandReceipt,
  validateFinalReceiptForCommand,
  type FinalCommandReceipt,
} from './receipt.js';
export const INDUSTRY_OPERATING_WAGE_COMMAND =
  'CORE_INDUSTRY_OPERATING_WAGE_PAY_V1';
export const INDUSTRY_OPERATING_WAGE_EVENT = 'INDUSTRY_OPERATING_WAGE_PAID_V1';
export const INDUSTRY_OPERATING_WAGE_POLICY = Object.freeze({
  version: 'INDUSTRY_ACTUAL_COMPLETED_WORK_WAGE_V2',
  classification: 'GENERATED_POLICY',
  sourceRule: 'EXISTING_ANNUAL_LC_WAGE_360_SIM_DAYS_480_MINUTES_PER_DAY',
  sourcePolicy: 'INDUSTRY_FIRST_DAY_20261101_V1',
  instrument: 'LC_BANK_DEPOSIT_CLAIM_NOT_CASH',
  rounding:
    'FLOOR_PER_ACTUAL_BENEFICIARY_AGGREGATE_TO_SIX_DECIMALS_CARRY_EXACT_UNPAID_LIABILITY',
  precisionPrecedent: 'POSTWAR_OPENING_OP_PAYROLL_20261028_V1',
  precisionScopeExtension:
    'ACTUAL_COMPLETED_WORK_WITH_DISTINCT_COMMITTED_RECOGNITION',
  reserveRelease:
    'ACTUAL_PAID_AMOUNT_ONLY_UNPAID_EXACT_LIABILITY_REMAINS_RESERVED',
  accounting: 'OP_EXPENSE_DEPOSIT_BANK_MIRRORS_HH_DEPOSIT_REVENUE',
  recognition: 'DISTINCT_PRIOR_COMMITTED_COMPLETED_WORK_NOT_FILLED_OR_CLOCK',
});
export interface IndustryCompletedWorkAllocation {
  readonly positionId: string;
  readonly poolId: string;
  readonly cohortRef: string;
  readonly sourceStartOrdinal: string;
  readonly populationLineage: 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1';
  readonly regionId: string;
  readonly startOrdinal: string;
  readonly count: string;
  readonly skill: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly personMilliseconds: string;
  readonly personMinutes: Readonly<{ numerator: string; denominator: '60000' }>;
}
export interface IndustryCompletedWorkBody {
  readonly schemaVersion: 'postwar-industry-completed-work-v1';
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly schedule: Readonly<{
    commandId: string;
    commandFingerprint: string;
    eventId: string;
    eventFingerprint: string;
  }>;
  readonly policy: Readonly<{
    version: string;
    rawSha256: string;
    userAdoptionRawSha256: string;
    sourceRef: string;
    sourceRawSha256: string;
  }>;
  readonly completedAtSimTime: string;
  readonly allocations: readonly IndustryCompletedWorkAllocation[];
}
export type IndustryCommittedWorkFrame = V08AuthoritativeLedgerTransition & {
  readonly receipt: FinalCommandReceipt;
};
export interface IndustryOperatingWageSource {
  readonly worldId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly facilityId: string;
  readonly operatorId: string;
  readonly runId: string;
  readonly seedId: string;
  readonly seedFingerprint: string;
  readonly admissionRef: string;
  readonly schedule: IndustryCompletedWorkBody['schedule'];
  readonly policy: IndustryCompletedWorkBody['policy'];
  readonly householdAccountId: string;
  readonly openingReservedAmount: string;
  readonly maximumExpense: Readonly<{ amount: string; currency: string }>;
  readonly openingEncumbranceRef: string;
  /** Actual source contracts and actual regional population ranges, not demand. */
  readonly wages: readonly Readonly<{
    positionId: string;
    poolId: string;
    cohortRef: string;
    skill: string;
    reservationId: string;
    reservedAmount: string;
    sourceStartOrdinal: string;
    wagePeriod: 'SIM_YEAR';
    annualWage: string;
    currency: string;
    wageVersion: string;
    sourceRef: string;
    firstPersonOrdinal: string;
    personCount: string;
  }>[];
}
interface PaidWorkRange {
  readonly locationId: string;
  readonly startOrdinal: string;
  readonly count: string;
  readonly startsAtSimTime: string;
  readonly endsAtSimTime: string;
  readonly workEventFingerprint: string;
}
export interface IndustryWageRational {
  readonly numerator: string;
  readonly denominator: string;
}
export interface IndustryWageLiabilityOrigin {
  readonly maximumExpense: Readonly<{ amount: string; currency: string }>;
  readonly workEventFingerprint: string;
  readonly runId: string;
  readonly facilityId: string;
  readonly amount: IndustryWageRational;
}
export interface IndustryUnpaidWageLiability {
  readonly accountId: string;
  readonly operatorId: string;
  readonly countryId: string;
  readonly currency: string;
  readonly amount: IndustryWageRational;
  readonly origins: readonly IndustryWageLiabilityOrigin[];
}
interface AccruedReservation {
  readonly reservationId: string;
  readonly accountId: string;
  readonly currency: string;
  readonly amount: IndustryWageRational;
}
export interface IndustryOperatingWageState {
  readonly runPayments: readonly Readonly<{
    countryId: string;
    operatorId: string;
    facilityId: string;
    runId: string;
    currency: string;
    maximumExpense: string;
    amount: IndustryWageRational;
  }>[];
  readonly worldId: string;
  readonly seedFingerprint: string;
  readonly unpaidWageLiabilities: readonly IndustryUnpaidWageLiability[];
  readonly accruedReservations: readonly AccruedReservation[];
  /** Processed work settlements; explicit rational obligations may remain OPEN. */
  readonly paidWork: readonly string[];
  readonly ranges: readonly PaidWorkRange[];
  readonly reservationReleases: readonly Readonly<{
    reservationId: string;
    openingEncumbranceRef: string;
    accountId: string;
    amount: string;
    currency: string;
  }>[];
}
export interface IndustryOperatingWageResult {
  readonly classification: 'CONDITIONAL_SETTLED_WAGE_DATA_NOT_AUTHORITY';
  readonly obligationState: 'SETTLED' | 'PARTIALLY_PAID_EXACT_REMAINDER_OPEN';
  readonly state: Readonly<IndustryOperatingWageState>;
  readonly financial: Readonly<FinancialLedgerState>;
  readonly step: V08AuthoritativeLedgerTransition;
  readonly paidAmount: string;
  readonly unpaidWageLiabilities: readonly IndustryUnpaidWageLiability[];
  readonly expenseLegId: string;
  readonly paymentLegId: string;
  readonly recipients: readonly Readonly<{
    accountId: string;
    groupId: string | null;
    amount: string;
  }>[];
}
const states = new WeakSet<object>();
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'INDUSTRY_OPERATING_WAGE:' + s,
  );
}
function same(a: unknown, b: unknown, s: string) {
  if (canonicalSerialize(a) !== canonicalSerialize(b)) invalid(s);
}
function uint(s: string): bigint {
  if (typeof s !== 'string' || !/^(0|[1-9]\d*)$/u.test(s))
    invalid('CANONICAL_INTEGER_REQUIRED');
  return BigInt(s);
}
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
export function createIndustryOperatingWageState(input: {
  financial: FinancialLedgerState;
  seedFingerprint: string;
}): Readonly<IndustryOperatingWageState> {
  if (
    !isAuthoritativeFinancialLedgerState(input.financial) ||
    input.financial.worldVersion !== '0' ||
    input.financial.appliedBatches.length ||
    !/^sha256:[0-9a-f]{64}$/u.test(input.seedFingerprint)
  )
    invalid('GENUINE_H0_BASELINE_REQUIRED');
  const state = freeze({
    worldId: input.financial.worldId,
    seedFingerprint: input.seedFingerprint,
    paidWork: [],
    ranges: [],
    reservationReleases: [],
    unpaidWageLiabilities: [],
    runPayments: [],
    accruedReservations: [],
  });
  states.add(state);
  return state;
}
function rational(n: bigint, d: bigint): IndustryWageRational {
  if (n < 0n || d <= 0n) invalid('NONNEGATIVE_EXACT_WAGE_LIABILITY_REQUIRED');
  let x = n,
    y = d;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return Object.freeze({
    numerator: (n / x).toString(),
    denominator: (d / x).toString(),
  });
}
function plus(
  a: IndustryWageRational,
  b: IndustryWageRational,
): IndustryWageRational {
  return rational(
    uint(a.numerator) * uint(b.denominator) +
      uint(b.numerator) * uint(a.denominator),
    uint(a.denominator) * uint(b.denominator),
  );
}
function minus(
  a: IndustryWageRational,
  b: IndustryWageRational,
): IndustryWageRational {
  return rational(
    uint(a.numerator) * uint(b.denominator) -
      uint(b.numerator) * uint(a.denominator),
    uint(a.denominator) * uint(b.denominator),
  );
}
function atMost(a: IndustryWageRational, b: IndustryWageRational) {
  return (
    uint(a.numerator) * uint(b.denominator) <=
    uint(b.numerator) * uint(a.denominator)
  );
}
function decimalRational(amount: string): IndustryWageRational {
  const [whole, fraction = ''] = amount.split('.');
  return rational(BigInt(whole! + fraction), 10n ** BigInt(fraction.length));
}
function earnedWage(input: {
  annualWage: string;
  currency: string;
  personMilliseconds: string;
}): IndustryWageRational {
  const annual = Money.from(input.annualWage, input.currency);
  if (
    !annual.amount.isPositive() ||
    canonicalDecimal(annual.amount) !== input.annualWage ||
    !uint(input.personMilliseconds)
  )
    invalid('POSITIVE_CANONICAL_ACTUAL_WAGE_AND_TIME_REQUIRED');
  const a = decimalRational(input.annualWage);
  return rational(
    uint(a.numerator) * uint(input.personMilliseconds),
    uint(a.denominator) * 360n * 480n * 60000n,
  );
}
function quantize(
  earned: IndustryWageRational,
  carry: IndustryWageRational,
  currency: string,
) {
  const exact = plus(earned, carry),
    n = uint(exact.numerator),
    d = uint(exact.denominator),
    micros = (n * 1000000n) / d;
  const paidAmount = canonicalDecimal(
    Money.from(
      `${micros / 1000000n}.${(micros % 1000000n).toString().padStart(6, '0')}`,
      currency,
    ).amount,
  );
  return Object.freeze({
    paidAmount,
    earned,
    carriedTotal: exact,
    unpaid: rational(n * 1000000n - micros * d, d * 1000000n),
  });
}
/** Same six-decimal wage precision as opening payroll, explicitly extended to
 * completed WORK. The exact unpaid liability is retained, never income paid. */
export function quoteIndustryOperatingWage(input: {
  annualWage: string;
  currency: string;
  personMilliseconds: string;
  carry?: IndustryWageRational;
}) {
  return quantize(
    earnedWage(input),
    input.carry ?? rational(0n, 1n),
    input.currency,
  );
}
export function calculateIndustryOperatingWage(input: {
  annualWage: string;
  currency: string;
  personMilliseconds: string;
}): string {
  return quoteIndustryOperatingWage(input).paidAmount;
}
function intersects(a: PaidWorkRange, b: PaidWorkRange) {
  return (
    a.locationId === b.locationId &&
    uint(a.startOrdinal) < uint(b.startOrdinal) + uint(b.count) &&
    uint(b.startOrdinal) < uint(a.startOrdinal) + uint(a.count) &&
    uint(a.startsAtSimTime) < uint(b.endsAtSimTime) &&
    uint(b.startsAtSimTime) < uint(a.endsAtSimTime)
  );
}
function completed(input: {
  work: IndustryCompletedWork;
  source: IndustryOperatingWageSource;
  command: CanonicalCommand;
  sha256Hex: Sha256Hex;
}): IndustryCompletedWorkBody {
  const { source, command, sha256Hex: sha } = input;
  const work = readIndustryCompletedWork(input.work).frame;
  const original = validateCanonicalCommand(work.command, sha);
  bindAuthoritativeTransition(
    { command: original, transition: work.transition },
    sha,
  );
  validateFinalReceiptForCommand({
    command: original,
    transition: work.transition,
    receipt: work.receipt,
  });
  same(
    work.receipt,
    createFinalCommandReceipt({
      command: original,
      transition: work.transition,
      outcome: 'COMMITTED',
      reasonCode: null,
      simTime: original.simTime,
      recordedAtReal: work.receipt.recordedAtReal,
    }),
    'EXACT_PRIOR_COMMITTED_WORK_RECEIPT_REQUIRED',
  );
  const event = work.transition.events[0];
  if (
    original.commandType !== 'CORE_INDUSTRY_FIRST_DAY_WORK_V1' ||
    original.officeId !== null ||
    original.worldId !== source.worldId ||
    original.countryId !== source.countryId ||
    work.transition.events.length !== 1 ||
    !event ||
    event.eventType !== 'INDUSTRY_FIRST_DAY_WORK_COMPLETED_V1' ||
    event.correctsEventId !== null ||
    uint(work.transition.worldVersionAfter) >
      uint(command.expectedWorldVersion!) ||
    original.simTime.ticks > command.simTime.ticks
  )
    invalid('ACTUAL_PRIOR_WORK_SCOPE_REQUIRED');
  same(work.financialPostingBatches, [], 'WORK_IS_NOT_PAYMENT');
  same(work.inventoryPostings, [], 'WORK_HAS_NO_GOODS_POSTINGS');
  const body = readIndustryCompletedWork(input.work).data;
  same(
    body,
    JSON.parse(event.canonicalPayload),
    'ISSUED_WORK_EVENT_DATA_DIFFERS',
  );
  if (
    body.schemaVersion !== 'postwar-industry-completed-work-v1' ||
    !Array.isArray(body.allocations) ||
    !body.allocations.length ||
    body.allocations.length > 256
  )
    invalid('BOUNDED_COMPLETED_WORK_REQUIRED');
  const { allocations, ...scope } = body;
  same(
    scope,
    {
      schemaVersion: 'postwar-industry-completed-work-v1',
      worldId: source.worldId,
      countryId: source.countryId,
      locationId: source.locationId,
      facilityId: source.facilityId,
      operatorId: source.operatorId,
      runId: source.runId,
      seedId: source.seedId,
      seedFingerprint: source.seedFingerprint,
      admissionRef: source.admissionRef,
      schedule: source.schedule,
      policy: source.policy,
      completedAtSimTime: body.completedAtSimTime,
    },
    'ACTUAL_WORK_SOURCE_DIFFERS',
  );
  if (uint(body.completedAtSimTime) > original.simTime.ticks)
    invalid('FUTURE_WORK_NOT_COMPLETED');
  for (const a of allocations) {
    const n = uint(a.count),
      start = uint(a.startsAtSimTime),
      end = uint(a.endsAtSimTime);
    if (
      !n ||
      end <= start ||
      end - start > 480n * 60000n ||
      end > uint(body.completedAtSimTime) ||
      end > 86400000n ||
      a.populationLineage !== 'POSTWAR_REGIONAL_POPULATION_ORDINAL_V1' ||
      a.regionId !== source.locationId ||
      uint(a.personMilliseconds) !== n * (end - start)
    )
      invalid('ACTUAL_FINITE_PERSON_TIME_REQUIRED');
    same(
      a.personMinutes,
      { numerator: a.personMilliseconds, denominator: '60000' },
      'EXACT_PERSON_MINUTES_REQUIRED',
    );
    const wages = source.wages.filter(
      (w) =>
        w.positionId === a.positionId &&
        w.poolId === a.poolId &&
        w.cohortRef === a.cohortRef &&
        w.skill === a.skill,
    );
    if (wages.length !== 1) invalid('EXACT_SOURCE_WAGE_POSITION_REQUIRED');
    const wage = wages[0]!;
    if (
      wage.wagePeriod !== 'SIM_YEAR' ||
      uint(a.sourceStartOrdinal) < uint(wage.sourceStartOrdinal) ||
      uint(a.startOrdinal) !==
        uint(wage.firstPersonOrdinal) +
          uint(a.sourceStartOrdinal) -
          uint(wage.sourceStartOrdinal)
    )
      invalid('ACTUAL_POOL_TO_REGION_COORDINATE_REQUIRED');
    if (
      uint(a.startOrdinal) < uint(wage.firstPersonOrdinal) ||
      uint(a.startOrdinal) + n >
        uint(wage.firstPersonOrdinal) + uint(wage.personCount)
    )
      invalid('WORK_OUTSIDE_ACTUAL_PERSON_RANGE');
  }
  return body;
}
export function prepareIndustryOperatingWagePayment(input: {
  command: CanonicalCommand;
  source: IndustryOperatingWageSource;
  work: IndustryCompletedWork;
  state: IndustryOperatingWageState;
  financial: FinancialLedgerState;
  beneficialReceipt?: BeneficialHousingReclassificationReceipt;
  eventSequence: string;
  observedAtReal: string;
  sha256Hex: Sha256Hex;
}): Readonly<IndustryOperatingWageResult> {
  const { source, state, financial, sha256Hex: sha } = input,
    command = validateCanonicalCommand(input.command, sha);
  const work = readIndustryCompletedWork(input.work).frame;
  if (
    !states.has(state) ||
    !isAuthoritativeFinancialLedgerState(financial) ||
    state.worldId !== source.worldId ||
    state.seedFingerprint !== source.seedFingerprint ||
    command.worldId !== source.worldId ||
    financial.worldId !== source.worldId ||
    command.countryId !== source.countryId ||
    command.officeId !== null ||
    command.commandType !== INDUSTRY_OPERATING_WAGE_COMMAND ||
    command.expectedWorldVersion !== financial.worldVersion
  )
    invalid('EXACT_PAYMENT_STATE_AND_HEAD_REQUIRED');
  const body = completed({ ...input, command }),
    event = work.transition.events[0]!;
  if (state.paidWork.includes(event.fingerprint))
    invalid('WORK_ALREADY_PAID_REQUIRES_FINAL_RECOVERY');
  const key = canonicalSha256(
    canonicalSerialize([
      source.worldId,
      source.seedFingerprint,
      event.fingerprint,
      INDUSTRY_OPERATING_WAGE_POLICY.version,
    ]),
    sha,
  )
    .slice(7)
    .toUpperCase();
  if (command.idempotencyKey !== `INDUSTRY_WAGE_${key}`)
    invalid('EXACT_WORK_PAYMENT_IDEMPOTENCY_REQUIRED');
  same(
    JSON.parse(command.canonicalPayload),
    {
      schemaVersion: 'industry-operating-wage-payment-v1',
      workEventId: event.eventId,
      workEventFingerprint: event.fingerprint,
      policyVersion: INDUSTRY_OPERATING_WAGE_POLICY.version,
    },
    'EXACT_PAYMENT_INTENT_REQUIRED',
  );
  const newRanges = body.allocations.map((a) => ({
    locationId: body.locationId,
    startOrdinal: a.startOrdinal,
    count: a.count,
    startsAtSimTime: a.startsAtSimTime,
    endsAtSimTime: a.endsAtSimTime,
    workEventFingerprint: event.fingerprint,
  }));
  for (let i = 0; i < newRanges.length; i++)
    if (
      [...state.ranges, ...newRanges.slice(0, i)].some((p) =>
        intersects(p, newRanges[i]!),
      )
    )
      invalid('PERSON_RANGE_TIME_ALREADY_PAID_OR_OVERLAPPING');
  const allRanges = [...state.ranges, ...newRanges];
  if (allRanges.length > 65536)
    invalid('BOUNDED_WORK_PAYMENT_HISTORY_REQUIRED');
  for (const location of new Set(newRanges.map((r) => r.locationId))) {
    const regionRanges = allRanges.filter((r) => r.locationId === location);
    const points = [
      ...new Set(
        regionRanges.flatMap((r) => [
          r.startOrdinal,
          (uint(r.startOrdinal) + uint(r.count)).toString(),
        ]),
      ),
    ]
      .map(BigInt)
      .sort((a, b) => (a < b ? -1 : 1));
    for (const point of points) {
      const elapsed = regionRanges
        .filter(
          (r) =>
            uint(r.startOrdinal) <= point &&
            point < uint(r.startOrdinal) + uint(r.count),
        )
        .reduce(
          (n, r) => n + uint(r.endsAtSimTime) - uint(r.startsAtSimTime),
          0n,
        );
      if (elapsed > 480n * 60000n)
        invalid('ACTUAL_PERSON_TIME_EXCEEDS_FIRST_DAY_LIMIT');
    }
  }
  // V2 has not published legacy cap-free wages. The actual committed RUN
  // ceiling is mandatory source data, never inferred from a label or balance.
  if (
    !source.maximumExpense ||
    typeof source.maximumExpense.amount !== 'string' ||
    typeof source.maximumExpense.currency !== 'string'
  )
    invalid('V2_ACTUAL_RUN_CEILING_REQUIRED');
  const runCap = Money.from(
    source.maximumExpense.amount,
    source.maximumExpense.currency,
  );
  if (
    !runCap.amount.isPositive() ||
    canonicalDecimal(runCap.amount) !== source.maximumExpense.amount
  )
    invalid('EXACT_POSITIVE_RUN_CEILING_REQUIRED');
  const receipt = input.beneficialReceipt;
  if (receipt) {
    if (
      receipt.worldId !== source.worldId ||
      receipt.countryId !== source.countryId
    )
      invalid('BENEFICIAL_RECIPIENT_SCOPE_DIFFERS');
    bindBeneficialProductionDepositRecipients(financial, receipt);
    aggregateBeneficialHousingLiquidClaim(financial, receipt);
  }
  const paid = new Map<
    string,
    {
      asset: FinancialAccount;
      groupId: string | null;
      earned: IndustryWageRational;
    }
  >();
  let currency: string | undefined;
  for (const allocation of body.allocations) {
    const wage = source.wages.find(
      (w) =>
        w.positionId === allocation.positionId &&
        w.poolId === allocation.poolId &&
        w.cohortRef === allocation.cohortRef &&
        w.skill === allocation.skill,
    )!;
    if (currency && currency !== wage.currency)
      invalid('SINGLE_ACTUAL_LC_PAYROLL_REQUIRED');
    currency = wage.currency;
    const start = uint(allocation.startOrdinal),
      end = start + uint(allocation.count),
      duration =
        uint(allocation.endsAtSimTime) - uint(allocation.startsAtSimTime);
    const recipients = receipt
      ? receipt.groups
          .filter((g) => g.locationId === source.locationId)
          .map((g) => {
            const left =
              uint(g.firstPersonOrdinal) > start
                ? uint(g.firstPersonOrdinal)
                : start;
            const right =
              uint(g.firstPersonOrdinal) + uint(g.population) < end
                ? uint(g.firstPersonOrdinal) + uint(g.population)
                : end;
            return {
              count: right > left ? right - left : 0n,
              groupId: g.groupId,
              accountId: receipt.subaccounts.find(
                (s) => s.groupId === g.groupId,
              )!.account.accountId,
            };
          })
          .filter((g) => g.count > 0n)
      : [
          {
            count: uint(allocation.count),
            groupId: null,
            accountId: source.householdAccountId,
          },
        ];
    if (recipients.reduce((n, r) => n + r.count, 0n) !== uint(allocation.count))
      invalid('ACTUAL_WORK_POPULATION_NOT_PARTITIONED_BY_BENEFICIARIES');
    for (const r of recipients) {
      const accounts = readProductionWageDepositAccounts({
        financial,
        countryId: source.countryId,
        operatorId: source.operatorId,
        householdAccountId: r.accountId,
      });
      const earned = earnedWage({
        annualWage: wage.annualWage,
        currency: wage.currency,
        personMilliseconds: (r.count * duration).toString(),
      });
      const old = paid.get(r.accountId);
      paid.set(r.accountId, {
        asset: accounts.payeeAsset,
        groupId: r.groupId,
        earned: old ? plus(old.earned, earned) : earned,
      });
    }
  }
  if (!currency || !paid.size) invalid('NO_ACTUAL_WAGES_DUE');
  const unpaidWageLiabilities = state.unpaidWageLiabilities.filter(
    (r) =>
      !(
        r.operatorId === source.operatorId &&
        r.countryId === source.countryId &&
        r.currency === currency &&
        paid.has(r.accountId)
      ),
  );
  const recipients = [...paid.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, r]) => {
      const prior = state.unpaidWageLiabilities.filter(
        (v) =>
          v.accountId === id &&
          v.operatorId === source.operatorId &&
          v.countryId === source.countryId &&
          v.currency === currency,
      );
      if (prior.length > 1) invalid('DUPLICATED_EXACT_UNPAID_LIABILITY');
      const quote = quantize(
        r.earned,
        prior[0]?.amount ?? rational(0n, 1n),
        currency,
      );
      const origins = [
        ...(prior[0]?.origins ?? []),
        {
          maximumExpense: source.maximumExpense,
          workEventFingerprint: event.fingerprint,
          runId: source.runId,
          facilityId: source.facilityId,
          amount: r.earned,
        },
      ];
      const remaining: IndustryWageLiabilityOrigin[] = [],
        settledWorkLiabilities: IndustryWageLiabilityOrigin[] = [];
      let left = decimalRational(quote.paidAmount);
      for (const origin of origins) {
        if (atMost(origin.amount, left)) {
          settledWorkLiabilities.push(origin);
          left = minus(left, origin.amount);
        } else {
          if (uint(left.numerator) > 0n)
            settledWorkLiabilities.push({ ...origin, amount: left });
          remaining.push({ ...origin, amount: minus(origin.amount, left) });
          left = rational(0n, 1n);
        }
      }
      same(
        remaining.reduce((n, r) => plus(n, r.amount), rational(0n, 1n)),
        quote.unpaid,
        'EXACT_UNPAID_WORK_ORIGIN_CONSERVATION_REQUIRED',
      );
      if (uint(quote.unpaid.numerator) > 0n)
        unpaidWageLiabilities.push({
          accountId: id,
          operatorId: source.operatorId,
          countryId: source.countryId,
          currency,
          amount: quote.unpaid,
          origins: remaining,
        });
      return [
        id,
        {
          asset: r.asset,
          groupId: r.groupId,
          amount: Money.from(quote.paidAmount, currency),
          exactEarned: quote.earned,
          priorUnpaid: prior[0]?.amount ?? rational(0n, 1n),
          unpaid: quote.unpaid,
          settledWorkLiabilities,
        },
      ] as const;
    })
    .filter(([, r]) => r.amount.amount.isPositive());
  // Below-quantum WORK remains unpaid and unconsumed, never a zero-paid FINAL.
  if (!recipients.length)
    invalid('NO_POSITIVE_PAYABLE_QUANTUM_WORK_REMAINS_UNPAID');
  const accounts = readProductionWageDepositAccounts({
    financial,
    countryId: source.countryId,
    operatorId: source.operatorId,
    householdAccountId: recipients[0]![0],
  });
  const total = recipients.reduce(
    (n, [, r]) => n.add(r.amount),
    Money.from('0', currency),
  );
  const available = financial.positions.find(
    (p) => p.account.accountId === accounts.payerAsset.accountId,
  )!.netDebitBalance;
  if (available.amount.lessThan(total.amount))
    invalid('ACTUAL_OP_SPENDABLE_FUNDS_INSUFFICIENT');
  const accruedReservations = [...state.accruedReservations];
  for (const a of body.allocations) {
    const wage = source.wages.find(
      (w) =>
        w.positionId === a.positionId &&
        w.poolId === a.poolId &&
        w.cohortRef === a.cohortRef &&
        w.skill === a.skill,
    )!;
    const prior = accruedReservations.filter(
      (r) => r.reservationId === wage.reservationId,
    );
    if (
      prior.length > 1 ||
      prior.some(
        (r) =>
          r.currency !== currency ||
          r.accountId !== accounts.payerAsset.accountId,
      )
    )
      invalid('RESERVATION_SCOPE_CHANGED');
    const accrued = plus(
      prior[0]?.amount ?? rational(0n, 1n),
      earnedWage({
        annualWage: wage.annualWage,
        currency,
        personMilliseconds: a.personMilliseconds,
      }),
    );
    const reserve = Money.from(wage.reservedAmount, currency);
    if (!wage.reservationId || reserve.amount.isNegative())
      invalid('ACTUAL_POSITION_PAYROLL_RESERVATION_REQUIRED');
    const reserved = decimalRational(canonicalDecimal(reserve.amount));
    if (
      uint(accrued.numerator) * uint(reserved.denominator) >
      uint(reserved.numerator) * uint(accrued.denominator)
    )
      invalid('ACTUAL_POSITION_PAYROLL_RESERVATION_INSUFFICIENT');
    if (prior[0])
      accruedReservations.splice(accruedReservations.indexOf(prior[0]), 1);
    accruedReservations.push({
      reservationId: wage.reservationId,
      accountId: accounts.payerAsset.accountId,
      currency,
      amount: accrued,
    });
  }
  const releaseEntries = [
    {
      reservationId: `INDUSTRY_WAGE_RELEASE_${key}`,
      openingEncumbranceRef: source.openingEncumbranceRef,
      accountId: accounts.payerAsset.accountId,
      amount: canonicalDecimal(total.amount),
      currency,
    },
  ];
  const releasedNow = total;
  if (
    !source.openingEncumbranceRef ||
    state.reservationReleases.some(
      (r) =>
        r.accountId === accounts.payerAsset.accountId &&
        r.openingEncumbranceRef !== source.openingEncumbranceRef,
    )
  )
    invalid('ACTUAL_AGGREGATE_RESERVATION_REFERENCE_CHANGED');
  const runPayments = [...state.runPayments];
  for (const [, r] of recipients)
    for (const origin of r.settledWorkLiabilities) {
      if (origin.maximumExpense.currency !== currency)
        invalid('RUN_CEILING_CURRENCY_DIFFERS');
      const cap = Money.from(origin.maximumExpense.amount, currency);
      if (
        !cap.amount.isPositive() ||
        canonicalDecimal(cap.amount) !== origin.maximumExpense.amount
      )
        invalid('EXACT_IMMUTABLE_RUN_CEILING_REQUIRED');
      const previous = runPayments.filter(
        (p) =>
          p.countryId === source.countryId &&
          p.operatorId === source.operatorId &&
          p.facilityId === origin.facilityId &&
          p.runId === origin.runId &&
          p.currency === currency,
      );
      if (
        previous.length > 1 ||
        previous.some((p) => p.maximumExpense !== origin.maximumExpense.amount)
      )
        invalid('IMMUTABLE_RUN_CEILING_CHANGED');
      const paid = plus(previous[0]?.amount ?? rational(0n, 1n), origin.amount),
        maximum = decimalRational(origin.maximumExpense.amount);
      if (!atMost(paid, maximum))
        invalid('ACTUAL_PAID_RUN_COST_EXCEEDS_MAXIMUM_EXPENSE');
      if (previous[0]) runPayments.splice(runPayments.indexOf(previous[0]), 1);
      runPayments.push({
        countryId: source.countryId,
        operatorId: source.operatorId,
        facilityId: origin.facilityId,
        runId: origin.runId,
        currency,
        maximumExpense: origin.maximumExpense.amount,
        amount: paid,
      });
    }
  const originalReserve = Money.from(source.openingReservedAmount, currency);
  const usedReserve = state.reservationReleases
    .filter(
      (r) =>
        r.currency === currency &&
        r.accountId === accounts.payerAsset.accountId,
    )
    .reduce(
      (n, r) => n.add(Money.from(r.amount, currency)),
      Money.from('0', currency),
    );
  const retained = originalReserve.subtract(usedReserve).subtract(releasedNow);
  if (
    originalReserve.amount.isNegative() ||
    retained.amount.isNegative() ||
    available.subtract(total).amount.lessThan(retained.amount)
  )
    invalid('OTHER_ACTUAL_OPENING_RESERVATIONS_NOT_BACKED');

  const account = (
    owner: string,
    id: string,
    accountClass: 'EXPENSE' | 'REVENUE',
  ) =>
    createFinancialAccount({
      worldId: worldId(source.worldId),
      countryId: countryId(source.countryId),
      ownerId: legalEntityId(owner),
      accountId: financialAccountId(id),
      accountClass,
      currency,
      claimId: null,
      counterpartyEntityId: null,
    });
  const expense = account(
    source.operatorId,
    `INDUSTRY_WAGE_EXPENSE_${key}`,
    'EXPENSE',
  );
  const revenue = recipients.map(([, r], i) =>
    account(r.asset.ownerId, `INDUSTRY_WAGE_REVENUE_${key}_${i}`, 'REVENUE'),
  );
  const payload = {
    schemaVersion: 'industry-operating-wage-paid-v1',
    policy: INDUSTRY_OPERATING_WAGE_POLICY,
    source,
    workEventId: event.eventId,
    workEventFingerprint: event.fingerprint,
    workCommandFingerprint: work.command.fingerprint,
    paidAmount: canonicalDecimal(total.amount),
    currency,
    reservationReleases: releaseEntries,
    unpaidWageLiabilities,
    accruedReservations,
    recipients: recipients.map(([accountId, r]) => ({
      accountId,
      groupId: r.groupId,
      amount: canonicalDecimal(r.amount.amount),
    })),
    actualRunPaidLiabilities: runPayments,
    recipientSettlements: recipients.map(([accountId, r]) => ({
      accountId,
      exactEarned: r.exactEarned,
      priorUnpaid: r.priorUnpaid,
      unpaid: r.unpaid,
      settledWorkLiabilities: r.settledWorkLiabilities,
    })),
    generatedBookkeepingAccounts: [expense, ...revenue],
  };
  const paidEvent = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventType: INDUSTRY_OPERATING_WAGE_EVENT,
      eventId: `INDUSTRY_WAGE_EVENT_${key}`,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: (uint(financial.worldVersion) + 1n).toString(),
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
    worldVersionAfter: paidEvent.worldVersion,
    events: [paidEvent],
  });
  const rows: Omit<FinancialPostingLeg, 'legId'>[] = [
    {
      account: expense,
      direction: 'DEBIT',
      amount: total,
      counterpartyAccountId: accounts.payerAsset.accountId,
    },
    {
      account: accounts.payerAsset,
      direction: 'CREDIT',
      amount: total,
      counterpartyAccountId: expense.accountId,
    },
    {
      account: accounts.payerLiability,
      direction: 'DEBIT',
      amount: total,
      counterpartyAccountId: accounts.payeeLiability.accountId,
    },
    {
      account: accounts.payeeLiability,
      direction: 'CREDIT',
      amount: total,
      counterpartyAccountId: accounts.payerLiability.accountId,
    },
  ];
  recipients.forEach(([, r], i) =>
    rows.push(
      {
        account: r.asset,
        direction: 'DEBIT',
        amount: r.amount,
        counterpartyAccountId: revenue[i]!.accountId,
      },
      {
        account: revenue[i]!,
        direction: 'CREDIT',
        amount: r.amount,
        counterpartyAccountId: r.asset.accountId,
      },
    ),
  );
  const batchId = financialPostingBatchId(`INDUSTRY_WAGE_BATCH_${key}`);
  const batch = createFinancialPostingBatch(
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
      settlementCurrency: currency,
      legs: rows.map((r, i) => ({
        ...r,
        legId: financialPostingLegId(`${batchId}_LEG_${i}`),
      })),
    },
    sha,
  );
  const applied = applyFinancialPostingBatch(financial, batch);
  if (applied.receipt.outcome !== 'APPLIED')
    invalid('WORK_ALREADY_PAID_REQUIRES_FINAL_RECOVERY');
  if (
    !isSettledOriginalProductionDeposit({
      financial: applied.state,
      batch,
      expense: batch.legs[0]!,
      payment: batch.legs[1]!,
    })
  )
    invalid('REAL_ORIGINAL_DEPOSIT_PAYMENT_REQUIRED');
  const after = freeze({
    worldId: state.worldId,
    seedFingerprint: state.seedFingerprint,
    paidWork: [...state.paidWork, event.fingerprint],
    ranges: [...state.ranges, ...newRanges],
    reservationReleases: [...state.reservationReleases, ...releaseEntries],
    unpaidWageLiabilities,
    accruedReservations,
    runPayments,
  });
  states.add(after);
  return freeze({
    classification: 'CONDITIONAL_SETTLED_WAGE_DATA_NOT_AUTHORITY',
    obligationState: unpaidWageLiabilities.some(
      (r) =>
        r.operatorId === source.operatorId &&
        r.countryId === source.countryId &&
        r.currency === currency,
    )
      ? 'PARTIALLY_PAID_EXACT_REMAINDER_OPEN'
      : 'SETTLED',
    state: after,
    financial: applied.state,
    step: {
      command,
      transition,
      financialPostingBatches: [batch],
      inventoryPostings: [],
    },
    paidAmount: canonicalDecimal(total.amount),
    unpaidWageLiabilities,
    expenseLegId: batch.legs[0]!.legId,
    paymentLegId: batch.legs[1]!.legId,
    recipients: payload.recipients,
  });
}
export function replayIndustryOperatingWagePayment(
  input: Omit<
    Parameters<typeof prepareIndustryOperatingWagePayment>[0],
    'eventSequence' | 'observedAtReal'
  > & {
    step: Omit<
      V08AuthoritativeLedgerTransition,
      'financialPostingBatches' | 'inventoryPostings'
    > & {
      readonly financialPostingBatches: readonly unknown[];
      readonly inventoryPostings: readonly unknown[];
    };
  },
): Readonly<IndustryOperatingWageResult> {
  const event = input.step.transition.events[0];
  if (!event || input.step.transition.events.length !== 1)
    invalid('EXACT_WAGE_EVENT_REQUIRED');
  same(input.command, input.step.command, 'REPLAY_COMMAND_DIFFERS');
  const replayed = prepareIndustryOperatingWagePayment({
    ...input,
    eventSequence: event.sequence,
    observedAtReal: event.recordedAtReal,
  });
  same(replayed.step, input.step, 'ACTUAL_WAGE_REPLAY_DIFFERS');
  return replayed;
}
