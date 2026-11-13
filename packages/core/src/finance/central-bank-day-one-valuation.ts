/** Read-only denomination view for the already adopted first-day quote.
 * Every original currency/account stays on the genuine ledger. This creates
 * no posting, equity, profit, threshold, FX capacity or source authority. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import { isAuthoritativeFinancialLedgerState } from '../opening/ledger-authority.js';
import { type FinancialLedgerState } from './financial-ledger.js';
import {
  parsePostwarDayOneFxQuoteData,
  type PostwarDayOneFxQuoteData,
} from './postwar-day-one-treasury-fx.js';
import { Money } from '../numeric/money.js';
import { isSimTime, type SimTime } from '../numeric/sim-time.js';
import type { Sha256Hex } from '../commands/command.js';
function invalid(s: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'CB_DAY_ONE_VALUATION:' + s,
  );
}
/** Exact finite decimal product with no rounding or binary float. Money's
 * numeric bounds still apply to the returned representation. */
function product(a: string, b: string): string {
  const parse = (v: string) => {
    if (!/^-?(0|[1-9]\d*)(\.\d+)?$/u.test(v)) invalid('EXACT_DECIMAL_REQUIRED');
    const negative = v.startsWith('-'),
      [w, f = ''] = (negative ? v.slice(1) : v).split('.');
    return { n: BigInt(w! + f) * (negative ? -1n : 1n), scale: f.length };
  };
  const x = parse(a),
    y = parse(b),
    n = x.n * y.n,
    scale = x.scale + y.scale,
    negative = n < 0n,
    digits = (negative ? -n : n).toString().padStart(scale + 1, '0');
  const absolute = scale
    ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
        .replace(/0+$/u, '')
        .replace(/\.$/u, '')
    : digits;
  return negative && n !== 0n ? '-' + absolute : absolute;
}
/** Adds the complete foreign cash/equity denomination view to a snapshot
 * already derived from the actual LC register. Complete OMO reconciliation
 * subsequently checks these values against the same ledger and quote. */
export function projectCentralBankDayOneValuedSnapshot<
  T extends {
    readonly currency: string;
    readonly equity: { readonly amount: string; readonly currency: string };
  },
>(input: {
  readonly financial: FinancialLedgerState;
  readonly quote: PostwarDayOneFxQuoteData;
  readonly ownerRef: string;
  readonly simTime: SimTime;
  readonly sha256Hex: Sha256Hex;
  readonly snapshot: T;
  readonly assetField: 'settlementCash' | 'otherAssets';
}): Readonly<T> {
  const v = valueCentralBankDayOneForeignRegister(input),
    raw = (input.snapshot as Readonly<Record<string, unknown>>)[
      input.assetField
    ];
  if (
    input.snapshot.currency !== v.localCurrency ||
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw)
  )
    invalid('EXACT_LC_SNAPSHOT_REQUIRED');
  const asset = raw as {
    readonly amount?: unknown;
    readonly currency?: unknown;
  };
  if (
    typeof asset.amount !== 'string' ||
    asset.currency !== v.localCurrency ||
    input.snapshot.equity.currency !== v.localCurrency
  )
    invalid('EXACT_LC_SNAPSHOT_REQUIRED');
  return Object.freeze({
    ...input.snapshot,
    [input.assetField]: Money.from(asset.amount, v.localCurrency)
      .add(Money.from(v.assetAddition.amount, v.localCurrency))
      .toCanonicalValue(),
    equity: Money.from(input.snapshot.equity.amount, v.localCurrency)
      .add(Money.from(v.equityAddition.amount, v.localCurrency))
      .toCanonicalValue(),
  });
}
export function valueCentralBankDayOneForeignRegister(input: {
  readonly financial: FinancialLedgerState;
  readonly quote: PostwarDayOneFxQuoteData;
  readonly ownerRef: string;
  readonly simTime: SimTime;
  readonly sha256Hex: Sha256Hex;
}) {
  if (
    !isAuthoritativeFinancialLedgerState(input.financial) ||
    !isSimTime(input.simTime)
  )
    invalid('GENUINE_LEDGER_AND_TIME_REQUIRED');
  const q = parsePostwarDayOneFxQuoteData(input.quote, input.sha256Hex);
  if (
    input.financial.worldId !== q.worldId ||
    ![q.bankEntityId, q.centralBankEntityId].includes(input.ownerRef) ||
    input.simTime.ticks < BigInt(q.validFromSimTime) ||
    input.simTime.ticks >= BigInt(q.validUntilSimTime)
  )
    invalid('SAME_COUNTRY_ADOPTED_DAY_QUOTE_REQUIRED');
  let assets = Money.from('0', q.localCurrency),
    equity = Money.from('0', q.localCurrency);
  const entries = input.financial.accounts
    .filter(
      (a) => a.ownerId === input.ownerRef && a.currency !== q.localCurrency,
    )
    .map((account) => {
      if (
        account.worldId !== q.worldId ||
        account.countryId !== q.countryId ||
        account.currency !== 'GCU' ||
        !['CASH', 'EQUITY'].includes(account.accountClass) ||
        account.claimId !== null ||
        account.counterpartyEntityId !== null
      )
        invalid('FULL_FOREIGN_INSTRUMENT_VALUATION_REQUIRED');
      const found = input.financial.positions.filter(
        (p) => p.account.accountId === account.accountId,
      );
      if (found.length !== 1) invalid('EXACT_ACTUAL_POSITION_REQUIRED');
      const amount = found[0]!.netDebitBalance;
      if (
        amount.currency !== 'GCU' ||
        (account.accountClass === 'CASH' && amount.amount.isNegative())
      )
        invalid('ACTUAL_NONOVERDRAWN_GCU_POSITION_REQUIRED');
      const signedLocal = Money.from(
        product(amount.toCanonicalValue().amount, q.localCurrencyPerGcu),
        q.localCurrency,
      );
      if (account.accountClass === 'CASH') assets = assets.add(signedLocal);
      else equity = equity.subtract(signedLocal);
      return Object.freeze({
        accountId: account.accountId,
        ownerRef: account.ownerId,
        accountClass: account.accountClass,
        currency: 'GCU' as const,
        signedNetDebitAmount: amount.toCanonicalValue().amount,
        localCurrency: q.localCurrency,
        signedLocalNetDebitAmount: signedLocal.toCanonicalValue().amount,
      });
    });
  return Object.freeze({
    classification: 'READ_ONLY_DAY_ONE_FOREIGN_VALUATION_NOT_LEDGER' as const,
    worldId: q.worldId,
    worldVersion: input.financial.worldVersion,
    countryId: q.countryId,
    ownerRef: input.ownerRef,
    localCurrency: q.localCurrency,
    quoteRef: q.quoteRef,
    quoteSha256: q.quoteSha256,
    localCurrencyPerGcu: q.localCurrencyPerGcu,
    observedSimTime: input.simTime.toCanonicalValue(),
    validUntilSimTime: q.validUntilSimTime,
    entries: Object.freeze(entries),
    assetAddition: assets.toCanonicalValue(),
    equityAddition: equity.toCanonicalValue(),
  });
}
