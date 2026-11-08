/** TEST_ONLY transport vectors. None of these references are registered sources,
 * completed service WORK, paid expenses, rights, bookings or deliveries. */
export const manualUtilityKinds = ['POWER', 'WATER', 'LOGISTICS'] as const;
export type ManualUtilityKind = (typeof manualUtilityKinds)[number];
export const manualUtilityCases = [
  ['POWER', 'BOOK'],
  ['WATER', 'DELIVER'],
  ['LOGISTICS', 'BOOK'],
  ['LOGISTICS', 'SHIP'],
  ['LOGISTICS', 'PAY_INPUTS'],
  ['LOGISTICS', 'DELIVER'],
  ['LOGISTICS', 'SERVICE_WORK'],
] as const;
export function manualUtilityPayload(kind: ManualUtilityKind, action?: string) {
  const operation =
    kind === 'POWER'
      ? {
          action: 'BOOK',
          bookingRef: 'BOOKING_TEST_ONLY',
          purpose: 'INDUSTRY_SELF_USE',
          fromSimTime: '10000',
          throughSimTime: '20000',
          outputMWh: '1',
        }
      : kind === 'WATER'
        ? {
            action: 'DELIVER',
            workEventFingerprint: 'sha256:' + '1'.repeat(64),
            paymentEventFingerprint: 'sha256:' + '2'.repeat(64),
            powerEventFingerprints: ['sha256:' + '3'.repeat(64)],
            additionalProtectedClaims: [],
          }
        : {
            action: 'BOOK',
            transferId: 'TRANSFER_TEST_ONLY',
            request: {
              transferId: 'TRANSFER_TEST_ONLY',
              runId: 'RUN_TEST_ONLY',
              direction: 'WAREHOUSE_TO_EXISTING_FACILITY',
              quantity: { amount: '1', unit: 'tonne' },
              startsAtSimTime: '10000',
              endsAtSimTime: '20000',
            },
          };
  return {
    schemaVersion: 'industry-first-day-utility-command-v1',
    serviceKind: kind,
    operationRef: 'OPERATION_TEST_ONLY',
    facilityId: 'FACILITY_TEST_ONLY',
    runId: 'RUN_TEST_ONLY',
    sourceRef: 'SOURCE_TEST_ONLY',
    sourceRawSha256: 'a'.repeat(64),
    operation:
      kind !== 'LOGISTICS' || action === undefined || action === 'BOOK'
        ? operation
        : action === 'SERVICE_WORK'
          ? {
              action,
              transferId: 'TRANSFER_TEST_ONLY',
              workOrderRef: 'WORK_ORDER_TEST_ONLY',
              workOrderSha256: 'c'.repeat(64),
            }
          : action === 'PAY_INPUTS'
            ? {
                action,
                transferId: 'TRANSFER_TEST_ONLY',
                workEventFingerprint: 'sha256:' + '1'.repeat(64),
                expenseOrderRef: 'EXPENSE_ORDER_TEST_ONLY',
                expenseOrderSha256: 'b'.repeat(64),
              }
            : { action, transferId: 'TRANSFER_TEST_ONLY' },
  };
}
