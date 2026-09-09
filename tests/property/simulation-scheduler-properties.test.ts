import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  advanceClockInput,
  advanceRunningSimulationScheduler,
  completeDueSimulationEvent,
  createSimulationScheduler,
  pauseSimulationSeason,
  restoreSimulationSchedulerState,
  resumeSimulationSeason,
  scheduleEventInput,
  scheduleSimulationEvent,
  scheduledEventId,
  serializeSimulationSchedulerState,
  startSimulationSeason,
  type SimulationSchedulerState,
} from '../../packages/core/src/index.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

describe('V06.2 Simulation Scheduler properties', () => {
  it('is monotonic and excludes every PAUSED advancement attempt', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            activeMilliseconds: fc.integer({ min: 0, max: 100_000 }),
            pauseFirst: fc.boolean(),
          }),
          { maxLength: 100 },
        ),
        (steps) => {
          let state = startSimulationSeason(createSimulationScheduler());
          let expectedTicks = 0n;
          for (const step of steps) {
            if (step.pauseFirst) {
              const frozen = pauseSimulationSeason(state);
              expect(frozen.clock.simTime.ticks).toBe(expectedTicks);
              state = resumeSimulationSeason(frozen);
              expect(state.clock.simTime.ticks).toBe(expectedTicks);
            }
            state = advanceRunningSimulationScheduler(
              state,
              advanceClockInput(step.activeMilliseconds.toString()),
            ).state;
            expectedTicks += BigInt(step.activeMilliseconds) * 10n;
            expect(state.clock.simTime.ticks).toBe(expectedTicks);
          }
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('preserves one-time completion across arbitrary restart counts', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 25 }), (restartCount) => {
        let state: SimulationSchedulerState = startSimulationSeason(
          createSimulationScheduler(),
        );
        state = scheduleSimulationEvent(
          state,
          scheduleEventInput(
            scheduledEventId('EVENT_RESTART'),
            'TEST_OBLIGATION',
            state.clock.simTime,
            'IDEMPOTENCY_RESTART',
          ),
        );
        const first = completeDueSimulationEvent(
          state,
          scheduledEventId('EVENT_RESTART'),
        );
        expect(first.applied).toBe(true);
        state = first.state;

        for (let index = 0; index < restartCount; index += 1) {
          state = restoreSimulationSchedulerState(
            serializeSimulationSchedulerState(state),
          );
          const retry = completeDueSimulationEvent(
            state,
            scheduledEventId('EVENT_RESTART'),
          );
          expect(retry.applied).toBe(false);
          state = retry.state;
        }
        expect(state.scheduledEvents).toHaveLength(1);
        expect(state.scheduledEvents[0]?.status).toBe('COMPLETED');
      }),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });
});
