import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const READER_ROLE = 'world_v2_api_reader';
const LOGIN_ROLE = 'world_v2_api_login';
const SELECTED_BUNDLE = 'BALANCED_2026_09_28_V1';
const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;

let admin: Pool | undefined;
let login: Pool | undefined;
let allowedPaths: readonly string[] = [];
let allowedChunkPath = '';

function currentAdmin(): Pool {
  if (admin === undefined)
    throw new Error('WORLD_V2_FULL_READER_ADMIN_MISSING');
  return admin;
}

function currentLogin(): Pool {
  if (login === undefined)
    throw new Error('WORLD_V2_FULL_READER_LOGIN_MISSING');
  return login;
}

function storagePath(sourcePath: string): string {
  return `source/${Buffer.from(sourcePath, 'utf8').toString('hex')}`;
}

function roleConnectionString(connectionString: string, role: string): string {
  const value = new URL(connectionString);
  value.username = role;
  value.password = '';
  return value.toString();
}

async function dropRole(role: string): Promise<void> {
  await currentAdmin().query(
    `select pg_terminate_backend(pid)
       from pg_stat_activity
      where usename = $1 and pid <> pg_backend_pid()`,
    [role],
  );
  await currentAdmin().query(`drop role if exists ${role}`);
}

async function resetWorldV2(): Promise<void> {
  await currentAdmin().query('drop schema if exists world_v2 cascade');
  await dropRole(LOGIN_ROLE);
  await dropRole(READER_ROLE);
  const manifest = JSON.parse(
    await readFile(
      path.join(root, 'database/migrations/manifest.json'),
      'utf8',
    ),
  ) as { migrations: readonly { readonly path: string }[] };
  for (const migration of manifest.migrations) {
    await currentAdmin().query(
      await readFile(path.join(root, migration.path), 'utf8'),
    );
  }
}

async function frozenJsonSourcePaths(): Promise<readonly string[]> {
  const checksums = JSON.parse(
    await readFile(
      path.join(root, 'artifacts/world-balanced-candidate-v1/CHECKSUMS.json'),
      'utf8',
    ),
  ) as readonly { path: string }[];
  const sourcePaths = checksums
    .filter(
      (entry) => entry.path.startsWith('data/') && entry.path.endsWith('.json'),
    )
    .map((entry) => storagePath(entry.path));
  if (sourcePaths.length !== 34 || new Set(sourcePaths).size !== 34) {
    throw new Error('WORLD_V2_FULL_READER_FROZEN_JSON_PATHSET_INVALID');
  }
  return sourcePaths;
}

async function insertArtifact(
  artifactPath: string,
  content: string,
): Promise<void> {
  const hash = (
    await currentAdmin().query<{ hash: string }>(
      'select world_v2.authoritative_sha256($1) as hash',
      [content],
    )
  ).rows[0]?.hash;
  if (hash === undefined) throw new Error('WORLD_V2_FULL_READER_HASH_MISSING');
  await currentAdmin().query(
    `insert into world_v2.country_candidate_artifact
       (bundle_id, artifact_path, content_sha256, content_utf8)
     values ($1, $2, $3, $4)`,
    [SELECTED_BUNDLE, artifactPath, hash, content],
  );
}

async function seedCandidateRows(): Promise<void> {
  allowedPaths = await frozenJsonSourcePaths();
  allowedChunkPath = `${storagePath('data/geography.json')}.part0001`;
  await currentAdmin().query(
    `insert into world_v2.country_candidate_bundle
       (bundle_id, source_thread_id, package_manifest_sha256, source_status,
        activation_allowed)
     values ($1, 'selected-source', $2, 'IMPLEMENTED_UNVERIFIED_CANDIDATE', false)`,
    [SELECTED_BUNDLE, 'a'.repeat(64)],
  );
  for (const artifactPath of allowedPaths) {
    await insertArtifact(artifactPath, JSON.stringify({ artifactPath }));
  }
  await insertArtifact(allowedChunkPath, '[{"chunk":1}]');
  await insertArtifact(
    storagePath('data/assumptions.csv'),
    'country,value\nA,1\n',
  );
  await insertArtifact(
    `${storagePath('data/geography.json')}.part001`,
    '[{"invalidChunkSuffix":true}]',
  );
  await insertArtifact(storagePath('data/not-in-frozen-whitelist.json'), '[]');
}

async function queryAsReader(
  text: string,
  values: readonly unknown[] = [],
  readOnly = true,
) {
  const client = await currentLogin().connect();
  let transactionOpen = false;
  try {
    await client.query(readOnly ? 'begin read only' : 'begin');
    transactionOpen = true;
    await client.query(`set local role ${READER_ROLE}`);
    const result = await client.query(text, values);
    await client.query('commit');
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

postgresDescribe('World V2 full-data server reader role', () => {
  beforeAll(async () => {
    const environment = assertV09PostgresTestEnvironment();
    admin = new Pool({
      connectionString: environment.connectionString,
      max: 2,
    });
    await resetWorldV2();
    await seedCandidateRows();
    await currentAdmin().query(`alter role ${LOGIN_ROLE} login`);
    login = new Pool({
      connectionString: roleConnectionString(
        environment.connectionString,
        LOGIN_ROLE,
      ),
      max: 1,
    });
  }, 30_000);

  afterAll(async () => {
    await login?.end();
    login = undefined;
    if (admin !== undefined) {
      await currentAdmin().query('drop schema if exists world_v2 cascade');
      await dropRole(LOGIN_ROLE);
      await dropRole(READER_ROLE);
      await admin.end();
      admin = undefined;
    }
  });

  it('returns exactly all 34 frozen JSON paths and a four-digit chunk', async () => {
    await expect(
      currentLogin().query(
        'select artifact_path from world_v2.country_candidate_artifact',
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const result = await queryAsReader(
      `select artifact_path
         from world_v2.country_candidate_artifact
        where bundle_id = $1
        order by artifact_path`,
      [SELECTED_BUNDLE],
    );
    expect(result.rowCount).toBe(35);
    expect(result.rows.map((row) => row.artifact_path)).toEqual(
      [...allowedPaths, allowedChunkPath].sort(),
    );
  }, 30_000);

  it('denies CSV, malformed chunks, unknown paths, ungranted columns, and mutations', async () => {
    for (const artifactPath of [
      storagePath('data/assumptions.csv'),
      `${storagePath('data/geography.json')}.part001`,
      storagePath('data/not-in-frozen-whitelist.json'),
    ]) {
      await expect(
        queryAsReader(
          `select artifact_path from world_v2.country_candidate_artifact
            where bundle_id = $1 and artifact_path = $2`,
          [SELECTED_BUNDLE, artifactPath],
        ),
      ).resolves.toMatchObject({ rowCount: 0 });
    }
    await expect(
      queryAsReader(
        `select source_thread_id from world_v2.country_candidate_bundle
          where bundle_id = $1`,
        [SELECTED_BUNDLE],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      queryAsReader(
        `delete from world_v2.country_candidate_artifact
          where bundle_id = $1`,
        [SELECTED_BUNDLE],
        false,
      ),
    ).rejects.toMatchObject({ code: '42501' });
  }, 30_000);
});
