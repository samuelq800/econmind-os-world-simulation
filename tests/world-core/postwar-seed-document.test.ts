import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalSerialize,
  createOpeningSource,
  createOpeningSeed,
  OPENING_SOURCE_SCHEMA_VERSION,
  OPENING_SEED_SCHEMA_VERSION,
  CURRENT_REPLAY_BINDING,
  openingSourceId,
  openingSeedId,
  worldId,
  parseOpeningSeed,
} from '@econmind/core';
import {
  encodePostwarSeedDocument,
  decodePostwarSeedDocument,
} from '../../apps/world-worker/src/preparation/postwar-seed-document.js';
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const seed = createOpeningSeed(
  {
    schemaVersion: OPENING_SEED_SCHEMA_VERSION,
    seedId: openingSeedId('SEED_TEST_ONLY_POSTWAR_TRANSPORT'),
    worldId: worldId('WORLD_TEST_ONLY_POSTWAR_TRANSPORT'),
    openingWorldVersion: '0',
    replayBinding: CURRENT_REPLAY_BINDING,
    inventoryEntries: [],
    financialBatches: [],
    sources: [
      createOpeningSource(
        {
          schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
          sourceId: openingSourceId('SOURCE_TEST_ONLY_POSTWAR_TRANSPORT'),
          sourceKind: 'TEST_FIXTURE',
          locator: 'fixture://TEST_ONLY/transport',
          sourceVersion: 'TEST_ONLY',
          payload: { data: 'TEST_ONLY_REPEAT_'.repeat(5000) },
        },
        sha,
      ),
    ],
  },
  sha,
);
describe('bounded postwar seed transport without new authority', () => {
  it('reproduces exact Core identity and deterministic compressed bytes', () => {
    const packed = encodePostwarSeedDocument(seed);
    expect(packed).toBe(encodePostwarSeedDocument(seed));
    expect(packed.length).toBeLessThan(canonicalSerialize(seed).length);
    expect(parseOpeningSeed(decodePostwarSeedDocument(packed), sha)).toEqual(
      seed,
    );
  });
  it.each(['decodedSha256', 'decodedBytes', 'payload'])(
    'rejects changed %s instead of trusting an envelope label',
    (field) => {
      const packed = JSON.parse(encodePostwarSeedDocument(seed)) as Record<
        string,
        string
      >;
      packed[field] =
        field === 'decodedSha256'
          ? '0'.repeat(64)
          : field === 'decodedBytes'
            ? '1'
            : 'QQ==';
      expect(() => decodePostwarSeedDocument(JSON.stringify(packed))).toThrow();
    },
  );
  it('rejects excessive decoded size before inflation and rejects unknown envelope fields', () => {
    const packed = JSON.parse(encodePostwarSeedDocument(seed)) as Record<
      string,
      string
    >;
    packed.decodedBytes = '134217729';
    expect(() => decodePostwarSeedDocument(JSON.stringify(packed))).toThrow(
      'INVALID',
    );
    const unknown = JSON.parse(encodePostwarSeedDocument(seed)) as Record<
      string,
      string
    >;
    unknown.approved = 'true';
    expect(() => decodePostwarSeedDocument(JSON.stringify(unknown))).toThrow(
      'INVALID',
    );
  });
});
