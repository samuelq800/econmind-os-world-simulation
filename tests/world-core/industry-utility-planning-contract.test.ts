/** Pure public DATA schema only, not a registered source or utility execution. */
import { describe, expect, it } from 'vitest';
import {
  parseIndustryUtilityPlanningRow,
  parseIndustryUtilityPlanningCoverage,
} from '../../packages/core/src/read-models/postwar-industry-utility-planning-contract.js';
import {
  planningRow,
  planningFp,
} from '../support/industry-utility-planning-fixture.js';
describe('public source-bound Industry utility planning DATA', () => {
  it.each([
    ['POWER', 'BOOK'],
    ['LOGISTICS', 'BOOK'],
    ['LOGISTICS', 'SHIP'],
    ['LOGISTICS', 'SERVICE_WORK'],
    ['LOGISTICS', 'PAY_INPUTS'],
    ['LOGISTICS', 'DELIVER'],
    ['WATER', 'DELIVER'],
  ] as const)(
    'parses exact %s/%s DATA without an authority field',
    (kind, action) => {
      const row = planningRow(kind, action);
      expect(parseIndustryUtilityPlanningRow(row)).toEqual(row);
      expect(Object.isFrozen(row.parameters)).toBe(true);
    },
  );
  it.each([
    { ready: true },
    { sourceRawSha256: 'bad' },
    { runEndsAtSimTime: '86400001' },
    { runStartsAtSimTime: '1000' },
    { runId: '' },
    { parameters: { operation: { action: 'GRANT_RIGHT' } } },
  ])(
    'rejects extra flags and incomplete or contradictory sources %j',
    (change) => {
      expect(() =>
        parseIndustryUtilityPlanningRow({
          ...planningRow('WATER', 'DELIVER'),
          ...change,
        }),
      ).toThrow();
    },
  );
  it('rejects HTTP-like performed allocations in place of an actual work-order reference', () => {
    const row = planningRow('LOGISTICS', 'SERVICE_WORK');
    expect(() =>
      parseIndustryUtilityPlanningRow({
        ...row,
        parameters: {
          operation: {
            action: 'SERVICE_WORK',
            transferId: 'TRANSFER_TEST_ONLY',
            allocations: [],
          },
        },
      }),
    ).toThrow();
  });
  it('binds complete-prefix planning coverage to a distinct observed head without inventing an origin event', () => {
    const c = {
      schemaVersion: 'postwar-industry-utility-planning-coverage-v1',
      reducerVersion: 'POSTWAR_INDUSTRY_UTILITY_PLANNING_COMPLETE_PREFIX_V1',
      countryId: 'COUNTRY_TEST_ONLY',
      globalWorldVersion: '7',
      globalEventSequence: '12',
      prefixFingerprint: planningFp,
      pageChainFingerprint: planningFp,
      sourceOriginalsFingerprint: planningFp,
      planningRowsFingerprint: planningFp,
    };
    expect(parseIndustryUtilityPlanningCoverage(c)).toEqual(c);
    expect(() =>
      parseIndustryUtilityPlanningCoverage({ ...c, ready: true }),
    ).toThrow();
    expect(() =>
      parseIndustryUtilityPlanningCoverage({
        ...c,
        pageChainFingerprint: 'MISSING',
      }),
    ).toThrow();
  });
});
