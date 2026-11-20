import { describe, expect, it } from 'vitest';
import {
  parseCanonicalCommand,
  COMMAND_SCHEMA_VERSION,
} from '../../packages/core/src/commands/command.js';
import {
  createIndustryFirstDayWorkCoreFixture,
  industryWorkTestSha as sha,
} from '../support/industry-first-day-work-core-fixture.js';
import {
  prepareIndustryUtilisationTargetFrame,
  replayIndustryFirstDayRunFrame,
  readIndustryFirstDayWorkState,
  INDUSTRY_UTILISATION_TARGET_COMMAND,
} from '../../packages/core/src/industry/industry-first-day-work.js';
import { projectIndustryUtilisationTargetRows } from '../../apps/world-worker/src/persistence/postwar-industry-utilisation-targets-read.js';
const observedAtReal = '2026-11-01T00:00:00.000Z';
function setup() {
  const f = createIndustryFirstDayWorkCoreFixture();
  function command(
    percent: string,
    extra: Record<string, unknown> = {},
    id = 'TARGET_01',
    version = '1',
    office: 'INDUSTRY' | 'SOCIAL' = 'INDUSTRY',
  ) {
    return parseCanonicalCommand(
      {
        schemaVersion: COMMAND_SCHEMA_VERSION,
        commandId: id,
        commandType: INDUSTRY_UTILISATION_TARGET_COMMAND,
        worldId: f.source.worldId,
        actorId: f.schedule.command.actorId,
        authSubject: f.schedule.command.authSubject,
        countryId: f.source.countryId,
        officeId: office,
        expectedWorldVersion: version,
        idempotencyKey: id,
        correlationId: id,
        simTime: '0',
        submittedAtReal: observedAtReal,
        payload: {
          schemaVersion: 'postwar-industry-utilisation-target-v1',
          facilityId: f.source.facilityId,
          targetPercent: percent,
          startsAtSimTime: '0',
          endsAtSimTime: '86400000',
          policyVersion: f.source.policyVersion,
          sourceRef: f.source.sourceRef,
          sourceRawSha256: f.source.sourceRawSha256,
          ...extra,
        },
      },
      sha,
    );
  }
  return { f, command };
}
describe('bounded first-day utilisation intent in existing Industry state', () => {
  it('distinguishes no target from explicit zero without changing a committed run, money, inventory or labour', () => {
    const { f, command } = setup();
    expect(
      readIndustryFirstDayWorkState(f.scheduled).utilisationTargets,
    ).toEqual([]);
    const result = prepareIndustryUtilisationTargetFrame(
      {
        state: f.scheduled,
        command: command('0'),
        head: { worldVersion: '1', eventSequence: '1' },
        observedAtReal,
      },
      sha,
    );
    const state = readIndustryFirstDayWorkState(result.state);
    expect(state.runs).toEqual(readIndustryFirstDayWorkState(f.scheduled).runs);
    expect(state.bookings).toEqual([]);
    expect(state.completedWorks).toEqual([]);
    expect(result.frame.financialPostingBatches).toEqual([]);
    expect(result.frame.inventoryPostings).toEqual([]);
    expect(state.utilisationTargets).toHaveLength(1);
    expect(state.utilisationTargets[0]!.terms.targetPercent).toBe('0');
    const rows = projectIndustryUtilisationTargetRows(
      state,
      f.source.countryId,
      f.source.facilityId,
    );
    expect(rows[0]).toMatchObject({
      targetPercent: '0',
      measurement:
        'COMMITTED_TARGET_INTENT_NOT_PRODUCTION_RESERVATION_OR_FEASIBILITY',
    });
    expect(
      projectIndustryUtilisationTargetRows(
        state,
        'COUNTRY_01',
        f.source.facilityId,
      ),
    ).toEqual([]);
  });
  it('replays idempotently and replaces only the explicit current target, retaining prior command identity', () => {
    const { f, command } = setup();
    const zero = prepareIndustryUtilisationTargetFrame(
      {
        state: f.scheduled,
        command: command('0'),
        head: { worldVersion: '1', eventSequence: '1' },
        observedAtReal,
      },
      sha,
    );
    const next = prepareIndustryUtilisationTargetFrame(
      {
        state: zero.state,
        command: command('75', {}, 'TARGET_02', '2'),
        head: { worldVersion: '2', eventSequence: '2' },
        observedAtReal,
      },
      sha,
    );
    expect(
      readIndustryFirstDayWorkState(next.state).utilisationTargets,
    ).toHaveLength(1);
    expect(
      readIndustryFirstDayWorkState(next.state).utilisationTargets[0]!.terms
        .targetPercent,
    ).toBe('75');
    expect(
      replayIndustryFirstDayRunFrame(
        { state: next.state, frame: zero.frame },
        sha,
      ).state,
    ).toBe(next.state);
    expect(readIndustryFirstDayWorkState(next.state).runs).toEqual(
      readIndustryFirstDayWorkState(f.scheduled).runs,
    );
  });
  it('refuses out-of-range percentages, source substitution, unsupported facility/window and another office', () => {
    const { f, command } = setup();
    const produce = (c: ReturnType<typeof command>) =>
      prepareIndustryUtilisationTargetFrame(
        {
          state: f.scheduled,
          command: c,
          head: { worldVersion: '1', eventSequence: '1' },
          observedAtReal,
        },
        sha,
      );
    for (const percent of ['100.0000000000000000001', '-1', '01', '0.0'])
      expect(() => produce(command(percent))).toThrow();
    for (const extra of [
      { sourceRawSha256: 'c'.repeat(64) },
      { facilityId: 'UNREGISTERED_FACILITY' },
      { endsAtSimTime: '86400001' },
      { startsAtSimTime: '86400000' },
    ])
      expect(() => produce(command('50', extra))).toThrow();
    expect(() =>
      produce(command('50', {}, 'TARGET_OTHER', '1', 'SOCIAL')),
    ).toThrow('MANUAL_UTILISATION_TARGET_SCOPE_REQUIRED');
  });
});
