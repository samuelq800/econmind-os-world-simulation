import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  SimTime,
  advanceClockInput,
  advanceRunningSimulationScheduler,
  canonicalSerialize,
  completeDueSimulationEvent,
  createSimulationScheduler,
  pendingDueSimulationEventsInOrder,
  restoreSimulationSchedulerState,
  scheduleEventInput,
  scheduleSimulationEvent,
  scheduledEventId,
  schedulerPriorityId,
  serializeSimulationSchedulerState,
  startSimulationSeason,
  type SimulationSchedulerState,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

const priorityIds = [
  'ORDER_PRIORITY_000',
  'ORDER_PRIORITY_100',
  'ORDER_PRIORITY_200',
] as const;

function buildState(
  records: readonly {
    readonly dueUnits: number;
    readonly id: number;
    readonly priorityIndex: number;
  }[],
): SimulationSchedulerState {
  let state = startSimulationSeason(createSimulationScheduler());
  for (const record of records) {
    const id = `EVENT_${String(record.id).padStart(4, '0')}`;
    state = scheduleSimulationEvent(
      state,
      scheduleEventInput(
        scheduledEventId(id),
        'PROPERTY_ORDER',
        SimTime.fromTicks(String(record.dueUnits * 10)),
        `KEY_${id}`,
        schedulerPriorityId(priorityIds[record.priorityIndex]!),
      ),
    );
  }
  return advanceRunningSimulationScheduler(state, advanceClockInput('1000'))
    .state;
}

describe('V06.3 deterministic ordering properties', () => {
  it('is invariant to insertion order and restart', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            dueUnits: fc.integer({ min: 0, max: 1000 }),
            id: fc.integer({ min: 0, max: 9999 }),
            priorityIndex: fc.integer({ min: 0, max: 2 }),
          }),
          { maxLength: 80, selector: (record) => record.id },
        ),
        (records) => {
          const forward = restoreSimulationSchedulerState(
            serializeSimulationSchedulerState(buildState(records)),
          );
          const reverse = restoreSimulationSchedulerState(
            serializeSimulationSchedulerState(
              buildState([...records].reverse()),
            ),
          );
          const orderedIds = (state: SimulationSchedulerState) =>
            pendingDueSimulationEventsInOrder(state).map(
              (event) => event.scheduledEventId,
            );

          expect(orderedIds(forward)).toEqual(orderedIds(reverse));

          let draining = forward;
          while (true) {
            const due = pendingDueSimulationEventsInOrder(draining);
            const head = due[0];
            if (head === undefined) break;
            const nonHead = due.at(-1);
            if (
              nonHead !== undefined &&
              nonHead.scheduledEventId !== head.scheduledEventId
            ) {
              expect(() =>
                completeDueSimulationEvent(draining, nonHead.scheduledEventId),
              ).toThrowError(
                expect.objectContaining({
                  code: DOMAIN_ERROR_CODES.SCHEDULED_EVENT_ORDER_VIOLATION,
                }),
              );
            }

            const completion = completeDueSimulationEvent(
              draining,
              head.scheduledEventId,
            );
            expect(completion.applied).toBe(true);
            draining = restoreSimulationSchedulerState(
              serializeSimulationSchedulerState(completion.state),
            );
            expect(
              completeDueSimulationEvent(draining, head.scheduledEventId)
                .applied,
            ).toBe(false);
          }
          expect(
            draining.scheduledEvents.every(
              (event) => event.status === 'COMPLETED',
            ),
          ).toBe(true);
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('accepts restored due completion sets exactly when they are a prefix', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            completed: fc.boolean(),
            dueUnits: fc.integer({ min: 0, max: 1000 }),
            id: fc.integer({ min: 0, max: 9999 }),
            priorityIndex: fc.integer({ min: 0, max: 2 }),
          }),
          { maxLength: 60, selector: (record) => record.id },
        ),
        (records) => {
          const state = buildState(records);
          const completionById = new Map(
            records.map((record) => [
              `EVENT_${String(record.id).padStart(4, '0')}`,
              record.completed,
            ]),
          );
          const orderedDue = pendingDueSimulationEventsInOrder(state);
          let pendingSeen = false;
          let isPrefix = true;
          for (const event of orderedDue) {
            const completed =
              completionById.get(event.scheduledEventId) ?? false;
            if (!completed) pendingSeen = true;
            else if (pendingSeen) isPrefix = false;
          }

          const snapshot = JSON.parse(serializeSimulationSchedulerState(state));
          for (const event of snapshot.scheduledEvents) {
            event.status = completionById.get(event.scheduledEventId)
              ? 'COMPLETED'
              : 'PENDING';
          }
          const serialized = canonicalSerialize(snapshot);

          if (isPrefix) {
            const restored = restoreSimulationSchedulerState(serialized);
            expect(serializeSimulationSchedulerState(restored)).toBe(
              serialized,
            );
          } else {
            expect(() =>
              restoreSimulationSchedulerState(serialized),
            ).toThrowError(
              expect.objectContaining({
                code: DOMAIN_ERROR_CODES.SCHEDULER_STATE_INVALID,
              }),
            );
          }
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });
});
