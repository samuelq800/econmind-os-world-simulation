import { describe, expect, it } from 'vitest';
import { buildIndustryUtilisationTargetRequest } from '../../apps/world-web/src/industry-run/form.js';
const row = {
  schemaVersion: 'postwar-industry-run-parameter-row-v1' as const,
  countryId: 'COUNTRY_TEST_ONLY',
  facilityId: 'FACILITY_SOURCE_ONLY',
  locationId: 'LOCATION_TEST_ONLY',
  operatorId: 'OP_TEST_ONLY',
  sourceRef: 'INDUSTRY_FIRST_DAY_' + 'B'.repeat(64),
  sourceRawSha256: 'b'.repeat(64),
  policyVersion: 'POLICY_TEST_ONLY',
  policyRawSha256: 'c'.repeat(64),
  userAdoptionRawSha256: 'd'.repeat(64),
  outputUnit: 'source unit',
  expenseCurrency: 'XBB',
  windowStartsAtSimTime: '0',
  windowEndsAtSimTime: '86400000',
  maximumMinutesPerWorkerFirstSimDay: '480',
  measurement:
    'ADOPTED_PARAMETERS_NOT_RUN_WORK_PAYMENT_OR_OUTPUT_AUTHORITY' as const,
};

const source = {
  ...row,
  schemaVersion: 'postwar-industry-run-parameter-row-v2' as const,
  capacityPerSimDay: '123.4',
};
const input = {
  row: source,
  draft: {
    facilityId: row.facilityId,
    targetPercent: '0',
    startsAtSimTime: '0',
    endsAtSimTime: '86400000',
  },
  worldId: 'WORLD_TEST_ONLY',
  countryId: row.countryId,
  worldVersion: '7',
  requestId: '11111111-1111-4111-8111-111111111111',
  commandId: 'TARGET_TEST_ONLY',
  idempotencyKey: 'TARGET_KEY_TEST_ONLY',
};
describe('explicit bounded target UI request', () => {
  it('builds zero as a target command without RUN quantity, costs or production', () => {
    const command = buildIndustryUtilisationTargetRequest(input);
    expect(command.request.commandType).toBe(
      'CORE_INDUSTRY_UTILISATION_TARGET_SET_V1',
    );
    expect(command.request.payload).toEqual({
      schemaVersion: 'postwar-industry-utilisation-target-v1',
      ...input.draft,
      policyVersion: row.policyVersion,
      sourceRef: row.sourceRef,
      sourceRawSha256: row.sourceRawSha256,
    });
  });
  it('rejects unbound facilities, missing real capacity and out-of-range exact percentages', () => {
    expect(() =>
      buildIndustryUtilisationTargetRequest({ ...input, row }),
    ).toThrow();
    for (const change of [
      { targetPercent: '100.000000000000000001' },
      { facilityId: 'OTHER' },
      { targetPercent: '' },
      { endsAtSimTime: '86400001' },
    ])
      expect(() =>
        buildIndustryUtilisationTargetRequest({
          ...input,
          draft: { ...input.draft, ...change },
        }),
      ).toThrow();
  });
});
