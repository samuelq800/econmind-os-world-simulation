import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';

const simTimeInstances = new WeakSet<object>();

export class SimTime {
  readonly ticks: bigint;

  private constructor(ticks: bigint) {
    this.ticks = ticks;
    simTimeInstances.add(this);
    Object.freeze(this);
  }

  static fromTicks(ticks: string): SimTime {
    if (!/^(?:0|[1-9]\d*)$/u.test(ticks)) {
      throw new DomainError(
        DOMAIN_ERROR_CODES.INVALID_DECIMAL,
        'Simulation ticks must be a non-negative canonical integer string',
      );
    }
    return new SimTime(BigInt(ticks));
  }

  toCanonicalValue() {
    return this.ticks.toString();
  }
}

export function isSimTime(value: unknown): value is SimTime {
  return (
    typeof value === 'object' && value !== null && simTimeInstances.has(value)
  );
}
