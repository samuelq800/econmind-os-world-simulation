import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { assertWorldDecimalResult, canonicalDecimal, parseWorldDecimal, } from './world-decimal.js';
const moneyInstances = new WeakSet();
export class Money {
    amount;
    currency;
    constructor(amount, currency) {
        this.amount = amount;
        this.currency = currency;
        moneyInstances.add(this);
        Object.freeze(this);
    }
    static from(amount, currency) {
        if (!/^[A-Z]{3}$/u.test(currency)) {
            throw new DomainError(DOMAIN_ERROR_CODES.INVALID_ID, 'Currency must be an uppercase ISO-style identifier');
        }
        return new Money(parseWorldDecimal(amount), currency);
    }
    add(other) {
        this.assertCurrency(other);
        return new Money(assertWorldDecimalResult(this.amount.plus(other.amount)), this.currency);
    }
    subtract(other) {
        this.assertCurrency(other);
        return new Money(assertWorldDecimalResult(this.amount.minus(other.amount)), this.currency);
    }
    toCanonicalValue() {
        return { amount: canonicalDecimal(this.amount), currency: this.currency };
    }
    assertCurrency(other) {
        if (this.currency !== other.currency) {
            throw new DomainError(DOMAIN_ERROR_CODES.CURRENCY_MISMATCH, 'Money currencies must match');
        }
    }
}
export function isMoney(value) {
    return (typeof value === 'object' && value !== null && moneyInstances.has(value));
}
