import { describe, expect, it } from 'vitest';
import { selectRegisteredSocialCreation } from '../support/registered-social-create-browser-chain.js';
function page() {
  return {
    offset: 25,
    body: {
      source: {
        sourceVersion: 'sha256:' + 'a'.repeat(64),
        currentEmploymentServiceCreationOptions: {
          status: 'AVAILABLE',
          data: {
            classification:
              'CURRENT_T0_SERVICE_CREATION_PLANNING_DATA_NOT_AUTHORITY',
            countryId: 'COUNTRY_02',
            dayIndex: '0',
            rootTargets: [
              {
                poolId: 'actual-pool',
                locationId: 'actual-location',
                capacitySlots: '2',
                usedSlots: '0',
                reservedSlots: '1',
                actualUnemployedCount: '1',
              },
            ],
            usageLicences: [
              {
                locationId: 'actual-location',
                validFromDayIndex: '0',
                validUntilDayIndex: '1',
                maximumWorkerMinutes: '480',
                scope: 'PUBLIC_REFERRALS_ONLY_NOT_EMPLOYER_TRANSFER',
                state: 'GENESIS_USAGE_LICENSE_NOT_PAID_PURCHASE',
                additionalFeeAmount: '0',
              },
            ],
          },
        },
      },
    },
  };
}
describe('finite native request selection from actual authorized page DATA, not authority', () => {
  it('selects one explicit test slot with its actual page/version', () => {
    expect(selectRegisteredSocialCreation([page()])).toEqual({
      servicePoolId: 'actual-pool',
      capacity: '1',
      sourceVersion: 'sha256:' + 'a'.repeat(64),
      poolPageOffset: 25,
    });
  });
  it.each([
    'no-free-slot',
    'no-unemployed',
    'no-licence',
    'future-licence',
  ] as const)('does not invent a prerequisite: %s', (missing) => {
    const p = page(),
      data = p.body.source.currentEmploymentServiceCreationOptions.data;
    if (missing === 'no-free-slot') data.rootTargets[0]!.reservedSlots = '2';
    if (missing === 'no-unemployed')
      data.rootTargets[0]!.actualUnemployedCount = '0';
    if (missing === 'no-licence') data.usageLicences = [];
    if (missing === 'future-licence')
      data.usageLicences[0]!.validFromDayIndex = '1';
    expect(selectRegisteredSocialCreation([p])).toBeNull();
  });
  it('rejects foreign country and malformed exact counts', () => {
    const p = page();
    p.body.source.currentEmploymentServiceCreationOptions.data.countryId =
      'COUNTRY_10';
    expect(() => selectRegisteredSocialCreation([p])).toThrow();
    const q = page();
    q.body.source.currentEmploymentServiceCreationOptions.data.rootTargets[0]!.capacitySlots =
      '1.0';
    expect(() => selectRegisteredSocialCreation([q])).toThrow();
  });
});
