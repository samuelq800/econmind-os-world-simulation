import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import {
  WORLD_V2_MIGRATION_ROOT,
  readMigrationGitProvenance,
  validateMigrationManifest,
} from './migration-policy.mjs';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const confirmation = 'EXECUTE_DISPOSABLE_V30_PG_RESTORE';
const name = /^econmind_v30_(?:source|restored)_[0-9a-f]{8}$/;
const sha = /^[0-9a-f]{40}$/;
const pgDump = '/usr/lib/postgresql/16/bin/pg_dump';
const pgRestore = '/usr/lib/postgresql/16/bin/pg_restore';

function invalid(message) {
  throw new Error(`Unsafe V30 disposable restore: ${message}`);
}

/** Refuse every runtime/remote target before opening any connection. */
export function assertV30DisposableRestoreTarget(environment = process.env) {
  if (
    environment.ECONMIND_ENV !== 'ci' ||
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.V30_DISPOSABLE_RESTORE_CONFIRMATION !== confirmation ||
    environment.DATABASE_URL !== undefined ||
    environment.WORLD_DATABASE_URL !== undefined ||
    environment.SUPABASE_DB_URL !== undefined ||
    !sha.test(environment.GITHUB_SHA ?? '')
  ) {
    invalid(
      'CI identity, explicit confirmation, or runtime isolation is missing',
    );
  }
  const raw = environment.V30_DISPOSABLE_POSTGRES_ADMIN_URL;
  if (typeof raw !== 'string') invalid('admin URL is missing');
  let url;
  try {
    url = new URL(raw);
  } catch {
    invalid('admin URL is malformed');
  }
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5432' ||
    url.pathname !== '/postgres' ||
    url.username !== 'postgres' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    invalid(
      'only the exact credential-free loopback PostgreSQL service is allowed',
    );
  }
  return Object.freeze({ adminUrl: raw, codeSha: environment.GITHUB_SHA });
}

