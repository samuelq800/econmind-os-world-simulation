import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from './migration-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifiedHandoffs = new WeakSet();

export const WORLD_V2_RELEASE_HANDOFF_VERSION =
  'WORLD_V2_MAIN_SITE_RELEASE_HANDOFF-1';
export const WORLD_V2_EXPECTED_TABLE_COUNT = 21;
export const WORLD_V2_RELEASE_OWNER = 'main-site-release-chain';
const INITIAL_RELEASE_MIGRATION_COUNT = 17;

export class WorldV2ReleaseHandoffError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WorldV2ReleaseHandoffError';
    this.code = code;
  }
}

function failure(code) {
  throw new WorldV2ReleaseHandoffError(code);
}

function expectedReleaseRow(migration) {
  return Object.freeze({
    artifact_sha256: migration.sha256,
    migration_id: migration.migration_id,
    release_order: migration.release_order,
    source_repo_commit: migration.artifact_source_commit,
  });
}

/**
 * Loads only manifest-listed immutable artifacts after their on-disk bytes and
 * Git-object provenance pass the existing release-chain validator. The caller
 * receives no connection settings and this module never contacts Supabase.
 */
export async function loadWorldV2ReleaseHandoff(repositoryRoot = root) {
  const manifestPath = path.join(
    repositoryRoot,
    'database/migrations/manifest.json',
  );
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const artifacts = new Map();
  for (const migration of manifest.migrations ?? []) {
    const artifactPath = path.resolve(repositoryRoot, migration.path);
    if (!artifactPath.startsWith(`${repositoryRoot}${path.sep}`)) {
      failure('WORLD_V2_HANDOFF_ARTIFACT_PATH_INVALID');
    }
    artifacts.set(migration.path, await readFile(artifactPath));
  }
  const provenance = await readMigrationGitProvenance(
    repositoryRoot,
    manifest.migrations,
  );
  const validation = validateMigrationManifest(manifest, artifacts, provenance);
  if (validation.status !== 'PASS') {
    failure('WORLD_V2_HANDOFF_MANIFEST_INVALID');
  }
  // This handoff is the immutable initial publication, not a rolling latest
  // release. Later migrations have separate, additive publication contracts.
  const initialMigrations = manifest.migrations.slice(
    0,
    INITIAL_RELEASE_MIGRATION_COUNT,
  );
  if (
    initialMigrations.length !== INITIAL_RELEASE_MIGRATION_COUNT ||
    initialMigrations.at(-1)?.migration_id !==
      '0017_world_v2_narrow_transfer_approval_reference'
  ) {
    failure('WORLD_V2_HANDOFF_MIGRATION_COUNT');
  }
  const migrations = initialMigrations.map((migration) =>
    Object.freeze({
      ...expectedReleaseRow(migration),
      artifactPath: migration.path,
      sql: artifacts.get(migration.path).toString('utf8'),
    }),
  );
  if (migrations.length !== INITIAL_RELEASE_MIGRATION_COUNT)
    failure('WORLD_V2_HANDOFF_MIGRATION_COUNT');
  const handoff = Object.freeze({
    version: WORLD_V2_RELEASE_HANDOFF_VERSION,
    namespace: manifest.namespace,
    productionPublisher: manifest.production_publisher,
    expectedTableCount: WORLD_V2_EXPECTED_TABLE_COUNT,
    migrations: Object.freeze(migrations),
  });
  verifiedHandoffs.add(handoff);
  return handoff;
}

function rows(result) {
  if (!result || !Array.isArray(result.rows)) {
    failure('WORLD_V2_HANDOFF_QUERY_RESULT_INVALID');
  }
  return result.rows;
}

async function requireAbsentNamespace(client, namespace) {
  const result = await client.query(
    'select to_regnamespace($1)::text as namespace',
    [namespace],
  );
  const resultRows = rows(result);
  if (resultRows.length !== 1 || resultRows[0]?.namespace !== null) {
    failure('WORLD_V2_NAMESPACE_MUST_BE_ABSENT');
  }
}

async function verifyReleaseLedger(client, handoff) {
  const release = rows(
    await client.query(
      `select migration_id, artifact_sha256, source_repo_commit, release_order
         from world_v2.schema_release
        order by release_order`,
    ),
  );
  if (
    release.length !== handoff.migrations.length ||
    release.some((row, index) => {
      const expected = handoff.migrations[index];
      return (
        row?.migration_id !== expected.migration_id ||
        row?.artifact_sha256 !== expected.artifact_sha256 ||
        row?.source_repo_commit !== expected.source_repo_commit ||
        Number(row?.release_order) !== expected.release_order
      );
    })
  ) {
    failure('WORLD_V2_SCHEMA_RELEASE_LEDGER_MISMATCH');
  }
  const tableResult = rows(
    await client.query(
      `select count(*)::text as table_count
         from information_schema.tables
        where table_schema = $1 and table_type = 'BASE TABLE'`,
      [handoff.namespace],
    ),
  );
  if (
    tableResult.length !== 1 ||
    Number(tableResult[0]?.table_count) !== handoff.expectedTableCount
  ) {
    failure('WORLD_V2_SCHEMA_TABLE_COUNT_MISMATCH');
  }
  return Object.freeze({
    migrationCount: release.length,
    tableCount: handoff.expectedTableCount,
  });
}

/**
 * This is deliberately a client-injected main-site-release-chain primitive,
 * not a World repository command. Its sole state change is the reviewed
 * `world_v2` chain and corresponding schema_release ledger in one transaction.
 */
export async function applyWorldV2ReleaseHandoff(client, handoff) {
  if (
    !verifiedHandoffs.has(handoff) ||
    handoff?.version !== WORLD_V2_RELEASE_HANDOFF_VERSION ||
    handoff?.namespace !== 'world_v2' ||
    handoff?.productionPublisher !== WORLD_V2_RELEASE_OWNER ||
    !Array.isArray(handoff?.migrations) ||
    handoff.migrations.length !== INITIAL_RELEASE_MIGRATION_COUNT
  ) {
    failure('WORLD_V2_HANDOFF_INVALID');
  }
  let transactionOpen = false;
  try {
    await client.query('begin');
    transactionOpen = true;
    await requireAbsentNamespace(client, handoff.namespace);
    for (const migration of handoff.migrations) {
      await client.query(migration.sql);
      await client.query(
        `insert into world_v2.schema_release
           (migration_id, artifact_sha256, source_repo_commit, release_order)
         values ($1, $2, $3, $4)`,
        [
          migration.migration_id,
          migration.artifact_sha256,
          migration.source_repo_commit,
          migration.release_order,
        ],
      );
    }
    const summary = await verifyReleaseLedger(client, handoff);
    await client.query('commit');
    transactionOpen = false;
    return summary;
  } catch (error) {
    if (transactionOpen) await client.query('rollback').catch(() => undefined);
    throw error;
  }
}
