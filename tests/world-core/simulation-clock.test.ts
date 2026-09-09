import { describe, expect, it } from 'vitest';

import {
  DOMAIN_ERROR_CODES,
  SIMULATION_CLOCK_VERSION,
  SIMULATION_DAYS_PER_YEAR,
  SIMULATION_TICKS_PER_DAY,
  SIMULATION_TICKS_PER_REAL_MILLISECOND,
  SIMULATION_TICKS_PER_REAL_SECOND,
  SIMULATION_TICKS_PER_YEAR,
  SimTime,
  activeRealMillisecondsForSimulationTicks,
  advanceClockInput,
  advanceSimulationClock,
  createSimulationClockState,
  simulationCalendarPosition,
  simulationTicksForActiveRealMilliseconds,
  simulationTicksForActiveRealSeconds,
  type SimulationClockAdvanceSource,
} from '../../packages/core/src/index.js';

describe('V06.1 deterministic Simulation Clock', () => {
  it('freezes the approved unit, multiplier, day, and year constants', () => {
    expect({
      clockVersion: SIMULATION_CLOCK_VERSION,
      daysPerYear: SIMULATION_DAYS_PER_YEAR,
      ticksPerDay: SIMULATION_TICKS_PER_DAY,
      ticksPerRealMillisecond: SIMULATION_TICKS_PER_REAL_MILLISECOND,
      ticksPerRealSecond: SIMULATION_TICKS_PER_REAL_SECOND,
      ticksPerYear: SIMULATION_TICKS_PER_YEAR,
    }).toEqual({
      clockVersion: 'SIMULATION_CLOCK_V1',
      daysPerYear: '360',
      ticksPerDay: '86400000',
      ticksPerRealMillisecond: '10',
      ticksPerRealSecond: '10000',
      ticksPerYear: '31104000000',
    });
  });

  it('maps 8,640 real seconds to exactly one simulation day', () => {
    const ticks = simulationTicksForActiveRealSeconds('8640');
    expect(ticks).toBe(SIMULATION_TICKS_PER_DAY);
    expect(simulationCalendarPosition(SimTime.fromTicks(ticks))).toEqual({
      dayIndex: '1',
      dayOfYearIndex: '1',
      tickOfDay: '0',
      yearIndex: '0',
    });
  });

  it('advances only from an explicit canonical active-real input', () => {
    const initial = createSimulationClockState();
    const advanced = advanceSimulationClock(initial, advanceClockInput('1250'));

    expect(initial.simTime.toCanonicalValue()).toBe('0');
    expect(advanced.simTime.toCanonicalValue()).toBe('12500');
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(advanced)).toBe(true);
  });

  it('converts back only when the result is exact', () => {
    expect(activeRealMillisecondsForSimulationTicks('12500')).toBe('1250');
    expect(() => activeRealMillisecondsForSimulationTicks('1')).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.CLOCK_CONVERSION_ERROR,
      }),
    );
  });

  it('rejects malformed inputs and forged state without mutation', () => {
    const initial = createSimulationClockState(SimTime.fromTicks('25'));
    for (const invalid of ['-1', '01', '1.5', ' 1', '1 ']) {
      expect(() => advanceClockInput(invalid)).toThrowError(
        expect.objectContaining({
          code: DOMAIN_ERROR_CODES.CLOCK_INPUT_INVALID,
        }),
      );
    }
    expect(() =>
      advanceSimulationClock(
        {
          clockVersion: SIMULATION_CLOCK_VERSION,
          simTime: { ticks: 25n } as SimTime,
        },
        advanceClockInput('1'),
      ),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.CLOCK_STATE_INVALID }),
    );
    expect(initial.simTime.toCanonicalValue()).toBe('25');
  });

  it('rejects behavioral or forged advancement input without executing it', () => {
    let reads = 0;
    const behavioral = Object.defineProperty({}, 'activeRealMilliseconds', {
      enumerable: true,
      get() {
        reads += 1;
        return '1';
      },
    }) as { readonly activeRealMilliseconds: string };

    expect(() =>
      advanceSimulationClock(createSimulationClockState(), behavioral),
    ).toThrowError(
      expect.objectContaining({ code: DOMAIN_ERROR_CODES.CLOCK_INPUT_INVALID }),
    );
    expect(reads).toBe(0);
  });

  it('keeps the wall-clock adapter outside the pure clock', async () => {
    const source: SimulationClockAdvanceSource = {
      async nextAdvanceClockInput() {
        return advanceClockInput('100');
      },
    };
    const next = advanceSimulationClock(
      createSimulationClockState(),
      await source.nextAdvanceClockInput(),
    );
    expect(next.simTime.toCanonicalValue()).toBe('1000');
  });

  it('decomposes the 360-day calendar using zero-based indices', () => {
    const finalTickOfYear = SimTime.fromTicks('31103999999');
    const nextYear = SimTime.fromTicks(SIMULATION_TICKS_PER_YEAR);

    expect(simulationCalendarPosition(finalTickOfYear)).toEqual({
      dayIndex: '359',
      dayOfYearIndex: '359',
      tickOfDay: '86399999',
      yearIndex: '0',
    });
    expect(simulationCalendarPosition(nextYear)).toEqual({
      dayIndex: '360',
      dayOfYearIndex: '0',
      tickOfDay: '0',
      yearIndex: '1',
    });
  });

  it('uses the same exact conversion for seconds and milliseconds', () => {
    expect(simulationTicksForActiveRealSeconds('1')).toBe('10000');
    expect(simulationTicksForActiveRealMilliseconds('1000')).toBe('10000');
  });
});
