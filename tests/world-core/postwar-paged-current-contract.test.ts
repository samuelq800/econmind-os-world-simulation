/** Public wire vectors, not a source/permission or economic replay proof. */
import { it, expect } from 'vitest';
import {
  parsePostwarFinancialMixedCoverage,
  POSTWAR_FINANCIAL_PAGED_COVERAGE_SCHEMA,
} from '../../packages/core/src/read-models/postwar-financial-mixed-current-contract.js';
import {
  parsePostwarSocialMixedCoverage,
  POSTWAR_SOCIAL_PAGED_COVERAGE_SCHEMA,
} from '../../packages/core/src/read-models/postwar-social-mixed-current-contract.js';
import {
  parsePostwarCaptainCurrentCoverage,
  POSTWAR_CAPTAIN_PAGED_COVERAGE_SCHEMA,
} from '../../packages/core/src/read-models/postwar-captain-current-contract.js';
import {
  POSTWAR_PAGED_CURRENT_REDUCER,
  POSTWAR_PAGED_PROOF_ALGORITHM,
} from '../../packages/core/src/read-models/postwar-extended-current-reducer.js';
const fp = 'sha256:' + '1'.repeat(64),
  scope = {
    countryId: 'COUNTRY_01',
    worldVersion: '300',
    eventSequence: '302',
  };
const proof = {
  schemaVersion: 'postwar-complete-page-proof-v1',
  hashAlgorithm: POSTWAR_PAGED_PROOF_ALGORITHM,
  pageCount: '2',
  frameCount: '300',
};
const common = {
  countryId: scope.countryId,
  reducerVersion: POSTWAR_PAGED_CURRENT_REDUCER,
  coverageRef: 'PAGE_TEST_ONLY',
  prefixFingerprint: fp,
  knownEffectsFingerprint: fp,
  globalWorldVersion: '300',
  globalEventSequence: '302',
  coveredThroughEventId: 'EVENT_TEST_ONLY',
  coveredThroughEventFingerprint: fp,
  financialPostingCount: '0',
  financialBatchCount: '0',
  financialPostingsFingerprint: fp,
  pageProof: proof,
};
const vectors = [
  {
    parse: (v: unknown) => parsePostwarFinancialMixedCoverage(v, scope),
    schemaVersion: POSTWAR_FINANCIAL_PAGED_COVERAGE_SCHEMA,
    oldSchema: 'postwar-financial-current-prefix-coverage-v2',
    extra: {},
  },
  {
    parse: (v: unknown) => parsePostwarSocialMixedCoverage(v, scope),
    schemaVersion: POSTWAR_SOCIAL_PAGED_COVERAGE_SCHEMA,
    oldSchema: 'postwar-social-current-prefix-coverage-v3',
    extra: {
      originWorldVersion: '0',
      originEventSequence: '0',
      employmentStateHash: fp,
      materializationHash: fp,
      stateOrigin: 'ADMITTED_OPENING_SOURCE',
    },
  },
  {
    parse: parsePostwarCaptainCurrentCoverage,
    schemaVersion: POSTWAR_CAPTAIN_PAGED_COVERAGE_SCHEMA,
    oldSchema: 'postwar-captain-current-prefix-coverage-v1',
    extra: {
      originWorldVersion: '0',
      originEventSequence: '0',
      capitalStateHash: fp,
      originalPacketSha256: '2'.repeat(64),
    },
  },
];
it.each(vectors)(
  'uses an explicit new schema for complete page chains and preserves old array-proof meaning %#',
  ({ parse, schemaVersion, oldSchema, extra }) => {
    const value = { ...common, schemaVersion, ...extra };
    expect(parse(value).pageProof).toEqual(proof);
    expect(() => parse({ ...value, schemaVersion: oldSchema })).toThrow();
    for (const change of [
      { pageCount: '0' },
      { frameCount: '299' },
      { pageCount: '1' },
      { hashAlgorithm: 'UNVERIFIED_PAGE_HASH' },
      { ready: true },
    ])
      expect(() =>
        parse({ ...value, pageProof: { ...proof, ...change } }),
      ).toThrow();
    expect(() =>
      parse({
        ...value,
        reducerVersion: 'POSTWAR_FINANCIAL_SOCIAL_FX_COMPLETE_PREFIX_V2',
      }),
    ).toThrow();
    const input = { ...value, pageProof: { ...proof } },
      parsed = parse(input);
    input.pageProof.pageCount = '9';
    expect(parsed.pageProof!.pageCount).toBe('2');
  },
);
