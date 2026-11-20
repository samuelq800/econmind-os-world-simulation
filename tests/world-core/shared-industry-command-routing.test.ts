import { PostwarIndustryRuntimeMissing } from '../../apps/world-worker/src/persistence/postwar-industry-runtime.js';
/** Routing protocol only: no paid work, production, or source admission is claimed. */
import { describe, it, expect } from 'vitest';
import { parseCanonicalCommand } from '@econmind/core';
import {
  approvalLockCommand,
  approvalLockSha,
} from '../support/b-narrow-approval-lock-native.js';
import { validateManualOfficeCommandIntent } from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import {
  parseManualOfficeCommandRequest,
  manualOfficeCommandCapability,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  createManualOfficeCommandComposition,
  manualOfficeCapability,
  isManualOfficeSourceMissing,
} from '../../apps/world-worker/src/preparation/manual-office-command-composition.js';
function command(payload = { facilityId: 'FACILITY_TEST', runId: 'RUN_TEST' }) {
  const old = approvalLockCommand('_INDUSTRY_ROUTING');
  const header = Object.fromEntries(
    Object.entries(old).filter(
      ([key]) =>
        !['fingerprint', 'payloadHash', 'canonicalPayload'].includes(key),
    ),
  );
  return parseCanonicalCommand(
    {
      ...header,
      officeId: 'INDUSTRY',
      commandType: 'CORE_INDUSTRY_PRODUCTION_V1',
      simTime: old.simTime.toCanonicalValue(),
      payload,
    },
    approvalLockSha,
  );
}
describe('fixed Industry shared routing', () => {
  it('keeps missing genuine paid-run evidence as a source denial without masking operational failures', () => {
    expect(
      isManualOfficeSourceMissing(
        new PostwarIndustryRuntimeMissing(['GENUINE_PREPARED_RUN_MISSING']),
      ),
    ).toBe(true);
    expect(
      isManualOfficeSourceMissing(new Error('DATABASE_DISCONNECTED')),
    ).toBe(false);
  });
  it('registers only the exact office/family/capability and strict two-reference intent', () => {
    const c = command();
    const request = {
      worldId: c.worldId,
      countryId: c.countryId,
      officeId: 'INDUSTRY',
      commandType: c.commandType,
      commandId: c.commandId,
      idempotencyKey: c.idempotencyKey,
      expectedWorldVersion: '0',
      payload: JSON.parse(c.canonicalPayload),
    };
    expect(parseManualOfficeCommandRequest(request)).toEqual(request);
    expect(manualOfficeCommandCapability(request)).toBe('INDUSTRY_PRODUCTION');
    expect(manualOfficeCapability(c)).toBe('INDUSTRY_PRODUCTION');
    expect(() => validateManualOfficeCommandIntent(c)).not.toThrow();
    for (const wrong of [
      { officeId: 'FINANCE' },
      { commandType: 'CORE_INDUSTRY_UNKNOWN' },
    ])
      expect(() =>
        parseManualOfficeCommandRequest({ ...request, ...wrong }),
      ).toThrow();
    expect(() =>
      validateManualOfficeCommandIntent(
        command({ facilityId: '', runId: 'RUN_TEST' }),
      ),
    ).toThrow();
  });
  it('requires the genuine prepared runtime on the same database before claiming work', () => {
    const database = {
      query: async () => {
        throw Error('NO_IO');
      },
      transaction: async () => {
        throw Error('NO_IO');
      },
    };
    for (const readers of [{}, { industry: { candidateFactory: {} } as never }])
      expect(
        createManualOfficeCommandComposition({
          command: command(),
          database,
          workerId: 'WORKER_ROUTING',
          sha256Hex: approvalLockSha,
          readers,
        }),
      ).toBeNull();
  });
});
