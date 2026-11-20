/** Form mapping uses real seven-bucket wire semantics; these fixture records
 * are protocol inputs, not runtime originals or an allocation approval. */
import { it, expect } from 'vitest';
import {
  buildCaptainCapitalRequest,
  CAPTAIN_CAPITAL_CATALOG_BINDING,
} from '../../apps/world-web/src/captain-capital/form.js';
import { POSTWAR_CAPTAIN_CURRENT_BUCKETS } from '@econmind/core/postwar-captain-current-contract';
const hash = 'sha256:' + 'a'.repeat(64),
  raw = 'b'.repeat(64);
function input() {
  return {
    rows: POSTWAR_CAPTAIN_CURRENT_BUCKETS.map((bucket) => ({
      schemaVersion: 'postwar-captain-political-capital-row-v1',
      countryId: 'COUNTRY_01',
      capitalRef: 'CAPITAL_ACTUAL_READ',
      bucket,
      unit: 'political_capital',
      balance: '10',
      opening: '70',
      generated: '0',
      total: '70',
      available: '70',
      spent: '0',
      closing: '70',
      allocationNature: 'REALLOCATION_NOT_GENERATION_OR_SPENDING',
    })),
    options: {
      schemaVersion: 'postwar-captain-allocation-options-v1',
      classification: 'REGISTERED_REASON_REFERENCES_NOT_ALLOCATION_APPROVAL',
      countryId: 'COUNTRY_01',
      originalPacketSha256: raw,
      reasons: [
        {
          factRef: 'REASON_ACTUAL_READ',
          sourceRef: 'SOURCE_ACTUAL_READ',
          payloadSha256: raw,
          revision: '1',
          sourceClass: 'TEST_ONLY',
          effectiveFromSimTime: '0',
          effectiveUntilSimTime: null,
          recordRef: 'Actual record / section 1',
          reason: 'Actual registered basis; not this command approval.',
        },
      ],
    },
    coverage: {
      schemaVersion: 'postwar-captain-opening-current-coverage-v1',
      reducerVersion: 'POSTWAR_CAPTAIN_ADMITTED_GENESIS_EXACT_H0_V1',
      countryId: 'COUNTRY_01',
      coverageRef: 'COVERAGE_TEST',
      prefixFingerprint: hash,
      knownEffectsFingerprint: hash,
      globalWorldVersion: '0',
      globalEventSequence: '0',
      coveredThroughEventId: null,
      coveredThroughEventFingerprint: null,
      financialPostingCount: '0',
      financialBatchCount: '0',
      financialPostingsFingerprint: hash,
      capitalStateHash: hash,
      originalPacketSha256: raw,
      originWorldVersion: '0',
      originEventSequence: '0',
    },
    draft: {
      fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
      toBucket: 'FISCAL_REFORM',
      amount: '0.000001',
      reasonFactRef: 'REASON_ACTUAL_READ',
    },
    worldId: 'WORLD_TEST',
    countryId: 'COUNTRY_01',
    worldVersion: '0',
    eventSequence: '0',
    requestId: '11111111-1111-4111-8111-111111111111',
    commandId: 'COMMAND_CAPITAL_TEST',
    idempotencyKey: 'KEY_CAPITAL_TEST',
  };
}
it('maps the six real catalog fields plus reserve to one exact transfer, without catalog0/max40 defaults', () => {
  const f = input(),
    request = buildCaptainCapitalRequest(f);
  expect(Object.keys(CAPTAIN_CAPITAL_CATALOG_BINDING.fields)).toHaveLength(6);
  expect(request.request.payload).toEqual({
    schemaVersion: 'captain-political-capital-allocation-v1',
    fromBucket: 'UNALLOCATED_CRISIS_RESERVE',
    toBucket: 'FISCAL_REFORM',
    amount: { amount: '0.000001', unit: 'political_capital' },
    reasonFactRef: 'REASON_ACTUAL_READ',
  });
  expect(request.request.expectedWorldVersion).toBe('0');
  expect(f.rows.every((x) => x.balance === '10')).toBe(true);
});
it.each([
  'missing',
  'duplicate',
  'foreign',
  'wrongPacket',
  'wrongHead',
  'unknownReason',
  'sameBucket',
  'overdraw',
  'noncanonical',
  'zero',
])(
  'refuses %s source/draft instead of inventing options or balances',
  (kind) => {
    const f = input();
    if (kind === 'missing') f.rows = [];
    if (kind === 'duplicate') f.rows[1] = f.rows[0]!;
    if (kind === 'foreign') f.countryId = 'COUNTRY_02';
    if (kind === 'wrongPacket') f.options.originalPacketSha256 = 'c'.repeat(64);
    if (kind === 'wrongHead') f.worldVersion = '1';
    if (kind === 'unknownReason')
      f.draft.reasonFactRef = 'REASON_NOT_REGISTERED';
    if (kind === 'sameBucket') f.draft.toBucket = f.draft.fromBucket;
    if (kind === 'overdraw') f.draft.amount = '10.000001';
    if (kind === 'noncanonical') f.draft.amount = '1.0';
    if (kind === 'zero') f.draft.amount = '0';
    expect(() => buildCaptainCapitalRequest(f)).toThrow();
  },
);
