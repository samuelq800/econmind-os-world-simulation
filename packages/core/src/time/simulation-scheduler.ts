import { canonicalSerialize } from '../serialization/canonical.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  scheduledEventId,
  type ScheduledEventId,
  type SchedulerPriorityId,
} from '../ids.js';
import { SimTime, isSimTime } from '../numeric/sim-time.js';
import {
  SIMULATION_TICKS_PER_DAY,
  SIMULATION_TICKS_PER_YEAR,
  advanceSimulationClock,
  createSimulationClockState,
  type AdvanceClockInput,
  type SimulationClockState,
} from './simulation-clock.js';
import {
  DEFAULT_SCHEDULER_PRIORITY_ID,
  SCHEDULER_ORDER_VERSION,
  compareCanonicalIdentifiers,
  orderScheduledWork,
  registeredSchedulerPriorityId,
} from './deterministic-order.js';

export const LEGACY_SIMULATION_SCHEDULER_VERSION =
  'SIMULATION_SCHEDULER_V1' as const;
export const SIMULATION_SCHEDULER_VERSION = 'SIMULATION_SCHEDULER_V2' as const;

export const SEASON_STATUSES = Object.freeze([
  'PREOPEN',
  'RUNNING',
  'PAUSED',
  'ENDED',
] as const);

export type SeasonStatus = (typeof SEASON_STATUSES)[number];
export type ScheduledEventStatus = 'PENDING' | 'COMPLETED';

export interface ScheduleEventInput {
  readonly dueSimTime: SimTime;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly priorityId: SchedulerPriorityId;
  readonly scheduledEventId: ScheduledEventId;
}

export interface ScheduledEventRecord {
  readonly dueSimTime: SimTime;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly priorityId: SchedulerPriorityId;
  readonly scheduledEventId: ScheduledEventId;
  readonly status: ScheduledEventStatus;
}

export interface PauseInterval {
  readonly pausedAtSimTime: SimTime;
  readonly resumedAtSimTime: SimTime | null;
}

export interface SimulationBoundaryRange {
  readonly count: string;
  readonly firstIndex: string | null;
  readonly lastIndex: string | null;
}

export interface SimulationBoundaryCrossings {
  readonly days: SimulationBoundaryRange;
  readonly years: SimulationBoundaryRange;
}

export interface SimulationSchedulerState {
  readonly clock: SimulationClockState;
  readonly orderVersion: typeof SCHEDULER_ORDER_VERSION;
  readonly pauseIntervals: readonly PauseInterval[];
  readonly scheduledEvents: readonly ScheduledEventRecord[];
  readonly schedulerVersion: typeof SIMULATION_SCHEDULER_VERSION;
  readonly seasonStatus: SeasonStatus;
}

export interface SchedulerAdvanceResult {
  readonly boundaries: SimulationBoundaryCrossings;
  readonly state: SimulationSchedulerState;
}

export interface ScheduledEventCompletion {
  readonly applied: boolean;
  readonly state: SimulationSchedulerState;
}

export const AUTHORITATIVE_TRANSACTION_CUTOFF_VERSION =
  'AUTHORITATIVE_TRANSACTION_CUTOFF_V1' as const;

export interface AuthoritativeTransactionCutoff {
  readonly cutoffVersion: typeof AUTHORITATIVE_TRANSACTION_CUTOFF_VERSION;
  readonly lockedSimTime: SimTime;
}

interface SerializedScheduledEvent {
  readonly dueSimTime: string;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly priorityId?: string;
  readonly scheduledEventId: string;
  readonly status: ScheduledEventStatus;
}

interface SerializedPauseInterval {
  readonly pausedAtSimTime: string;
  readonly resumedAtSimTime: string | null;
}

interface SerializedSchedulerState {
  readonly clock: {
    readonly clockVersion: string;
    readonly simTime: string;
  };
  readonly pauseIntervals: readonly SerializedPauseInterval[];
  readonly orderVersion?: string;
  readonly scheduledEvents: readonly SerializedScheduledEvent[];
  readonly schedulerVersion: string;
  readonly seasonStatus: string;
}

