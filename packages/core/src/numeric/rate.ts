import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  canonicalDecimal,
  parseWorldDecimal,
  type WorldDecimalValue,
} from './world-decimal.js';

const rateInstances = new WeakSet<object>();

export class Rate {
  readonly value: WorldDecimalValue;

  private constructor(value: WorldDecimalValue) {
    this.value = value;
    rateInstances.add(this);
    Object.freeze(this);
  }

  static from(value: string): Rate {
    const decimal = parseWorldDecimal(value);
    if (decimal.isNegative() || decimal.greaterThan(1)) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.INVALID_RATE,
        'Rate must be between 0 and 1 inclusive',
      );
    }
    return new Rate(decimal);
  }

  toCanonicalValue() {
    return canonicalDecimal(this.value);
  }
}

export function isRate(value: unknown): value is Rate {
  return (
    typeof value === 'object' && value !== null && rateInstances.has(value)
  );
}
