import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AUTHENTICATED_OFFICE_COMMAND_SCHEMA,
  FINANCE_BUDGET_APPROPRIATION_COMMAND,
  POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND,
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

describe('browser manual Office transport permits only the six registered manual families', () => {
  it('retains exact readonly family types without enabling any automatic family', () => {
    expectTypeOf(officeFamilies).toEqualTypeOf<{
      readonly CAPTAIN: readonly ['CAPTAIN_POLITICAL_CAPITAL_ALLOCATE_V1'];
      readonly CENTRAL_BANK: readonly ['CORE_CENTRAL_BANK_OMO_V1'];
      readonly SOCIAL: readonly [
        'CORE_SOCIAL_EMPLOYMENT_SERVICE_PLAN_V1',
        'CORE_SOCIAL_EMPLOYMENT_POSITION_OFFER_CREATE_V1',
      ];
      readonly FINANCE: readonly [
        'CORE_FINANCE_BUDGET_APPROPRIATION_V1',
        'POSTWAR_DAY_ONE_TREASURY_FX_SPOT_V1',
      ];
    }>();
    expect(Object.keys(officeFamilies).sort()).toEqual([
      'CAPTAIN',
      'CENTRAL_BANK',
      'FINANCE',
      'SOCIAL',
    ]);
  });
  it.each(['CAPTAIN', 'CENTRAL_BANK', 'SOCIAL', 'FINANCE'] as const)(
    'still parses the existing %s transport',
    (office) => {
      const value = envelope(office, officeFamilies[office][0]);
      expect(parseOfficeIntent(value, config(office))).toEqual(value);
    },
  );
  it('carries Treasury FX only through the current Finance identity and never as a private OP or CB action', () => {
    const value = envelope('FINANCE', POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND);
    expect(parseOfficeIntent(value, config('FINANCE'))).toEqual(value);
    for (const office of [
      'CAPTAIN',
      'CENTRAL_BANK',
      'SOCIAL',
      'INDUSTRY',
      'TRADE',
    ]) {
      expect(
        parseOfficeIntent(
          envelope(office, POSTWAR_DAY_ONE_TREASURY_FX_SPOT_COMMAND),
          config(office),
        ),
      ).toBeNull();
      expect(parseOfficeIntent(value, config(office))).toBeNull();
    }
    expect(
      parseOfficeIntent(
        envelope('FINANCE', 'POSTWAR_DAY_ONE_PRIVATE_FX_SPOT_V1'),
        config('FINANCE'),
      ),
    ).toBeNull();
    expect(
      parseOfficeIntent(value, {
        ...config('FINANCE'),
        identity: { ...config('FINANCE').identity, countryId: 'COUNTRY_OTHER' },
      }),
    ).toBeNull();
  });
  it('permits funded Social position transport only for the authenticated Social identity', () => {
    const value = envelope('SOCIAL', officeFamilies.SOCIAL[1]);
    expect(parseOfficeIntent(value, config('SOCIAL'))).toEqual(value);
    expect(parseOfficeIntent(value, config('FINANCE'))).toBeNull();
    expect(
      parseOfficeIntent(
        envelope('SOCIAL', 'CORE_SOCIAL_JOB_MATCH_SETTLEMENT_V1'),
        config('SOCIAL'),
      ),
    ).toBeNull();
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
        office === 'CAPTAIN'
          ? officeFamilies.SOCIAL[0]
          : officeFamilies.CAPTAIN[0];
      expect(
        parseOfficeIntent(envelope(office, other), config(office)),
      ).toBeNull();
    },
  );
});
