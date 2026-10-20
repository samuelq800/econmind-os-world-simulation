import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  FINANCE_BUDGET_APPROPRIATION_COMMAND,
} from '@econmind/core/authenticated-office-command-contract';
import {
  officeFamilies,
  parseOfficeIntent,
} from '../../apps/world-web/src/office-command/contract.js';
import type { ProductionReadConfig } from '../../apps/world-web/src/production-read/contract.js';

// TEST_ONLY transport vectors, not a current session/source/queue/commit proof.
function config(officeId: string): ProductionReadConfig {
  const identity = {
    worldId: 'WORLD_TEST_ONLY',
    authSubjectId: '11111111-1111-4111-8111-111111111111',
    countryId: 'COUNTRY_TEST_ONLY',
    officeId,
    authorizationRevision: 'REV_TEST_ONLY',
    modelVersion: 'MODEL_TEST_ONLY',
    projectionVersion: 'PROJECTION_TEST_ONLY',
    scopeKey: 'SCOPE_TEST_ONLY',
    classification: 'OFFICE_PRIVATE' as const,
  };
  return {
    identity,
    endpoints: {
      origin: 'https://example.invalid',
      projectionPath: '/v1/read',
      finalLookupPath: '/v1/final',
      deploymentRef: 'DEPLOYMENT_TEST_ONLY',
    },
    world: {
      worldId: identity.worldId,
      seedRef: 'SEED_TEST_ONLY',
      contentHash: `sha256:${'0'.repeat(64)}`,
      admissionRef: 'ADMISSION_TEST_ONLY',
      minimumWorldVersion: '0',
    },
    seatRef: 'SEAT_TEST_ONLY',
    currentIdentity: () => identity,
    getAccessToken: async () => null,
    session: {
      sessionRef: 'SESSION_TEST_ONLY',
      isCurrent: () => true,
      onInvalidate: () => () => undefined,
    },
  };
}
function envelope(officeId: string, commandType: string) {
  return {
    schemaVersion: AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
    requestId: '11111111-1111-4111-8111-111111111111',
    request: {
      worldId: 'WORLD_TEST_ONLY',
      countryId: 'COUNTRY_TEST_ONLY',
      officeId,
      commandType,
      commandId: 'COMMAND_TEST_ONLY',
      idempotencyKey: 'KEY_TEST_ONLY',
      expectedWorldVersion: '0',
      payload: { fixture: true },
    },
  };
}

describe('browser manual Office support stays explicitly three-family', () => {
  it('retains exact readonly map types and all three exhaustive keys, not the server Office union', () => {
    expectTypeOf(officeFamilies).toEqualTypeOf<{
      readonly CAPTAIN: 'CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1';
      readonly CENTRAL_BANK: 'CORE_CENTRAL_BANK_OMO_V1';
      readonly SOCIAL: 'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1';
    }>();
    expect(Object.keys(officeFamilies).sort()).toEqual([
      'CAPTAIN',
      'CENTRAL_BANK',
      'SOCIAL',
    ]);
  });
  it.each(['CAPTAIN', 'CENTRAL_BANK', 'SOCIAL'] as const)(
    'still parses the existing %s transport',
    (office) => {
      const value = envelope(office, officeFamilies[office]);
      expect(parseOfficeIntent(value, config(office))).toEqual(value);
    },
  );
  it('rejects Finance budget even when its transport DTO exists and the read identity is FINANCE', () => {
    expect(
      parseOfficeIntent(
        envelope('FINANCE', FINANCE_BUDGET_APPROPRIATION_COMMAND),
        config('FINANCE'),
      ),
    ).toBeNull();
    expect(Object.hasOwn(officeFamilies, 'FINANCE')).toBe(false);
  });
  it.each(['CAPTAIN', 'CENTRAL_BANK', 'SOCIAL'] as const)(
    'does not route budget or a mismatched family through %s',
    (office) => {
      expect(
        parseOfficeIntent(
          envelope(office, FINANCE_BUDGET_APPROPRIATION_COMMAND),
          config(office),
        ),
      ).toBeNull();
      const other =
        office === 'CAPTAIN' ? officeFamilies.SOCIAL : officeFamilies.CAPTAIN;
      expect(
        parseOfficeIntent(envelope(office, other), config(office)),
      ).toBeNull();
    },
  );
});
