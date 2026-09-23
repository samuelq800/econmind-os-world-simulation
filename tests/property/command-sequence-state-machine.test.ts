import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  SimTime,
  advanceClockInput,
  advanceRunningSimulationScheduler,
  completeDueSimulationEvent,
  createSimulationScheduler,
  endSimulationSeason,
  pauseSimulationSeason,
  pendingDueSimulationEventsInOrder,
  restoreSimulationSchedulerState,
  resumeSimulationSeason,
  scheduleEventInput,
  scheduleSimulationEvent,
  scheduledEventId,
  schedulerPriorityId,
  serializeSimulationSchedulerState,
  startSimulationSeason,
  type SimulationSchedulerState,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

const PRIORITIES = [
  'ORDER_PRIORITY_000',
  'ORDER_PRIORITY_100',
  'ORDER_PRIORITY_200',
] as const;

type ModelSeason = 'RUNNING' | 'PAUSED' | 'ENDED';

interface ModelEvent {
  readonly dueTicks: bigint;
  readonly priorityIndex: number;
  readonly slot: number;
  status: 'PENDING' | 'COMPLETED';
}

interface SchedulerModel {
  readonly events: Map<number, ModelEvent>;
  season: ModelSeason;
  ticks: bigint;
}

type Operation =
  | Readonly<{ readonly kind: 'ADVANCE'; readonly milliseconds: number }>
  | Readonly<{ readonly kind: 'PAUSE' }>
  | Readonly<{ readonly kind: 'RESUME' }>
  | Readonly<{ readonly kind: 'END' }>
  | Readonly<{
      readonly kind: 'SCHEDULE';
      readonly delayMilliseconds: number;
      readonly priorityIndex: number;
      readonly slot: number;
    }>
  | Readonly<{ readonly kind: 'COMPLETE'; readonly slot: number }>
  | Readonly<{ readonly kind: 'RESTART' }>;

const commandSequenceArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  fc.integer({ min: 0, max: 500 }).map((milliseconds) => ({
    kind: 'ADVANCE' as const,
    milliseconds,
  })),
  fc.constant({ kind: 'PAUSE' as const }),
  fc.constant({ kind: 'RESUME' as const }),
  fc.constant({ kind: 'END' as const }),
  fc
    .record({
      delayMilliseconds: fc.integer({ min: 0, max: 500 }),
      priorityIndex: fc.integer({ min: 0, max: PRIORITIES.length - 1 }),
      slot: fc.integer({ min: 0, max: 31 }),
    })
    .map((input) => ({ kind: 'SCHEDULE' as const, ...input })),
  fc.integer({ min: 0, max: 31 }).map((slot) => ({
    kind: 'COMPLETE' as const,
    slot,
  })),
  fc.constant({ kind: 'RESTART' as const }),
);

const STATE_MACHINE_CONFIG = Object.freeze({
  ...FOUNDATION_PROPERTY_CONFIG,
  numRuns: 250,
  seed: FOUNDATION_PROPERTY_CONFIG.seed + 260,
});

function eventId(slot: number): string {
  return `EVENT_SEQUENCE_${String(slot).padStart(2, '0')}`;
}

function eventKey(slot: number): string {
  return `KEY_SEQUENCE_${String(slot).padStart(2, '0')}`;
}

function orderedPendingEvents(model: SchedulerModel): ModelEvent[] {
  if (model.season !== 'RUNNING') return [];
  return [...model.events.values()]
    .filter(
      (event) => event.status === 'PENDING' && event.dueTicks <= model.ticks,
    )
    .sort((left, right) =>
      left.dueTicks < right.dueTicks
        ? -1
        : left.dueTicks > right.dueTicks
          ? 1
          : left.priorityIndex - right.priorityIndex ||
            eventId(left.slot).localeCompare(eventId(right.slot)),
    );
}

function assertRejected(
  state: SimulationSchedulerState,
  code: string,
  operation: () => unknown,
): void {
  const before = serializeSimulationSchedulerState(state);
  expect(operation).toThrowError(expect.objectContaining({ code }));
  expect(serializeSimulationSchedulerState(state)).toBe(before);
}

function assertEquivalent(
  model: SchedulerModel,
  actual: SimulationSchedulerState,
): SimulationSchedulerState {
  expect(actual.seasonStatus).toBe(model.season);
  expect(actual.clock.simTime.ticks).toBe(model.ticks);
  expect(actual.scheduledEvents).toHaveLength(model.events.size);

  for (const event of actual.scheduledEvents) {
    const slot = Number.parseInt(event.scheduledEventId.slice(-2), 10);
    const expected = model.events.get(slot);
    expect(expected).toBeDefined();
    expect(event.dueSimTime.ticks).toBe(expected?.dueTicks);
    expect(event.priorityId).toBe(PRIORITIES[expected?.priorityIndex ?? 0]);
    expect(event.status).toBe(expected?.status);
  }

  expect(
    pendingDueSimulationEventsInOrder(actual).map(
      (event) => event.scheduledEventId,
    ),
  ).toEqual(orderedPendingEvents(model).map((event) => eventId(event.slot)));

  const serialized = serializeSimulationSchedulerState(actual);
  const restored = restoreSimulationSchedulerState(serialized);
  expect(serializeSimulationSchedulerState(restored)).toBe(serialized);
  return restored;
}