const CANONICAL_TOKEN = /^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*$/u;
const CANONICAL_NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/u;
const scheduleEventInputs = new WeakSet<object>();
const schedulerStates = new WeakSet<object>();
const transactionCutoffs = new WeakSet<object>();
const TICKS_PER_DAY = BigInt(SIMULATION_TICKS_PER_DAY);
const TICKS_PER_YEAR = BigInt(SIMULATION_TICKS_PER_YEAR);

function invalidInput(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.SCHEDULER_INPUT_INVALID, message);
}

function invalidState(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.SCHEDULER_STATE_INVALID, message);
}

function assertSchedulerState(
  state: SimulationSchedulerState,
): asserts state is SimulationSchedulerState {
  if (
    typeof state !== 'object' ||
    state === null ||
    !schedulerStates.has(state)
  ) {
    invalidState('Simulation scheduler state is invalid or unsupported');
  }
}

function canonicalToken(value: string, label: string): string {
  if (typeof value !== 'string' || !CANONICAL_TOKEN.test(value)) {
    invalidInput(`${label} must be a canonical uppercase token`);
  }
  return value;
}

function canonicalTicks(value: unknown, label: string): SimTime {
  if (
    typeof value !== 'string' ||
    !CANONICAL_NON_NEGATIVE_INTEGER.test(value)
  ) {
    invalidState(`${label} must be a canonical non-negative tick string`);
  }
  return SimTime.fromTicks(value);
}

function freezeEvent(record: ScheduledEventRecord): ScheduledEventRecord {
  return Object.freeze({ ...record });
}

function freezePause(interval: PauseInterval): PauseInterval {
  return Object.freeze({ ...interval });
}

function createSchedulerState(input: {
  readonly clock: SimulationClockState;
  readonly pauseIntervals: readonly PauseInterval[];
  readonly scheduledEvents: readonly ScheduledEventRecord[];
  readonly seasonStatus: SeasonStatus;
}): SimulationSchedulerState {
  const state = Object.freeze({
    clock: input.clock,
    orderVersion: SCHEDULER_ORDER_VERSION,
    pauseIntervals: Object.freeze(input.pauseIntervals.map(freezePause)),
    scheduledEvents: Object.freeze(
      [...input.scheduledEvents]
        .sort((left, right) =>
          compareCanonicalIdentifiers(
            left.scheduledEventId,
            right.scheduledEventId,
          ),
        )
        .map(freezeEvent),
    ),
    schedulerVersion: SIMULATION_SCHEDULER_VERSION,
    seasonStatus: input.seasonStatus,
  });
  schedulerStates.add(state);
  return state;
}

function transition(
  state: SimulationSchedulerState,
  allowed: readonly SeasonStatus[],
  target: SeasonStatus,
): void {
  assertSchedulerState(state);
  if (!allowed.includes(state.seasonStatus)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      `Cannot transition ${state.seasonStatus} to ${target}`,
    );
  }
}

function rangeBetween(
  beforeTicks: bigint,
  afterTicks: bigint,
  intervalTicks: bigint,
): SimulationBoundaryRange {
  const beforeIndex = beforeTicks / intervalTicks;
  const afterIndex = afterTicks / intervalTicks;
  const count = afterIndex - beforeIndex;
  return Object.freeze({
    count: count.toString(),
    firstIndex: count === 0n ? null : (beforeIndex + 1n).toString(),
    lastIndex: count === 0n ? null : afterIndex.toString(),
  });
}

export function scheduleEventInput(
  eventId: ScheduledEventId,
  eventType: string,
  dueSimTime: SimTime,
  idempotencyKey: string,
  priorityId: SchedulerPriorityId = DEFAULT_SCHEDULER_PRIORITY_ID,
): ScheduleEventInput {
  if (!isSimTime(dueSimTime)) {
    invalidInput('Scheduled event due time must be canonical SimTime');
  }
  const result = Object.freeze({
    dueSimTime,
    eventType: canonicalToken(eventType, 'Event type'),
    idempotencyKey: canonicalToken(idempotencyKey, 'Idempotency key'),
    priorityId: registeredSchedulerPriorityId(priorityId),
    scheduledEventId: scheduledEventId(eventId),
  });
  scheduleEventInputs.add(result);
  return result;
}

