import { describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  restoreSimulationSchedulerState,
  serializeSimulationSchedulerState,
  pendingDueSimulationEventsInOrder,
} from '@econmind/core';
import {
  deriveClockRecord,
  replayClockRecords,
  parseClockBinding,
  clockInteger,
  type ClockRecord,
  type ClockKind,
} from '../../apps/world-worker/src/time/clock-contracts.js';
import {
  createUnregisteredDurableWorldClock,
  createTestOnlyDurableWorldClock,
  REAL_PUBLISHER_NON_BYPASS,
} from '../../apps/world-worker/src/time/durable-world-clock.js';
import {
  fixtureBinding,
  fixtureIntent,
  fixtureObservation,
} from '../support/isolated-world-clock-fixture.js';

const leaseAt = '2026-10-11T12:00:00.000Z';
function chain(
  operations: readonly [ClockKind, string][],
  bindingBytes = fixtureBinding(),
) {
  const records: Readonly<ClockRecord>[] = [];
  for (const [index, [kind, at]] of operations.entries()) {
    const id = 'OP_' + index;
    records.push(
      deriveClockRecord({
        bindingBytes,
        intentBytes: fixtureIntent(
          bindingBytes,
          id,
          kind,
          records.at(-1)?.head ?? null,
        ),
        sourceBytes: fixtureObservation(bindingBytes, 'SOURCE_' + id, at),
        previous: records.at(-1)?.head ?? null,
        leaseObservedAtReal: leaseAt,
      }),
    );
  }
  return { bindingBytes, records, last: records.at(-1)! };
}
describe('P1/P2 isolated Clock canonical mechanics (not source authority)', () => {
  it('converts exactly 1000 real ms once, restores full bytes and preserves due total order', () => {
    const c = chain([
      ['INIT', '1000'],
      ['ADVANCE', '2000'],
    ]);
    const state = restoreSimulationSchedulerState(c.last.head.stateBytes);
    expect(state.clock.simTime.toCanonicalValue()).toBe('10000');
    expect(
      pendingDueSimulationEventsInOrder(state).map((e) => e.scheduledEventId),
    ).toEqual(['FIXED_EVENT_A', 'FIXED_EVENT_B']);
    expect(state.scheduledEvents.every((e) => e.status === 'PENDING')).toBe(
      true,
    );
    expect(
      replayClockRecords(
        c.bindingBytes,
        c.records.map((r) => r.originalBytes),
      ),
    ).toEqual(c.records);
    expect(serializeSimulationSchedulerState(state)).toBe(
      c.last.head.stateBytes,
    );
  });
  it('RUNNING downtime and partitioned observations yield equal final Core state, not equal journal identity', () => {
    const one = chain([
      ['INIT', '1000'],
      ['ADVANCE', '10001000'],
    ]);
    const split = chain([
      ['INIT', '1000'],
      ['ADVANCE', '2000'],
      ['ADVANCE', '10001000'],
    ]);
    expect(one.last.head.stateBytes).toBe(split.last.head.stateBytes);
    expect(one.last.recordHash).not.toBe(split.last.recordHash);
    expect(one.last.head.revision).toBe('2');
    expect(split.last.head.revision).toBe('3');
  });
  it('PAUSE accounts before freeze; PAUSED restart contributes zero, resume resets anchor', () => {
    const c = chain([
      ['INIT', '1000'],
      ['PAUSE', '1100'],
      ['RESUME', '9000000'],
      ['ADVANCE', '9000010'],
    ]);
    expect(
      restoreSimulationSchedulerState(
        c.records[1]!.head.stateBytes,
      ).clock.simTime.toCanonicalValue(),
    ).toBe('1000');
    expect(
      restoreSimulationSchedulerState(
        c.records[2]!.head.stateBytes,
      ).clock.simTime.toCanonicalValue(),
    ).toBe('1000');
    expect(
      restoreSimulationSchedulerState(
        c.last.head.stateBytes,
      ).clock.simTime.toCanonicalValue(),
    ).toBe('1100');
    expect(JSON.parse(c.records[2]!.originalBytes).activeRealMilliseconds).toBe(
      '0',
    );
    expect(
      replayClockRecords(
        c.bindingBytes,
        c.records.map((r) => r.originalBytes),
      ),
    ).toEqual(c.records);
    expect(() =>
      chain([
        ['INIT', '1000'],
        ['PAUSE', '1100'],
        ['ADVANCE', '1200'],
      ]),
    ).toThrow();
  });
  it('rejects regression, overflow, floats, unknown fields/kinds/protocol, and mismatched world/epoch/base', () => {
    for (const value of ['-1', '1.0', '01', '9223372036854775808', 1])
      expect(() => clockInteger(value)).toThrow();
    expect(() =>
      chain([
        ['INIT', '1000'],
        ['ADVANCE', '999'],
      ]),
    ).toThrow('REGRESSION');
    expect(() =>
      chain([
        ['INIT', '1000'],
        ['ADVANCE', '9223372036854775807'],
      ]),
    ).toThrow();
    for (const override of [
      { worldId: 'PRODUCTION_WORLD' },
      { sourceVersion: '2' },
      { extra: true },
    ])
      expect(() =>
        parseClockBinding(fixtureBinding(undefined, override)),
      ).toThrow();
    const b = fixtureBinding();
    const intent = fixtureIntent(b, 'OP', 'INIT', null);
    for (const override of [
      { sourceEpoch: 'OTHER' },
      { worldId: 'CLOCK_ISOLATED_OTHER' },
      { baseGenesisRef: 'OTHER' },
      { environment: 'LIVE' },
      { sourceVersion: '2' },
      { provenanceRef: '' },
    ])
      expect(() =>
        deriveClockRecord({
          bindingBytes: b,
          intentBytes: intent,
          sourceBytes: fixtureObservation(b, 'SOURCE_OP', '1000', override),
          previous: null,
          leaseObservedAtReal: leaseAt,
        }),
      ).toThrow();
    expect(() =>
      deriveClockRecord({
        bindingBytes: b,
        intentBytes: canonicalSerialize({
          ...JSON.parse(intent),
          kind: 'IMPORT_SNAPSHOT',
        }),
        sourceBytes: fixtureObservation(b, 'SOURCE_OP', '1000'),
        previous: null,
        leaseObservedAtReal: leaseAt,
      }),
    ).toThrow();
  });
  it('does not trust a self-consistent hash or canonical snapshot: replays every original input', () => {
    const c = chain([
      ['INIT', '1000'],
      ['ADVANCE', '2000'],
    ]);
    for (const override of [
      { activeRealMilliseconds: '0' },
      { afterBytes: c.records[0]!.head.stateBytes },
      { clockVersion: 'UNKNOWN' },
      { beforeHash: '0'.repeat(64) },
      { classification: 'AUTHORITATIVE' },
    ]) {
      const bad = canonicalSerialize({
        ...JSON.parse(c.last.originalBytes),
        ...override,
      });
      expect(() =>
        replayClockRecords(c.bindingBytes, [c.records[0]!.originalBytes, bad]),
      ).toThrow();
    }
    expect(() =>
      replayClockRecords(c.bindingBytes, [c.last.originalBytes]),
    ).toThrow();
    expect(() =>
      replayClockRecords(c.bindingBytes, [
        c.records[0]!.originalBytes,
        c.records[0]!.originalBytes,
      ]),
    ).toThrow();
    expect(() =>
      replayClockRecords(c.bindingBytes, [c.records[0]!.originalBytes + ' ']),
    ).toThrow();
  });
  it('legacy restore normalizes through Core and refuses nonprefix completion snapshots without exposing completion', () => {
    const b = fixtureBinding();
    const binding = JSON.parse(b);
    const snapshot = JSON.parse(binding.baseSchedulerBytes);
    const legacy = {
      clock: snapshot.clock,
      pauseIntervals: snapshot.pauseIntervals,
      scheduledEvents: snapshot.scheduledEvents.map(
        (event: Record<string, unknown>) => {
          const { priorityId, ...rest } = event;
          void priorityId;
          return rest;
        },
      ),
      schedulerVersion: 'SIMULATION_SCHEDULER_V1',
      seasonStatus: snapshot.seasonStatus,
    };
    const legacyBinding = fixtureBinding(undefined, {
      baseSchedulerBytes: canonicalSerialize(legacy),
    });
    const normalized = chain(
      [
        ['INIT', '1000'],
        ['ADVANCE', '2000'],
      ],
      legacyBinding,
    );
    expect(
      restoreSimulationSchedulerState(
        normalized.last.head.stateBytes,
      ).clock.simTime.toCanonicalValue(),
    ).toBe('10000');
    expect(
      replayClockRecords(
        legacyBinding,
        normalized.records.map((r) => r.originalBytes),
      ),
    ).toEqual(normalized.records);
    snapshot.clock.simTime = '100';
    snapshot.scheduledEvents[1].status = 'COMPLETED';
    expect(() =>
      parseClockBinding(
        fixtureBinding(undefined, {
          baseSchedulerBytes: canonicalSerialize(snapshot),
        }),
      ),
    ).toThrow();
    legacy.clock = { ...legacy.clock, simTime: '100' };
    legacy.scheduledEvents[1]!.status = 'COMPLETED';
    expect(() =>
      parseClockBinding(
        fixtureBinding(undefined, {
          baseSchedulerBytes: canonicalSerialize(legacy),
        }),
      ),
    ).toThrow();
  });
  it('fails real construction closed and exposes no timer, cutoff, schedule or complete port', async () => {
    const real = createUnregisteredDurableWorldClock();
    for (const operation of [real.apply, real.read, real.recover])
      expect(await operation()).toMatchObject({ status: 'DENIED', writes: 0 });
    let transactions = 0;
    const isolated = createTestOnlyDurableWorldClock({
      bindingBytes: fixtureBinding(),
      database: {
        query: async () => {
          throw Error('NO_QUERY');
        },
        transaction: async () => {
          transactions++;
          throw Error('UNAVAILABLE');
        },
      },
    });
    expect(Object.keys(isolated).sort()).toEqual([
      'apply',
      'classification',
      'recover',
      'status',
    ]);
    await expect(
      isolated.recover(fixtureIntent(fixtureBinding(), 'OP', 'INIT', null)),
    ).rejects.toThrow('UNAVAILABLE');
    expect(isolated.status().halted).toBe(true);
    expect(transactions).toBe(1);
    await expect(
      isolated.apply(fixtureIntent(fixtureBinding(), 'OP', 'INIT', null)),
    ).rejects.toThrow('HALTED');
    expect(transactions).toBe(1);
    expect(REAL_PUBLISHER_NON_BYPASS).toBe('NOT_PROVEN');
  });
});
