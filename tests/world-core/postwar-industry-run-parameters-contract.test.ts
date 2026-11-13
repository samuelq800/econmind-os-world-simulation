import { describe, expect, it } from 'vitest';
import { parseIndustryRunParameterRow } from '../../packages/core/src/read-models/postwar-industry-run-parameters-contract.js';
const row = {
  schemaVersion: 'postwar-industry-run-parameter-row-v1',
  countryId: 'COUNTRY_02',
  facilityId: 'FACILITY_TEST_ONLY',
  locationId: 'LOCATION_TEST_ONLY',
  operatorId: 'OP_TEST_ONLY',
  sourceRef: 'INDUSTRY_FIRST_DAY_' + 'B'.repeat(64),
  sourceRawSha256: 'b'.repeat(64),
  policyVersion: 'POLICY_TEST_ONLY',
  policyRawSha256: 'c'.repeat(64),
  userAdoptionRawSha256: 'd'.repeat(64),
  outputUnit: 'tonne',
  expenseCurrency: 'XBB',
  windowStartsAtSimTime: '0',
  windowEndsAtSimTime: '86400000',
  maximumMinutesPerWorkerFirstSimDay: '480',
  measurement: 'ADOPTED_PARAMETERS_NOT_RUN_WORK_PAYMENT_OR_OUTPUT_AUTHORITY',
};
describe('Industry RUN parameter DATA contract', () => {
  it('requires complete original references and carries no execution or balance', () => {
    expect(parseIndustryRunParameterRow(row)).toEqual(row);
    expect(Object.isFrozen(parseIndustryRunParameterRow(row))).toBe(true);
  });
  it('accepts exact v2 capacity while retaining the exact v1 contract', () => {
    const v2 = {
      ...row,
      schemaVersion: 'postwar-industry-run-parameter-row-v2',
      capacityPerSimDay: '123.45',
    };
    expect(parseIndustryRunParameterRow(v2)).toEqual(v2);
    expect(() =>
      parseIndustryRunParameterRow({ ...row, capacityPerSimDay: '123.45' }),
    ).toThrow();
    for (const capacityPerSimDay of [
      undefined,
      '0',
      '-1',
      'NaN',
      '01',
      '1.0',
      '1e2',
      100,
    ])
      expect(() =>
        parseIndustryRunParameterRow({ ...v2, capacityPerSimDay }),
      ).toThrow();
  });
  it.each([
    { ready: true },
    { balance: '100' },
    { sourceRawSha256: '0' },
    { sourceRef: 'ARBITRARY_SOURCE' },
    { expenseCurrency: '' },
    { windowEndsAtSimTime: '0' },
    { maximumMinutesPerWorkerFirstSimDay: '0' },
    { measurement: 'COMPLETED_WORK' },
  ])('rejects incomplete or authority-shaped data %j', (change) => {
    expect(() => parseIndustryRunParameterRow({ ...row, ...change })).toThrow();
  });
});
