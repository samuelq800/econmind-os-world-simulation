/** DATA codec/preflight only. These transport examples do not constitute a
 * registered source, staffing, private preparation or multi-country acceptance. */
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import {
  createPostwarRefinery21AssemblyCheck,
  decodeRefinery21UtilityPacket,
} from '../support/postwar-refinery21-source-assembly.js';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const scope = {
  worldId: 'WORLD_TEST_ONLY_CODEC',
  seedId: 'SEED_TEST_ONLY',
  seedFingerprint: 'sha256:' + 'a'.repeat(64),
  admissionRef: 'ADMISSION_TEST_ONLY',
  countryId: 'COUNTRY_10',
  facilityId: 'OPEN-10-REFINED_FUEL',
  head: { worldVersion: '3', eventSequence: '3' },
};
const text = JSON.stringify({
  schemaVersion: 'postwar-industry-utility-original-v1',
  ...scope,
  head: undefined,
  power: { storageId: 'TEST_ONLY_STORAGE_NOT_REGISTERED' },
});
const row = {
  source_text: text,
  source_sha256: sha(text),
  source_ref: 'INDUSTRY_UTILITY_' + sha(text).toUpperCase(),
  world_version: '3',
  event_sequence: '3',
};
it('decodes its exact own-country transport packet without issuing authority', () => {
  expect(decodeRefinery21UtilityPacket(row, scope)).toEqual({
    sourceRef: row.source_ref,
    sourceSha256: row.source_sha256,
    storageId: 'TEST_ONLY_STORAGE_NOT_REGISTERED',
  });
});
it.each(['country', 'head', 'hash'] as const)(
  'rejects %s mismatch instead of C2 fallback',
  (kind) => {
    expect(() =>
      decodeRefinery21UtilityPacket(
        kind === 'hash' ? { ...row, source_sha256: '0'.repeat(64) } : row,
        kind === 'country'
          ? { ...scope, countryId: 'COUNTRY_02' }
          : kind === 'head'
            ? { ...scope, head: { worldVersion: '4', eventSequence: '4' } }
            : scope,
      ),
    ).toThrow();
  },
);
it('does not accept serialized source context as a genuine adopted refinery plan', () => {
  expect(() =>
    Reflect.apply(createPostwarRefinery21AssemblyCheck, undefined, [
      { source: {} },
    ]),
  ).toThrow('REFINERY_GENUINE_PINNED_CONTEXT_REQUIRED');
});
