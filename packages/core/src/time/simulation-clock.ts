import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import { SimTime, isSimTime } from '../numeric/sim-time.js';

export const SIMULATION_CLOCK_VERSION = 'SIMULATION_CLOCK_V1' as const;
export const SIMULATION_TICKS_PER_REAL_MILLISECOND = '10' as const;
export const SIMULATION_TICKS_PER_REAL_SECOND = '10000' as const;
export const SIMULATION_TICKS_PER_DAY = '86400000' as const;
export const SIMULATION_DAYS_PER_YEAR = '360' as const;
export const SIMULATION_TICKS_PER_YEAR = '31104000000' as const;

const TICKS_PER_REAL_MILLISECOND = 10n;
const TICKS_PER_REAL_SECOND = 10_000n;
const TICKS_PER_DAY = 86_400_000n;
const DAYS_PER_YEAR = 360n;
const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const advanceClockInputs = new WeakSet<object>();
const simulationClockStates = new WeakSet<object>();

export interface AdvanceClockInput {
  readonly activeRealMilliseconds: string;
}

export interface SimulationClockState {
  readonly clockVersion: typeof SIMULATION_CLOCK_VERSION;
  readonly simTime: SimTime;
}

export interface SimulationCalendarPosition {
  readonly dayIndex: string;
  readonly dayOfYearIndex: string;
  readonly tickOfDay: string;
  readonly yearIndex: string;
}

export interface SimulationClockAdvanceSource {
  nextAdvanceClockInput(): Promise<AdvanceClockInput>;
}

function parseCanonicalNonNegativeInteger(
  value: string,
  label: string,
): bigint {
  if (
    typeof value !== 'string' ||
    !CANONICAL_NON_NEGATIVE_INTEGER.test(value)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.CLOCK_INPUT_INVALID,
      `${label} must be a non-negative canonical integer string`,
    );
  }
  return BigInt(value);
}

function assertClockState(
  state: SimulationClockState,
): asserts state is SimulationClockState {
  if (
    typeof state !== 'object' ||
    state === null ||
    !simulationClockStates.has(state)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.CLOCK_STATE_INVALID,
      'Simulation clock state is invalid or uses an unsupported version',
    );
  }
}

export function advanceClockInput(
  activeRealMilliseconds: string,
): AdvanceClockInput {
  parseCanonicalNonNegativeInteger(
    activeRealMilliseconds,
    'Active real milliseconds',
  );
  const input = Object.freeze({ activeRealMilliseconds });
  advanceClockInputs.add(input);
  return input;
}

export function createSimulationClockState(
  simTime: SimTime = SimTime.fromTicks('0'),
): SimulationClockState {
  if (!isSimTime(simTime)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.CLOCK_STATE_INVALID,
      'Simulation clock requires a canonical SimTime',
    );
  }
  const state = Object.freeze({
    clockVersion: SIMULATION_CLOCK_VERSION,
    simTime,
  });
  simulationClockStates.add(state);
  return state;
}

export function simulationTicksForActiveRealMilliseconds(
  activeRealMilliseconds: string,
): string {
  const milliseconds = parseCanonicalNonNegativeInteger(
    activeRealMilliseconds,
    'Active real milliseconds',
  );
  return (milliseconds * TICKS_PER_REAL_MILLISECOND).toString();
}

export function simulationTicksForActiveRealSeconds(
  activeRealSeconds: string,
): string {
  const seconds = parseCanonicalNonNegativeInteger(
    activeRealSeconds,
    'Active real seconds',
  );
  return (seconds * TICKS_PER_REAL_SECOND).toString();
}

export function activeRealMillisecondsForSimulationTicks(
  simulationTicks: string,
): string {
  const ticks = parseCanonicalNonNegativeInteger(
    simulationTicks,
    'Simulation ticks',
  );
  if (ticks % TICKS_PER_REAL_MILLISECOND !== 0n) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.CLOCK_CONVERSION_ERROR,
      'Simulation ticks do not represent an exact real-millisecond interval',
    );
  }
  return (ticks / TICKS_PER_REAL_MILLISECOND).toString();
}

export function advanceSimulationClock(
  state: SimulationClockState,
  input: AdvanceClockInput,
): SimulationClockState {
  assertClockState(state);
  if (
    typeof input !== 'object' ||
    input === null ||
    !advanceClockInputs.has(input)
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.CLOCK_INPUT_INVALID,
      'Simulation clock requires an explicit advancement input',
    );
  }
  const deltaTicks = simulationTicksForActiveRealMilliseconds(
    input.activeRealMilliseconds,
  );
  const nextTicks = state.simTime.ticks + BigInt(deltaTicks);
  return createSimulationClockState(SimTime.fromTicks(nextTicks.toString()));
}

export function simulationCalendarPosition(
  simTime: SimTime,
): SimulationCalendarPosition {
  if (!isSimTime(simTime)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.CLOCK_STATE_INVALID,
      'Simulation calendar requires a canonical SimTime',
    );
  }
  const yearIndex = simTime.ticks / TICKS_PER_YEAR;
  const tickOfYear = simTime.ticks % TICKS_PER_YEAR;
  const dayOfYearIndex = tickOfYear / TICKS_PER_DAY;
  const tickOfDay = tickOfYear % TICKS_PER_DAY;
  return Object.freeze({
    dayIndex: (simTime.ticks / TICKS_PER_DAY).toString(),
    dayOfYearIndex: dayOfYearIndex.toString(),
    tickOfDay: tickOfDay.toString(),
    yearIndex: yearIndex.toString(),
  });
}
