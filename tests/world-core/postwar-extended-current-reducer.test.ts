/** Public wire compatibility only; a valid DTO never authorizes replay. */
import { describe, expect, it } from 'vitest';
import {
  parsePostwarFinancialMixedCoverage,
  POSTWAR_FINANCIAL_MIXED_REDUCER,
  POSTWAR_EXTENDED_CURRENT_REDUCER,
  POSTWAR_RENT_CURRENT_REDUCER,
} from '../../packages/core/src/read-models/postwar-financial-mixed-current-contract.js';
import {
  parsePostwarSocialMixedCoverage,
  POSTWAR_SOCIAL_MIXED_REDUCER,
} from '../../packages/core/src/read-models/postwar-social-mixed-current-contract.js';
import { parsePostwarCaptainCurrentCoverage } from '../../packages/core/src/read-models/postwar-captain-current-contract.js';
const scope = {
    countryId: 'COUNTRY_01',
    worldVersion: '4',
    eventSequence: '4',
  },
  fp = 'sha256:' + 'a'.repeat(64);
const base = {
  countryId: scope.countryId,
  coverageRef: 'COVERAGE_TEST_ONLY',
  prefixFingerprint: fp,
  knownEffectsFingerprint: fp,
  globalWorldVersion: '4',
  globalEventSequence: '4',
  coveredThroughEventId: 'EVENT_TEST_ONLY',
  coveredThroughEventFingerprint: fp,
  financialPostingCount: '4',
  financialBatchCount: '1',
  financialPostingsFingerprint: fp,
};
const cases = [
  {
    parse: (value: unknown) => parsePostwarFinancialMixedCoverage(value, scope),
    original: POSTWAR_FINANCIAL_MIXED_REDUCER,
    value: {
      ...base,
      schemaVersion: 'postwar-financial-current-prefix-coverage-v2',
    },
  },
  {
    parse: (value: unknown) => parsePostwarSocialMixedCoverage(value, scope),
    original: POSTWAR_SOCIAL_MIXED_REDUCER,
    value: {
      ...base,
      schemaVersion: 'postwar-social-current-prefix-coverage-v3',
      originWorldVersion: '0',
      originEventSequence: '0',
      employmentStateHash: fp,
      materializationHash: fp,
      stateOrigin: 'ADMITTED_OPENING_SOURCE',
    },
  },
  {
    parse: parsePostwarCaptainCurrentCoverage,
    original: 'POSTWAR_CAPTAIN_FINANCE_SOCIAL_FX_COMPLETE_PREFIX_V1',
    value: {
      ...base,
      schemaVersion: 'postwar-captain-current-prefix-coverage-v1',
      originWorldVersion: '0',
      originEventSequence: '0',
      capitalStateHash: fp,
      originalPacketSha256: 'b'.repeat(64),
    },
  },
];
describe('explicit complete Goods/OMO prefix wire discriminator', () => {
  it.each(cases)(
    'retains old semantics and accepts only the fixed new reducer %#',
    ({ parse, original, value }) => {
      expect(parse({ ...value, reducerVersion: original }).reducerVersion).toBe(
        original,
      );
      expect(
        parse({ ...value, reducerVersion: POSTWAR_EXTENDED_CURRENT_REDUCER })
          .reducerVersion,
      ).toBe(POSTWAR_EXTENDED_CURRENT_REDUCER);
      expect(
        parse({ ...value, reducerVersion: POSTWAR_RENT_CURRENT_REDUCER })
          .reducerVersion,
      ).toBe(POSTWAR_RENT_CURRENT_REDUCER);
      for (const reducerVersion of [
        'READY',
        'POSTWAR_SKIP_INVENTORY_V2',
        original + '_GOODS',
      ])
        expect(() => parse({ ...value, reducerVersion })).toThrow();
      expect(() =>
        parse({
          ...value,
          reducerVersion: POSTWAR_EXTENDED_CURRENT_REDUCER,
          prefixFingerprint: 'SKIPPED_GOODS',
        }),
      ).toThrow();
    },
  );
});
