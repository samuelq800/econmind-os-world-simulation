/** Effect-set unit checks only. No source, authorization or commit is issued. */
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { assertSocialServiceCreationEffectSet } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
const hash = (value: string) =>
  'sha256:' + createHash('sha256').update(value).digest('hex');
const expectedHash = hash('{"testOnlyState":1}');
const material = {
  key: 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_10',
  payloadHash: expectedHash,
};
const input = {
  countryId: 'COUNTRY_10',
  eventPayload: JSON.stringify({ afterStateHash: expectedHash }),
  materials: [material],
  outboxCount: 0,
};
it('binds the sole derived state to the source-checked event hash', () => {
  expect(() => assertSocialServiceCreationEffectSet(input)).not.toThrow();
});
it('rejects omitted, extra, foreign-country or different derived state', () => {
  for (const materials of [
    [],
    [material, material],
    [{ ...material, key: 'SOCIAL_EMPLOYMENT_SERVICE_COUNTRY_02' }],
    [{ ...material, payloadHash: hash('{"testOnlyState":2}') }],
  ]) {
    expect(() =>
      assertSocialServiceCreationEffectSet({ ...input, materials }),
    ).toThrow();
  }
});
it('rejects appended outbox effects and malformed event state commitments', () => {
  expect(() =>
    assertSocialServiceCreationEffectSet({ ...input, outboxCount: 1 }),
  ).toThrow();
  for (const eventPayload of [
    '{}',
    'null',
    '[]',
    '{"afterStateHash":"unverified"}',
  ]) {
    expect(() =>
      assertSocialServiceCreationEffectSet({ ...input, eventPayload }),
    ).toThrow();
  }
});
