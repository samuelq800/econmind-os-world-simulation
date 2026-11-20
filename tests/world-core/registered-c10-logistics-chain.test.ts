/** Pure rejection contracts. These do not certify actual PostgreSQL/Node work. */
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { executeRegisteredC10Stage } from '../support/registered-c10-logistics-chain.js';
import type { createRegisteredFinalDriver } from '../support/postwar-registered-final-driver.js';
const original = {
  schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  requestId: '00000000-0000-4000-8000-000000000001',
  request: {
    worldId: 'WORLD_C10_CONTRACT_TEST',
    countryId: 'COUNTRY_10',
    officeId: 'INDUSTRY' as const,
    commandType: 'INDUSTRY_FIRST_DAY_LOGISTICS_EXECUTE_V1' as const,
    commandId: 'C10_TEST_BOOK',
    idempotencyKey: 'C10_TEST_BOOK_KEY',
    expectedWorldVersion: '4',
    payload: {
      schemaVersion: 'industry-first-day-utility-command-v1',
      serviceKind: 'LOGISTICS',
      facilityId: 'OPEN-10-REFINED_FUEL',
      operation: { action: 'BOOK' },
    },
  },
};
function noDispatch(priors: readonly (typeof original)[] = []) {
  let dispatched = 0;
  // Deliberately no authority/services: each tested guard must fail before dispatch.
  const driver = {
    originals: [...priors],
    submit() {
      dispatched++;
      throw Error('UNEXPECTED_DISPATCH');
    },
  } as unknown as ReturnType<typeof createRegisteredFinalDriver>;
  return { driver, count: () => dispatched };
}
describe('C10 staged entry safe refusal', () => {
  it('refuses another country before dispatch', async () => {
    const f = noDispatch();
    await expect(
      executeRegisteredC10Stage({
        driver: f.driver,
        original: {
          ...original,
          request: { ...original.request, countryId: 'COUNTRY_02' },
        },
      }),
    ).rejects.toThrow('C10_INDUSTRY_COMMAND_ONLY');
    expect(f.count()).toBe(0);
  });
  it('refuses water or an unrelated command even with a logistics-looking body', async () => {
    const f = noDispatch();
    await expect(
      executeRegisteredC10Stage({
        driver: f.driver,
        original: {
          ...original,
          request: {
            ...original.request,
            commandType: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
          },
        },
      }),
    ).rejects.toThrow('C10_FINITE_CHAIN_ONLY');
    expect(f.count()).toBe(0);
  });
  it('requires original receipt recovery after any prior dispatch, including unknown outcomes', async () => {
    const f = noDispatch([original]);
    await expect(
      executeRegisteredC10Stage({ driver: f.driver, original }),
    ).rejects.toThrow('C10_PRIOR_DISPATCH_REQUIRES_RECOVERY_NOT_RESUBMIT');
    expect(f.count()).toBe(0);
  });
});
