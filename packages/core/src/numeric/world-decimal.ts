import { Decimal } from 'decimal.js';

import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';

export const WorldDecimal = Decimal.clone({
  // Two accepted operands contain at most 120 lexical digits each. A 240-digit
  // context therefore covers exact coefficient multiplication and the widest
  // scale-aligned addition/subtraction before result-domain validation.
  precision: 240,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -1_000_000,
  toExpPos: 1_000_000,
});

export type WorldDecimalValue = Decimal;

const DECIMAL_STRING = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
export const WORLD_DECIMAL_OPERAND_MAX_DIGITS = 120;
export const WORLD_DECIMAL_RESULT_MAX_DIGITS = 120;

function lexicalDigitCount(value: string): number {
  return value.replace(/[-.]/gu, '').length;
}

export function parseWorldDecimal(value: string): WorldDecimalValue {
  if (
    typeof value !== 'string' ||
    !DECIMAL_STRING.test(value) ||
    lexicalDigitCount(value) > WORLD_DECIMAL_OPERAND_MAX_DIGITS
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.INVALID_DECIMAL,
      'Authoritative decimals require a canonical decimal string',
    );
  }
  const decimal = new WorldDecimal(value);
  if (!decimal.isFinite()) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.NON_FINITE_DECIMAL,
      'Authoritative decimals must be finite',
    );
  }
  return decimal;
}

export function assertWorldDecimalResult(
  value: WorldDecimalValue,
): WorldDecimalValue {
  const rendered = canonicalDecimal(value);
  if (lexicalDigitCount(rendered) > WORLD_DECIMAL_RESULT_MAX_DIGITS) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.DECIMAL_RESULT_OUT_OF_RANGE,
      `Exact authoritative decimal result exceeds ${WORLD_DECIMAL_RESULT_MAX_DIGITS} digits`,
    );
  }
  return value;
}

export function canonicalDecimal(value: WorldDecimalValue): string {
  if (!value.isFinite()) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.NON_FINITE_DECIMAL,
      'Authoritative decimals must be finite',
    );
  }
  const rendered = value.toFixed();
  if (/^-?0(?:\.0+)?$/u.test(rendered)) return '0';
  if (!rendered.includes('.')) return rendered;
  return rendered.replace(/0+$/u, '').replace(/\.$/u, '');
}

export function toDisplayNumber(value: WorldDecimalValue): number {
  return value.toNumber();
}
