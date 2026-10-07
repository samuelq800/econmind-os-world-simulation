// PREPARATION_ONLY_NOT_V09_2_STARTED. Real PG requires separate execution authority.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { snapshotStorageFixtureSql } from '../support/snapshot-storage-fixture.js';

const root = path.resolve(import.meta.dirname, '../..');
const describePostgres = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;
const manifestHash =
  '39efbcfdb28b0a5302fc2d8b7a6c55c8543539e265daaa272b065284d2d839bf';
const t0 = '2026-09-11T00:00:00.000000Z';
const t250 = '2026-09-11T00:00:00.250000Z';
const t500 = '2026-09-11T00:00:00.500000Z';
const t1 = '2026-09-11T00:00:01.000000Z';
const t2 = '2026-09-11T00:00:02.000000Z';
const t2250 = '2026-09-11T00:00:02.250000Z';
const t3500 = '2026-09-11T00:00:03.500000Z';

interface MigrationManifest {
  readonly migrations: readonly {
    readonly artifact_source_commit: string;
    readonly migration_id: string;
    readonly path: string;
    readonly release_order: number;
    readonly sha256: string;
  }[];
}

interface LeaseRow {
  world_id: string;
  holder_id: string;
  fencing_token: string;
  acquired_at_real: string;
  renewed_at_real: string;
  lease_expires_at_real: string;
}

// SQL renders exact UTC microseconds and bigint strings; pg never coerces them
// to Date/Number. This is an observation adapter, not a lease implementation.
const leaseColumns = `world_id, holder_id, fencing_token::text as fencing_token,
  to_char(acquired_at_real at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as acquired_at_real,
  to_char(renewed_at_real at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as renewed_at_real,
  to_char(lease_expires_at_real at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as lease_expires_at_real`;

let database: Pool | undefined;
let worldTables: readonly string[] = [];

function db(): Pool {
  if (!database)
    throw Error('Disposable renewal PostgreSQL pool not initialized');
  return database;
}

async function addWorld(world: string) {
  expect(world).toMatch(/^WORLD_PG_RENEW_[A-Z_]+$/u);
  await db().query('insert into world_v2.world_head(world_id) values ($1)', [
    world,
  ]);
}

async function acquire(
  world: string,
  holder: string,
  at: string,
  duration: string,
) {
  const result = await db().query<LeaseRow & { acquisition_kind: string }>(
    `select ${leaseColumns}, acquisition_kind
     from world_v2.acquire_world_writer_lease($1,$2,$3::timestamptz,$4::bigint)`,
    [world, holder, at, duration],
  );
  return result.rows;
}

async function lease(world: string) {
  return (
    await db().query<LeaseRow>(
      `select ${leaseColumns} from world_v2.world_writer_lease where world_id=$1`,
      [world],
    )
  ).rows;
}

function expectedLease(
  world: string,
  holder: string,
  fence: string,
  acquired: string,
  renewed: string,
  expiry: string,
): LeaseRow {
  return {
    world_id: world,
    holder_id: holder,
    fencing_token: fence,
    acquired_at_real: acquired,
    renewed_at_real: renewed,
    lease_expires_at_real: expiry,
  };
}

async function facts(world: string) {
  const rows: Record<string, readonly { row_text: string }[]> = {};
  for (const table of worldTables) {
    // Identifiers originate only from the real schema catalog, never user input.
    const quotedTable = `"${table.replaceAll('"', '""')}"`;
    rows[table] = (
      await db().query<{ row_text: string }>(
        `select to_jsonb(fact)::text as row_text
         from world_v2.${quotedTable} as fact where world_id=$1
         order by row_text collate "C"`,
        [world],
      )
    ).rows;
  }
  return rows;
}

