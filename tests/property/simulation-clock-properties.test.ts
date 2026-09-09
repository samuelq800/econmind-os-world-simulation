import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  SIMULATION_TICKS_PER_DAY,
  SimTime,
  advanceClockInput,
  advanceSimulationClock,
  createSimulationClockState,
  simulationCalendarPosition,
  simulationTicksForActiveRealMilliseconds,
} from '../../packages/core/src/index.js';
import { activeRealMillisecondsArbitrary } from '../../packages/testkit/src/arbitraries.js';
import { FOUNDATION_PROPERTY_CONFIG } from './property-config.js';

describe('V06.1 Simulation Clock properties', () => {
  it('is exact, monotonic, and applies the multiplier once', () => {
    fc.assert(
      fc.property(
        activeRealMillisecondsArbitrary,
        activeRealMillisecondsArbitrary,
        (first, second) => {
          const initial = createSimulationClockState();
          const afterFirst = advanceSimulationClock(
            initial,
            advanceClockInput(first),
          );
          const afterSecond = advanceSimulationClock(
            afterFirst,
            advanceClockInput(second),
          );
          const combined = advanceSimulationClock(
            initial,
            advanceClockInput((BigInt(first) + BigInt(second)).toString()),
          );

          expect(afterFirst.simTime.ticks).toBeGreaterThanOrEqual(
            initial.simTime.ticks,
          );
          expect(afterSecond.simTime.ticks).toBeGreaterThanOrEqual(
            afterFirst.simTime.ticks,
          );
          expect(afterSecond.simTime.toCanonicalValue()).toBe(
            combined.simTime.toCanonicalValue(),
          );
          expect(afterFirst.simTime.toCanonicalValue()).toBe(
            simulationTicksForActiveRealMilliseconds(first),
          );
        },
      ),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });

  it('decomposes every SimTime into an exact day and tick remainder', () => {
    fc.assert(
      fc.property(fc.bigInt({ max: 10n ** 28n, min: 0n }), (ticks) => {
        const position = simulationCalendarPosition(
          SimTime.fromTicks(ticks.toString()),
        );
        const reconstructed =
          BigInt(position.dayIndex) * BigInt(SIMULATION_TICKS_PER_DAY) +
          BigInt(position.tickOfDay);
        expect(reconstructed).toBe(ticks);
        expect(BigInt(position.tickOfDay)).toBeLessThan(
          BigInt(SIMULATION_TICKS_PER_DAY),
        );
        expect(BigInt(position.dayOfYearIndex)).toBeLessThan(360n);
      }),
      FOUNDATION_PROPERTY_CONFIG,
    );
  });
});
