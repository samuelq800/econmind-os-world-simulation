/** Syntax only: a parsed manual request grants neither capacity/licence
 * authority nor source admission, queuing, money or an executable candidate. */
import { describe, expect, it } from 'vitest';
import {
  SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
  SOCIAL_LABOUR_PROGRAMME_CREATE_COMMAND,
} from '@econmind/core';
import { parseManualOfficeCommandRequest } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import { buildManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
const payload = {
  schemaVersion: 'social-employment-service-create-v1',
  programmeId: 'PROGRAMME_SYNTAX_ONLY',
  capacity: { amount: '1', unit: 'person' },
  budget: { amount: '0', currency: 'XAA' },
  target: {
    servicePoolId: 'ROOT_POOL_SYNTAX_ONLY',
    locationId: 'REGION_01_E1',
    skill: 'LOW',
  },
};
const request = {
  worldId: 'WORLD_SYNTAX_ONLY',
  countryId: 'COUNTRY_01',
  officeId: 'SOCIAL',
  commandType: SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND,
  commandId: 'SOCIAL_SERVICE_CREATE_SYNTAX_ONLY',
  idempotencyKey: 'SOCIAL_SERVICE_CREATE_SYNTAX_IDEM',
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
describe('licensed service creation strict transport registration only', () => {
  it('uses the canonical family/parser without issuing source or authority data', () => {
    const command = build(request);
    expect(command.commandType).toBe(SOCIAL_EMPLOYMENT_SERVICE_CREATE_COMMAND);
    expect(JSON.parse(command.canonicalPayload)).toEqual(payload);
    expect(command).not.toHaveProperty('financeAuthorization');
    expect(command).not.toHaveProperty('sourceAdmitted');
  });
  it('rejects a mismatched Office and user-supplied capacity or licence authority', () => {
    expect(() => build({ ...request, officeId: 'FINANCE' })).toThrow();
    for (const added of [
      { remainingCapacity: '100' },
      { balance: '100' },
      { approved: true },
      { licence: { noExtraFee: true } },
      { sourceAdmitted: true },
    ])
      expect(() =>
        build({ ...request, payload: { ...payload, ...added } }),
      ).toThrow('unknown');
  });
});

it('registers explicit pending programme terms under Social without accepting approval fields', () => {
  const programme = {
    ...request,
    commandType: SOCIAL_LABOUR_PROGRAMME_CREATE_COMMAND,
    payload: {
      schemaVersion: 'social-labour-programme-create-v1',
      programmeId: 'PROGRAMME_PENDING_TEST_ONLY',
      kind: 'RETURN_TO_WORK',
      eligible: 'Proposed eligibility; verification pending',
      capacity: '3',
      duration: { amount: '2', unit: 'SIM_DAY' },
    },
  };
  expect(JSON.parse(build(programme).canonicalPayload)).toEqual(
    programme.payload,
  );
  expect(() => build({ ...programme, officeId: 'FINANCE' })).toThrow();
  expect(() =>
    build({ ...programme, payload: { ...programme.payload, approved: true } }),
  ).toThrow();
});
