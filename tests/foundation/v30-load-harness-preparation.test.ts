import { describe, expect, it } from 'vitest';

import {
  createV30LoadPlan,
  summarizeV30Latencies,
  type V30LoadPlanInput,
} from '../../tools/v30/load-harness-preparation.js';

const input: V30LoadPlanInput = {
  tier: 50,
  minutes: 2,
  seed: 17,
  sessionActions: [
    { kind: 'PROJECTION_READ', perMinute: 2 },
    { kind: 'ORDER_SUBMIT', perMinute: 1 },
    { kind: 'FORECAST_LOCAL', perMinute: 0 },
  ],
  worldActions: [{ kind: 'DUE_OBLIGATION_TICK', perMinute: 3 }],
};

describe('V30.1 non-executing load harness preparation', () => {
  it('streams an exact, ordered 50-session virtual operation mix', () => {
    const operations = [...createV30LoadPlan(input)];
    expect(operations).toHaveLength(50 * 2 * 3 + 2 * 3);
    expect(
      operations.every(
        (operation, index) =>
          index === 0 ||
          operation.virtualSecond >= operations[index - 1]!.virtualSecond,
      ),
    ).toBe(true);
    expect(
      operations.filter((operation) => operation.kind === 'PROJECTION_READ'),
    ).toHaveLength(50 * 2 * 2);
    expect(
      operations.filter(
        (operation) => operation.kind === 'DUE_OBLIGATION_TICK',
      ),
    ).toHaveLength(6);
    expect(
      operations
        .filter((operation) => operation.kind === 'DUE_OBLIGATION_TICK')
        .every((operation) => operation.sessionIndex === null),
    ).toBe(true);
  });

  it('supports the named 100 and 420 session tiers without executing I/O', () => {
    for (const tier of [100, 420] as const) {
      const operations = [
        ...createV30LoadPlan({
          ...input,
          tier,
          minutes: 1,
          sessionActions: [{ kind: 'CONTRACT_SUBMIT', perMinute: 1 }],
          worldActions: [],
        }),
      ];
      expect(operations).toHaveLength(tier);
      expect(new Set(operations.map((row) => row.sessionIndex)).size).toBe(
        tier,
      );
    }
  });

  it('keeps non-divisor rates exact across minute boundaries', () => {
    const operations = [
      ...createV30LoadPlan({
        ...input,
        minutes: 2,
        sessionActions: [{ kind: 'RECEIPT_POLL', perMinute: 7 }],
        worldActions: [],
      }),
    ];
    expect(operations).toHaveLength(50 * 2 * 7);
    expect(operations.filter((row) => row.virtualSecond < 60)).toHaveLength(
      50 * 7,
    );
  });

  it('replays the same seed identically and varies the schedule with another seed', () => {
    const first = [...createV30LoadPlan(input)];
    expect([...createV30LoadPlan(input)]).toEqual(first);
    expect([...createV30LoadPlan({ ...input, seed: 18 })]).not.toEqual(first);
  });

  it('rejects invalid tiers, zero work, duplicates and unsafe rates', () => {
    expect(() => createV30LoadPlan({ ...input, tier: 10 as 50 })).toThrow();
    expect(() => createV30LoadPlan({ ...input, minutes: 0 })).toThrow();
    expect(() =>
      createV30LoadPlan({
        ...input,
        sessionActions: [],
        worldActions: [],
      }),
    ).toThrow();
    expect(() =>
      createV30LoadPlan({
        ...input,
        sessionActions: [
          { kind: 'ORDER_SUBMIT', perMinute: 1 },
          { kind: 'ORDER_SUBMIT', perMinute: 2 },
        ],
      }),
    ).toThrow();
    expect(() =>
      createV30LoadPlan({
        ...input,
        sessionActions: [{ kind: 'ORDER_SUBMIT', perMinute: 61 }],
      }),
    ).toThrow();
  });

  it('classifies absent observations as NOT_RUN and never returns PASS', () => {
    expect(summarizeV30Latencies([])).toEqual({
      status: 'NOT_RUN',
      source: 'CALLER_SUPPLIED_OBSERVATIONS_UNVERIFIED',
      count: 0,
      failures: 0,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    });
    expect(
      summarizeV30Latencies([
        { kind: 'PROJECTION_READ', latencyMs: 2, success: true },
        { kind: 'PROJECTION_READ', latencyMs: 4, success: false },
        { kind: 'ORDER_SUBMIT', latencyMs: 8, success: true },
        { kind: 'RECEIPT_POLL', latencyMs: 10, success: true },
      ]),
    ).toEqual({
      status: 'CALLER_MEASURED_NOT_ACCEPTED',
      source: 'CALLER_SUPPLIED_OBSERVATIONS_UNVERIFIED',
      count: 4,
      failures: 1,
      p50Ms: 4,
      p95Ms: 10,
      p99Ms: 10,
    });
    expect(() =>
      summarizeV30Latencies([
        { kind: 'ORDER_SUBMIT', latencyMs: Number.NaN, success: true },
      ]),
    ).toThrow();
  });
});