export function createSimulationScheduler(
  initialSimTime: SimTime = SimTime.fromTicks('0'),
): SimulationSchedulerState {
  if (!isSimTime(initialSimTime)) {
    invalidInput('Initial scheduler time must be canonical SimTime');
  }
  return createSchedulerState({
    clock: createSimulationClockState(initialSimTime),
    pauseIntervals: [],
    scheduledEvents: [],
    seasonStatus: 'PREOPEN',
  });
}

export function startSimulationSeason(
  state: SimulationSchedulerState,
): SimulationSchedulerState {
  transition(state, ['PREOPEN'], 'RUNNING');
  return createSchedulerState({ ...state, seasonStatus: 'RUNNING' });
}

export function pauseSimulationSeason(
  state: SimulationSchedulerState,
): SimulationSchedulerState {
  transition(state, ['RUNNING'], 'PAUSED');
  return createSchedulerState({
    ...state,
    pauseIntervals: [
      ...state.pauseIntervals,
      {
        pausedAtSimTime: state.clock.simTime,
        resumedAtSimTime: null,
      },
    ],
    seasonStatus: 'PAUSED',
  });
}

export function resumeSimulationSeason(
  state: SimulationSchedulerState,
): SimulationSchedulerState {
  transition(state, ['PAUSED'], 'RUNNING');
  const openInterval = state.pauseIntervals.at(-1);
  if (openInterval === undefined || openInterval.resumedAtSimTime !== null) {
    invalidState('Paused scheduler lacks exactly one open pause interval');
  }
  return createSchedulerState({
    ...state,
    pauseIntervals: [
      ...state.pauseIntervals.slice(0, -1),
      {
        ...openInterval,
        resumedAtSimTime: state.clock.simTime,
      },
    ],
    seasonStatus: 'RUNNING',
  });
}

export function endSimulationSeason(
  state: SimulationSchedulerState,
): SimulationSchedulerState {
  transition(state, ['RUNNING', 'PAUSED'], 'ENDED');
  const intervals = [...state.pauseIntervals];
  const finalInterval = intervals.at(-1);
  if (state.seasonStatus === 'PAUSED') {
    if (
      finalInterval === undefined ||
      finalInterval.resumedAtSimTime !== null
    ) {
      invalidState('Paused scheduler lacks exactly one open pause interval');
    }
    intervals[intervals.length - 1] = {
      ...finalInterval,
      resumedAtSimTime: state.clock.simTime,
    };
  }
  return createSchedulerState({
    ...state,
    pauseIntervals: intervals,
    seasonStatus: 'ENDED',
  });
}

export function simulationBoundaryCrossings(
  before: SimTime,
  after: SimTime,
): SimulationBoundaryCrossings {
  if (!isSimTime(before) || !isSimTime(after) || after.ticks < before.ticks) {
    invalidInput('Boundary calculation requires monotonic canonical SimTime');
  }
  return Object.freeze({
    days: rangeBetween(before.ticks, after.ticks, TICKS_PER_DAY),
    years: rangeBetween(before.ticks, after.ticks, TICKS_PER_YEAR),
  });
}

export function advanceRunningSimulationScheduler(
  state: SimulationSchedulerState,
  input: AdvanceClockInput,
): SchedulerAdvanceResult {
  transition(state, ['RUNNING'], 'RUNNING');
  const clock = advanceSimulationClock(state.clock, input);
  return Object.freeze({
    boundaries: simulationBoundaryCrossings(state.clock.simTime, clock.simTime),
    state: createSchedulerState({ ...state, clock }),
  });
}

export const catchUpRunningSimulationScheduler =
  advanceRunningSimulationScheduler;

