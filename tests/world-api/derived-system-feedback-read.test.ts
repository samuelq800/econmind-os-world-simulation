import { describe, expect, it } from 'vitest';
import {
  classifiedActivityWireFixture,
  classifiedOfficeScope,
} from '../support/classified-activity-wire-fixture.js';
import {
  createWorldReadRequest,
  type WorldProjectionDto,
} from '../../apps/world-api/src/integration/contracts.js';
import { parseSupabaseAuthSubject } from '../../apps/world-api/src/integration/identity.js';
import {
  readEntitledWorldProjection,
  type ParameterizedPgReadResult,
} from '../../apps/world-api/src/integration/postgres-read-adapter.js';
import { assertDerivedSystemFeedbackPayload } from '../../apps/world-api/src/integration/derived-system-feedback-validator.js';

const WORLD = 'WORLD_FB2_MECHANISM';
const COUNTRY = 'COUNTRY_FB2_MECHANISM';
const SUBJECT = '550e8400-e29b-41d4-a716-446655440011';
const AT = '2026-10-13T10:00:00.000Z';
const SCOPE = classifiedOfficeScope(COUNTRY, 'SOCIAL');
function fixture() {
  const feedback = {
    schemaVersion: 'derived-system-feedback-v1',
    classification: 'OFFICE_PRIVATE',
    scopeKey: SCOPE,
    countryId: COUNTRY,
    officeId: 'SOCIAL',
    sourceHead: { worldId: WORLD, worldVersion: '0', eventSequence: '0' },
    generatedAt: AT,
    citizen: {
      status: 'UNAVAILABLE',
      reason: 'MODEL_NOT_ADMITTED',
      items: [] as unknown[],
    },
    government: {
      status: 'UNAVAILABLE',
      reason: 'DISCLOSURE_UNAVAILABLE',
      items: [] as unknown[],
    },
  };
  const payload = {
    ...classifiedActivityWireFixture(COUNTRY, 'SOCIAL'),
    feedback,
  };
  const authority = {
    authSubject: SUBJECT,
    worldId: WORLD,
    classification: 'OFFICE_PRIVATE' as const,
    scopeKey: SCOPE,
    seedRef: 'SEED_MECHANISM_ONLY',
    contentHash: 'sha256:' + 'a'.repeat(64),
    worldVersion: '0',
    eventSequence: '0',
  };
  const row = {
    world_id: WORLD,
    classification: 'OFFICE_PRIVATE',
    scope_key: SCOPE,
    schema_version: 'world-projection-read-v1',
    world_version: '0',
    event_sequence: '0',
    generated_at: AT,
    payload,
  };
  const request = createWorldReadRequest({
    requestId: '123e4567-e89b-42d3-a456-426614174010',
    worldId: WORLD,
    classification: 'OFFICE_PRIVATE',
    scopeKey: SCOPE,
  });
  // Mutable JSON request transport copy; createWorldReadRequest stays frozen.
  return {
    feedback,
    payload,
    authority,
    row,
    request: structuredClone(request),
  };
}
type Fixture = ReturnType<typeof fixture>;
const fail = { code: 'PROTOCOL_ERROR', retryable: false };
// This shape is a parser MECHANISM vector, NOT a persisted authority issuer,
// seat/JWT/admission fixture or a real authorized readback claim.
const read = (f: Fixture, authority: unknown = f.authority) =>
  readEntitledWorldProjection({
    executor: {
      query: async () =>
        ({
          rows: [f.row],
          verifiedProjectionAuthority: authority,
        }) as ParameterizedPgReadResult,
    },
    authSubject: parseSupabaseAuthSubject(SUBJECT),
    request: f.request,
  });
