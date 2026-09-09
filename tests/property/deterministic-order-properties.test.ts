import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  SimTime,
  advanceClockInput,
  advanceRunningSimulationScheduler,
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
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });
});
