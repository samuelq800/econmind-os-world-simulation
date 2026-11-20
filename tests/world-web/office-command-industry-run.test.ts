/** Browser transport only; the server's Core parser remains economic authority. */
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_OFFICE_COMMAND_SCHEMA } from '@econmind/core/authenticated-office-command-contract';
import { officeProjectionFixture } from './office-projection-fixture.js';
import {
  officeFamilies,
  parseOfficeIntent,
  officeRecoveryRequest,
} from '../../apps/world-web/src/office-command/contract.js';
describe('Industry RUN browser transport', () => {
  it('keeps RUN in its exact office and preserves the complete original for recovery', () => {
    const { config } = officeProjectionFixture('industry');
    const request = {
      schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
      requestId: '11111111-1111-4111-8111-111111111111',
      request: {
        worldId: config.identity.worldId,
        countryId: config.identity.countryId,
        officeId: 'INDUSTRY',
        commandType: 'CORE_INDUSTRY_RUN_SCHEDULE_V1',
        commandId: 'COMMAND_TEST_ONLY_RUN',
        idempotencyKey: 'KEY_TEST_ONLY_RUN',
        expectedWorldVersion: '2',
        payload: {
          schemaVersion: 'postwar-industry-run-schedule-v1',
          runId: 'RUN_TEST_ONLY',
        },
      },
    };
    expect(officeFamilies.INDUSTRY).toContain('CORE_INDUSTRY_RUN_SCHEDULE_V1');
    const parsed = parseOfficeIntent(request, config);
    expect(parsed).toEqual(request);
    expect(
      officeRecoveryRequest(parsed!, request.requestId).request.originalRequest,
    ).toEqual(parsed);
    for (const change of [
      { officeId: 'TRADE' },
      { countryId: 'FOREIGN_COUNTRY' },
      { commandType: 'CORE_INDUSTRY_RUN_UNKNOWN_V1' },
      { expectedWorldVersion: null },
      { idempotencyKey: null },
    ])
      expect(
        parseOfficeIntent(
          { ...request, request: { ...request.request, ...change } },
          config,
        ),
      ).toBeNull();
  });
});
