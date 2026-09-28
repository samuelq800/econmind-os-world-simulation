import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { Money } from './money.js';
import { Quantity } from './quantity.js';
import { assertWorldDecimalResult, canonicalDecimal, parseWorldDecimal, } from './world-decimal.js';
const priceInstances = new WeakSet();
export class Price {
    amount;
    currency;
    perUnit;
    constructor(amount, currency, perUnit) {
        this.amount = amount;
        this.currency = currency;
        this.perUnit = perUnit;
        priceInstances.add(this);
        Object.freeze(this);
    }
    static from(amount, currency, perUnit) {
        Money.from('0', currency);
        Quantity.from('0', perUnit);
        return new Price(parseWorldDecimal(amount), currency, perUnit);
    }
    multiply(quantity) {
        if (quantity.unit !== this.perUnit) {
            throw new DomainError(DOMAIN_ERROR_CODES.UNIT_MISMATCH, 'Price and quantity units must match');
        }
        return Money.from(canonicalDecimal(assertWorldDecimalResult(this.amount.times(quantity.amount))), this.currency);
    }
    toCanonicalValue() {
        return {
            amount: canonicalDecimal(this.amount),
            currency: this.currency,
            perUnit: this.perUnit,
        };
    }
}
export function isPrice(value) {
    return (typeof value === 'object' && value !== null && priceInstances.has(value));
}
