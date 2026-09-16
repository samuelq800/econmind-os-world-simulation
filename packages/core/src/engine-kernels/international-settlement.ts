import {
  kernelInvalid,
  money,
  nonNegative,
  render,
  renderMoney,
  type ExactDecimal,
  type ExactMoney,
} from './common.js';

/** The sole common currency permitted for cross-country settlement. */
export const INTERNATIONAL_SETTLEMENT_CURRENCY = 'ICU';

/**
 * A deterministic binding from one domestic currency unit to the international
 * settlement currency. `internationalPerLocalUnit` is never inferred from a
 * market feed: its version and period are caller-owned evidence.
 */
export interface InternationalCurrencyBinding {
  readonly localCurrency: string;
  readonly internationalCurrency: string;
  readonly internationalPerLocalUnit: ExactDecimal;
  readonly effectivePeriod: number;
  readonly version: string;
}

export interface InternationalSettlementResult {
  readonly payerCountry: string;
  readonly payeeCountry: string;
  /** The domestic debit remains explicit; it is not silently re-denominated. */
  readonly payerDomesticDebit: ExactMoney;
  /** Every cross-border settlement is expressed in the shared currency. */
  readonly internationalSettlement: ExactMoney;
  readonly bindingVersion: string;
  readonly effectivePeriod: number;
}

function stableIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    kernelInvalid(`${label} must be a stable identifier`);
  }
  return value;
}

