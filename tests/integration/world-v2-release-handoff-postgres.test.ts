import { createHash } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  applyWorldV2ReleaseHandoff,
  loadWorldV2ReleaseHandoff,
} from '../../scripts/world-v2-release-handoff.mjs';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;

let pool: Pool | undefined;
let handoff: Awaited<ReturnType<typeof loadWorldV2ReleaseHandoff>> | undefined;

function currentPool(): Pool {
  if (pool === undefined) throw new Error('WORLD_V2_RELEASE_TEST_POOL_MISSING');
  return pool;
}

function currentHandoff(): Awaited<
  ReturnType<typeof loadWorldV2ReleaseHandoff>
> {
  if (handoff === undefined) {
    throw new Error('WORLD_V2_RELEASE_TEST_HANDOFF_MISSING');
  }
  return handoff;
}

async function legacySentinelFingerprint(): Promise<string> {
  const result = await currentPool().query(
    `select jsonb_build_object(
       'columns', (
         select jsonb_agg(jsonb_build_object(
           'name', a.attname,
           'notNull', a.attnotnull,
           'type', format_type(a.atttypid, a.atttypmod)
         ) order by a.attnum)
         from pg_attribute a
         where a.attrelid = 'public.world_v2_release_test_sentinel'::regclass
           and a.attnum > 0 and not a.attisdropped
       ),
       'rows', (
         select jsonb_agg(to_jsonb(s) order by s.id)
         from public.world_v2_release_test_sentinel s
       )
     )::text as snapshot`,
  );
  return createHash('sha256')
    .update(result.rows[0]?.snapshot ?? '', 'utf8')
    .digest('hex');
}

async function resetDatabase(): Promise<void> {
  await currentPool().query('drop schema if exists world_v2 cascade');
  await currentPool().query(
    'drop table if exists public.world_v2_release_test_sentinel',
  );
  await currentPool().query(
    `create table public.world_v2_release_test_sentinel (
       id integer primary key,
       label text not null
     )`,
  );
  await currentPool().query(
    `insert into public.world_v2_release_test_sentinel (id, label)
     values (1, 'fixture-before-release'), (2, 'fixture-stable')`,
  );
}

postgresDescribe(
  'World V2 main-site release handoff / native PostgreSQL',
  () => {
    beforeAll(async () => {
      const target = assertV09PostgresTestEnvironment(process.env);
      pool = new Pool({
        connectionString: target.connectionString,
        max: 2,
        options: '-c lock_timeout=2000 -c statement_timeout=10000',
      });
      handoff = await loadWorldV2ReleaseHandoff();
    }, 30_000);

    beforeEach(async () => {
      await resetDatabase();
    });

    afterAll(async () => {
      if (pool !== undefined) {
        await currentPool().query('drop schema if exists world_v2 cascade');
        await currentPool().query(
          'drop table if exists public.world_v2_release_test_sentinel',
        );
        await pool.end();
        pool = undefined;
      }
    });

    it('applies all immutable artifacts atomically and leaves a pre-existing legacy sentinel unchanged', async () => {
      const before = await legacySentinelFingerprint();
      await expect(
        applyWorldV2ReleaseHandoff(currentPool(), currentHandoff()),
      ).resolves.toEqual({ migrationCount: 17, tableCount: 21 });
      await expect(legacySentinelFingerprint()).resolves.toBe(before);
      await expect(
        currentPool().query(
          `select migration_id, artifact_sha256, source_repo_commit, release_order
           from world_v2.schema_release
          order by release_order`,
        ),
      ).resolves.toMatchObject({ rowCount: 17 });
      await expect(
        currentPool().query(
          `select count(*)::text as count
           from information_schema.tables
          where table_schema = 'world_v2' and table_type = 'BASE TABLE'`,
        ),
      ).resolves.toMatchObject({ rows: [{ count: '21' }] });
    }, 30_000);

    it('fails before DDL when world_v2 already exists', async () => {
      await currentPool().query('create schema world_v2');
      await expect(
        applyWorldV2ReleaseHandoff(currentPool(), currentHandoff()),
      ).rejects.toThrow('WORLD_V2_NAMESPACE_MUST_BE_ABSENT');
      await expect(
        currentPool().query(
          "select to_regnamespace('world_v2')::text as namespace",
        ),
      ).resolves.toMatchObject({ rows: [{ namespace: 'world_v2' }] });
    });

    it('refuses a caller-constructed release plan before it can issue DDL', async () => {
      await expect(
        applyWorldV2ReleaseHandoff(
          currentPool(),
          structuredClone(currentHandoff()),
        ),
      ).rejects.toThrow('WORLD_V2_HANDOFF_INVALID');
      await expect(
        currentPool().query(
          "select to_regnamespace('world_v2')::text as namespace",
        ),
      ).resolves.toMatchObject({ rows: [{ namespace: null }] });
    });

    it('refuses a spread copy whose SQL was replaced before it can issue DDL', async () => {
      const valid = currentHandoff();
      const forged = {
        ...valid,
        migrations: valid.migrations.map((migration, index) =>
          index === 0 ? { ...migration, sql: 'select 1' } : migration,
        ),
      };
      let queryCalls = 0;
      const recordingClient = {
        query: async () => {
          queryCalls += 1;
          throw new Error('FORGED_HANDOFF_REACHED_DATABASE');
        },
      };
      await expect(
        applyWorldV2ReleaseHandoff(recordingClient, forged),
      ).rejects.toThrow('WORLD_V2_HANDOFF_INVALID');
      expect(queryCalls).toBe(0);
      await expect(
        currentPool().query(
          "select to_regnamespace('world_v2')::text as namespace",
        ),
      ).resolves.toMatchObject({ rows: [{ namespace: null }] });
    });

    it('rolls back every prior artifact when an execution failure occurs', async () => {
      const before = await legacySentinelFingerprint();
      const failureSql = currentHandoff().migrations[4]?.sql;
      const failingClient = {
        query: async (text: string, values?: readonly unknown[]) => {
          if (text === failureSql)
            throw new Error('DISPOSABLE_RELEASE_FAILURE');
          return currentPool().query(text, values);
        },
      };
      await expect(
        applyWorldV2ReleaseHandoff(failingClient, currentHandoff()),
      ).rejects.toThrow('DISPOSABLE_RELEASE_FAILURE');
      await expect(
        currentPool().query(
          "select to_regnamespace('world_v2')::text as namespace",
        ),
      ).resolves.toMatchObject({ rows: [{ namespace: null }] });
      await expect(legacySentinelFingerprint()).resolves.toBe(before);
    }, 30_000);
  },
);
