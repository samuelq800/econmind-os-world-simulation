/** Real Core private model replay, never SQL source admission or paid labour. */
import { describe, it, expect } from 'vitest';
import { parseCanonicalCommand, type CanonicalCommand } from '@econmind/core';
import {
  createIndustryFirstDayWorkState,
  prepareIndustryRunScheduleFrame,
  prepareIndustryFirstDayWorkFrame,
  readIndustryCompletedWork,
  type IndustryFirstDayWorkSiteSource,
} from '@econmind/core/industry-first-day-work';
import { derivePostwarIndustryRunWorkAllocations } from '../../apps/world-worker/src/persistence/postwar-industry-work-publisher.js';
import {
  createIndustryFirstDayWorkCoreFixture,
  industryWorkTestSha as sha,
} from '../support/industry-first-day-work-core-fixture.js';
function command(
  source: IndustryFirstDayWorkSiteSource,
  id: string,
  version: string,
  time: string,
  payload: unknown,
  automatic = false,
): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: 'command-v1',
      worldId: source.worldId,
      commandId: id,
      commandType: automatic
        ? 'CORE_INDUSTRY_FIRST_DAY_WORK_V1'
        : 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
      actorId: 'ACTOR_TEST_ONLY_ALLOCATION',
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId: source.countryId,
      officeId: automatic ? null : 'INDUSTRY',
      expectedWorldVersion: version,
      idempotencyKey: id,
      correlationId: 'CORRELATION_' + id,
      simTime: time,
      submittedAtReal: '2026-11-01T00:00:00.000Z',
      payload,
    },
    sha,
  );
}
const at = '2026-11-01T00:00:00.000Z';
describe('bounded Industry distinct-person interval allocation', () => {
  it('allocates thousands of workers as one real ordinal range and Core replays exact person-time', () => {
    const f = createIndustryFirstDayWorkCoreFixture(),
      source = {
        ...f.source,
        capacityPerSimDay: '500000',
        positions: f.source.positions.map((p) => ({ ...p, count: '10000' })),
      };
    const initial = createIndustryFirstDayWorkState([source]),
      terms = {
        ...f.terms,
        quantity: { ...f.terms.quantity, amount: '375000' },
      };
    const c = command(source, 'COMMAND_LARGE_RUN', '0', '0', terms),
      schedule = prepareIndustryRunScheduleFrame(
        {
          state: initial,
          command: c,
          head: { worldVersion: '0', eventSequence: '0' },
          observedAtReal: at,
        },
        sha,
      );
    const input = {
      state: schedule.state,
      countryId: source.countryId,
      facilityId: source.facilityId,
      runId: terms.runId,
      currentEmployment: [
        { positionId: source.positions[0]!.positionId, employedCount: '10000' },
      ],
      simTime: '28800000',
    };
    const allocations = derivePostwarIndustryRunWorkAllocations(input);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]).toMatchObject({
      count: '3000',
      personMilliseconds: '86400000000',
      startsAtSimTime: '0',
      endsAtSimTime: '28800000',
    });
    const workCommand = command(
      source,
      'COMMAND_LARGE_WORK',
      '1',
      '28800000',
      {
        schemaVersion: 'postwar-industry-work-command-v1',
        runId: terms.runId,
        scheduleCommandFingerprint: c.fingerprint,
        allocations,
      },
      true,
    );
    const actual = prepareIndustryFirstDayWorkFrame(
      {
        state: schedule.state,
        command: workCommand,
        head: { worldVersion: '1', eventSequence: '1' },
        observedAtReal: at,
      },
      sha,
    );
    expect(readIndustryCompletedWork(actual.work!).data.allocations).toEqual(
      allocations,
    );
    expect(() =>
      derivePostwarIndustryRunWorkAllocations({ ...input, simTime: '100' }),
    ).toThrow('NOT_DUE_ACTUAL_DISTINCT_ELAPSED');
  });
  it('partitions existing bookings by ordinal and subtracts exact elapsed time/daily cap across two already scheduled runs', () => {
    const f = createIndustryFirstDayWorkCoreFixture(),
      source = f.source,
      initial = createIndustryFirstDayWorkState([source]);
    const c1 = command(source, 'COMMAND_RUN_A', '0', '0', f.terms),
      r1 = prepareIndustryRunScheduleFrame(
        {
          state: initial,
          command: c1,
          head: { worldVersion: '0', eventSequence: '0' },
          observedAtReal: at,
        },
        sha,
      );
    const t2 = {
        ...f.terms,
        runId: 'RUN_TEST_ONLY_SECOND',
        quantity: { ...f.terms.quantity, amount: '200' },
      },
      c2 = command(source, 'COMMAND_RUN_B', '1', '0', t2),
      r2 = prepareIndustryRunScheduleFrame(
        {
          state: r1.state,
          command: c2,
          head: { worldVersion: '1', eventSequence: '1' },
          observedAtReal: at,
        },
        sha,
      );
    const first = command(
        source,
        'COMMAND_WORK_A',
        '2',
        '230400',
        {
          schemaVersion: 'postwar-industry-work-command-v1',
          runId: f.terms.runId,
          scheduleCommandFingerprint: c1.fingerprint,
          allocations: [f.allocation],
        },
        true,
      ),
      w1 = prepareIndustryFirstDayWorkFrame(
        {
          state: r2.state,
          command: first,
          head: { worldVersion: '2', eventSequence: '2' },
          observedAtReal: at,
        },
        sha,
      );
    const allocations = derivePostwarIndustryRunWorkAllocations({
      state: w1.state,
      countryId: source.countryId,
      facilityId: source.facilityId,
      runId: t2.runId,
      currentEmployment: [
        { positionId: source.positions[0]!.positionId, employedCount: '2' },
      ],
      simTime: '28800000',
    });
    expect(
      allocations.map((a) => [
        a.startOrdinal,
        a.startsAtSimTime,
        a.personMilliseconds,
      ]),
    ).toEqual([
      ['100', '230400', '28569600'],
      ['101', '0', '17510400'],
    ]);
    const second = command(
        source,
        'COMMAND_WORK_B',
        '3',
        '28800000',
        {
          schemaVersion: 'postwar-industry-work-command-v1',
          runId: t2.runId,
          scheduleCommandFingerprint: c2.fingerprint,
          allocations,
        },
        true,
      ),
      w2 = prepareIndustryFirstDayWorkFrame(
        {
          state: w1.state,
          command: second,
          head: { worldVersion: '3', eventSequence: '3' },
          observedAtReal: at,
        },
        sha,
      );
    expect(readIndustryCompletedWork(w2.work!).data.allocations).toEqual(
      allocations,
    );
  });
  it('does not accept a copied private model or an expanded employment range', () => {
    expect(() =>
      derivePostwarIndustryRunWorkAllocations({
        state: {} as never,
        countryId: 'COUNTRY_02',
        facilityId: 'SITE_TEST',
        runId: 'RUN_TEST',
        currentEmployment: [],
        simTime: '0',
      }),
    ).toThrow('ISSUED_WORK_STATE');
  });
});