function checkedPeriod(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    kernelInvalid(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function canonicalCurrency(currency: string, label: string): string {
  return money({ amount: '0', currency }, label).currency;
}

/**
 * Canonicalizes a caller-owned FX binding. This kernel deliberately does not
 * source rates, choose a rate, or mutate any central-bank/ledger state.
 */
export function canonicalizeInternationalCurrencyBinding(
  input: InternationalCurrencyBinding,
): InternationalCurrencyBinding {
  const localCurrency = canonicalCurrency(input.localCurrency, 'localCurrency');
  const internationalCurrency = canonicalCurrency(
    input.internationalCurrency,
    'internationalCurrency',
  );
  if (internationalCurrency !== INTERNATIONAL_SETTLEMENT_CURRENCY) {
    kernelInvalid(
      `internationalCurrency must use ${INTERNATIONAL_SETTLEMENT_CURRENCY}`,
    );
  }
  const rate = nonNegative(
    input.internationalPerLocalUnit,
    'internationalPerLocalUnit',
  );
  if (rate.isZero()) {
    kernelInvalid('internationalPerLocalUnit must be positive');
  }
  return Object.freeze({
    localCurrency,
    internationalCurrency,
    internationalPerLocalUnit: render(rate),
    effectivePeriod: checkedPeriod(input.effectivePeriod, 'effectivePeriod'),
    version: stableIdentifier(input.version, 'binding version'),
  });
}

/**
 * Requires exactly one fixed binding for each supplied currency and one common
 * settlement currency. This prevents a transaction from selecting its own FX
 * rate or changing settlement units part way through a batch.
 */
export function indexInternationalCurrencyBindings(
  bindings: readonly InternationalCurrencyBinding[],
): ReadonlyMap<string, InternationalCurrencyBinding> {
  if (bindings.length === 0) {
    kernelInvalid('At least one international currency binding is required');
  }
  const indexed = new Map<string, InternationalCurrencyBinding>();
  let sharedInternationalCurrency: string | null = null;
  let sharedEffectivePeriod: number | null = null;
  let sharedVersion: string | null = null;
  for (const bindingInput of bindings) {
    const binding = canonicalizeInternationalCurrencyBinding(bindingInput);
    if (indexed.has(binding.localCurrency)) {
      kernelInvalid('Each local currency may have only one active binding');
    }
    if (
      sharedInternationalCurrency !== null &&
      sharedInternationalCurrency !== binding.internationalCurrency
    ) {
      kernelInvalid(
        'All bindings in one settlement batch must share a currency',
      );
    }
    sharedInternationalCurrency = binding.internationalCurrency;
    if (
      sharedEffectivePeriod !== null &&
      sharedEffectivePeriod !== binding.effectivePeriod
    ) {
      kernelInvalid(
        'All bindings in one settlement batch must share an effective period',
      );
    }
    if (sharedVersion !== null && sharedVersion !== binding.version) {
      kernelInvalid(
        'All bindings in one settlement batch must share a version',
      );
    }
    sharedEffectivePeriod = binding.effectivePeriod;
    sharedVersion = binding.version;
    indexed.set(binding.localCurrency, binding);
  }
  return indexed;
}

/**
 * Fails closed if a world/configuration exposes a domestic currency without an
 * active binding to the common international settlement currency. Supplying
 * the authoritative enabled-currency list is deliberately the caller's job;
 * this pure core does not infer countries or currencies from mutable state.
 */
export function assertCurrenciesBoundToInternational(
  enabledCurrencies: readonly string[],
  bindings: readonly InternationalCurrencyBinding[],
): void {
  if (enabledCurrencies.length === 0) {
    kernelInvalid('At least one enabled currency is required');
  }
  const indexed = indexInternationalCurrencyBindings(bindings);
  const seen = new Set<string>();
  for (const currencyInput of enabledCurrencies) {
    const currency = canonicalCurrency(currencyInput, 'enabled currency');
    if (seen.has(currency)) {
      kernelInvalid('Enabled currencies must be unique');
    }
    seen.add(currency);
    if (!indexed.has(currency)) {
      kernelInvalid(`${currency} has no international currency binding`);
    }
  }
}

/** Converts an exact domestic amount to the fixed international settlement unit. */
export function convertToInternationalSettlementMoney(input: {
  readonly amount: ExactMoney;
  readonly binding: InternationalCurrencyBinding;
}): ExactMoney {
  const amount = money(input.amount, 'conversion amount');
  const binding = canonicalizeInternationalCurrencyBinding(input.binding);
  if (amount.currency !== binding.localCurrency) {
    kernelInvalid('Conversion amount currency must match its local binding');
  }
  return renderMoney(
    amount.amount.times(nonNegative(binding.internationalPerLocalUnit, 'rate')),
    binding.internationalCurrency,
  );
}

/**
 * Converts a cross-country payment before settlement. Domestic payments must
 * use domestic payment logic; they are rejected here instead of being silently
 * treated as international transfers.
 */
export function settleCrossBorderPayment(input: {
  readonly payerCountry: string;
  readonly payeeCountry: string;
  readonly payerAmount: ExactMoney;
  readonly payerBinding: InternationalCurrencyBinding;
}): InternationalSettlementResult {
  const payerCountry = stableIdentifier(input.payerCountry, 'payerCountry');
  const payeeCountry = stableIdentifier(input.payeeCountry, 'payeeCountry');
  if (payerCountry === payeeCountry) {
    kernelInvalid('Cross-border settlement requires different countries');
  }
  const payerDomesticDebit = money(input.payerAmount, 'payerAmount');
  if (payerDomesticDebit.amount.isNegative()) {
    kernelInvalid('payerAmount must be non-negative');
  }
  const binding = canonicalizeInternationalCurrencyBinding(input.payerBinding);
  const internationalSettlement = convertToInternationalSettlementMoney({
    amount: input.payerAmount,
    binding,
  });
  return Object.freeze({
    payerCountry,
    payeeCountry,
    payerDomesticDebit: renderMoney(
      payerDomesticDebit.amount,
      payerDomesticDebit.currency,
    ),
    internationalSettlement,
    bindingVersion: binding.version,
    effectivePeriod: binding.effectivePeriod,
  });
}

/**
 * The production-facing variant selects the payer quote only from the
 * complete, single-version settlement table. It is the integration point for
 * later atomic trade/remittance/foreign-debt postings.
 */
export function settleCrossBorderPaymentFromBindings(input: {
  readonly payerCountry: string;
  readonly payeeCountry: string;
  readonly payerAmount: ExactMoney;
  readonly currencyBindings: readonly InternationalCurrencyBinding[];
}): InternationalSettlementResult {
  const payerAmount = money(input.payerAmount, 'payerAmount');
  const bindings = indexInternationalCurrencyBindings(input.currencyBindings);
  const payerBinding = bindings.get(payerAmount.currency);
  if (payerBinding === undefined) {
    kernelInvalid(
      `${payerAmount.currency} has no international currency binding`,
    );
  }
  return settleCrossBorderPayment({
    payerCountry: input.payerCountry,
    payeeCountry: input.payeeCountry,
    payerAmount: input.payerAmount,
    payerBinding,
  });
}