export function scheduleSimulationEvent(
  state: SimulationSchedulerState,
  input: ScheduleEventInput,
): SimulationSchedulerState {
  assertSchedulerState(state);
  if (state.seasonStatus === 'ENDED') {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      'Cannot schedule after the Season has ended',
    );
  }
  if (
    typeof input !== 'object' ||
    input === null ||
    !scheduleEventInputs.has(input)
  ) {
    invalidInput('Scheduler requires a canonical ScheduleEventInput');
  }
  if (input.dueSimTime.ticks < state.clock.simTime.ticks) {
    invalidInput('Scheduled event due time cannot precede current SimTime');
  }
  const existingById = state.scheduledEvents.find(
    (event) => event.scheduledEventId === input.scheduledEventId,
  );
  if (existingById !== undefined) {
    if (
      existingById.dueSimTime.ticks === input.dueSimTime.ticks &&
      existingById.eventType === input.eventType &&
      existingById.idempotencyKey === input.idempotencyKey &&
      existingById.priorityId === input.priorityId
    ) {
      return state;
    }
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULED_EVENT_CONFLICT,
      'Scheduled event ID was reused with different intent',
    );
  }
  if (
    state.scheduledEvents.some(
      (event) => event.idempotencyKey === input.idempotencyKey,
    )
  ) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULED_EVENT_CONFLICT,
      'Idempotency key was reused for a different scheduled event',
    );
  }
  return createSchedulerState({
    ...state,
    scheduledEvents: [
      ...state.scheduledEvents,
      {
        ...input,
        status: 'PENDING',
      },
    ],
  });
}

export function pendingDueSimulationEventsInOrder(
  state: SimulationSchedulerState,
): readonly ScheduledEventRecord[] {
  assertSchedulerState(state);
  if (state.seasonStatus !== 'RUNNING') return Object.freeze([]);
  return orderScheduledWork(
    state.scheduledEvents.filter(
      (event) =>
        event.status === 'PENDING' &&
        event.dueSimTime.ticks <= state.clock.simTime.ticks,
    ),
  );
}

export function beginAuthoritativeTransactionCutoff(
  state: SimulationSchedulerState,
): AuthoritativeTransactionCutoff {
  transition(state, ['RUNNING'], 'RUNNING');
  const cutoff = Object.freeze({
    cutoffVersion: AUTHORITATIVE_TRANSACTION_CUTOFF_VERSION,
    lockedSimTime: state.clock.simTime,
  });
  transactionCutoffs.add(cutoff);
  return cutoff;
}

export function isAuthoritativeTransactionCutoff(
  value: unknown,
): value is AuthoritativeTransactionCutoff {
  return (
    typeof value === 'object' && value !== null && transactionCutoffs.has(value)
  );
}

export function isSimulationEventDue(
  state: SimulationSchedulerState,
  eventId: ScheduledEventId,
): boolean {
  assertSchedulerState(state);
  const canonicalId = scheduledEventId(eventId);
  const event = state.scheduledEvents.find(
    (candidate) => candidate.scheduledEventId === canonicalId,
  );
  if (event === undefined) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULED_EVENT_NOT_FOUND,
      `Scheduled event ${canonicalId} does not exist`,
    );
  }
  return (
    state.seasonStatus === 'RUNNING' &&
    event.status === 'PENDING' &&
    event.dueSimTime.ticks <= state.clock.simTime.ticks
  );
}

