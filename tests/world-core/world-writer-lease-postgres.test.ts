import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const testDatabaseConfigured = Boolean(process.env.V09_TEST_DATABASE_URL);
const describePostgres = testDatabaseConfigured ? describe : describe.skip;

interface MigrationManifest {
  readonly migrations: readonly {
    readonly artifact_source_commit: string;
    readonly migration_id: string;
    readonly path: string;
    readonly release_order: number;
    readonly sha256: string;
  }[];
}

type Queryable = Pool | PoolClient;

let database: Pool | undefined;

function currentDatabase(): Pool {
  if (database === undefined) {
    throw new Error('V09 disposable PostgreSQL pool is not initialized');
  }
  return database;
}

async function addWorld(world: string): Promise<void> {
  await currentDatabase().query(
    'insert into world_v2.world_head (world_id) values ($1)',
    [world],
  );
}

async function acquireLease(
  client: Queryable,
  world: string,
  holder: string,
  observedAtReal: string,
  durationMilliseconds: string,
) {
  return client.query(
    `select
       holder_id,
       fencing_token::text as fencing_token,
       acquisition_kind
     from world_v2.acquire_world_writer_lease($1, $2, $3::timestamptz, $4::bigint)`,
    [world, holder, observedAtReal, durationMilliseconds],
  );
}

async function assertCommitGuard(
  client: Queryable,
  world: string,
  holder: string,
  fence: string,
  expectedWorldVersion: string,
  observedAtReal: string,
) {
  return client.query(
    `select
       world_version::text as world_version,
       event_sequence::text as event_sequence
     from world_v2.assert_world_writer_commit_guard(
       $1,
       $2,
       $3::bigint,
       $4::bigint,
       $5::timestamptz
     )`,
    [world, holder, fence, expectedWorldVersion, observedAtReal],
  );
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

describePostgres('V09.1 real PostgreSQL lease/fencing evidence', () => {
  beforeAll(async () => {
    const environment = assertV09PostgresTestEnvironment();
    database = new Pool({
      connectionString: environment.connectionString,
      max: 6,
    });
    const client = await currentDatabase().connect();
    try {
      const preexisting = await client.query(
        `select schema_name
         from information_schema.schemata
         where schema_name = 'world_v2'`,
      );
      if (preexisting.rowCount !== 0) {
        throw new Error(
          'V09 PostgreSQL evidence requires a fresh disposable target with no world_v2 schema',
        );
      }

      const manifest = JSON.parse(
        await readFile(
          path.join(root, 'database/migrations/manifest.json'),
          'utf8',
        ),
      ) as MigrationManifest;
      for (const migration of manifest.migrations) {
        await client.query(
          await readFile(path.join(root, migration.path), 'utf8'),
        );
        await client.query(
          `insert into world_v2.schema_release
            (migration_id, artifact_sha256, source_repo_commit, release_order)
           values ($1, $2, $3, $4)`,
          [
            migration.migration_id,
            migration.sha256,
            migration.artifact_source_commit,
            migration.release_order,
          ],
        );
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await database?.end();
    database = undefined;
  });

  it('serializes two independent writer connections and keeps only one active holder', async () => {
    await addWorld('WORLD_PG_RACE');
    const firstWriter = await currentDatabase().connect();
    const competingWriter = await currentDatabase().connect();
    let firstTransactionOpen = false;
    try {
      await firstWriter.query('begin');
      firstTransactionOpen = true;
      await expect(
        acquireLease(
          firstWriter,
          'WORLD_PG_RACE',
          'WORKER_1',
          '2026-09-11T00:00:00.000Z',
          '5000',
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            acquisition_kind: 'ACQUIRED',
            fencing_token: '1',
            holder_id: 'WORKER_1',
          },
        ],
      });

      let competingWriterSettled = false;
      const competingAcquisition = acquireLease(
        competingWriter,
        'WORLD_PG_RACE',
        'WORKER_2',
        '2026-09-11T00:00:00.100Z',
        '5000',
      ).finally(() => {
        competingWriterSettled = true;
      });
      void competingAcquisition.catch(() => undefined);
      await delay(100);
      expect(competingWriterSettled).toBe(false);

      await firstWriter.query('commit');
      firstTransactionOpen = false;
      await expect(competingAcquisition).rejects.toThrow(
        'WORLD_WRITER_LEASE_HELD',
      );
    } finally {
      if (firstTransactionOpen) await firstWriter.query('rollback');
      firstWriter.release();
      competingWriter.release();
    }
  });

  it('rejects expired and stale writers inside the real transaction guard', async () => {
    await addWorld('WORLD_PG_FENCE');
    await acquireLease(
      currentDatabase(),
      'WORLD_PG_FENCE',
      'WORKER_1',
      '2026-09-11T00:00:00.000Z',
      '1000',
    );
    await acquireLease(
      currentDatabase(),
      'WORLD_PG_FENCE',
      'WORKER_2',
      '2026-09-11T00:00:01.000Z',
      '1000',
    );

    await expect(
      assertCommitGuard(
        currentDatabase(),
        'WORLD_PG_FENCE',
        'WORKER_1',
        '1',
        '0',
        '2026-09-11T00:00:01.000Z',
      ),
    ).rejects.toThrow('WORLD_WRITER_FENCE_STALE');
    await expect(
      assertCommitGuard(
        currentDatabase(),
        'WORLD_PG_FENCE',
        'WORKER_2',
        '2',
        '0',
        '2026-09-11T00:00:02.000Z',
      ),
    ).rejects.toThrow('WORLD_WRITER_LEASE_EXPIRED');
    await expect(
      assertCommitGuard(
        currentDatabase(),
        'WORLD_PG_FENCE',
        'WORKER_2',
        '2',
        '0',
        '2026-09-11T00:00:01.500Z',
      ),
    ).resolves.toMatchObject({
      rows: [{ event_sequence: '0', world_version: '0' }],
    });

    await currentDatabase().query(
      `update world_v2.world_head
       set world_version = 1
       where world_id = 'WORLD_PG_FENCE'`,
    );
    await expect(
      assertCommitGuard(
        currentDatabase(),
        'WORLD_PG_FENCE',
        'WORKER_2',
        '2',
        '0',
        '2026-09-11T00:00:01.500Z',
      ),
    ).rejects.toThrow('WORLD_VERSION_MISMATCH');
  });
});
