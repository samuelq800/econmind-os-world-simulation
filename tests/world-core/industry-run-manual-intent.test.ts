import { INDUSTRY_FIRST_DAY_POLICY_VERSION } from '@econmind/core';
/** Pure strict transport/canonical decoding, not source/OP/work authority. */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseCanonicalCommand } from '@econmind/core';
import {
  INDUSTRY_RUN_SCHEDULE_COMMAND,
  parseIndustryRunScheduleIntent,
} from '@econmind/core/industry-first-day-work';
import {
  parseManualOfficeCommandRequest,
  manualOfficeCommandCapability,
} from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  buildManualOfficeCommandIntent,
  decodeStoredManualOfficeCommand,
  type StoredManualOfficeCommand,
} from '../../apps/world-worker/src/intake/manual-office-command-intent.js';
import { manualOfficeIntakeRuntimeSupportsFamily } from '../../apps/world-worker/src/intake/manual-office-intake-runtime.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const payload = () => ({
  schemaVersion: 'postwar-industry-run-schedule-v1',
  runId: 'RUN_TEST_ONLY',
  facilityId: 'FACILITY.TEST_ONLY',
  quantity: { amount: '1', unit: 'barrel equivalent' },
  startsAtSimTime: '0',
  endsAtSimTime: '86400000',
  maximumExpense: { amount: '100', currency: 'XBB' },
  policyVersion: INDUSTRY_FIRST_DAY_POLICY_VERSION,
  sourceRef: 'SOURCE_TEST_ONLY',
  sourceRawSha256: 'b'.repeat(64),
});
const request = () => ({
  worldId: 'WORLD_TEST_ONLY',
  countryId: 'COUNTRY_02',
  officeId: 'INDUSTRY',
  commandType: INDUSTRY_RUN_SCHEDULE_COMMAND,
  commandId: 'COMMAND_TEST_ONLY_RUN',
  idempotencyKey: 'KEY_TEST_ONLY_RUN',
  expectedWorldVersion: '0',
  payload: payload(),
});
const build = (r: unknown = request()) =>
  buildManualOfficeCommandIntent({
    request: parseManualOfficeCommandRequest(r),
    countryId: 'COUNTRY_02',
    officeId: 'INDUSTRY',
    authSubject: '11111111-1111-4111-8111-111111111111',
    actor: 'ACTOR_TEST_ONLY',
    simTime: '0',
    submittedAtReal: '2026-11-01T00:00:00.000Z',
    correlationId: 'CORRELATION_TEST_ONLY',
  });
function stored(c: ReturnType<typeof build>): StoredManualOfficeCommand {
  return {
    ...c,
    officeId: c.officeId!,
    authSubject: c.authSubject!,
    expectedWorldVersion: c.expectedWorldVersion!,
    idempotencyKey: c.idempotencyKey!,
    simTime: c.simTime.toCanonicalValue(),
  };
}
describe('manual Industry RUN schedule intent', () => {
  it('uses the actual Core economic parser and exact production capability without issuing source readiness', () => {
    const r = parseManualOfficeCommandRequest(request()),
      c = build(r);
    expect(manualOfficeCommandCapability(r)).toBe('INDUSTRY_PRODUCTION');
    expect(parseIndustryRunScheduleIntent(c, sha)).toEqual(payload());
    expect(decodeStoredManualOfficeCommand([stored(c)], r)?.fingerprint).toBe(
      c.fingerprint,
    );
    expect(
      manualOfficeIntakeRuntimeSupportsFamily(
        undefined,
        INDUSTRY_RUN_SCHEDULE_COMMAND,
      ),
    ).toBe(false);
  });
  it.each([
    { commandType: 'CORE_INDUSTRY_RUN_UNKNOWN_V1' },
    { officeId: 'TRADE' },
    { idempotencyKey: null },
    { expectedWorldVersion: null },
    { expectedWorldVersion: '-1' },
    { countryId: 'COUNTRY_OTHER' },
  ])('rejects mismatched manual scope %j', (change) => {
    expect(() => build({ ...request(), ...change })).toThrow();
  });
  it.each([
    { ...payload(), paid: true },
    { ...payload(), quantity: { amount: '0', unit: 'barrel equivalent' } },
    { ...payload(), maximumExpense: { amount: '0', currency: 'XBB' } },
    { ...payload(), endsAtSimTime: '86400001' },
  ])(
    'refuses malformed economic payload without a permissive local decoder',
    (bad) => {
      expect(() => build({ ...request(), payload: bad })).toThrow();
    },
  );
  it('revalidates restored RUN payload even if its outer canonical hash is coherent', () => {
    const c = build();
    const {
      fingerprint: _fingerprint,
      payloadHash: _payloadHash,
      canonicalPayload: _canonicalPayload,
      ...fields
    } = c;
    void _fingerprint;
    void _payloadHash;
    void _canonicalPayload;
    const forged = parseCanonicalCommand(
      { ...fields, simTime: '0', payload: { ...payload(), paid: true } },
      sha,
    );
    expect(() =>
      decodeStoredManualOfficeCommand(
        [stored(forged)],
        parseManualOfficeCommandRequest(request()),
      ),
    ).toThrow();
  });
});
