import { describe, expect, it } from 'vitest';
import {
  createIndustryFirstDayWorkCoreFixture,
  industryWorkTestSha,
} from '../support/industry-first-day-work-core-fixture.js';
import {
  readIndustryCompletedWork,
  isIndustryCompletedWork,
  replayIndustryFirstDayRunFrame,
  parseIndustryRunScheduleIntent,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
  readIndustryFirstDayWorkState,
} from '../../packages/core/src/industry/industry-first-day-work.js';
describe('finite Industry scheduled worker-time Core DATA replay', () => {
  it('fixed Core stage producers derive and replay complete deterministic frames without manufacturing financial or inventory effects', () => {
    const f = createIndustryFirstDayWorkCoreFixture();
    const schedule = prepareIndustryRunScheduleFrame(
      {
        state: f.initial,
        command: f.schedule.command,
        head: { worldVersion: '0', eventSequence: '0' },
        observedAtReal: '2026-11-01T00:00:00.000Z',
      },
      industryWorkTestSha,
    );
    const work = prepareIndustryFirstDayWorkFrame(
      {
        state: schedule.state,
        command: f.frame.command,
        head: { worldVersion: '1', eventSequence: '1' },
        observedAtReal: '2026-11-01T00:00:00.000Z',
      },
      industryWorkTestSha,
    );
    expect(readIndustryCompletedWork(work.work!).data.allocations).toEqual([
      f.allocation,
    ]);
    expect(
      readIndustryFirstDayWorkState(work.state).runs[0]
        ?.performedPersonMilliseconds,
    ).toBe('230400');
    expect(work.frame.financialPostingBatches).toEqual([]);
    expect(work.frame.inventoryPostings).toEqual([]);
    expect(
      prepareIndustryFirstDayWorkFrame(
        {
          state: schedule.state,
          command: f.frame.command,
          head: { worldVersion: '1', eventSequence: '1' },
          observedAtReal: '2026-11-01T00:00:00.000Z',
        },
        industryWorkTestSha,
      ).frame,
    ).toEqual(work.frame);
    expect(() =>
      prepareIndustryFirstDayWorkFrame(
        {
          state: schedule.state,
          command: f.frame.command,
          head: { worldVersion: '2', eventSequence: '2' },
          observedAtReal: '2026-11-01T00:00:00.000Z',
        },
        industryWorkTestSha,
      ),
    ).toThrow('EXACT_ACTUAL_STAGE_HEAD_REQUIRED');
  });

  it('verifies actual canonical schedule then automatic WORK and preserves pool/region lineage and units', () => {
    const f = createIndustryFirstDayWorkCoreFixture(),
      w = readIndustryCompletedWork(f.work);
    expect(
      parseIndustryRunScheduleIntent(f.schedule.command, industryWorkTestSha),
    ).toEqual(f.terms);
    expect(w.data.allocations[0]).toMatchObject({
      sourceStartOrdinal: '10',
      startOrdinal: '100',
      count: '1',
      personMilliseconds: '230400',
      personMinutes: { numerator: '230400', denominator: '60000' },
    });
    expect(w.frame.command.officeId).toBe(null);
    expect(w.frame.command.authSubject).toBe(f.schedule.command.authSubject);
    expect(isIndustryCompletedWork({ ...f.work })).toBe(false);
    expect(() => readIndustryCompletedWork({ ...f.work })).toThrow(
      'ISSUED_WORK_REPLAY',
    );
  });
  it('keeps duplicate commits idempotent and refuses another event claiming the same person/time', () => {
    const f = createIndustryFirstDayWorkCoreFixture();
    expect(
      replayIndustryFirstDayRunFrame(
        { state: f.state, frame: f.frame },
        industryWorkTestSha,
      ),
    ).toEqual({ state: f.state, work: f.work });
    expect(() =>
      replayIndustryFirstDayRunFrame(
        {
          state: f.state,
          frame: f.makeWork(undefined, {
            id: 'COMMAND_TEST_ONLY_DOUBLE_WORK',
            version: '2',
          }),
        },
        industryWorkTestSha,
      ),
    ).toThrow('WORKER_TIME_ALREADY_BOOKED');
  });
  it('rejects missing schedule, forged regional coordinates, work in the future, and demand-derived false time', () => {
    const f = createIndustryFirstDayWorkCoreFixture();
    expect(() =>
      replayIndustryFirstDayRunFrame(
        { state: f.initial, frame: f.frame },
        industryWorkTestSha,
      ),
    ).toThrow('ACTUAL_COMMITTED_RUN_REQUIRED');
    for (const a of [
      { ...f.allocation, startOrdinal: '10' },
      { ...f.allocation, sourceStartOrdinal: '12' },
      { ...f.allocation, personMilliseconds: '1' },
      { ...f.allocation, skill: 'HIGH' as const },
    ])
      expect(() =>
        replayIndustryFirstDayRunFrame(
          { state: f.scheduled, frame: f.makeWork([a]) },
          industryWorkTestSha,
        ),
      ).toThrow('EXACT_ELAPSED_DISTINCT_PERSON_TIME');
    expect(() =>
      replayIndustryFirstDayRunFrame(
        { state: f.scheduled, frame: f.makeWork(undefined, { time: '100' }) },
        industryWorkTestSha,
      ),
    ).toThrow('EXACT_ELAPSED_DISTINCT_PERSON_TIME');
  });
  it('does not accept copied state or a missing financial/inventory effect as an inert work frame', () => {
    const f = createIndustryFirstDayWorkCoreFixture();
    expect(() =>
      replayIndustryFirstDayRunFrame(
        { state: { ...f.scheduled }, frame: f.frame },
        industryWorkTestSha,
      ),
    ).toThrow('ISSUED_WORK_STATE');
    expect(() =>
      replayIndustryFirstDayRunFrame(
        {
          state: f.scheduled,
          frame: { ...f.frame, financialPostingBatches: [{}] },
        },
        industryWorkTestSha,
      ),
    ).toThrow('EXACT_ZERO_POSTING');
  });
});
