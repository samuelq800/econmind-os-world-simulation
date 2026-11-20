/** One global reservation calculation over unchanged opening GOV/OP cash.
 * Reservations are not postings, account creation, payments or new grants. */
import { createHash } from 'node:crypto';
import {
  canonicalDecimal,
  canonicalSerialize,
  Money,
  parseWorldDecimal,
  SIMULATION_DAYS_PER_YEAR,
  type OpeningSeed,
} from '@econmind/core';
import {
  isVerifiedOfficialOpeningDecisionSource,
  type VerifiedOfficialOpeningSource,
} from './official-opening-decision-reconciliation.js';
import {
  consumePostwarMonetaryGenesis,
  type PostwarMonetaryGenesis,
} from './postwar-monetary-genesis.js';
import {
  consumePostwarLabourGenesis,
  type PostwarLabourGenesisPreparation,
} from './postwar-labour-genesis.js';
import {
  isPostwarWagePolicy,
  type PostwarWagePolicy,
} from './postwar-wage-policy.js';
import { readPostwarLiquidFundingAccountsFromSeed } from './postwar-financial-genesis.js';

export const POSTWAR_FUNDING_POLICY = Object.freeze({
  version: 'POSTWAR_SHARED_FUNDING_20261028_V1',
  classification: 'GENERATED_POLICY',
  payrollDays: '1',
  simulationDaysPerYear: '360',
  reservationQuantumLC: '0.01',
  payrollReservation: 'CEIL_EXACT_FIRST_DAY_PAYROLL_TO_CENTS_PER_POSITION',
  publicReservation:
    'PAYROLL_FIRST_THEN_PRO_RATA_CENTS_LARGEST_REMAINDER_STABLE_PURPOSE_ID',
  balanceRule: 'ORIGINAL_GOV_TGA_OR_OP_BUSINESS_DEPOSIT_TIMES_SAME_BOUND_FX',
  noNewMoney: true,
});
export interface PostwarPublicFundingRequest {
  readonly requestId: string;
  readonly purposeId: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly kind: 'OPERATING' | 'WELFARE';
  readonly currency: string;
  /** Non-payroll amount actually requested for this due window, not annual cash. */
  readonly amount: string;
  readonly periodDays: '1' | '30';
  readonly payerEntityId?: string;
  readonly accountRef?: string;
  readonly sourceBalanceRef?: string;
}
export interface PostwarFundingAccount {
  readonly countryId: string;
  readonly payerEntityId: string;
  readonly payerRole: 'GOV' | 'OP';
  readonly accountRef: string;
  readonly accountClass: 'TGA_ASSET' | 'BUSINESS_DEPOSIT_ASSET';
  readonly accountNature: 'CANONICAL_OPENING_SEED_FINANCIAL_ASSET';
  readonly claimId: string;
  readonly issuerEntityId: string;
  readonly counterpartAccountId: string;
  readonly openingSourceId: string;
  readonly currency: string;
  readonly sourceBalanceRef: string;
  readonly sourceBalanceSHA256: string;
  readonly originalGcuAmount: string;
  readonly localCurrencyPerGcu: string;
  readonly fxVersion: string;
  readonly availableAmount: string;
  readonly reservedPayrollAmount: string;
  readonly reservedPublicAmount: string;
  readonly reservedAmount: string;
  readonly remainingAmount: string;
}
export interface PostwarFundingAllocation {
  readonly purposeId: string;
  readonly fundingRef: string;
  readonly countryId: string;
  readonly locationId: string;
  readonly payerEntityId: string;
  readonly accountRef: string;
  readonly currency: string;
  readonly amount: string;
  readonly period: 'SIM_DAY' | 'SIM_30_DAYS';
  readonly periodDays: '1' | '30';
  readonly sourceBalanceRef: string;
  readonly kind: 'PAYROLL' | 'OPERATING' | 'WELFARE';
  readonly requestedReservationAmount: string;
  readonly uncoveredReservationAmount: string;
}
export interface PostwarPositionFunding extends PostwarFundingAllocation {
  readonly kind: 'PAYROLL';
  readonly period: 'SIM_DAY';
  readonly periodDays: '1';
  readonly positionId: string;
  readonly filledCount: string;
  readonly exactFirstDayPayrollLC: Readonly<{
    numerator: string;
    denominator: string;
  }>;
  readonly payrollFundingRef: string;
}
export interface PostwarFundingGenesis {
  readonly schemaVersion: 'postwar-shared-funding-genesis-v1';
  readonly policy: typeof POSTWAR_FUNDING_POLICY;
  readonly fingerprint: string;
  readonly accounts: readonly PostwarFundingAccount[];
  /** Full source balances for downstream cross-checks, never independent office pots. */
  readonly balances: readonly PostwarFundingAccount[];
  readonly positionFunding: readonly PostwarPositionFunding[];
  readonly allocations: readonly PostwarFundingAllocation[];
  readonly wagesByPositionId: Readonly<
    Record<
      string,
      Readonly<{
        wageAmount: string;
        wageCurrency: string;
        wagePeriod: 'SIM_YEAR';
        wageVersion: string;
        payrollFundingRef: string;
      }>
    >
  >;
  readonly moneyCreated: false;
  readonly balancesChanged: false;
  readonly paymentsGenerated: false;
  readonly sourceAdmitted: false;
}
const issued = new WeakSet<object>();
const hash = (value: unknown) =>
  createHash('sha256').update(canonicalSerialize(value)).digest('hex');
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function invalid(reason: string): never {
  throw new Error(`POSTWAR_FUNDING: ${reason}`);
}
function exact(value: string): { n: bigint; d: bigint } {
  const parsed = parseWorldDecimal(value);
  if (parsed.isNegative()) invalid('Negative money is not a reservation');
  const canonical = canonicalDecimal(parsed);
  const [whole, fraction = ''] = canonical.split('.');
  return { n: BigInt(whole! + fraction), d: 10n ** BigInt(fraction.length) };
}
function cents(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
const floorCents = (value: string) => {
  const a = exact(value);
  return (a.n * 100n) / a.d;
};
const ceilCents = (value: string) => {
  const a = exact(value);
  return ceil(a.n * 100n, a.d);
};
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function consumePostwarFundingGenesis(
  value: PostwarFundingGenesis,
): PostwarFundingGenesis {
  if (!issued.has(value)) invalid('Issued shared funding calculation required');
  return value;
}
export class PostwarFundingCashConstraint extends Error {
  constructor(
    readonly countryId: string,
    readonly payerEntityId: string,
    readonly currency: string,
    readonly requiredFirstDayAmount: string,
    readonly availableAmount: string,
  ) {
    super(
      `POSTWAR_FUNDING_CASH_SHORTFALL:${canonicalSerialize({ countryId, payerEntityId, currency, requiredFirstDayAmount, availableAmount })}`,
    );
  }
}

export function createPostwarFundingGenesis(input: {
  readonly source: VerifiedOfficialOpeningSource;
  readonly openingSeed: OpeningSeed;
  readonly monetary: PostwarMonetaryGenesis;
  readonly labourPreparation: PostwarLabourGenesisPreparation;
  readonly wages: PostwarWagePolicy;
  readonly publicRequests: readonly PostwarPublicFundingRequest[];
}): PostwarFundingGenesis {
  if (!isVerifiedOfficialOpeningDecisionSource(input.source))
    invalid('Verified selected source required');
  consumePostwarMonetaryGenesis(input.monetary);
  const labour = consumePostwarLabourGenesis(input.labourPreparation);
  if (
    !isPostwarWagePolicy(input.wages) ||
    input.wages.sourceChecksumsSha256 !== input.source.pins.checksumsSha256 ||
    labour.sourceChecksumsSha256 !== input.source.pins.checksumsSha256 ||
    SIMULATION_DAYS_PER_YEAR !== '360'
  )
    invalid('Mixed/untrusted source, labour, wage or calendar');
  const finance = input.source.domains.find((row) => row.dataset === 'finance');
  if (!finance) invalid('Finance provenance missing');
  const seedAccounts = readPostwarLiquidFundingAccountsFromSeed(
    input.openingSeed,
  );
  const accounts = new Map<string, PostwarFundingAccount>();
  for (const binding of input.monetary.bindings) {
    const wageCountry = input.wages.countries.find(
      (row) => row.countryId === binding.countryId,
    );
    if (
      !wageCountry ||
      wageCountry.currency !== binding.localCurrency ||
      wageCountry.localCurrencyPerGcu !== binding.localCurrencyPerGcu ||
      wageCountry.fxVersion !== binding.fxVersion ||
      wageCountry.sourceCountryId !== binding.sourceCountryId
    )
      invalid('Currency/FX does not match actual wage policy');
    const sourceIndex = input.source.financeOriginals.findIndex(
      (row) => row.countryId === binding.sourceCountryId,
    );
    const raw = input.source.financeOriginals[sourceIndex];
    if (!raw || raw.currency !== 'GCU_SCENARIO_ACCOUNTING_UNIT')
      invalid('Source balance missing or wrong denomination');
    for (const role of ['GOV', 'OP'] as const) {
      const employer = labour.employers.filter(
        (row) => row.countryId === binding.countryId && row.role === role,
      );
      if (employer.length !== 1 || !employer[0])
        invalid('Unique mapped payer employer required');
      const field =
        role === 'GOV' ? 'treasuryCentralBankBalance' : 'businessBankDeposits';
      if (typeof raw[field] !== 'string')
        invalid('Lossless original payer balance required');
      exact(raw[field]);
      const amount = canonicalDecimal(
        parseWorldDecimal(raw[field]).mul(binding.localCurrencyPerGcu),
      );
      Money.from(amount, binding.localCurrency);
      const sourceBalanceRef = `data/finance.json#/${sourceIndex}/${field}`;
      const kind = role === 'GOV' ? 'TREASURY_TGA' : 'OPERATOR_BANK_DEPOSIT';
      const candidates = seedAccounts.filter(
        (entry) => entry.countryId === binding.countryId && entry.kind === kind,
      );
      if (
        candidates.length !== 1 ||
        !candidates[0] ||
        candidates[0].ownerId !== employer[0].employerId ||
        candidates[0].currency !== binding.localCurrency ||
        !parseWorldDecimal(candidates[0].availableAmount).eq(amount)
      )
        invalid('Exact canonical opening payer asset/source balance required');
      const seedAccount = candidates[0];
      const accountRef = seedAccount.accountId;
      accounts.set(`${binding.countryId}:${role}`, {
        countryId: binding.countryId,
        payerEntityId: employer[0].employerId,
        payerRole: role,
        accountRef,
        accountClass: role === 'GOV' ? 'TGA_ASSET' : 'BUSINESS_DEPOSIT_ASSET',
        accountNature: 'CANONICAL_OPENING_SEED_FINANCIAL_ASSET',
        claimId: seedAccount.claimId,
        issuerEntityId: seedAccount.issuerEntityId,
        counterpartAccountId: seedAccount.counterpartAccountId,
        openingSourceId: seedAccount.sourceId,
        currency: binding.localCurrency,
        sourceBalanceRef,
        sourceBalanceSHA256: finance.sourceSha256,
        originalGcuAmount: raw[field],
        localCurrencyPerGcu: binding.localCurrencyPerGcu,
        fxVersion: binding.fxVersion,
        availableAmount: amount,
        reservedPayrollAmount: '0',
        reservedPublicAmount: '0',
        reservedAmount: '0',
        remainingAmount: amount,
      });
    }
  }
  if (accounts.size !== 140) invalid('All 70 mapped GOV/OP accounts required');
  const positionFunding: PostwarPositionFunding[] = [],
    publicAllocations: PostwarFundingAllocation[] = [];
  const reservedPayroll = new Map<string, bigint>();
  const wagesByPositionId: Record<
    string,
    PostwarFundingGenesis['wagesByPositionId'][string]
  > = Object.create(null) as Record<
    string,
    PostwarFundingGenesis['wagesByPositionId'][string]
  >;
  const positionIds = new Set(labour.positions.map((row) => row.positionId));
  if (Object.keys(input.wages.wagesByPositionId).length !== positionIds.size)
    invalid('Wages must bind exactly the prepared position set');
  for (const position of [...labour.positions].sort((a, b) =>
    compare(a.positionId, b.positionId),
  )) {
    const account = accounts.get(
      `${position.countryId}:${position.employerRole}`,
    );
    const quote = input.wages.wagesByPositionId[position.positionId];
    if (
      !account ||
      position.employerId !== account.payerEntityId ||
      !quote ||
      quote.wageCurrency !== account.currency ||
      quote.wagePeriod !== 'SIM_YEAR'
    )
      invalid('Position payer/country/currency binding differs');
    const wage = exact(quote.wageAmount),
      filled = BigInt(position.filledCount);
    const numerator = wage.n * filled,
      denominator = wage.d * 360n;
    const required = ceil(numerator * 100n, denominator);
    const key = `${position.countryId}:${position.employerRole}`;
    reservedPayroll.set(key, (reservedPayroll.get(key) ?? 0n) + required);
    const fundingRef = `PW_FUNDING_${hash([POSTWAR_FUNDING_POLICY.version, account.accountRef, account.openingSourceId, account.currency, account.fxVersion, account.sourceBalanceSHA256, account.sourceBalanceRef, quote.wageVersion, position.positionId, position.filledCount, required.toString(), '1']).toUpperCase()}`;
    positionFunding.push({
      purposeId: position.positionId,
      positionId: position.positionId,
      fundingRef,
      payrollFundingRef: fundingRef,
      countryId: position.countryId,
      locationId: position.locationId,
      payerEntityId: account.payerEntityId,
      accountRef: account.accountRef,
      currency: account.currency,
      amount: cents(required),
      period: 'SIM_DAY',
      periodDays: '1',
      sourceBalanceRef: account.sourceBalanceRef,
      kind: 'PAYROLL',
      filledCount: position.filledCount,
      exactFirstDayPayrollLC: {
        numerator: numerator.toString(),
        denominator: denominator.toString(),
      },
      requestedReservationAmount: cents(required),
      uncoveredReservationAmount: '0.00',
    });
    wagesByPositionId[position.positionId] = {
      wageAmount: quote.wageAmount,
      wageCurrency: quote.wageCurrency,
      wagePeriod: quote.wagePeriod,
      wageVersion: quote.wageVersion,
      payrollFundingRef: fundingRef,
    };
  }
  const seen = new Set<string>();
  for (const request of input.publicRequests) {
    const account = accounts.get(`${request.countryId}:GOV`);
    if (
      !request.requestId ||
      request.requestId !== request.purposeId ||
      seen.has(request.purposeId) ||
      positionIds.has(request.purposeId)
    )
      invalid('Duplicate public purpose or already-covered payroll');
    seen.add(request.purposeId);
    if (
      !account ||
      !labour.regions.some(
        (region) =>
          region.countryId === request.countryId &&
          region.locationId === request.locationId,
      ) ||
      request.currency !== account.currency ||
      !['OPERATING', 'WELFARE'].includes(request.kind) ||
      !['1', '30'].includes(request.periodDays)
    )
      invalid('Public request country/location/currency/kind/window differs');
    if (
      (request.payerEntityId !== undefined &&
        request.payerEntityId !== account.payerEntityId) ||
      (request.accountRef !== undefined &&
        request.accountRef !== account.accountRef) ||
      (request.sourceBalanceRef !== undefined &&
        request.sourceBalanceRef !== account.sourceBalanceRef)
    )
      invalid('Public request payer/account/source balance reference differs');
    Money.from(request.amount, request.currency);
    exact(request.amount);
  }
  const finalAccounts = [...accounts.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([key, account]) => {
      const payroll = reservedPayroll.get(key) ?? 0n,
        available = floorCents(account.availableAmount);
      if (payroll > available)
        throw new PostwarFundingCashConstraint(
          account.countryId,
          account.payerEntityId,
          account.currency,
          cents(payroll),
          account.availableAmount,
        );
      const requests =
        account.payerRole === 'GOV'
          ? input.publicRequests
              .filter((request) => request.countryId === account.countryId)
              .map((request) => ({
                request,
                amount: ceilCents(request.amount),
              }))
              .sort((a, b) => compare(a.request.purposeId, b.request.purposeId))
          : [];
      const demand = requests.reduce((sum, row) => sum + row.amount, 0n),
        budget = available - payroll;
      const envelope = budget < demand ? budget : demand;
      const portions = requests.map((row) => ({
        ...row,
        assigned: demand ? (envelope * row.amount) / demand : 0n,
        remainder: demand ? (envelope * row.amount) % demand : 0n,
      }));
      let leftover =
        envelope - portions.reduce((sum, row) => sum + row.assigned, 0n);
      for (const row of [...portions].sort((a, b) =>
        a.remainder === b.remainder
          ? compare(a.request.purposeId, b.request.purposeId)
          : a.remainder > b.remainder
            ? -1
            : 1,
      )) {
        if (!leftover) break;
        if (row.assigned < row.amount) {
          row.assigned++;
          leftover--;
        }
      }
      if (leftover !== 0n) invalid('Pro-rata remainder conservation failed');
      for (const row of portions) {
        const request = row.request;
        publicAllocations.push({
          purposeId: request.purposeId,
          fundingRef: `PW_FUNDING_${hash([POSTWAR_FUNDING_POLICY.version, account.accountRef, account.openingSourceId, account.currency, account.fxVersion, account.sourceBalanceSHA256, account.sourceBalanceRef, request, row.assigned.toString()]).toUpperCase()}`,
          countryId: request.countryId,
          locationId: request.locationId,
          payerEntityId: account.payerEntityId,
          accountRef: account.accountRef,
          currency: account.currency,
          amount: cents(row.assigned),
          period: request.periodDays === '1' ? 'SIM_DAY' : 'SIM_30_DAYS',
          periodDays: request.periodDays,
          sourceBalanceRef: account.sourceBalanceRef,
          kind: request.kind,
          requestedReservationAmount: cents(row.amount),
          uncoveredReservationAmount: cents(row.amount - row.assigned),
        });
      }
      return {
        ...account,
        reservedPayrollAmount: cents(payroll),
        reservedPublicAmount: cents(envelope),
        reservedAmount: cents(payroll + envelope),
        remainingAmount: canonicalDecimal(
          parseWorldDecimal(account.availableAmount).minus(
            cents(payroll + envelope),
          ),
        ),
      };
    });
  const allocations = [...positionFunding, ...publicAllocations].sort((a, b) =>
    compare(a.purposeId, b.purposeId),
  );
  const body = {
    schemaVersion: 'postwar-shared-funding-genesis-v1' as const,
    policy: POSTWAR_FUNDING_POLICY,
    accounts: finalAccounts,
    balances: finalAccounts,
    positionFunding,
    allocations,
    wagesByPositionId: { ...wagesByPositionId },
    moneyCreated: false as const,
    balancesChanged: false as const,
    paymentsGenerated: false as const,
    sourceAdmitted: false as const,
  };
  const result: PostwarFundingGenesis = freeze({
    ...body,
    fingerprint: `sha256:${hash(body)}`,
  });
  issued.add(result);
  return result;
}
