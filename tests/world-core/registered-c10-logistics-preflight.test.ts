/** Pure order/gate tests only; no database or Node. */
import { it, expect } from 'vitest';
import { readPostwarIndustryLogisticsReplaySourcesFrom } from '../../apps/world-worker/src/persistence/postwar-industry-logistics-source.js';
import { inspectRegisteredC10LogisticsPreflight } from '../support/registered-c10-logistics-preflight.js';
it('rejects before any pool access unless explicitly opted in', async () => {
  const old = process.env.ECONMIND_REGISTERED_C10_LOGISTICS_PREFLIGHT;
  delete process.env.ECONMIND_REGISTERED_C10_LOGISTICS_PREFLIGHT;
  try {
    await expect(
      Reflect.apply(inspectRegisteredC10LogisticsPreflight, undefined, [{}]),
    ).rejects.toThrow();
  } finally {
    if (old !== undefined)
      process.env.ECONMIND_REGISTERED_C10_LOGISTICS_PREFLIGHT = old;
  }
});

it('real held reader rejects an unissued baseline before any source SQL', async () => {
  let calls = 0;
  const tx = {
    query: async () => {
      calls++;
      throw Error('UNEXPECTED_SQL');
    },
  };
  await expect(
    Reflect.apply(readPostwarIndustryLogisticsReplaySourcesFrom, undefined, [
      tx,
      {
        baseline: {},
        worldId: 'WORLD_TEST_ONLY_C10',
        countryId: 'COUNTRY_10',
        facilityId: 'OPEN-10-REFINED_FUEL',
        runIds: ['RUN_TEST'],
        expectedHead: { worldVersion: '0', eventSequence: '0' },
      },
    ]),
  ).rejects.toThrow('GENUINE_LIVE_FINANCIAL_REPLAY_BASE_REQUIRED');
  expect(calls).toBe(0);
});
