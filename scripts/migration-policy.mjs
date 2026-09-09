import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

export const WORLD_V2_NAMESPACE = 'world_v2';
export const WORLD_V2_MIGRATION_ROOT = 'database/migrations/artifacts';
export const PRODUCTION_PUBLISHER = 'main-site-release-chain';

const MIGRATION_ID = /^\d{4}_[a-z][a-z0-9_]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const FULL_COMMIT = /^[0-9a-f]{40}$/u;
const execFileAsync = promisify(execFile);
const FORBIDDEN_SQL = [
  {
    category: 'SHARED_SCHEMA_REFERENCE',
    pattern: /\b(?:auth|public|storage|extensions)\s*\./iu,
  },
  {
    category: 'PRODUCTION_CONTROL',
    pattern: /\b(?:alter\s+system|copy\s+.+\s+program|create\s+extension)\b/iu,
  },
  {
    category: 'DESTRUCTIVE_NAMESPACE',
    pattern: /\bdrop\s+(?:schema|database)\b/iu,
  },
];
const NO_REPLACE_GIT_ENV = Object.freeze({
  ...process.env,
  GIT_NO_REPLACE_OBJECTS: '1',
});

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function inspectMigrationSql(sql) {
  const violations = [];
  for (const rule of FORBIDDEN_SQL) {
    if (rule.pattern.test(sql)) violations.push(rule.category);
  }
  if (
    !/\bworld_v2\s*\./iu.test(sql) &&
    !/create\s+schema\s+if\s+not\s+exists\s+world_v2/iu.test(sql)
  ) {
    violations.push('WORLD_V2_NAMESPACE_MISSING');
  }
  return [...new Set(violations)];
}

function provenanceKey(commit, artifactPath) {
  return `${commit}:${artifactPath}`;
}

export async function readMigrationGitProvenance(repositoryRoot, migrations) {
  const provenance = new Map();
  for (const migration of migrations) {
    const commit = migration?.artifact_source_commit;
    const artifactPath = path.posix.normalize(migration?.path ?? '');
    const key = provenanceKey(commit, artifactPath);
    if (!FULL_COMMIT.test(commit ?? '')) {
      provenance.set(key, { commitExists: false, pathExists: false });
      continue;
    }
    try {
      await execFileAsync(
        'git',
        ['--no-replace-objects', 'cat-file', '-e', `${commit}^{commit}`],
        { cwd: repositoryRoot, env: NO_REPLACE_GIT_ENV },
      );
    } catch {
      provenance.set(key, { commitExists: false, pathExists: false });
      continue;
    }
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['--no-replace-objects', 'show', `${commit}:${artifactPath}`],
        {
          cwd: repositoryRoot,
          encoding: 'buffer',
          env: NO_REPLACE_GIT_ENV,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      provenance.set(key, {
        bytes: Buffer.from(stdout),
        commitExists: true,
        pathExists: true,
      });
    } catch {
      provenance.set(key, { commitExists: true, pathExists: false });
    }
  }
  return provenance;
}

export function validateMigrationManifest(manifest, artifacts, provenance) {
  const violations = [];
  const migrations = Array.isArray(manifest?.migrations)
    ? manifest.migrations
    : [];

  if (manifest?.schema_version !== 'WORLD_V2_MIGRATIONS-1')
    violations.push('INVALID_MANIFEST_VERSION');
  if (manifest?.namespace !== WORLD_V2_NAMESPACE)
    violations.push('WRONG_NAMESPACE');
  if (manifest?.production_publisher !== PRODUCTION_PUBLISHER)
    violations.push('UNAUTHORIZED_PRODUCTION_PUBLISHER');
  if (manifest?.world_repository_production_mutation !== false)
    violations.push('WORLD_REPOSITORY_PRODUCTION_MUTATION_NOT_DISABLED');
  if (migrations.length === 0) violations.push('EMPTY_MIGRATION_CHAIN');

  const ids = new Set();
  const paths = new Set();
  let previousId = '';
  migrations.forEach((migration, index) => {
    const expectedOrder = index + 1;
    if (!MIGRATION_ID.test(migration?.migration_id ?? ''))
      violations.push(`INVALID_MIGRATION_ID:${index}`);
    if (ids.has(migration?.migration_id))
      violations.push(`DUPLICATE_MIGRATION_ID:${migration?.migration_id}`);
    ids.add(migration?.migration_id);
    if (migration?.release_order !== expectedOrder)
      violations.push(`INVALID_RELEASE_ORDER:${migration?.migration_id}`);
    if (previousId && previousId >= migration?.migration_id)
      violations.push(`NON_MONOTONIC_MIGRATION_ID:${migration?.migration_id}`);
    previousId = migration?.migration_id ?? previousId;

    const normalized = path.posix.normalize(migration?.path ?? '');
    if (
      normalized !== migration?.path ||
      normalized.startsWith('../') ||
      !normalized.startsWith(`${WORLD_V2_MIGRATION_ROOT}/`) ||
      !normalized.endsWith('.sql')
    ) {
      violations.push(`UNAUTHORIZED_MIGRATION_PATH:${migration?.migration_id}`);
    }
    if (paths.has(normalized))
      violations.push(`DUPLICATE_MIGRATION_PATH:${normalized}`);
    paths.add(normalized);

    if (!SHA256.test(migration?.sha256 ?? ''))
      violations.push(`INVALID_SHA256:${migration?.migration_id}`);
    const sourceCommit = migration?.artifact_source_commit;
    if (!FULL_COMMIT.test(sourceCommit ?? '')) {
      violations.push(
        `INVALID_ARTIFACT_SOURCE_COMMIT:${migration?.migration_id}`,
      );
    }
    if (migration?.created_from_commit !== undefined) {
      violations.push(`LEGACY_PROVENANCE_FIELD:${migration?.migration_id}`);
    }
    if (
      migration?.affected_schemas?.some(
        (schema) => schema !== WORLD_V2_NAMESPACE,
      )
    ) {
      violations.push(`UNAUTHORIZED_SCHEMA_OWNER:${migration?.migration_id}`);
    }
    if (
      !['forward-fix', 'reversible-before-economic-facts'].includes(
        migration?.rollback_strategy,
      )
    ) {
      violations.push(`INVALID_ROLLBACK_STRATEGY:${migration?.migration_id}`);
    }

    const bytes = artifacts.get(normalized);
    if (bytes === undefined) {
      violations.push(`MISSING_MIGRATION_ARTIFACT:${migration?.migration_id}`);
    } else {
      if (sha256(bytes) !== migration.sha256)
        violations.push(`MIGRATION_HASH_MISMATCH:${migration?.migration_id}`);
      for (const category of inspectMigrationSql(bytes.toString('utf8'))) {
        violations.push(`${category}:${migration?.migration_id}`);
      }
    }
    const source = provenance?.get(provenanceKey(sourceCommit, normalized));
    if (source === undefined) {
      violations.push(`UNVERIFIED_GIT_PROVENANCE:${migration?.migration_id}`);
    } else if (!source.commitExists) {
      violations.push(`SOURCE_COMMIT_NOT_FOUND:${migration?.migration_id}`);
    } else if (!source.pathExists || source.bytes === undefined) {
      violations.push(`SOURCE_ARTIFACT_NOT_FOUND:${migration?.migration_id}`);
    } else if (sha256(source.bytes) !== migration.sha256) {
      violations.push(
        `SOURCE_ARTIFACT_HASH_MISMATCH:${migration?.migration_id}`,
      );
    }
  });

  return {
    migrations: migrations.length,
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    violations,
  };
}
