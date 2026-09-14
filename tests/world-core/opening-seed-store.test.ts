import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  canonicalSerialize,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
const root = path.resolve(import.meta.dirname, '../..');

async function database(): Promise<V09AtomicTestDatabase> {
  const value = createPGliteV09AtomicTestDatabase();
  for (const migration of [
    '0001_world_v2_namespace.sql',
    '0002_world_v2_command_event_ledger.sql',
    '0016_world_v2_opening_seed.sql',
  ]) {
    await value.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  return value;
}

function seed(sourceKind: 'AUTHORITATIVE_DATASET' | 'TEST_FIXTURE') {
  const id = worldId('WORLD_OPENING_STORE');
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId('SOURCE_OPENING_STORE'),
      sourceKind,
      locator: 'dataset://opening/world-opening-store',
      sourceVersion: '2026-09-14',
      payload: { dataset: 'opening-world-store-v1' },
    },
    sha256Hex,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId('SEED_OPENING_STORE'),
      worldId: id,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha256Hex,
  );
}

describe('V10.5 immutable server opening seed store', () => {
  it('bootstraps exactly once at WorldVersion zero and rehydrates canonical lineage', async () => {
    const value = await database();
    try {
      const opening = seed('AUTHORITATIVE_DATASET');
      await value.query(
        `insert into world_v2.world_head (world_id, world_version, event_sequence)
         values ($1, 0, 0)`,
        [opening.worldId],
      );
      const store = new WorldOpeningSeedStore({
        database: value,
        sha256Hex,
      });
      expect(
        await store.bootstrap({
          seed: opening,
          bootstrappedAtReal: '2026-09-14T01:00:00.000Z',
        }),
      ).toBe('BOOTSTRAPPED');
      expect(canonicalSerialize(await store.load(opening.worldId))).toBe(
        canonicalSerialize(opening),
      );
      expect(
        await store.bootstrap({
          seed: opening,
          bootstrappedAtReal: '2026-09-14T01:00:01.000Z',
        }),
      ).toBe('ALREADY_BOOTSTRAPPED');
      await expect(
        value.query(
          `update world_v2.opening_seed
              set seed_id = 'REWRITTEN'
            where world_id = $1`,
          [opening.worldId],
        ),
      ).rejects.toThrow('authoritative World history is append-only');
    } finally {
      await value.close();
    }
  });

  it('rejects test-fixture provenance before any server opening row is written', async () => {
    const value = await database();
    try {
      const opening = seed('TEST_FIXTURE');
      await value.query(
        `insert into world_v2.world_head (world_id, world_version, event_sequence)
         values ($1, 0, 0)`,
        [opening.worldId],
      );
      const store = new WorldOpeningSeedStore({
        database: value,
        sha256Hex,
      });
      await expect(
        store.bootstrap({
          seed: opening,
          bootstrappedAtReal: '2026-09-14T01:00:00.000Z',
        }),
      ).rejects.toThrow('TEST_FIXTURE');
      const persisted = await value.query(
        'select count(*)::text as count from world_v2.opening_seed',
      );
      expect(persisted.rows[0]).toMatchObject({ count: '0' });
    } finally {
      await value.close();
    }
  });
});
