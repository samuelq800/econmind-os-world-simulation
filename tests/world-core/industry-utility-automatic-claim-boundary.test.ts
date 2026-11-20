/** DATA routing only. No private prepared source, queue authority or delivery
 * is issued by these vectors; the actual pending native GRANT is separate. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { COMMAND_SCHEMA_VERSION, parseCanonicalCommand } from '@econmind/core';
import { isPostwarIndustryWaterGrantCommand } from '../../apps/world-worker/src/persistence/postwar-industry-utility-runtime.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const id =
  'COMMAND_INDUSTRY_WATER_GRANT_' +
  sha('TEST_ONLY_NOT_AN_ISSUER').toUpperCase();
function vector(
  change: Record<string, unknown> = {},
  operation: unknown = { action: 'GRANT_RIGHT' },
) {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      worldId: 'WORLD_TEST_ONLY_AUTOMATIC_GRANT',
      countryId: 'COUNTRY_02',
      commandId: id,
      idempotencyKey: id,
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      officeId: null,
      commandType: 'INDUSTRY_FIRST_DAY_WATER_EXECUTE_V1',
      expectedWorldVersion: '2',
      simTime: '0',
      submittedAtReal: '2026-11-08T00:00:00.000Z',
      correlationId: 'CORRELATION_TEST_ONLY',
      payload: {
        schemaVersion: 'industry-first-day-utility-command-v1',
        serviceKind: 'WATER',
        operationRef: id,
        facilityId: 'OPEN-02-REFINED_FUEL',
        runId: 'RUN_TEST_ONLY',
        sourceRef:
          'INDUSTRY_UTILITY_' + 'a'.repeat(64).toUpperCase() + '_WATER',
        sourceRawSha256: 'a'.repeat(64),
        operation,
      },
      ...change,
    },
    sha,
  );
}
describe('automatic WATER grant closed DATA routing', () => {
  it('recognizes the exact automatic envelope without issuing source authority', () => {
    expect(isPostwarIndustryWaterGrantCommand(vector())).toBe(true);
  });
  it.each([
    { officeId: 'INDUSTRY' },
    { officeId: 'FINANCE' },
    { expectedWorldVersion: null },
    { idempotencyKey: null },
    { commandId: 'COMMAND_NOT_FIXED_GRANT' },
    { commandType: 'INDUSTRY_FIRST_DAY_POWER_EXECUTE_V1' },
    { commandType: 'UNKNOWN_TEST_ONLY' },
  ])('rejects a manual or different envelope %j', (change) => {
    expect(isPostwarIndustryWaterGrantCommand(vector(change))).toBe(false);
  });
  it.each(['EXTRACT', 'DELIVER', 'BOOK', 'SERVICE_WORK', 'PAY_INPUTS'])(
    'rejects action %s on the automatic WATER envelope',
    (action) => {
      expect(isPostwarIndustryWaterGrantCommand(vector({}, { action }))).toBe(
        false,
      );
    },
  );
});
