import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
const simTimeInstances = new WeakSet();
export class SimTime {
    ticks;
    constructor(ticks) {
        this.ticks = ticks;
        simTimeInstances.add(this);
        Object.freeze(this);
    }
    static fromTicks(ticks) {
        if (!/^(?:0|[1-9]\d*)$/u.test(ticks)) {
            throw new DomainError(DOMAIN_ERROR_CODES.INVALID_DECIMAL, 'Simulation ticks must be a non-negative canonical integer string');
        }
        return new SimTime(BigInt(ticks));
    }
    toCanonicalValue() {
        return this.ticks.toString();
    }
}
export function isSimTime(value) {
    return (typeof value === 'object' && value !== null && simTimeInstances.has(value));
}
