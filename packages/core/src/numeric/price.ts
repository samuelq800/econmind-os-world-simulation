import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { Money } from './money.js';
import { Quantity } from './quantity.js';
import {
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from './world-decimal.js';

export class Price {
  readonly amount: WorldDecimalValue;
  readonly currency: string;
  readonly perUnit: string;

  private constructor(
    amount: WorldDecimalValue,
    currency: string,
    perUnit: string,
  ) {
    this.amount = amount;
    this.currency = currency;
    this.perUnit = perUnit;
    Object.freeze(this);
  }

  static from(amount: string, currency: string, perUnit: string): Price {
    Money.from('0', currency);
    Quantity.from('0', perUnit);
    return new Price(parseWorldDecimal(amount), currency, perUnit);
  }

  multiply(quantity: Quantity): Money {
    if (quantity.unit !== this.perUnit) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.UNIT_MISMATCH,
        'Price and quantity units must match',
      );
    }
    return Money.from(
      canonicalDecimal(this.amount.times(quantity.amount)),
      this.currency,
    );
  }

  toCanonicalValue() {
    return {
      amount: canonicalDecimal(this.amount),
      currency: this.currency,
      perUnit: this.perUnit,
    };
  }
}
