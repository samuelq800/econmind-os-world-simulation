import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CURRENT_REPLAY_BINDING,
  OPENING_SEED_SCHEMA_VERSION,
  OPENING_SOURCE_SCHEMA_VERSION,
  createOpeningSeed,
  createOpeningSource,
  openingSeedId,
  openingSourceId,
  worldId,
} from '@econmind/core';
import { WorldOpeningSeedStore } from '../../apps/world-worker/src/persistence/opening-seed-store.js';
import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { WorldOpeningBootstrapReadback } from '../../apps/world-worker/src/persistence/world-opening-bootstrap-readback.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const root = path.resolve(import.meta.dirname, '../..');
const sha256Hex = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const WORLD = worldId('WORLD_F_OFFICIAL_OPENING_NATIVE');

function testOnlySeed(suffix: string) {
  const source = createOpeningSource(
    {
      schemaVersion: OPENING_SOURCE_SCHEMA_VERSION,
      sourceId: openingSourceId(`SOURCE_F_OPENING_NATIVE_${suffix}`),
      sourceKind: 'AUTHORITATIVE_DATASET',
      locator: `dataset://test-only/native-opening/${suffix}`,
      sourceVersion: 'TEST_ONLY_NOT_OFFICIAL',
      payload: { testOnly: true, suffix },
    },
    sha256Hex,
  );
  return createOpeningSeed(
    {
      schemaVersion: OPENING_SEED_SCHEMA_VERSION,
      seedId: openingSeedId(`SEED_F_OPENING_NATIVE_${suffix}`),
      worldId: WORLD,
      openingWorldVersion: '0',
      replayBinding: CURRENT_REPLAY_BINDING,
      sources: [source],
      inventoryEntries: [],
      financialBatches: [],
    },
    sha256Hex,
  );
}

postgresDescribe(
  'F official opening plumbing / isolated native PostgreSQL',
  () => {
    let pool: Pool;
    let database: PostgresSqlDatabase;

    beforeAll(async () => {
      const target = assertV09PostgresTestEnvironment(process.env);
      pool = new Pool({
        connectionString: target.connectionString,
        max: 4,
        options: '-c lock_timeout=2000 -c statement_timeout=10000',
      });
      database = new PostgresSqlDatabase(pool);
      const existing = await database.query<{ name: string | null }>(
        "select to_regclass('world_v2.opening_seed')::text as name",
      );
      if (existing.rows[0]?.name !== null) {
        throw new Error('F_OPENING_REQUIRES_EMPTY_DISPOSABLE_DATABASE');
      }
      const directory = path.join(root, 'database/migrations/artifacts');
      const migrations = (await readdir(directory))
        .filter((name) => /^00(?:0[1-9]|1[0-9])_.*\.sql$/u.test(name))
        .sort();
      if (migrations.length !== 19) {
        throw new Error('F_OPENING_EXPECTS_19_APPROVED_MIGRATIONS');
      }
      for (const migration of migrations) {
        await pool.query(
          await readFile(path.join(directory, migration), 'utf8'),
        );
      }
      await database.query(
        'insert into world_v2.world_head (world_id) values ($1)',
        [WORLD],
      );
    }, 60_000);

    afterAll(async () => {
      await pool?.end();
    });

    it('accepts one immutable opening across concurrent exact retries, then reads Core lineage', async () => {
      const seed = testOnlySeed('ONE');
      const service = new WorldOpeningBootstrapReadback({
        database,
        sha256Hex,
      });
      const attempts = await Promise.all(
        Array.from({ length: 2 }, (_, index) =>
          service.bootstrapAndReadback({
            seed,
            bootstrappedAtReal: `2026-09-30T00:00:0${index}.000Z`,
          }),
        ),
      );
      expect(attempts.map((value) => value.disposition).sort()).toEqual([
        'ALREADY_BOOTSTRAPPED',
        'BOOTSTRAPPED',
      ]);
      for (const attempt of attempts) {
        expect(attempt.readback).toMatchObject({
          worldId: WORLD,
          seedFingerprint: seed.fingerprint,
          worldVersion: '0',
          eventSequence: '0',
        });
      }
      const count = await database.query<{ count: string }>(
        'select count(*)::text as count from world_v2.opening_seed where world_id = $1',
        [WORLD],
      );
      expect(count.rows[0]?.count).toBe('1');
    }, 15_000);

    it('keeps exact retry a no-op after head advances and rejects conflicting seed', async () => {
      const store = new WorldOpeningSeedStore({ database, sha256Hex });
      const original = testOnlySeed('ONE');
      await database.query(
        'update world_v2.world_head set world_version = 1, event_sequence = 1 where world_id = $1',
        [WORLD],
      );
      expect(
        await store.bootstrap({
          seed: original,
          bootstrappedAtReal: '2026-09-30T00:00:03.000Z',
        }),
      ).toBe('ALREADY_BOOTSTRAPPED');
      await expect(
        store.bootstrap({
          seed: testOnlySeed('TWO'),
          bootstrappedAtReal: '2026-09-30T00:00:04.000Z',
        }),
      ).rejects.toMatchObject({
        outcome: 'ROLLED_BACK',
        cause: { code: 'OPENING_SEED_INVALID' },
      });
      const persisted = await database.query<{ seed_id: string }>(
        'select seed_id from world_v2.opening_seed where world_id = $1',
        [WORLD],
      );
      expect(persisted.rows).toEqual([{ seed_id: original.seedId }]);
    }, 15_000);
  },
);
