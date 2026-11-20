/** DATA codec/preflight only. These transport examples do not constitute a
 * registered source, staffing, private preparation or multi-country acceptance. */
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import {
  createPostwarRefinery21AssemblyCheck,
  decodeRefinery21UtilityPacket,
  inspectRefinery21OriginalText,
} from '../support/postwar-refinery21-source-assembly.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const scope = {
  worldId: 'WORLD_TEST_ONLY_CODEC',
  seedId: 'SEED_TEST_ONLY',
  seedFingerprint: 'sha256:' + 'a'.repeat(64),
  admissionRef: 'ADMISSION_TEST_ONLY',
  countryId: 'COUNTRY_10',
  facilityId: 'OPEN-10-REFINED_FUEL',
  head: { worldVersion: '3', eventSequence: '3' },
};
const text = JSON.stringify({
  schemaVersion: 'postwar-industry-utility-original-v1',
  ...scope,
  head: undefined,
  power: { storageId: 'TEST_ONLY_STORAGE_NOT_REGISTERED' },
});
const row = {
  source_text: text,
  source_sha256: sha(text),
  source_ref: 'INDUSTRY_UTILITY_' + sha(text).toUpperCase(),
  world_version: '3',
  event_sequence: '3',
};
it('decodes its exact own-country transport packet without issuing authority', () => {
  expect(decodeRefinery21UtilityPacket(row, scope)).toEqual({
    sourceRef: row.source_ref,
    sourceSha256: row.source_sha256,
    storageId: 'TEST_ONLY_STORAGE_NOT_REGISTERED',
  });
});
it.each(['country', 'head', 'hash'] as const)(
  'rejects %s mismatch instead of C2 fallback',
  (kind) => {
    expect(() =>
      decodeRefinery21UtilityPacket(
        kind === 'hash' ? { ...row, source_sha256: '0'.repeat(64) } : row,
        kind === 'country'
          ? { ...scope, countryId: 'COUNTRY_02' }
          : kind === 'head'
            ? { ...scope, head: { worldVersion: '4', eventSequence: '4' } }
            : scope,
      ),
    ).toThrow();
  },
);
it('does not accept serialized source context as a genuine adopted refinery plan', () => {
  expect(() =>
    Reflect.apply(createPostwarRefinery21AssemblyCheck, undefined, [
      { source: {} },
    ]),
  ).toThrow('REFINERY_GENUINE_PINNED_CONTEXT_REQUIRED');
});

it('retains exact numeric original lexemes through the real original inspector', () => {
  const raw = `{
    "worldId":"WORLD_TEST_ONLY_CODEC","countryId":"COUNTRY_10",
    "locationId":"REGION_10_E1","operatorId":"TEST_ONLY_OP",
    "sourceFacility":{"id":"TEST_ONLY_FACILITY","recipeId":"TEST_ONLY_RECIPE",
      "commodityId":"TEST_ONLY_OUTPUT","constructionStatusProposal":"OPENING_EXISTING_ASSET",
      "projectId":"PROJECT-15","capacity":9007199254740993,"capacityUnit":"unit/sim-day",
      "installedMachineryUnits":1},
    "recipe":{"id":"TEST_ONLY_RECIPE","commodityId":"TEST_ONLY_OUTPUT","outputUnit":"unit",
      "authority":"TEST_ONLY_NOT_APPROVAL","inputsPerUnit":{"TEST_ONLY_INPUT":5e-05},
      "electricityMWhPerUnit":1e-7,"waterM3PerUnit":0,"workersPerDailyOutputUnit":0.125},
    "productionPlans":[],"technologyProposals":[],"licenseProposals":[],
    "commodityCatalog":[{"id":"TEST_ONLY_INPUT","unit":"unit"}]
  }`;
  const result = inspectRefinery21OriginalText(raw);
  expect(result.physical.sourceCapacity).toBe('9007199254740993');
  expect(result.recipe.materials[0]!.perOutput.amount).toBe('0.00005');
  expect(result.recipe.energyPerOutput.amount).toBe('0.0000001');
  expect(result.recipe.waterPerOutput.amount).toBe('0');
  expect(result.authority).toBe(false);
});