function databaseUrl(adminUrl, database) {
  if (!name.test(database)) invalid('generated database name is invalid');
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function client(url, operation) {
  const connection = new Client({ connectionString: url });
  await connection.connect();
  try {
    return await operation(connection);
  } finally {
    await connection.end();
  }
}

async function createDatabase(adminUrl, database) {
  if (!name.test(database)) invalid('generated database name is invalid');
  await client(adminUrl, (connection) =>
    connection.query(`create database "${database}" template template0`),
  );
}

/** Validate before any database I/O; copy bytes so later file edits cannot apply. */
export function prepareV30RestoreMigrations(manifest, artifacts, provenance) {
  const result = validateMigrationManifest(manifest, artifacts, provenance);
  if (result.status !== 'PASS') {
    invalid(
      `migration manifest validation failed: ${result.violations.join(', ')}`,
    );
  }
  return Object.freeze(
    manifest.migrations.map((migration) =>
      Object.freeze({
        file: path.posix.basename(migration.path),
        sha256: migration.sha256,
        sql: artifacts.get(migration.path).toString('utf8'),
      }),
    ),
  );
}

export async function loadV30RestoreMigrations() {
  const manifest = JSON.parse(
    await readFile(
      path.join(root, 'database/migrations/manifest.json'),
      'utf8',
    ),
  );
  if (!Array.isArray(manifest?.migrations))
    invalid('migration list is missing');
  const artifacts = new Map();
  for (const migration of manifest.migrations) {
    const artifactPath = migration?.path;
    if (
      typeof artifactPath !== 'string' ||
      path.posix.dirname(artifactPath) !== WORLD_V2_MIGRATION_ROOT ||
      path.posix.normalize(artifactPath) !== artifactPath ||
      !artifactPath.endsWith('.sql')
    ) {
      invalid('migration path is outside the canonical artifact directory');
    }
    const absolutePath = path.join(root, artifactPath);
    if (!(await lstat(absolutePath)).isFile())
      invalid('migration is not a regular file');
    artifacts.set(artifactPath, await readFile(absolutePath));
  }
  const provenance = await readMigrationGitProvenance(
    root,
    manifest.migrations,
  );
  return prepareV30RestoreMigrations(manifest, artifacts, provenance);
}

async function applyCheckedInMigrations(url, migrations) {
  await client(url, async (connection) => {
    for (const migration of migrations) {
      await connection.query(migration.sql);
    }
  });
}

async function insertWorldAndCommand(url, suffix) {
  const world = `WORLD_V30_RESTORE_${suffix}`;
  const command = `COMMAND_V30_RESTORE_${suffix}`;
  await client(url, async (connection) => {
    await connection.query(
      'insert into world_v2.world_head (world_id) values ($1)',
      [world],
    );
    await connection.query(
      `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
       values ($1, $2, $3, 'V30_DISPOSABLE_RESTORE', 'command-v1', '{}', $4, $5,
               '00000000-0000-4000-8000-000000000001', 'ACTOR_V30_RESTORE',
               'COUNTRY_V30_RESTORE', null, 0, 0, $6, now())`,
      [
        world,
        command,
        `IDEMPOTENCY_V30_RESTORE_${suffix}`,
        `sha256:${'a'.repeat(64)}`,
        `sha256:${'b'.repeat(64)}`,
        `CORRELATION_V30_RESTORE_${suffix}`,
      ],
    );
  });
}

async function durableSnapshot(url) {
  return client(url, async (connection) => {
    const heads = await connection.query(
      `select row_to_json(head)::text as durable_row
         from (select * from world_v2.world_head order by world_id) head`,
    );
    const commands = await connection.query(
      `select row_to_json(command)::text as durable_row
         from (select * from world_v2.command_submission
               order by world_id, command_id) command`,
    );
    const rows = { heads: heads.rows, commands: commands.rows };
    return {
      rows,
      sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    };
  });
}

async function writeEvidence(outputPath, runnerTemp, evidence) {
  if (
    typeof runnerTemp !== 'string' ||
    path.dirname(outputPath) !== runnerTemp ||
    path.basename(outputPath) !== 'v30-disposable-restore-evidence.json'
  ) {
    invalid('evidence output must be the fixed runner-temporary artifact');
  }
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

export async function runV30DisposableRestore(environment = process.env) {
  const target = assertV30DisposableRestoreTarget(environment);
  const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: root });
  if (stdout.trim() !== target.codeSha)
    invalid('checkout does not match GitHub SHA');
  const preparedMigrations = await loadV30RestoreMigrations();
  const suffix = randomBytes(4).toString('hex');
  const sourceName = `econmind_v30_source_${suffix}`;
  const restoredName = `econmind_v30_restored_${suffix}`;
  const sourceUrl = databaseUrl(target.adminUrl, sourceName);
  const restoredUrl = databaseUrl(target.adminUrl, restoredName);
  const tempDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'econmind-v30-restore-'),
  );
  const backupPath = path.join(tempDirectory, 'world-v2.dump');
  await createDatabase(target.adminUrl, sourceName);
  await createDatabase(target.adminUrl, restoredName);
  await applyCheckedInMigrations(sourceUrl, preparedMigrations);
  const migrations = preparedMigrations.map(({ file, sha256 }) => ({
    file,
    sha256,
  }));
  await insertWorldAndCommand(sourceUrl, 'BEFORE_BACKUP');
  const recoveryPointAt = new Date().toISOString();
  const expected = await durableSnapshot(sourceUrl);
  await exec(pgDump, [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file',
    backupPath,
    '--dbname',
    sourceUrl,
  ]);
  const backupSha256 = createHash('sha256')
    .update(await readFile(backupPath))
    .digest('hex');
  await insertWorldAndCommand(sourceUrl, 'AFTER_BACKUP');
  const incidentAt = new Date().toISOString();
  const laterSource = await durableSnapshot(sourceUrl);
  if (laterSource.sha256 === expected.sha256)
    invalid('post-backup source change was not observed');
  const restoreStartedAt = performance.now();
  await exec(pgRestore, [
    '--exit-on-error',
    '--no-owner',
    '--no-acl',
    '--dbname',
    restoredUrl,
    backupPath,
  ]);
  const actual = await durableSnapshot(restoredUrl);
  const restoredAt = new Date().toISOString();
  if (
    actual.sha256 !== expected.sha256 ||
    actual.rows.heads.length !== 1 ||
    actual.rows.commands.length !== 1
  ) {
    invalid(
      'restored durable World/Command snapshot does not match the backup point',
    );
  }
  const evidence = {
    status: 'DISPOSABLE_RESTORE_EVIDENCED_NOT_V30_ACCEPTANCE',
    target: 'GITHUB_ACTIONS_LOOPBACK_POSTGRESQL_16',
    codeSha: target.codeSha,
    migrationCount: migrations.length,
    migrationSetSha256: createHash('sha256')
      .update(JSON.stringify(migrations))
      .digest('hex'),
    backupSha256,
    backupPointSnapshotSha256: expected.sha256,
    laterSourceSnapshotSha256: laterSource.sha256,
    restoredSnapshotSha256: actual.sha256,
    restoredWorldRows: actual.rows.heads.length,
    restoredCommandRows: actual.rows.commands.length,
    rpoDiagnosticMs: Date.parse(incidentAt) - Date.parse(recoveryPointAt),
    rtoDiagnosticMs: Date.parse(restoredAt) - Date.parse(incidentAt),
    restoreOperationMs: Math.round(performance.now() - restoreStartedAt),
    eventPostingReplay: 'NOT_RUN',
    workerCrashFencing: 'NOT_RUN',
    productionBackupPolicy: 'NOT_RUN',
    gateB: 'PENDING',
  };
  if (typeof environment.V30_DISPOSABLE_RESTORE_OUTPUT === 'string') {
    await writeEvidence(
      environment.V30_DISPOSABLE_RESTORE_OUTPUT,
      environment.RUNNER_TEMP,
      evidence,
    );
  }
  return evidence;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runV30DisposableRestore(), null, 2));
  } catch (error) {
    console.error('V30 disposable restore diagnostic failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
      code:
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : 'UNKNOWN',
    });
    process.exitCode = 1;
  }
}
