import { describe, expect, it } from 'vitest';

import {
  canonicalSerialize,
  DOMAIN_ERROR_CODES,
  SIMULATION_TICKS_PER_DAY,
  SimTime,
  advanceClockInput,
  advanceRunningSimulationScheduler,
  catchUpRunningSimulationScheduler,
  completeDueSimulationEvent,
  createSimulationScheduler,
  endSimulationSeason,
  isSimulationEventDue,
  pauseSimulationSeason,
  restoreSimulationSchedulerState,
  resumeSimulationSeason,
  scheduleEventInput,
  scheduleSimulationEvent,
  scheduledEventId,
  serializeSimulationSchedulerState,
  simulationBoundaryCrossings,
  startSimulationSeason,
} from '../../packages/core/src/index.js';

function eventInput(id = 'EVENT_1', dueTicks = '100', key = 'IDEMPOTENCY_1') {
  return scheduleEventInput(
    scheduledEventId(id),
    'TEST_OBLIGATION',
    SimTime.fromTicks(dueTicks),
    key,
  );
}

describe('V06.2 Simulation Scheduler lifecycle', () => {
  it('enforces PREOPEN -> RUNNING <-> PAUSED -> ENDED transitions', () => {
    const preopen = createSimulationScheduler();
    expect(preopen.seasonStatus).toBe('PREOPEN');
    expect(() => pauseSimulationSeason(preopen)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      }),
    );

    const running = startSimulationSeason(preopen);
    const paused = pauseSimulationSeason(running);
    const resumed = resumeSimulationSeason(paused);
    const ended = endSimulationSeason(resumed);

    expect(paused.clock.simTime.toCanonicalValue()).toBe('0');
    expect(resumed.clock.simTime.toCanonicalValue()).toBe('0');
    expect(resumed.pauseIntervals).toEqual([
      {
        pausedAtSimTime: SimTime.fromTicks('0'),
        resumedAtSimTime: SimTime.fromTicks('0'),
      },
    ]);
    expect(ended.seasonStatus).toBe('ENDED');
    expect(() => startSimulationSeason(ended)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      }),
    );
  });

  it('freezes SimTime while PAUSED and excludes paused wall time', () => {
    const running = startSimulationSeason(createSimulationScheduler());
    const beforePause = advanceRunningSimulationScheduler(
      running,
      advanceClockInput('100'),
    ).state;
    const paused = pauseSimulationSeason(beforePause);

    expect(() =>
      advanceRunningSimulationScheduler(paused, advanceClockInput('999999')),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      }),
    );

    const resumed = resumeSimulationSeason(paused);
    const afterResume = advanceRunningSimulationScheduler(
      resumed,
      advanceClockInput('1'),
    ).state;
    expect(paused.clock.simTime.toCanonicalValue()).toBe('1000');
    expect(resumed.clock.simTime.toCanonicalValue()).toBe('1000');
    expect(afterResume.clock.simTime.toCanonicalValue()).toBe('1010');
  });

  it('uses recorded RUNNING catch-up and reports compact exact boundaries', () => {
    const running = startSimulationSeason(createSimulationScheduler());
    const result = catchUpRunningSimulationScheduler(
      running,
      advanceClockInput('3110400000'),
    );

    expect(result.state.clock.simTime.toCanonicalValue()).toBe('31104000000');
    expect(result.boundaries).toEqual({
      days: { count: '360', firstIndex: '1', lastIndex: '360' },
      years: { count: '1', firstIndex: '1', lastIndex: '1' },
    });
  });

  it('calculates day boundaries without allocating per-day work', () => {
    expect(
      simulationBoundaryCrossings(
        SimTime.fromTicks('0'),
        SimTime.fromTicks(`${SIMULATION_TICKS_PER_DAY}000000`),
      ).days,
    ).toEqual({
      count: '1000000',
      firstIndex: '1',
      lastIndex: '1000000',
    });
  });
});