export function completeDueSimulationEvent(
  state: SimulationSchedulerState,
  eventId: ScheduledEventId,
): ScheduledEventCompletion {
  transition(state, ['RUNNING'], 'RUNNING');
  const canonicalId = scheduledEventId(eventId);
  const eventIndex = state.scheduledEvents.findIndex(
    (candidate) => candidate.scheduledEventId === canonicalId,
  );
  if (eventIndex === -1) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULED_EVENT_NOT_FOUND,
      `Scheduled event ${canonicalId} does not exist`,
    );
  }
  const event = state.scheduledEvents[eventIndex];
  if (event === undefined) invalidState('Scheduled event index is invalid');
  if (event.status === 'COMPLETED') {
    return Object.freeze({ applied: false, state });
  }
  if (event.dueSimTime.ticks > state.clock.simTime.ticks) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULED_EVENT_NOT_DUE,
      `Scheduled event ${canonicalId} is not due`,
    );
  }
  const authoritativeHead = pendingDueSimulationEventsInOrder(state)[0];
  if (authoritativeHead === undefined) {
    invalidState(
      'Due scheduled event is missing from authoritative work order',
    );
  }
  if (authoritativeHead.scheduledEventId !== canonicalId) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SCHEDULED_EVENT_ORDER_VIOLATION,
      `Scheduled event ${canonicalId} cannot complete before ${authoritativeHead.scheduledEventId}`,
    );
  }
  const events = [...state.scheduledEvents];
  events[eventIndex] = freezeEvent({ ...event, status: 'COMPLETED' });
  return Object.freeze({
    applied: true,
    state: createSchedulerState({ ...state, scheduledEvents: events }),
  });
}

function serializedState(
  state: SimulationSchedulerState,
): SerializedSchedulerState {
  return {
    clock: {
      clockVersion: state.clock.clockVersion,
      simTime: state.clock.simTime.toCanonicalValue(),
    },
    pauseIntervals: state.pauseIntervals.map((interval) => ({
      pausedAtSimTime: interval.pausedAtSimTime.toCanonicalValue(),
      resumedAtSimTime: interval.resumedAtSimTime?.toCanonicalValue() ?? null,
    })),
    orderVersion: state.orderVersion,
    scheduledEvents: state.scheduledEvents.map((event) => ({
      dueSimTime: event.dueSimTime.toCanonicalValue(),
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      priorityId: event.priorityId,
      scheduledEventId: event.scheduledEventId,
      status: event.status,
    })),
    schedulerVersion: state.schedulerVersion,
    seasonStatus: state.seasonStatus,
  };
}

function legacySerializedState(
  state: SimulationSchedulerState,
): SerializedSchedulerState {
  const current = serializedState(state);
  return {
    clock: current.clock,
    pauseIntervals: current.pauseIntervals,
    scheduledEvents: current.scheduledEvents.map((event) => ({
      dueSimTime: event.dueSimTime,
      eventType: event.eventType,
      idempotencyKey: event.idempotencyKey,
      scheduledEventId: event.scheduledEventId,
      status: event.status,
    })),
    schedulerVersion: LEGACY_SIMULATION_SCHEDULER_VERSION,
    seasonStatus: current.seasonStatus,
  };
}

export function serializeSimulationSchedulerState(
  state: SimulationSchedulerState,
): string {
  assertSchedulerState(state);
  return canonicalSerialize(serializedState(state));
}

