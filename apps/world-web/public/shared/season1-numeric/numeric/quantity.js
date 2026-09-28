import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { assertWorldDecimalResult, canonicalDecimal, parseWorldDecimal, } from './world-decimal.js';
const quantityInstances = new WeakSet();
export class Quantity {
    amount;
    unit;
    constructor(amount, unit) {
        this.amount = amount;
        this.unit = unit;
        quantityInstances.add(this);
        Object.freeze(this);
    }
    static from(amount, unit) {
        if (!/^[A-Za-z][A-Za-z0-9 _/-]{0,63}$/u.test(unit)) {
            throw new DomainError(DOMAIN_ERROR_CODES.INVALID_QUANTITY_UNIT, 'Quantity unit is not canonical');
        }
        return new Quantity(parseWorldDecimal(amount), unit);
    }
    add(other) {
        this.assertUnit(other);
        return new Quantity(assertWorldDecimalResult(this.amount.plus(other.amount)), this.unit);
    }
    subtract(other) {
        this.assertUnit(other);
        return new Quantity(assertWorldDecimalResult(this.amount.minus(other.amount)), this.unit);
    }
    toCanonicalValue() {
        return { amount: canonicalDecimal(this.amount), unit: this.unit };
    }
    assertUnit(other) {
        if (this.unit !== other.unit) {
            throw new DomainError(DOMAIN_ERROR_CODES.UNIT_MISMATCH, 'Quantity units must match');
        }
    }
}
export function isQuantity(value) {
    return (typeof value === 'object' && value !== null && quantityInstances.has(value));
}
