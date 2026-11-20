/** Pure order/gate tests only; no database or Node. */
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readPostwarIndustryLogisticsReplaySourcesFrom } from '../../apps/world-worker/src/persistence/postwar-industry-logistics-source.js';
import {
  inspectRegisteredC10LogisticsPreflight,
  inspectRegisteredC10ProductionOriginal,
} from '../support/registered-c10-logistics-preflight.js';
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

it('inspects exact C10 original numeric lexemes only after checking raw bytes', () => {
  const raw = `{
    "worldId":"WORLD_TEST_ONLY_C10","countryId":"COUNTRY_10",
    "locationId":"REGION_10_E1","operatorId":"TEST_ONLY_OP",
    "sourceFacility":{"id":"OPEN-10-REFINED_FUEL","recipeId":"TEST_ONLY_RECIPE",
      "commodityId":"TEST_ONLY_OUTPUT","constructionStatusProposal":"OPENING_EXISTING_ASSET",
      "projectId":"PROJECT-15","capacity":9007199254740993,"capacityUnit":"unit/sim-day",
      "installedMachineryUnits":1},
    "recipe":{"id":"TEST_ONLY_RECIPE","commodityId":"TEST_ONLY_OUTPUT","outputUnit":"unit",
      "authority":"TEST_ONLY_NOT_APPROVAL","inputsPerUnit":{"TEST_ONLY_INPUT":5e-05},
      "electricityMWhPerUnit":1e-7,"waterM3PerUnit":0,"workersPerDailyOutputUnit":0.125},
    "productionPlans":[],"technologyProposals":[],"licenseProposals":[],
    "commodityCatalog":[{"id":"TEST_ONLY_INPUT","unit":"unit"}]
  }`;
  const row = {
    document_text: raw,
    document_sha256: createHash('sha256').update(raw).digest('hex'),
  };
  const inspected = inspectRegisteredC10ProductionOriginal(row);
  expect(inspected.scope.countryId).toBe('COUNTRY_10');
  expect(inspected.physical.sourceCapacity).toBe('9007199254740993');
  expect(inspected.recipe.materials[0]!.perOutput.amount).toBe('0.00005');
  expect(inspected.recipe.energyPerOutput.amount).toBe('0.0000001');
  expect(inspected.authority).toBe(false);
  expect(row.document_text).toBe(raw);
  expect(() =>
    inspectRegisteredC10ProductionOriginal({
      ...row,
      document_text: raw.replace('9007199254740993', '9007199254740992'),
    }),
  ).toThrow('C10_ACTUAL_BOUNDED_ORIGINAL_HASH_REQUIRED');
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