export function restoreSimulationSchedulerState(
  serialized: string,
): SimulationSchedulerState {
  if (typeof serialized !== 'string') {
    invalidInput('Serialized scheduler state must be a canonical JSON string');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    invalidState('Serialized scheduler state is not valid JSON');
  }
  if (canonicalSerialize(parsed) !== serialized) {
    invalidState('Serialized scheduler state is not canonical');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    invalidState('Serialized scheduler state must be a record');
  }
  const snapshot = parsed as SerializedSchedulerState;
  const isLegacy =
    snapshot.schedulerVersion === LEGACY_SIMULATION_SCHEDULER_VERSION;
  if (
    (!isLegacy && snapshot.schedulerVersion !== SIMULATION_SCHEDULER_VERSION) ||
    snapshot.clock?.clockVersion !== 'SIMULATION_CLOCK_V1' ||
    !SEASON_STATUSES.includes(snapshot.seasonStatus as SeasonStatus) ||
    !Array.isArray(snapshot.pauseIntervals) ||
    !Array.isArray(snapshot.scheduledEvents) ||
    (isLegacy
      ? snapshot.orderVersion !== undefined
      : snapshot.orderVersion !== SCHEDULER_ORDER_VERSION)
  ) {
    invalidState('Serialized scheduler state has an invalid schema or version');
  }
  const clock = createSimulationClockState(
    canonicalTicks(snapshot.clock.simTime, 'Clock SimTime'),
  );
  const pauseIntervals = snapshot.pauseIntervals.map((interval) => ({
    pausedAtSimTime: canonicalTicks(
      interval.pausedAtSimTime,
      'Pause start SimTime',
    ),
    resumedAtSimTime:
      interval.resumedAtSimTime === null
        ? null
        : canonicalTicks(interval.resumedAtSimTime, 'Pause end SimTime'),
  }));
  const events = snapshot.scheduledEvents.map((event) => {
    if (typeof event !== 'object' || event === null) {
      invalidState('Scheduled event must be a record');
    }
    if (event.status !== 'PENDING' && event.status !== 'COMPLETED') {
      invalidState('Scheduled event status is invalid');
    }
    if (
      (isLegacy && event.priorityId !== undefined) ||
      (!isLegacy && typeof event.priorityId !== 'string')
    ) {
      invalidState('Scheduled event priority does not match scheduler version');
    }
    return {
      dueSimTime: canonicalTicks(event.dueSimTime, 'Event due SimTime'),
      eventType: canonicalToken(event.eventType, 'Event type'),
      idempotencyKey: canonicalToken(event.idempotencyKey, 'Idempotency key'),
      priorityId: isLegacy
        ? DEFAULT_SCHEDULER_PRIORITY_ID
        : registeredSchedulerPriorityId(event.priorityId as string),
      scheduledEventId: scheduledEventId(event.scheduledEventId),
      status: event.status,
    };
  });
  if (
    new Set(events.map((event) => event.scheduledEventId)).size !==
      events.length ||
    new Set(events.map((event) => event.idempotencyKey)).size !== events.length
  ) {
    invalidState('Serialized scheduler contains duplicate event identities');
  }
  if (
    snapshot.seasonStatus === 'PREOPEN' &&
    (events.some((event) => event.status === 'COMPLETED') ||
      pauseIntervals.length > 0)
  ) {
    invalidState(
      'PREOPEN scheduler cannot contain completed events or pause history',
    );
  }
  if (
    events.some(
      (event) =>
        event.status === 'COMPLETED' &&
        event.dueSimTime.ticks > clock.simTime.ticks,
    )
  ) {
    invalidState('Serialized scheduler completes an event before its due time');
  }
  const openIntervals = pauseIntervals.filter(
    (interval) => interval.resumedAtSimTime === null,
  );
  if (
    openIntervals.length !== (snapshot.seasonStatus === 'PAUSED' ? 1 : 0) ||
    (openIntervals.length === 1 &&
      pauseIntervals.at(-1)?.resumedAtSimTime !== null) ||
    pauseIntervals.some(
      (interval) =>
        interval.pausedAtSimTime.ticks > clock.simTime.ticks ||
        (interval.resumedAtSimTime !== null &&
          (interval.resumedAtSimTime.ticks < interval.pausedAtSimTime.ticks ||
            interval.resumedAtSimTime.ticks > clock.simTime.ticks ||
            interval.resumedAtSimTime.ticks !==
              interval.pausedAtSimTime.ticks)),
    )
  ) {
    invalidState('Serialized scheduler contains invalid pause intervals');
  }
  for (let index = 1; index < pauseIntervals.length; index += 1) {
    const previous = pauseIntervals[index - 1];
    const current = pauseIntervals[index];
    if (
      previous === undefined ||
      current === undefined ||
      previous.resumedAtSimTime === null ||
      current.pausedAtSimTime.ticks < previous.resumedAtSimTime.ticks
    ) {
      invalidState('Serialized scheduler pause intervals overlap');
    }
  }
  const restored = createSchedulerState({
    clock,
    pauseIntervals,
    scheduledEvents: events,
    seasonStatus: snapshot.seasonStatus as SeasonStatus,
  });
  const expectedSerialized = canonicalSerialize(
    isLegacy ? legacySerializedState(restored) : serializedState(restored),
  );
  if (expectedSerialized !== serialized) {
    invalidState('Serialized scheduler state is not in canonical state order');
  }
  return restored;
}
