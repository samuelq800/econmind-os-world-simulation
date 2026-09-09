import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  assertWorldDecimalResult,
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from './world-decimal.js';

const moneyInstances = new WeakSet<object>();

export class Money {
  readonly amount: WorldDecimalValue;
  readonly currency: string;

  private constructor(amount: WorldDecimalValue, currency: string) {
    this.amount = amount;
    this.currency = currency;
    moneyInstances.add(this);
    Object.freeze(this);
  }

  static from(amount: string, currency: string): Money {
    if (!/^[A-Z]{3}$/u.test(currency)) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.INVALID_ID,
        'Currency must be an uppercase ISO-style identifier',
      );
    }
    return new Money(parseWorldDecimal(amount), currency);
  }

  add(other: Money): Money {
    this.assertCurrency(other);
    return new Money(
      assertWorldDecimalResult(this.amount.plus(other.amount)),
      this.currency,
    );
  }

  subtract(other: Money): Money {
    this.assertCurrency(other);
    return new Money(
      assertWorldDecimalResult(this.amount.minus(other.amount)),
      this.currency,
    );
  }

  toCanonicalValue() {
    return { amount: canonicalDecimal(this.amount), currency: this.currency };
  }

  private assertCurrency(other: Money) {
    if (this.currency !== other.currency) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.CURRENCY_MISMATCH,
        'Money currencies must match',
      );
    }
  }
}

export function isMoney(value: unknown): value is Money {
  return (
    typeof value === 'object' && value !== null && moneyInstances.has(value)
  );
}
