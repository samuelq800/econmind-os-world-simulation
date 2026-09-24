import { setTimeout as delay } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import { createV30LoadPlan } from '../../tools/v30/load-harness-preparation.js';
import { runV30LoadPlan } from '../../tools/v30/load-runner-preparation.js';

const plan = () =>
  createV30LoadPlan({
    tier: 50,
    minutes: 1,
    seed: 3,
    sessionActions: [{ kind: 'PROJECTION_READ', perMinute: 1 }],
    worldActions: [],
  });

describe('V30.1 injected bounded runner preparation', () => {
  it('executes the plan with a hard concurrency cap and preserves order', async () => {
    let active = 0;
    let highest = 0;
    const result = await runV30LoadPlan(
      plan(),
      async () => {
        active += 1;
        highest = Math.max(highest, active);
        await delay(2);
        active -= 1;
      },
      { maxInFlight: 3, millisecondsPerVirtualSecond: 0 },
    );
    expect(highest).toBeLessThanOrEqual(3);
    expect(result.status).toBe('CALLER_EXECUTED_NOT_ACCEPTED');
    expect(result.source).toBe('INJECTED_EXECUTOR_UNVERIFIED');
    expect(result.attempted).toBe(50);
    expect(result.observations).toHaveLength(50);
    expect(result.observations.every((row) => row.success)).toBe(true);
  });

  it('records executor failures without manufacturing a PASS', async () => {
    const result = await runV30LoadPlan(
      plan(),
      async (operation) => {
        if (operation.sessionIndex === 7) throw new Error('expected');
      },
      { maxInFlight: 4, millisecondsPerVirtualSecond: 0 },
    );
    expect(result.attempted).toBe(50);
    expect(result.observations.filter((row) => !row.success)).toHaveLength(1);
    expect(result.status).toBe('CALLER_EXECUTED_NOT_ACCEPTED');
  });

  it('stops dispatching on abort and drains already started tasks', async () => {
    const controller = new AbortController();
    let active = 0;
    const result = await runV30LoadPlan(
      plan(),
      async () => {
        active += 1;
        controller.abort();
        await delay(1);
        active -= 1;
      },
      {
        maxInFlight: 2,
        millisecondsPerVirtualSecond: 0,
        signal: controller.signal,
      },
    );
    expect(result.status).toBe('ABORTED_NOT_ACCEPTED');
    expect(result.attempted).toBeGreaterThan(0);
    expect(result.attempted).toBeLessThanOrEqual(2);
    expect(result.observations).toHaveLength(result.attempted);
    expect(active).toBe(0);
  });

  it('rejects unbounded options and out-of-order or forged operations', async () => {
    await expect(
      runV30LoadPlan([], async () => undefined, {
        maxInFlight: 420,
        millisecondsPerVirtualSecond: 0,
      }),
    ).rejects.toThrow();
    await expect(
      runV30LoadPlan(
        [
          { virtualSecond: 2, kind: 'PROJECTION_READ', sessionIndex: 1 },
          { virtualSecond: 1, kind: 'PROJECTION_READ', sessionIndex: 1 },
        ],
        async () => undefined,
        { maxInFlight: 1, millisecondsPerVirtualSecond: 0 },
      ),
    ).rejects.toThrow();
    await expect(
      runV30LoadPlan(
        [{ virtualSecond: 0, kind: 'DUE_OBLIGATION_TICK', sessionIndex: 1 }],
        async () => undefined,
        { maxInFlight: 1, millisecondsPerVirtualSecond: 0 },
      ),
    ).rejects.toThrow();
    expect(
      await runV30LoadPlan([], async () => undefined, {
        maxInFlight: 1,
        millisecondsPerVirtualSecond: 0,
      }),
    ).toMatchObject({ status: 'NOT_RUN', attempted: 0, observations: [] });
  });
});