function projection(f: Fixture): WorldProjectionDto {
  return {
    schemaVersion: 'world-projection-read-v1',
    worldId: WORLD,
    classification: 'OFFICE_PRIVATE',
    scopeKey: SCOPE,
    watermark: { worldVersion: '0', eventSequence: '0', generatedAt: AT },
    payload: f.payload as unknown as WorldProjectionDto['payload'],
    receipts: [],
    events: [],
  };
}
describe('FB2 unavailable-only reader / finite wire mechanisms, not admission', () => {
  it('accepts only the exact same-head unavailable parser control without changing input', async () => {
    const f = fixture(),
      before = JSON.stringify(f);
    const result = await read(f);
    expect(result?.payload).toEqual(f.payload);
    expect(f.feedback.citizen.items).toEqual([]);
    expect(f.feedback.government.items).toEqual([]);
    expect(JSON.stringify(f)).toBe(before);
  });
  it('keeps truly absent legacy feedback unchanged and does not require new authority', async () => {
    const f = fixture();
    Reflect.deleteProperty(f.payload, 'feedback');
    const result = await read(f, null);
    expect(result?.payload).toEqual(f.payload);
    expect(Object.hasOwn(result!.payload as object, 'feedback')).toBe(false);
  });
  it.each([undefined, null, 1, false, 'invalid', [], {}])(
    'refuses a present malformed field %s rather than downgrading to legacy',
    async (value) => {
      const f = fixture();
      Object.assign(f.payload, { feedback: value });
      await expect(read(f)).rejects.toMatchObject(fail);
    },
  );
  it.each(['COUNTRY', 'NEGOTIATION_PARTY'] as const)(
    'rejects private feedback on %s before the party early return',
    async (classification) => {
      const f = fixture();
      const scopeKey = classification === 'COUNTRY' ? COUNTRY : 'PARTY_TEST';
      Object.assign(f.row, { classification, scope_key: scopeKey });
      Object.assign(f.request.payload, { classification, scopeKey });
      await expect(read(f)).rejects.toMatchObject(fail);
      Reflect.deleteProperty(f.payload, 'feedback');
      if (classification === 'COUNTRY')
        Reflect.deleteProperty(f.payload, 'officeId');
      await expect(read(f, null)).resolves.toMatchObject({ classification });
    },
  );
  it.each(['PUBLIC', 'ADMIN'] as const)(
    'does not expand the original %s request gate',
    async (classification) => {
      const f = fixture();
      Object.assign(f.request.payload, { classification });
      await expect(read(f)).rejects.toMatchObject(fail);
    },
  );
  it.each([
    'schema',
    'classification',
    'scope',
    'country',
    'office',
    'time',
    'head-world',
    'head-version',
    'head-sequence',
    'citizen-status',
    'citizen-reason',
    'citizen-item',
    'government-status',
    'government-reason',
    'government-item',
    'extra',
    'head-extra',
    'part-extra',
    'test-envelope',
  ])('rejects exact contract conflict %s', async (fault) => {
    const f = fixture();
    if (fault === 'schema')
      f.feedback.schemaVersion = 'unit-test-only-derived-system-feedback-v1';
    if (fault === 'classification') f.feedback.classification = 'COUNTRY';
    if (fault === 'scope') f.feedback.scopeKey = 'OTHER_SCOPE';
    if (fault === 'country') f.feedback.countryId = 'COUNTRY_OTHER';
    if (fault === 'office') f.feedback.officeId = 'CAPTAIN';
    if (fault === 'time') f.feedback.generatedAt = '2026-10-13T10:00:01.000Z';
    if (fault === 'head-world') f.feedback.sourceHead.worldId = 'WORLD_OTHER';
    if (fault === 'head-version') f.feedback.sourceHead.worldVersion = '1';
    if (fault === 'head-sequence') f.feedback.sourceHead.eventSequence = '1';
    if (fault === 'citizen-status') f.feedback.citizen.status = 'CURRENT';
    if (fault === 'citizen-reason') f.feedback.citizen.reason = 'NO_ITEMS';
    if (fault === 'citizen-item')
      f.feedback.citizen.items.push({ text: 'fake' });
    if (fault === 'government-status') f.feedback.government.status = 'CURRENT';
    if (fault === 'government-reason')
      f.feedback.government.reason = 'MODEL_NOT_ADMITTED';
    if (fault === 'government-item')
      f.feedback.government.items.push({ text: 'fake' });
    if (fault === 'extra') Object.assign(f.feedback, { approved: true });
    if (fault === 'head-extra')
      Object.assign(f.feedback.sourceHead, { classification: 'COUNTRY' });
    if (fault === 'part-extra')
      Object.assign(f.feedback.citizen, { modelRef: 'TEST_MODEL' });
    if (fault === 'test-envelope')
      Object.assign(f.feedback, {
        admission: 'ISOLATED_TEST_ONLY_NOT_ADMITTED',
      });
    await expect(read(f)).rejects.toMatchObject(fail);
  });
  it.each([
    'absent',
    'subject',
    'world',
    'classification',
    'scope',
    'version',
    'sequence',
    'seed',
    'hash',
    'extra',
  ])('requires exact executor snapshot context: %s', async (fault) => {
    const f = fixture();
    if (fault === 'subject')
      f.authority.authSubject = '550e8400-e29b-41d4-a716-446655440012';
    if (fault === 'world') f.authority.worldId = 'WORLD_OTHER';
    if (fault === 'classification')
      Object.assign(f.authority, { classification: 'COUNTRY' });
    if (fault === 'scope') f.authority.scopeKey = 'OTHER_SCOPE';
    if (fault === 'version') f.authority.worldVersion = '1';
    if (fault === 'sequence') f.authority.eventSequence = '1';
    if (fault === 'seed') f.authority.seedRef = '';
    if (fault === 'hash') f.authority.contentHash = 'sha256:' + 'A'.repeat(64);
    if (fault === 'extra') Object.assign(f.authority, { approved: true });
    await expect(
      read(f, fault === 'absent' ? null : f.authority),
    ).rejects.toMatchObject(fail);
  });
  it.each(['01', '-1', '9223372036854775808', '1.5', '1e0'])(
    'refuses noncanonical/out-of-range source integers %s',
    async (value) => {
      const f = fixture();
      f.feedback.sourceHead.worldVersion = value;
      await expect(read(f)).rejects.toMatchObject(fail);
    },
  );
  it.each(['symbol', 'hidden', 'accessor', 'array-extra'])(
    'rejects internal non-wire own-key ambiguity %s',
    (fault) => {
      const f = fixture();
      if (fault === 'symbol')
        Object.assign(f.feedback, { [Symbol('extra')]: true });
      if (fault === 'hidden')
        Object.defineProperty(f.feedback, 'extra', { value: true });
      if (fault === 'accessor')
        Object.defineProperty(f.feedback, 'generatedAt', {
          enumerable: true,
          get: () => AT,
        });
      if (fault === 'array-extra')
        Object.assign(f.feedback.citizen.items, { extra: true });
      expect(() =>
        assertDerivedSystemFeedbackPayload({
          value: f.feedback,
          projection: projection(f),
          authority: f.authority,
          authSubject: SUBJECT,
        }),
      ).toThrow();
    },
  );
  it.each(['symbol', 'hidden', 'array-extra'])(
    'does not JSON-normalize raw feedback ambiguity into a valid wire row: %s',
    async (fault) => {
      const f = fixture();
      if (fault === 'symbol')
        Object.assign(f.feedback, { [Symbol('extra')]: true });
      if (fault === 'hidden')
        Object.defineProperty(f.feedback, 'extra', { value: true });
      if (fault === 'array-extra')
        Object.assign(f.feedback.citizen.items, { extra: true });
      await expect(read(f)).rejects.toMatchObject(fail);
    },
  );
  it('accepts the exact PostgreSQL bigint boundary without Number coercion', async () => {
    const f = fixture(),
      max = '9223372036854775807';
    f.row.world_version = max;
    f.row.event_sequence = max;
    f.feedback.sourceHead.worldVersion = max;
    f.feedback.sourceHead.eventSequence = max;
    f.authority.worldVersion = max;
    f.authority.eventSequence = max;
    await expect(read(f)).resolves.toMatchObject({
      watermark: { worldVersion: max, eventSequence: max },
    });
  });
  it.each([
    '2026-02-30T10:00:00.000Z',
    '2026-10-13T10:00:00Z',
    '2026-10-13T18:00:00.000+08:00',
  ])('refuses noncanonical observation time %s', (value) => {
    const f = fixture(),
      p = projection(f);
    f.feedback.generatedAt = value;
    Object.assign(p.watermark, { generatedAt: value });
    expect(() =>
      assertDerivedSystemFeedbackPayload({
        value: f.feedback,
        projection: p,
        authority: f.authority,
        authSubject: SUBJECT,
      }),
    ).toThrow();
  });
  it('preserves original ledger, DecisionResult and response-size rejection', async () => {
    const ledger = fixture();
    ledger.payload.ledger.inventoryPositions.push('private' as never);
    await expect(read(ledger)).rejects.toMatchObject(fail);
    const decision = fixture();
    Object.assign(decision.payload, { decisionResult: { approved: true } });
    await expect(read(decision)).rejects.toMatchObject(fail);
    const large = fixture();
    large.feedback.citizen.items.push('x'.repeat(1_048_577));
    await expect(read(large)).rejects.toMatchObject(fail);
  });
});
