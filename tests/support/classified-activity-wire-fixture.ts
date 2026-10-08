/** Wire fixtures only, not source/admission/grants. Default unknown economics
 * is explicitly NOT_AUTHORIZED. Detail rows model an already-filtered private
 * Finance/CB result for transport/size tests, never a production classifier. */
export interface ClassifiedFinancialWireFixture {
  accountId: string;
  accountClass: 'CASH';
  currency: string;
  netDebitBalance: string;
}
export function classifiedOfficeScope(country: string, office: string): string {
  return `OFFICE_${Buffer.from(country).toString('hex').toUpperCase()}_${Buffer.from(office).toString('hex').toUpperCase()}`;
}
export function classifiedActivityWireFixture(
  country: string,
  office: string | null = null,
  financialPositions: ClassifiedFinancialWireFixture[] = [],
) {
  if (
    financialPositions.length &&
    !['FINANCE', 'CENTRAL_BANK'].includes(office ?? '')
  )
    throw new Error('PRIVATE_SCOPE_REQUIRED');
  return {
    schemaVersion: 'world-activity-projection-v1',
    countryId: country,
    ...(office === null ? {} : { officeId: office }),
    activity: {
      authoritativeEventCount: '0',
      lastAuthoritativeEventSequence: '0',
      lastAuthoritativeEventWorldVersion: '0',
    },
    ledger: {
      financialPositions,
      inventoryPositions: [],
      visibility: {
        schemaVersion: 'economic-read-visibility-v1',
        financialDetail: financialPositions.length
          ? 'AUTHORIZED_FILTERED'
          : 'NOT_AUTHORIZED',
        inventoryDetail: 'NOT_AUTHORIZED',
        countrySummary: 'NOT_AUTHORIZED',
      },
    },
  };
}
