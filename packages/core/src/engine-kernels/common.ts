import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from '../numeric/world-decimal.js';

export type { WorldDecimalValue } from '../numeric/world-decimal.js';

/** Canonical decimal-string input/output used by pure, non-persistent engines. */
export type ExactDecimal = string;

export interface ExactMoney {
  readonly amount: ExactDecimal;
  readonly currency: string;
}

export interface ExactQuantity {
  readonly amount: ExactDecimal;
  readonly unit: string;
}

/** A dimensionless proportion, always expressed explicitly rather than naked. */
export interface ExactRatio {
  readonly amount: ExactDecimal;
  readonly unit: 'ratio';
}

/** A dimensional output quantity created per one input quantity unit. */
export interface ExactUnitRate {
  readonly amount: ExactDecimal;
  readonly outputUnit: string;
  readonly inputUnit: string;
}

/** A monetary price whose physical denominator is retained. */
export interface ExactUnitPrice {
  readonly amount: ExactDecimal;
  readonly currency: string;
  readonly perUnit: string;
}

export function kernelInvalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.ENGINE_KERNEL_INVALID, message);
}

export function decimal(value: ExactDecimal, label: string): WorldDecimalValue {
  try {
    return parseWorldDecimal(value);
  } catch {
    return kernelInvalid(`${label} must be a canonical exact decimal`);
  }
}

export function nonNegative(
  value: ExactDecimal,
  label: string,
): WorldDecimalValue {
  const parsed = decimal(value, label);
  if (parsed.isNegative()) kernelInvalid(`${label} must be non-negative`);
  return parsed;
}

export function positive(
  value: ExactDecimal,
  label: string,
): WorldDecimalValue {
  const parsed = nonNegative(value, label);
  if (parsed.isZero()) kernelInvalid(`${label} must be positive`);
  return parsed;
}

function factor(value: ExactDecimal, label: string): WorldDecimalValue {
  const parsed = nonNegative(value, label);
  if (parsed.greaterThan(1)) kernelInvalid(`${label} must be in [0, 1]`);
  return parsed;
}

export function ratio(value: ExactRatio, label: string): WorldDecimalValue {
  if (value.unit !== 'ratio') kernelInvalid(`${label} must use ratio`);
  return factor(value.amount, label);
}

export function render(value: WorldDecimalValue): ExactDecimal {
  return canonicalDecimal(value);
}

export function minimum(
  values: readonly WorldDecimalValue[],
  label: string,
): WorldDecimalValue {
  const first = values[0];
  if (first === undefined)
    kernelInvalid(`${label} requires at least one value`);
  let result = first;
  for (const value of values.slice(1)) {
    if (value.lessThan(result)) result = value;
  }
  return result;
}

export function maximum(
  values: readonly WorldDecimalValue[],
  label: string,
): WorldDecimalValue {
  const first = values[0];
  if (first === undefined)
    kernelInvalid(`${label} requires at least one value`);
  let result = first;
  for (const value of values.slice(1)) {
    if (value.greaterThan(result)) result = value;
  }
  return result;
}

function checkedCurrency(currency: string): string {
  if (!/^[A-Z]{3}$/u.test(currency))
    kernelInvalid('Money currency must be canonical');
  return currency;
}

export function money(
  value: ExactMoney,
  label: string,
): { amount: WorldDecimalValue; currency: string } {
  return {
    amount: decimal(value.amount, label),
    currency: checkedCurrency(value.currency),
  };
}

export function renderMoney(
  amount: WorldDecimalValue,
  currency: string,
): ExactMoney {
  return Object.freeze({
    amount: render(amount),
    currency: checkedCurrency(currency),
  });
}

export function addMoney(
  values: readonly ExactMoney[],
  label: string,
): ExactMoney {
  const first = values[0];
  if (first === undefined)
    kernelInvalid(`${label} requires at least one monetary value`);
  const parsed = money(first, label);
  let total = parsed.amount;
  for (const value of values.slice(1)) {
    const next = money(value, label);
    if (next.currency !== parsed.currency)
      kernelInvalid(`${label} currencies must match`);
    total = total.plus(next.amount);
  }
  return renderMoney(total, parsed.currency);
}

export function subtractMoney(
  minuend: ExactMoney,
  subtrahends: readonly ExactMoney[],
  label: string,
): ExactMoney {
  const parsed = money(minuend, label);
  let amount = parsed.amount;
  for (const value of subtrahends) {
    const next = money(value, label);
    if (next.currency !== parsed.currency)
      kernelInvalid(`${label} currencies must match`);
    amount = amount.minus(next.amount);
  }
  return renderMoney(amount, parsed.currency);
}

export function quantity(
  value: ExactQuantity,
  label: string,
): { amount: WorldDecimalValue; unit: string } {
  if (!/^[A-Za-z][A-Za-z0-9 _/-]{0,63}$/u.test(value.unit)) {
    kernelInvalid(`${label} unit must be canonical`);
  }
  return { amount: decimal(value.amount, label), unit: value.unit };
}

