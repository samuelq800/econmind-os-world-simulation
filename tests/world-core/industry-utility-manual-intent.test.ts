/** Pure/manual transport checks; no service work, payment or delivery authority. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMAND_SCHEMA_VERSION,
  parseCanonicalCommand,
} from '../../packages/core/src/index.js';
import { MANUAL_INDUSTRY_UTILITY_COMMANDS } from '../../packages/core/src/commands/authenticated-office-command-contract.js';
import {
  parseIndustryUtilityIntent,
  parseIndustryUtilityAutomaticWaterGrantIntent,
  parseIndustryUtilityManualIntent,
} from '../../packages/core/src/commands/industry-utility-execution.js';
import { buildManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import {
  manualOfficeCommandCapability,
  parseManualOfficeCommandRequest,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  manualUtilityCases,
  manualUtilityKinds,
  manualUtilityPayload,
  type ManualUtilityKind,
} from '../support/industry-utility-manual-intent-fixture.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function request(kind: ManualUtilityKind, action?: string) {
  return {
    worldId: 'WORLD_TEST_ONLY',
    countryId: 'COUNTRY_02',
    officeId: 'INDUSTRY' as const,
    commandType: MANUAL_INDUSTRY_UTILITY_COMMANDS[kind],
    commandId: 'COMMAND_TEST_ONLY',
    idempotencyKey: 'KEY_TEST_ONLY',
    expectedWorldVersion: '0',
    payload: manualUtilityPayload(kind, action),
  };
}
function command(
  kind: ManualUtilityKind,
  change: Record<string, unknown> = {},
  payload: unknown = manualUtilityPayload(kind),
) {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      ...request(kind),
      actorId: 'ACTOR_TEST_ONLY',
      authSubject: '11111111-1111-4111-8111-111111111111',
      simTime: '10000',
      submittedAtReal: '2026-11-08T00:00:00.000Z',
      correlationId: 'CORRELATION_TEST_ONLY',
      payload,
      ...change,
    },
    sha,
  );
}
describe('Industry utility manual scheduling boundary', () => {
  it.each(manualUtilityCases)(
    'validates %s/%s through the same Worker canonical parser and current Industry capability',
    (kind, action) => {
      const r = request(kind, action),
        c = command(kind, {}, r.payload);
      expect(parseManualOfficeCommandRequest(r)).toEqual(r);
      expect(parseIndustryUtilityManualIntent(c, sha)).toEqual(r.payload);
      expect(manualOfficeCommandCapability(r)).toBe('INDUSTRY_PRODUCTION');
      expect(
        buildManualOfficeCommandIntent({
          request: r,
          countryId: r.countryId,
          officeId: 'INDUSTRY',
          authSubject: c.authSubject,
          actor: c.actorId,
          simTime: c.simTime.ticks.toString(),
          submittedAtReal: c.submittedAtReal,
          correlationId: c.correlationId,
        }).fingerprint,
      ).toBe(c.fingerprint);
      expect(() =>
        manualOfficeCommandCapability({ ...r, officeId: 'TRADE' }),
      ).toThrow();
    },
  );
  it.each([
    ['POWER', 'DELIVER'],
    ['WATER', 'GRANT_RIGHT'],
  ] as const)(
    'preserves conditional %s/%s DATA parsing but rejects manual execution',
    (kind, action) => {
      const payload = { ...manualUtilityPayload(kind), operation: { action } },
        c = command(kind, {}, payload);
      expect(parseIndustryUtilityIntent(c, sha).operation.action).toBe(action);
      expect(() => parseIndustryUtilityManualIntent(c, sha)).toThrow();
      expect(() =>
        parseManualOfficeCommandRequest({ ...request(kind), payload }),
      ).toThrow();
    },
  );
  it.each([
    { officeId: null },
    { officeId: 'TRADE' },
    { idempotencyKey: null },
    { expectedWorldVersion: null },
    { simTime: '86400001' },
  ])('rejects missing current manual scope %j', (change) => {
    expect(() =>
      parseIndustryUtilityManualIntent(command('POWER', change), sha),
    ).toThrow();
  });
  it('rejects caller-supplied logistics workers or performed hours even after the work-order action is registered', () => {
    const payload = {
      ...manualUtilityPayload('LOGISTICS'),
      operation: {
        action: 'SERVICE_WORK',
        transferId: 'TRANSFER_TEST_ONLY',
        allocations: [],
      },
    };
    expect(() =>
      parseIndustryUtilityManualIntent(command('LOGISTICS', {}, payload), sha),
    ).toThrow();
    expect(() =>
      parseManualOfficeCommandRequest({ ...request('LOGISTICS'), payload }),
    ).toThrow();
  });
  it('recognizes only the fixed automatic WATER grant envelope as DATA, never as a manual request or proof', () => {
    const id =
      'COMMAND_INDUSTRY_WATER_GRANT_' +
      sha('TEST_ONLY_SCHEMA_VECTOR_NOT_ISSUER').toUpperCase();
    const payload = {
      ...manualUtilityPayload('WATER'),
      operationRef: id,
      sourceRef: 'INDUSTRY_UTILITY_' + 'a'.repeat(64).toUpperCase() + '_WATER',
      operation: { action: 'GRANT_RIGHT' },
    };
    const c = command(
      'WATER',
      { officeId: null, commandId: id, idempotencyKey: id },
      payload,
    );
    expect(parseIndustryUtilityAutomaticWaterGrantIntent(c, sha)).toEqual(
      payload,
    );
    expect(() => parseIndustryUtilityManualIntent(c, sha)).toThrow();
    expect(() =>
      parseManualOfficeCommandRequest({
        ...request('WATER'),
        commandId: id,
        idempotencyKey: id,
        payload,
      }),
    ).toThrow();
    // Audit fields must still be compared with the real committed RUN by the
    // genuine fixed source/commit port. This schema vector issues no authority.
    for (const change of [
      { officeId: 'INDUSTRY' },
      { expectedWorldVersion: null },
      { idempotencyKey: null },
      { commandId: 'COMMAND_FAKE' },
      { simTime: '86400001' },
      { authSubject: null },
    ]) {
      expect(() =>
        parseIndustryUtilityAutomaticWaterGrantIntent(
          command(
            'WATER',
            { officeId: null, commandId: id, idempotencyKey: id, ...change },
            payload,
          ),
          sha,
        ),
      ).toThrow();
    }
    for (const changed of [
      { ...payload, operationRef: 'OTHER' },
      { ...payload, sourceRef: 'OTHER' },
      { ...payload, operation: { action: 'GRANT_RIGHT', approved: true } },
    ]) {
      expect(() =>
        parseIndustryUtilityAutomaticWaterGrantIntent(
          command(
            'WATER',
            { officeId: null, commandId: id, idempotencyKey: id },
            changed,
          ),
          sha,
        ),
      ).toThrow();
    }
  });
  it.each(manualUtilityKinds)(
    'rejects %s caller paid/ready facts and schema extension',
    (kind) => {
      const original = manualUtilityPayload(kind);
      for (const payload of [
        { ...original, ready: true },
        { ...original, operation: { ...original.operation, paid: true } },
        { ...original, serviceKind: 'UNKNOWN' },
      ]) {
        expect(() =>
          parseIndustryUtilityManualIntent(command(kind, {}, payload), sha),
        ).toThrow();
        expect(() =>
          parseManualOfficeCommandRequest({ ...request(kind), payload }),
        ).toThrow();
      }
    },
  );
});
