import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { canonicalDecimal, parseWorldDecimal, } from './world-decimal.js';
const rateInstances = new WeakSet();
export class Rate {
    value;
    constructor(value) {
        this.value = value;
        rateInstances.add(this);
        Object.freeze(this);
    }
    static from(value) {
        const decimal = parseWorldDecimal(value);
        if (decimal.isNegative() || decimal.greaterThan(1)) {
            throw new DomainError(DOMAIN_ERROR_CODES.INVALID_RATE, 'Rate must be between 0 and 1 inclusive');
        }
        return new Rate(decimal);
    }
    toCanonicalValue() {
        return canonicalDecimal(this.value);
    }
}
export function isRate(value) {
    return (typeof value === 'object' && value !== null && rateInstances.has(value));
}
