import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from './world-decimal.js';

export class Quantity {
  readonly amount: WorldDecimalValue;
  readonly unit: string;

  private constructor(amount: WorldDecimalValue, unit: string) {
    this.amount = amount;
    this.unit = unit;
    Object.freeze(this);
  }

  static from(amount: string, unit: string): Quantity {
    if (!/^[A-Za-z][A-Za-z0-9 _/-]{0,63}$/u.test(unit)) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.INVALID_QUANTITY_UNIT,
        'Quantity unit is not canonical',
      );
    }
    return new Quantity(parseWorldDecimal(amount), unit);
  }

  add(other: Quantity): Quantity {
    this.assertUnit(other);
    return new Quantity(this.amount.plus(other.amount), this.unit);
  }

  subtract(other: Quantity): Quantity {
    this.assertUnit(other);
    return new Quantity(this.amount.minus(other.amount), this.unit);
  }

  toCanonicalValue() {
    return { amount: canonicalDecimal(this.amount), unit: this.unit };
  }

  private assertUnit(other: Quantity) {
    if (this.unit !== other.unit) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.UNIT_MISMATCH,
        'Quantity units must match',
      );
    }
  }
}
