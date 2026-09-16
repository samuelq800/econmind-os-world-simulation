import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  WorldDecimal,
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

export function factor(value: ExactDecimal, label: string): WorldDecimalValue {
  const parsed = nonNegative(value, label);
  if (parsed.greaterThan(1)) kernelInvalid(`${label} must be in [0, 1]`);
  return parsed;
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

export function ratioOrNull(
  numerator: WorldDecimalValue,
  denominator: WorldDecimalValue,
): ExactDecimal | null {
  return denominator.isZero() ? null : render(numerator.dividedBy(denominator));
}

export function boundedRatioOrNull(
  numerator: WorldDecimalValue,
  denominator: WorldDecimalValue,
): ExactDecimal | null {
  if (denominator.isZero()) return null;
  return render(
    minimum([WorldDecimal(1), numerator.dividedBy(denominator)], 'ratio'),
  );
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

export function sameUnit(
  left: ExactQuantity,
  right: ExactQuantity,
  label: string,
): void {
  if (quantity(left, label).unit !== quantity(right, label).unit) {
    kernelInvalid(`${label} units must match`);
  }
}
