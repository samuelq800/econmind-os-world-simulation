import { Decimal } from 'decimal.js';

import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';

export const WorldDecimal = Decimal.clone({
  precision: 80,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -1_000_000,
  toExpPos: 1_000_000,
});

export type WorldDecimalValue = Decimal;

const DECIMAL_STRING = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const MAX_DIGITS = 120;

export function parseWorldDecimal(value: string): WorldDecimalValue {
  if (
    typeof value !== 'string' ||
    !DECIMAL_STRING.test(value) ||
    value.replace(/[-.]/gu, '').length > MAX_DIGITS
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