async function guard(world: string, holder: string, fence: string, at: string) {
  const client = await db().connect();
  try {
    await client.query('begin');
    const result = await client.query<{
      world_version: string;
      event_sequence: string;
    }>(
      `select world_version::text, event_sequence::text
       from world_v2.assert_world_writer_commit_guard($1,$2,$3::bigint,0,$4::timestamptz)`,
      [world, holder, fence, at],
    );
    await client.query('commit');
    return result.rows;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

describePostgres(
  'V09 real PostgreSQL renewal supplement (fresh generation only)',
  () => {
    beforeAll(async () => {
      // The existing canonical guard MUST run before any connection or SQL.
      const environment = assertV09PostgresTestEnvironment();
      const manifestBytes = await readFile(
        path.join(root, 'database/migrations/manifest.json'),
      );
      expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(
        manifestHash,
      );
      const manifest = JSON.parse(
        manifestBytes.toString('utf8'),
      ) as MigrationManifest;
      expect(manifest.migrations).toHaveLength(22);
      // Check every artifact before applying any DDL, preserving manifest order.
      const artifacts = await Promise.all(
        manifest.migrations.map(async (migration, index) => {
          expect(migration.release_order).toBe(index + 1);
          const sql = await readFile(path.join(root, migration.path), 'utf8');
          expect(createHash('sha256').update(sql).digest('hex')).toBe(
            migration.sha256,
          );
          return sql;
        }),
      );
      database = new Pool({
        connectionString: environment.connectionString,
        max: 2,
      });
      const client = await db().connect();
      try {
        const existing = await client.query(
          `select schema_name from information_schema.schemata where schema_name='world_v2'`,
        );
        if (existing.rowCount !== 0)
          throw Error(
            'Renewal evidence requires a fresh disposable target without world_v2',
          );
        // Exact existing fixture precondition, not a new role/migration mechanism.
        await client.query(snapshotStorageFixtureSql);
        for (const [index, migration] of manifest.migrations.entries()) {
          await client.query(artifacts[index]!);
          await client.query(
            `insert into world_v2.schema_release
           (migration_id,artifact_sha256,source_repo_commit,release_order) values ($1,$2,$3,$4)`,
            [
              migration.migration_id,
              migration.sha256,
              migration.artifact_source_commit,
              migration.release_order,
            ],
          );
        }
        const tables = await client.query<{ table_name: string }>(
          `select c.table_name from information_schema.columns c
         join information_schema.tables t using (table_schema,table_name)
         where c.table_schema='world_v2' and c.column_name='world_id'
           and t.table_type='BASE TABLE' and c.table_name<>'world_writer_lease'
         order by c.table_name`,
        );
        worldTables = tables.rows.map((row) => row.table_name);
        expect(worldTables).toEqual(
          expect.arrayContaining([
            'world_head',
            'command_submission',
            'authoritative_event',
            'inventory_posting',
            'financial_posting_batch',
            'command_receipt',
            'notification_outbox',
          ]),
        );
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      await database?.end();
      database = undefined;
    });

    it('RENEWED preserves fence/acquisition, extends expiry and keeps the guard valid beyond old expiry', async () => {
      const world = 'WORLD_PG_RENEW_CURRENT';
      await addWorld(world);
      const before = await facts(world);
      const original = expectedLease(world, 'WORKER_A', '1', t0, t0, t1);
      expect(await acquire(world, 'WORKER_A', t0, '1000')).toEqual([
        { ...original, acquisition_kind: 'ACQUIRED' },
      ]);
      const renewed = expectedLease(world, 'WORKER_A', '1', t0, t250, t2250);
      expect(await acquire(world, 'WORKER_A', t250, '2000')).toEqual([
        { ...renewed, acquisition_kind: 'RENEWED' },
      ]);
      expect(await lease(world)).toEqual([renewed]);
      expect(
        await guard(world, 'WORKER_A', '1', '2026-09-11T00:00:01.500000Z'),
      ).toEqual([{ world_version: '0', event_sequence: '0' }]);
      const extended = expectedLease(world, 'WORKER_A', '1', t0, t500, t3500);
      expect(await acquire(world, 'WORKER_A', t500, '3000')).toEqual([
        { ...extended, acquisition_kind: 'RENEWED' },
      ]);
      expect(
        await guard(world, 'WORKER_A', '1', '2026-09-11T00:00:02.500000Z'),
      ).toEqual([{ world_version: '0', event_sequence: '0' }]);
      await expect(guard(world, 'WORKER_A', '1', t3500)).rejects.toMatchObject({
        message: 'WORLD_WRITER_LEASE_EXPIRED',
        code: '55000',
      });
      expect(await lease(world)).toEqual([extended]);
      expect(await facts(world)).toEqual(before);
    });

    it('rejects a competing holder while the renewed lease is active without changing any rows', async () => {
      const world = 'WORLD_PG_RENEW_COMPETITOR';
      await addWorld(world);
      await acquire(world, 'WORKER_A', t0, '1000');
      await acquire(world, 'WORKER_A', t250, '2000');
      const expected = [expectedLease(world, 'WORKER_A', '1', t0, t250, t2250)];
      expect(await lease(world)).toEqual(expected);
      const before = await facts(world);
      // Past original expiry but before renewed expiry: still held by A.
      await expect(
        acquire(world, 'WORKER_B', '2026-09-11T00:00:01.500000Z', '2000'),
      ).rejects.toMatchObject({
        message: 'WORLD_WRITER_LEASE_HELD',
        code: '55000',
      });
      expect(await lease(world)).toEqual(expected);
      expect(await facts(world)).toEqual(before);
    });

    it('rejects backward operational time and equal/shorter expiry, retaining the exact row and fence', async () => {
      const world = 'WORLD_PG_RENEW_INVALID';
      await addWorld(world);
      await acquire(world, 'WORKER_A', t0, '1000');
      await acquire(world, 'WORKER_A', t250, '2000');
      const expected = [expectedLease(world, 'WORKER_A', '1', t0, t250, t2250)];
      expect(await lease(world)).toEqual(expected);
      const before = await facts(world);
      for (const [at, duration, message] of [
        [
          '2026-09-11T00:00:00.200000Z',
          '5000',
          'lease renewal cannot move operational time backward',
        ],
        [
          t500,
          '1750',
          'lease renewal must extend the active expiry monotonically',
        ],
        [
          t500,
          '1000',
          'lease renewal must extend the active expiry monotonically',
        ],
      ] as const) {
        await expect(
          acquire(world, 'WORKER_A', at, duration),
        ).rejects.toMatchObject({
          message,
          code: '23514',
        });
        expect(await lease(world)).toEqual(expected);
        expect(await facts(world)).toEqual(before);
      }
    });

    it('treats expired same-holder acquisition as takeover +1 and rejects the former holder after takeover', async () => {
      const world = 'WORLD_PG_RENEW_TAKEOVER';
      await addWorld(world);
      const before = await facts(world);
      await acquire(world, 'WORKER_A', t0, '1000');
      await expect(guard(world, 'WORKER_A', '1', t1)).rejects.toMatchObject({
        message: 'WORLD_WRITER_LEASE_EXPIRED',
        code: '55000',
      });
      expect(await lease(world)).toEqual([
        expectedLease(world, 'WORKER_A', '1', t0, t0, t1),
      ]);
      expect(await facts(world)).toEqual(before);
      const reacquired = expectedLease(world, 'WORKER_A', '2', t1, t1, t2);
      expect(await acquire(world, 'WORKER_A', t1, '1000')).toEqual([
        { ...reacquired, acquisition_kind: 'TAKEN_OVER' },
      ]);
      expect(await lease(world)).toEqual([reacquired]);
      await expect(
        guard(world, 'WORKER_A', '1', '2026-09-11T00:00:01.100000Z'),
      ).rejects.toMatchObject({
        message: 'WORLD_WRITER_FENCE_STALE',
        code: '55000',
      });
      expect(await lease(world)).toEqual([reacquired]);
      expect(await facts(world)).toEqual(before);
      const takenOver = expectedLease(
        world,
        'WORKER_B',
        '3',
        t2,
        t2,
        '2026-09-11T00:00:03.000000Z',
      );
      expect(await acquire(world, 'WORKER_B', t2, '1000')).toEqual([
        { ...takenOver, acquisition_kind: 'TAKEN_OVER' },
      ]);
      await expect(
        acquire(world, 'WORKER_A', t2250, '5000'),
      ).rejects.toMatchObject({
        message: 'WORLD_WRITER_LEASE_HELD',
        code: '55000',
      });
      expect(await lease(world)).toEqual([takenOver]);
      expect(await facts(world)).toEqual(before);
      await expect(guard(world, 'WORKER_A', '2', t2250)).rejects.toMatchObject({
        message: 'WORLD_WRITER_FENCE_STALE',
        code: '55000',
      });
      expect(await lease(world)).toEqual([takenOver]);
      expect(await facts(world)).toEqual(before);
      expect(await guard(world, 'WORKER_B', '3', t2250)).toEqual([
        { world_version: '0', event_sequence: '0' },
      ]);
      expect(await lease(world)).toEqual([takenOver]);
      expect(await facts(world)).toEqual(before);
    });
  },
);