function runOperation(
  model: SchedulerModel,
  state: SimulationSchedulerState,
  operation: Operation,
): SimulationSchedulerState {
  switch (operation.kind) {
    case 'ADVANCE': {
      if (model.season !== 'RUNNING') {
        assertRejected(
          state,
          DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
          () =>
            advanceRunningSimulationScheduler(
              state,
              advanceClockInput(String(operation.milliseconds)),
            ),
        );
        return assertEquivalent(model, state);
      }
      model.ticks += BigInt(operation.milliseconds) * 10n;
      return assertEquivalent(
        model,
        advanceRunningSimulationScheduler(
          state,
          advanceClockInput(String(operation.milliseconds)),
        ).state,
      );
    }
    case 'PAUSE': {
      if (model.season !== 'RUNNING') {
        assertRejected(
          state,
          DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
          () => pauseSimulationSeason(state),
        );
        return assertEquivalent(model, state);
      }
      model.season = 'PAUSED';
      return assertEquivalent(model, pauseSimulationSeason(state));
    }
    case 'RESUME': {
      if (model.season !== 'PAUSED') {
        assertRejected(
          state,
          DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
          () => resumeSimulationSeason(state),
        );
        return assertEquivalent(model, state);
      }
      model.season = 'RUNNING';
      return assertEquivalent(model, resumeSimulationSeason(state));
    }
    case 'END': {
      if (model.season === 'ENDED') {
        assertRejected(
          state,
          DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
          () => endSimulationSeason(state),
        );
        return assertEquivalent(model, state);
      }
      model.season = 'ENDED';
      return assertEquivalent(model, endSimulationSeason(state));
    }
    case 'SCHEDULE': {
      const dueTicks = model.ticks + BigInt(operation.delayMilliseconds) * 10n;
      const expected: ModelEvent = {
        dueTicks,
        priorityIndex: operation.priorityIndex,
        slot: operation.slot,
        status: 'PENDING',
      };
      const input = scheduleEventInput(
        scheduledEventId(eventId(operation.slot)),
        `SEQUENCE_EVENT_${String(operation.slot).padStart(2, '0')}`,
        SimTime.fromTicks(dueTicks.toString()),
        eventKey(operation.slot),
        schedulerPriorityId(PRIORITIES[operation.priorityIndex]!),
      );
      const existing = model.events.get(operation.slot);
      if (model.season === 'ENDED') {
        assertRejected(
          state,
          DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
          () => scheduleSimulationEvent(state, input),
        );
      } else if (existing !== undefined) {
        if (
          existing.dueTicks === expected.dueTicks &&
          existing.priorityIndex === expected.priorityIndex
        ) {
          expect(scheduleSimulationEvent(state, input)).toBe(state);
        } else {
          assertRejected(
            state,
            DOMAIN_ERROR_CODES.SCHEDULED_EVENT_CONFLICT,
            () => scheduleSimulationEvent(state, input),
          );
        }
      } else {
        model.events.set(operation.slot, expected);
        state = scheduleSimulationEvent(state, input);
      }
      return assertEquivalent(model, state);
    }
    case 'COMPLETE': {
      const event = model.events.get(operation.slot);
      if (model.season !== 'RUNNING') {
        assertRejected(
          state,
          DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
          () =>
            completeDueSimulationEvent(
              state,
              scheduledEventId(eventId(operation.slot)),
            ),
        );
      } else if (event === undefined) {
        assertRejected(
          state,
          DOMAIN_ERROR_CODES.SCHEDULED_EVENT_NOT_FOUND,
          () =>
            completeDueSimulationEvent(
              state,
              scheduledEventId(eventId(operation.slot)),
            ),
        );
      } else if (event.status === 'COMPLETED') {
        expect(
          completeDueSimulationEvent(
            state,
            scheduledEventId(eventId(operation.slot)),
          ),
        ).toEqual({ applied: false, state });
      } else if (event.dueTicks > model.ticks) {
        assertRejected(state, DOMAIN_ERROR_CODES.SCHEDULED_EVENT_NOT_DUE, () =>
          completeDueSimulationEvent(
            state,
            scheduledEventId(eventId(operation.slot)),
          ),
        );
      } else {
        const head = orderedPendingEvents(model)[0];
        if (head?.slot !== operation.slot) {
          assertRejected(
            state,
            DOMAIN_ERROR_CODES.SCHEDULED_EVENT_ORDER_VIOLATION,
            () =>
              completeDueSimulationEvent(
                state,
                scheduledEventId(eventId(operation.slot)),
              ),
          );
        } else {
          event.status = 'COMPLETED';
          state = completeDueSimulationEvent(
            state,
            scheduledEventId(eventId(operation.slot)),
          ).state;
        }
      }
      return assertEquivalent(model, state);
    }
    case 'RESTART':
      return assertEquivalent(
        model,
        restoreSimulationSchedulerState(
          serializeSimulationSchedulerState(state),
        ),
      );
  }
}

describe('Gate B local scheduler command-sequence state machine', () => {
  it('matches the independent model across bounded valid and invalid command sequences', () => {
    fc.assert(
      fc.property(
        fc.array(commandSequenceArbitrary, { minLength: 1, maxLength: 90 }),
        (operations) => {
          const model: SchedulerModel = {
            events: new Map(),
            season: 'RUNNING',
            ticks: 0n,
          };
          let state = startSimulationSeason(createSimulationScheduler());

          for (const operation of operations) {
            state = runOperation(model, state, operation);
          }
        },
      ),
      STATE_MACHINE_CONFIG,
    );
  });
});
