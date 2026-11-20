/** Small issued Core DATA, not database/source admission or currentness. */
import { describe, it, expect } from 'vitest';
import { createIndustryFirstDayWorkCoreFixture } from '../support/industry-first-day-work-core-fixture.js';
import { readIndustryFirstDayWorkState } from '../../packages/core/src/industry/industry-first-day-work.js';
import {
  projectIndustryCommittedRunRows,
  createPostwarIndustryCommittedRunsReader,
} from '../../apps/world-worker/src/persistence/postwar-industry-committed-runs-read.js';
import {
  parseIndustryCommittedRunRow,
  parseIndustryCommittedRunsCoverage,
} from '../../packages/core/src/read-models/postwar-industry-committed-runs-contract.js';
describe('committed Industry run DATA projection', () => {
  it('keeps no schedule separate from committed schedule and actually recorded worker-time', () => {
    const f = createIndustryFirstDayWorkCoreFixture();
    const rows = (s: typeof f.state) =>
      projectIndustryCommittedRunRows(
        readIndustryFirstDayWorkState(s),
        f.source.countryId,
        f.source.facilityId,
      );
    expect(rows(f.initial)).toEqual([]);
    expect(rows(f.scheduled)).toHaveLength(1);
    expect(rows(f.scheduled)[0]).toMatchObject({
      runId: f.terms.runId,
      quantity: f.terms.quantity.amount,
      performedPersonMilliseconds: '0',
      commandId: f.schedule.command.commandId,
      commandFingerprint: f.schedule.command.fingerprint,
      eventId: f.schedule.events[0]!.eventId,
    });
    expect(rows(f.state)[0]?.performedPersonMilliseconds).toBe('230400');
    expect(rows(f.state)[0]).not.toHaveProperty('remainingCapacity');
    expect(rows(f.state)[0]).not.toHaveProperty('producedQuantity');
    expect(
      projectIndustryCommittedRunRows(
        readIndustryFirstDayWorkState(f.state),
        'COUNTRY_FOREIGN',
        f.source.facilityId,
      ),
    ).toEqual([]);
  });
  it('does not accept alleged live authority or malformed schedule/coverage DTOs', () => {
    expect(() =>
      createPostwarIndustryCommittedRunsReader({ binding: {} as never }),
    ).toThrow();
    const f = createIndustryFirstDayWorkCoreFixture(),
      row = projectIndustryCommittedRunRows(
        readIndustryFirstDayWorkState(f.state),
        f.source.countryId,
        f.source.facilityId,
      )[0]!;
    expect(() =>
      parseIndustryCommittedRunRow({ ...row, remainingCapacity: '0' }),
    ).toThrow();
    expect(() =>
      parseIndustryCommittedRunRow({ ...row, committedWorldVersion: '0' }),
    ).toThrow();
    expect(() =>
      parseIndustryCommittedRunRow({
        ...row,
        endsAtSimTime: row.startsAtSimTime,
      }),
    ).toThrow();
    expect(() => parseIndustryCommittedRunsCoverage({})).toThrow();
  });
});
