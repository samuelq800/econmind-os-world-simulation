import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  assertV30DisposableRestoreTarget,
  loadV30RestoreMigrations,
  prepareV30RestoreMigrations,
} from '../../scripts/v30-disposable-restore-diagnostic.mjs';

const valid = {
  ECONMIND_ENV: 'ci',
  GITHUB_ACTIONS: 'true',
  GITHUB_SHA: 'a'.repeat(40),
  V30_DISPOSABLE_RESTORE_CONFIRMATION: 'EXECUTE_DISPOSABLE_V30_PG_RESTORE',
  V30_DISPOSABLE_POSTGRES_ADMIN_URL:
    'postgresql://postgres@127.0.0.1:5432/postgres',
};

describe('V30 disposable PostgreSQL restore target guard', () => {
  it('permits only the exact credential-free CI loopback service', () => {
    expect(assertV30DisposableRestoreTarget(valid)).toEqual({
      adminUrl: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL,
      codeSha: valid.GITHUB_SHA,
    });
  });

  it('rejects remote, production, credentialed and shared runtime targets', () => {
    for (const changed of [
      { ECONMIND_ENV: 'production' },
      { GITHUB_ACTIONS: 'false' },
      { GITHUB_SHA: 'moving-main' },
      { V30_DISPOSABLE_RESTORE_CONFIRMATION: 'YES' },
      {
        V30_DISPOSABLE_POSTGRES_ADMIN_URL:
          'postgresql://postgres@db.example/postgres',
      },
      {
        V30_DISPOSABLE_POSTGRES_ADMIN_URL:
          'postgresql://postgres:secret@127.0.0.1:5432/postgres',
      },
      {
        V30_DISPOSABLE_POSTGRES_ADMIN_URL:
          'postgresql://postgres@127.0.0.1:5432/econmind_main',
      },
      { DATABASE_URL: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL },
      { WORLD_DATABASE_URL: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL },
      { SUPABASE_DB_URL: valid.V30_DISPOSABLE_POSTGRES_ADMIN_URL },
    ]) {
      expect(() =>
        assertV30DisposableRestoreTarget({ ...valid, ...changed }),
      ).toThrow();
    }
  });
});

function migrationFixture(count = 17) {
  const artifacts = new Map<string, Buffer>();
  const provenance = new Map<
    string,
    { commitExists: boolean; pathExists: boolean; bytes: Buffer }
  >();
  const migrations = Array.from({ length: count }, (_, index) => {
    const id = `${String(index + 1).padStart(4, '0')}_world_v2_test`;
    const artifactPath = `database/migrations/artifacts/${id}.sql`;
    const bytes = Buffer.from(
      `create table world_v2.fixture_${index} (id text);`,
    );
    artifacts.set(artifactPath, bytes);
    provenance.set(`${valid.GITHUB_SHA}:${artifactPath}`, {
      commitExists: true,
      pathExists: true,
      bytes: Buffer.from(bytes),
    });
    return {
      migration_id: id,
      release_order: index + 1,
      path: artifactPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      artifact_source_commit: valid.GITHUB_SHA,
      affected_schemas: ['world_v2'],
      rollback_strategy: 'forward-fix',
    };
  });
  return {
    manifest: {
      schema_version: 'WORLD_V2_MIGRATIONS-1',
      namespace: 'world_v2',
      production_publisher: 'main-site-release-chain',
      world_repository_production_mutation: false,
      migrations,
    },
    artifacts,
    provenance,
  };
}

describe('V30 restore manifest-bound migration preparation', () => {
  it('supports forward migrations in verified manifest order, not a fixed count', () => {
    const { manifest, artifacts, provenance } = migrationFixture();
    artifacts.set('unlisted.sql', Buffer.from('select 1;'));
    const prepared = prepareV30RestoreMigrations(
      manifest,
      artifacts,
      provenance,
    );
    expect(prepared).toHaveLength(17);
    expect(prepared[0]?.file).toBe('0001_world_v2_test.sql');
    expect(prepared[16]?.file).toBe('0017_world_v2_test.sql');
    expect(Object.isFrozen(prepared)).toBe(true);
    const originalSql = prepared[0]?.sql;
    artifacts.get(manifest.migrations[0]!.path)!.fill(0);
    expect(prepared[0]?.sql).toBe(originalSql);
    expect(prepared.every(Object.isFrozen)).toBe(true);
  });

  it('rejects changed bytes and unverifiable source commits', () => {
    const changed = migrationFixture(1);
    changed.artifacts.set(
      changed.manifest.migrations[0]!.path,
      Buffer.from('select 1;'),
    );
    expect(() =>
      prepareV30RestoreMigrations(
        changed.manifest,
        changed.artifacts,
        changed.provenance,
      ),
    ).toThrow('MIGRATION_HASH_MISMATCH');
    const missing = migrationFixture(1);
    missing.provenance.clear();
    expect(() =>
      prepareV30RestoreMigrations(
        missing.manifest,
        missing.artifacts,
        missing.provenance,
      ),
    ).toThrow('UNVERIFIED_GIT_PROVENANCE');
  });

  it('rejects empty, reordered and out-of-directory manifests', () => {
    const empty = migrationFixture(0);
    expect(() =>
      prepareV30RestoreMigrations(
        empty.manifest,
        empty.artifacts,
        empty.provenance,
      ),
    ).toThrow('EMPTY_MIGRATION_CHAIN');
    const reordered = migrationFixture(2);
    reordered.manifest.migrations.reverse();
    expect(() =>
      prepareV30RestoreMigrations(
        reordered.manifest,
        reordered.artifacts,
        reordered.provenance,
      ),
    ).toThrow('INVALID_RELEASE_ORDER');
    const escaped = migrationFixture(1);
    escaped.manifest.migrations[0]!.path = '../outside.sql';
    expect(() =>
      prepareV30RestoreMigrations(
        escaped.manifest,
        escaped.artifacts,
        escaped.provenance,
      ),
    ).toThrow('UNAUTHORIZED_MIGRATION_PATH');
  });

  it('loads the real checked-in manifest and verifies Git bytes without a DB', async () => {
    const migrations = await loadV30RestoreMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0]?.file).toBe('0001_world_v2_namespace.sql');
    for (const migration of migrations) {
      expect(createHash('sha256').update(migration.sql).digest('hex')).toBe(
        migration.sha256,
      );
    }
  });
});