/**
 * Keeps stock/flow engines from accepting people, cases, ratios, or currency
 * labels where a transferable physical commodity or energy unit is required.
 * Domain catalogs can use any canonical physical unit (for example tonne,
 * barrel, MWh, or cubic_metre) without collapsing it to an untyped decimal.
 */
export function physicalQuantity(
  value: ExactQuantity,
  label: string,
): { amount: WorldDecimalValue; unit: string } {
  const parsed = quantity(value, label);
  if (
    /^(?:person|case|bed|housing_unit|incident|firm|ratio)$/u.test(
      parsed.unit,
    ) ||
    /^[A-Z]{3}$/u.test(parsed.unit)
  ) {
    kernelInvalid(`${label} must use a physical commodity or energy unit`);
  }
  return { amount: nonNegative(value.amount, label), unit: parsed.unit };
}

export function requiredQuantity(
  value: ExactQuantity,
  expectedUnit: string,
  label: string,
): { amount: WorldDecimalValue; unit: string } {
  const parsed = quantity(value, label);
  if (parsed.unit !== expectedUnit) {
    kernelInvalid(`${label} must use ${expectedUnit}`);
  }
  return parsed;
}

export function nonNegativeQuantity(
  value: ExactQuantity,
  expectedUnit: string,
  label: string,
): { amount: WorldDecimalValue; unit: string } {
  const parsed = requiredQuantity(value, expectedUnit, label);
  return { amount: nonNegative(value.amount, label), unit: parsed.unit };
}

export function wholeQuantity(
  value: ExactQuantity,
  expectedUnit: string,
  label: string,
): { amount: WorldDecimalValue; unit: string } {
  const parsed = nonNegativeQuantity(value, expectedUnit, label);
  if (!parsed.amount.isInteger()) {
    kernelInvalid(`${label} must be a whole ${expectedUnit} count`);
  }
  return parsed;
}

export function renderQuantity(
  amount: WorldDecimalValue,
  unit: string,
): ExactQuantity {
  return Object.freeze({
    amount: render(amount),
    unit: quantity({ amount: '0', unit }, 'quantity result').unit,
  });
}

/** Renders a non-negative dimensional rate without falsely treating it as a [0,1] proportion. */
export function renderUnitRate(
  amount: WorldDecimalValue,
  outputUnit: string,
  inputUnit: string,
): ExactUnitRate {
  if (amount.isNegative()) {
    kernelInvalid('Unit rate result must be non-negative');
  }
  return Object.freeze({
    amount: render(amount),
    outputUnit: quantity({ amount: '0', unit: outputUnit }, 'unit rate output')
      .unit,
    inputUnit: quantity({ amount: '0', unit: inputUnit }, 'unit rate input')
      .unit,
  });
}

export function unitRate(
  value: ExactUnitRate,
  expectedInputUnit: string,
  expectedOutputUnit: string,
  label: string,
): WorldDecimalValue {
  if (
    quantity({ amount: '0', unit: value.inputUnit }, `${label} inputUnit`)
      .unit !== expectedInputUnit
  ) {
    kernelInvalid(`${label} inputUnit must use ${expectedInputUnit}`);
  }
  if (
    quantity({ amount: '0', unit: value.outputUnit }, `${label} outputUnit`)
      .unit !== expectedOutputUnit
  ) {
    kernelInvalid(`${label} outputUnit must use ${expectedOutputUnit}`);
  }
  return nonNegative(value.amount, `${label} amount`);
}

export function applyUnitRate(
  input: ExactQuantity,
  value: ExactUnitRate,
  label: string,
): ExactQuantity {
  const parsedInput = requiredQuantity(
    input,
    value.inputUnit,
    `${label} input`,
  );
  const rate = unitRate(value, value.inputUnit, value.outputUnit, label);
  return renderQuantity(parsedInput.amount.times(rate), value.outputUnit);
}

export function unitPrice(
  value: ExactUnitPrice,
  expectedPerUnit: string,
  label: string,
): { amount: WorldDecimalValue; currency: string; perUnit: string } {
  const currency = checkedCurrency(value.currency);
  const perUnit = quantity(
    { amount: '0', unit: value.perUnit },
    `${label} perUnit`,
  ).unit;
  if (perUnit !== expectedPerUnit) {
    kernelInvalid(`${label} perUnit must use ${expectedPerUnit}`);
  }
  return { amount: nonNegative(value.amount, label), currency, perUnit };
}

export function multiplyQuantityByUnitPrice(
  quantityValue: ExactQuantity,
  price: ExactUnitPrice,
  label: string,
): ExactMoney {
  const quantityParsed = requiredQuantity(
    quantityValue,
    price.perUnit,
    `${label} quantity`,
  );
  const priceParsed = unitPrice(price, price.perUnit, `${label} price`);
  return renderMoney(
    quantityParsed.amount.times(priceParsed.amount),
    priceParsed.currency,
  );
}

export function sameUnit(
  left: ExactQuantity,
  right: ExactQuantity,
  label: string,
): void {
  if (quantity(left, label).unit !== quantity(right, label).unit) {
    kernelInvalid(`${label} units must match`);
  }
}
