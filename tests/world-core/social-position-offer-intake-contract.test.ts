/** Syntax only: a parsed manual request grants neither budget/employer
 * authority nor source admission, queuing, money or an executable candidate. */
import { describe, expect, it } from 'vitest';
import { SOCIAL_POSITION_OFFER_CREATE_COMMAND } from '@econmind/core';
import { parseManualOfficeCommandRequest } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import { buildManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
const payload = {
  schemaVersion: 'social-employment-position-offer-create-v1',
  positionId: 'POSITION_SYNTAX_ONLY',
  locationId: 'REGION_01_E1',
  skill: 'LOW',
  publicService: 'PUBLIC_SAFETY',
  occupation: 'GENERAL',
  requiredCount: '1',
  wageScheduleRef: 'SOURCE_POSITION_REFERENCE_ONLY',
  fundingAccountId: 'SOURCE_ACCOUNT_REFERENCE_ONLY',
  coverageDays: '1',
};
const request = {
  worldId: 'WORLD_SYNTAX_ONLY',
  countryId: 'COUNTRY_01',
  officeId: 'SOCIAL',
  commandType: SOCIAL_POSITION_OFFER_CREATE_COMMAND,
  commandId: 'SOCIAL_POSITION_SYNTAX_ONLY',
  idempotencyKey: 'SOCIAL_POSITION_SYNTAX_IDEM',
  expectedWorldVersion: '0',
  payload,
};
function build(value: unknown) {
  return buildManualOfficeCommandIntent({
    request: parseManualOfficeCommandRequest(value),
    authSubject: '11111111-1111-4111-8111-111111111111',
    countryId: 'COUNTRY_01',
    officeId: 'SOCIAL',
    actor: 'ACTOR_SYNTAX_ONLY',
    simTime: '0',
    submittedAtReal: '2026-10-28T00:00:00.000Z',
    correlationId: 'TRACE_SYNTAX_ONLY',
  });
}
describe('funded position strict transport registration only', () => {
  it('uses the canonical family/parser without issuing source or authority data', () => {
    const command = build(request);
    expect(command.commandType).toBe(SOCIAL_POSITION_OFFER_CREATE_COMMAND);
    expect(JSON.parse(command.canonicalPayload)).toEqual(payload);
    expect(command).not.toHaveProperty('financeAuthorization');
    expect(command).not.toHaveProperty('sourceAdmitted');
  });
  it('rejects a mismatched Office and user-supplied wages/balances/approval flags', () => {
    expect(() => build({ ...request, officeId: 'FINANCE' })).toThrow();
    for (const added of [
      { amount: '100' },
      { balance: '100' },
      { approved: true },
      { financeAuthorization: { current: true } },
      { sourceAdmitted: true },
    ])
      expect(() =>
        build({ ...request, payload: { ...payload, ...added } }),
      ).toThrow('unknown');
  });
});