describe('V06.2 exact due and restart behavior', () => {
  it('uses locale-independent code-unit order for canonical event state', () => {
    let state = createSimulationScheduler();
    const localeCompare = String.prototype.localeCompare;
    String.prototype.localeCompare = () => {
      throw new Error('localeCompare must not determine authoritative order');
    };
    try {
      for (const id of ['Z', 'AA', 'A_1', 'A-1']) {
        state = scheduleSimulationEvent(
          state,
          eventInput(id, '100', `IDEMPOTENCY_${id}`),
        );
      }
    } finally {
      String.prototype.localeCompare = localeCompare;
    }
    expect(
      state.scheduledEvents.map((event) => event.scheduledEventId),
    ).toEqual(['A-1', 'AA', 'A_1', 'Z']);
  });

  it('executes an event only at or after its exact due SimTime', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = scheduleSimulationEvent(state, eventInput());
    expect(isSimulationEventDue(state, scheduledEventId('EVENT_1'))).toBe(
      false,
    );
    expect(() =>
      completeDueSimulationEvent(state, scheduledEventId('EVENT_1')),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULED_EVENT_NOT_DUE,
      }),
    );

    state = advanceRunningSimulationScheduler(
      state,
      advanceClockInput('10'),
    ).state;
    expect(isSimulationEventDue(state, scheduledEventId('EVENT_1'))).toBe(true);
    const completion = completeDueSimulationEvent(
      state,
      scheduledEventId('EVENT_1'),
    );
    expect(completion.applied).toBe(true);
    expect(completion.state.scheduledEvents[0]?.status).toBe('COMPLETED');
  });

  it('keeps due work pending through pause and processes it after resume', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = scheduleSimulationEvent(state, eventInput('EVENT_PAUSE', '0'));
    state = pauseSimulationSeason(state);
    expect(isSimulationEventDue(state, scheduledEventId('EVENT_PAUSE'))).toBe(
      false,
    );
    expect(() =>
      completeDueSimulationEvent(state, scheduledEventId('EVENT_PAUSE')),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      }),
    );

    state = resumeSimulationSeason(state);
    expect(isSimulationEventDue(state, scheduledEventId('EVENT_PAUSE'))).toBe(
      true,
    );
  });

  it('makes exact scheduling retries idempotent and rejects conflicts', () => {
    const initial = createSimulationScheduler();
    const scheduled = scheduleSimulationEvent(initial, eventInput());
    expect(scheduleSimulationEvent(scheduled, eventInput())).toBe(scheduled);
    expect(() =>
      scheduleSimulationEvent(
        scheduled,
        eventInput('EVENT_1', '101', 'IDEMPOTENCY_1'),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULED_EVENT_CONFLICT,
      }),
    );
    expect(() =>
      scheduleSimulationEvent(
        scheduled,
        eventInput('EVENT_2', '100', 'IDEMPOTENCY_1'),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULED_EVENT_CONFLICT,
      }),
    );
  });

  it('restores committed completion without executing the event twice', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = scheduleSimulationEvent(
      state,
      eventInput('DAILY_SETTLEMENT_DAY_1', '0', 'SETTLEMENT_DAY_1'),
    );
    state = completeDueSimulationEvent(
      state,
      scheduledEventId('DAILY_SETTLEMENT_DAY_1'),
    ).state;

    const serialized = serializeSimulationSchedulerState(state);
    const restored = restoreSimulationSchedulerState(serialized);
    const retry = completeDueSimulationEvent(
      restored,
      scheduledEventId('DAILY_SETTLEMENT_DAY_1'),
    );

    expect(serializeSimulationSchedulerState(restored)).toBe(serialized);
    expect(retry.applied).toBe(false);
    expect(retry.state).toBe(restored);
  });

  it('rejects non-canonical or internally impossible restart state', () => {
    let state = startSimulationSeason(createSimulationScheduler());
    state = scheduleSimulationEvent(state, eventInput());
    const canonical = serializeSimulationSchedulerState(state);
    expect(() => restoreSimulationSchedulerState(` ${canonical}`)).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_STATE_INVALID,
      }),
    );

    const impossible = JSON.parse(canonical);
    impossible.scheduledEvents[0].status = 'COMPLETED';
    expect(() =>
      restoreSimulationSchedulerState(
        JSON.stringify(impossible, Object.keys(impossible).sort()),
      ),
    ).toThrowError();
  });

  it('rejects a canonical PREOPEN snapshot with impossible completed work', () => {
    const scheduled = scheduleSimulationEvent(
      createSimulationScheduler(),
      eventInput('EVENT_PREOPEN', '0', 'IDEMPOTENCY_PREOPEN'),
    );
    const impossible = JSON.parse(serializeSimulationSchedulerState(scheduled));
    impossible.scheduledEvents[0].status = 'COMPLETED';

    expect(() =>
      restoreSimulationSchedulerState(canonicalSerialize(impossible)),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_STATE_INVALID,
      }),
    );
  });

  it('rejects scheduling and advancement after ENDED', () => {
    const ended = endSimulationSeason(
      startSimulationSeason(createSimulationScheduler()),
    );
    expect(() => scheduleSimulationEvent(ended, eventInput())).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      }),
    );
    expect(() =>
      advanceRunningSimulationScheduler(ended, advanceClockInput('1')),
    ).toThrowError(
      expect.objectContaining({
        code: DOMAIN_ERROR_CODES.SCHEDULER_TRANSITION_INVALID,
      }),
    );
  });
});
