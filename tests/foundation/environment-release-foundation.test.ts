import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assessEnvironment } from '../../scripts/environment-policy.mjs';
import {
  inspectMigrationSql,
  readMigrationGitProvenance,
  validateMigrationManifest,
} from '../../scripts/migration-policy.mjs';
import { classifySupabaseArguments } from '../../scripts/supabase-policy.mjs';

const root = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'database/migrations/manifest.json'), 'utf8'),
);
const artifacts = new Map(
  manifest.migrations.map((migration: { path: string }) => [
    migration.path,
    readFileSync(resolve(root, migration.path)),
  ]),
);
const provenance = await readMigrationGitProvenance(root, manifest.migrations);

describe('V02 environment isolation', () => {
  it('fails closed for missing, invalid, or conflicting environment identity', () => {
    expect(assessEnvironment({}).violations).toContain(
      'ECONMIND_ENV is required',
    );
    expect(assessEnvironment({ ECONMIND_ENV: 'preview' }).violations).toContain(
      'Unsupported ECONMIND_ENV: preview',
    );
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'local',
        DATABASE_URL: 'postgresql://localhost/a',
        WORLD_DATABASE_URL: 'postgresql://localhost/b',
      }).violations,
    ).toContain('WORLD_DATABASE_URL conflicts with DATABASE_URL');
  });

  it('rejects production-like development targets and development-like production targets', () => {
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'local',
        WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
        WORLD_DATABASE_URL:
          'postgresql://synthetic:synthetic@example.supabase.co/postgres',
      }).violations,
    ).toEqual(
      expect.arrayContaining([
        'local DATABASE_URL must resolve to a loopback host',
        'WORLD_DATABASE_FINGERPRINT must identify world-v2-local',
      ]),
    );
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'production',
        WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
        WORLD_DATABASE_URL:
          'postgresql://synthetic:synthetic@127.0.0.1/postgres',
      }).violations,
    ).toContain(
      'production database URL must not resolve to a development host',
    );
  });

  it.each([
    'localhost.',
    '127.1',
    '2130706433',
    '0x7f000001',
    '[::ffff:127.0.0.1]',
  ])('rejects production database loopback alias %s', (host) => {
    expect(
      assessEnvironment({
        ECONMIND_ENV: 'production',
        WORLD_DATABASE_FINGERPRINT: 'world-v2-production',
        WORLD_DATABASE_URL: `postgresql://synthetic@${host}/postgres`,
      }).violations,
    ).toContain(
      'production database URL must not resolve to a development host',
    );
  });

  it('rejects production mutation, wrong namespace, and CI credential variables without leaking values', () => {
    const syntheticSecret = 'synthetic-value-never-print';
    const result = assessEnvironment({
      ECONMIND_ENV: 'ci',
      PRODUCTION_SERVICE_ROLE_KEY: syntheticSecret,
      WORLD_DATABASE_MUTATION_MODE: 'enabled',
      WORLD_DATABASE_NAMESPACE: 'public',
    });
    expect(result.violations).toEqual(
      expect.arrayContaining([
        'World database mutation is disabled during the Foundation Sprint',
        'WORLD_DATABASE_NAMESPACE must be world_v2',
        'Runtime must not receive forbidden production credential variable: PRODUCTION_SERVICE_ROLE_KEY',
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(syntheticSecret);
  });
});

describe('V02 migration and release chain', () => {
  it('validates the canonical ordered and hashed manifest', () => {
    expect(validateMigrationManifest(manifest, artifacts, provenance)).toEqual({
      migrations: 1,
      status: 'PASS',
      violations: [],
    });
  });

  it('rejects duplicate IDs, release-order drift, wrong namespace, and unauthorized paths', () => {
    const invalid = structuredClone(manifest);
    invalid.namespace = 'public';
    invalid.migrations.push({
      ...invalid.migrations[0],
      path: '../outside.sql',
      release_order: 3,
    });
    const result = validateMigrationManifest(invalid, artifacts, provenance);
    expect(result.status).toBe('FAIL');
    expect(result.violations.join(' ')).toContain('WRONG_NAMESPACE');
    expect(result.violations.join(' ')).toContain('DUPLICATE_MIGRATION_ID');
    expect(result.violations.join(' ')).toContain('INVALID_RELEASE_ORDER');
    expect(result.violations.join(' ')).toContain(
      'UNAUTHORIZED_MIGRATION_PATH',
    );
  });

  it('rejects nonexistent, absent, mismatched, and unverified Git provenance', async () => {
    const nonexistent = structuredClone(manifest);
    nonexistent.migrations[0].artifact_source_commit = '0'.repeat(40);
    const nonexistentProvenance = await readMigrationGitProvenance(
      root,
      nonexistent.migrations,
    );
    expect(
      validateMigrationManifest(nonexistent, artifacts, nonexistentProvenance)
        .violations,
    ).toContain('SOURCE_COMMIT_NOT_FOUND:0001_world_v2_namespace');

    const absent = structuredClone(manifest);
    absent.migrations[0].artifact_source_commit =
      '980e89ac6a42fda924a9d95d369f7d702f06bda2';
    const absentProvenance = await readMigrationGitProvenance(
      root,
      absent.migrations,
    );
    expect(
      validateMigrationManifest(absent, artifacts, absentProvenance).violations,
    ).toContain('SOURCE_ARTIFACT_NOT_FOUND:0001_world_v2_namespace');

    const mismatch = structuredClone(manifest);
    mismatch.migrations[0].sha256 = 'f'.repeat(64);
    expect(
      validateMigrationManifest(mismatch, artifacts, provenance).violations,
    ).toEqual(
      expect.arrayContaining([
        'MIGRATION_HASH_MISMATCH:0001_world_v2_namespace',
        'SOURCE_ARTIFACT_HASH_MISMATCH:0001_world_v2_namespace',
      ]),
    );
    expect(validateMigrationManifest(manifest, artifacts).violations).toContain(
      'UNVERIFIED_GIT_PROVENANCE:0001_world_v2_namespace',
    );
  });

  it('reads provenance from immutable objects even when a replace ref exists', async () => {
    const fixture = await mkdtemp(resolve(tmpdir(), 'econmind-provenance-'));
    const artifactPath = 'database/migrations/artifacts/0001_source.sql';
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: fixture });
      execFileSync('git', ['config', 'user.name', 'Gate A Test'], {
        cwd: fixture,
      });
      execFileSync('git', ['config', 'user.email', 'gate-a@example.invalid'], {
        cwd: fixture,
      });
      await mkdir(resolve(fixture, 'database/migrations/artifacts'), {
        recursive: true,
      });
      await writeFile(resolve(fixture, artifactPath), 'ORIGINAL\n');
      execFileSync('git', ['add', artifactPath], { cwd: fixture });
      execFileSync('git', ['commit', '--quiet', '-m', 'original'], {
        cwd: fixture,
      });
      const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: fixture,
        encoding: 'utf8',
      }).trim();

      await writeFile(resolve(fixture, artifactPath), 'REPLACEMENT\n');
      execFileSync('git', ['add', artifactPath], { cwd: fixture });
      execFileSync('git', ['commit', '--quiet', '-m', 'replacement'], {
        cwd: fixture,
      });
      const replacementCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: fixture,
        encoding: 'utf8',
      }).trim();
      execFileSync('git', ['replace', sourceCommit, replacementCommit], {
        cwd: fixture,
      });

      const result = await readMigrationGitProvenance(fixture, [
        { artifact_source_commit: sourceCommit, path: artifactPath },
      ]);
      expect(
        result.get(`${sourceCommit}:${artifactPath}`)?.bytes?.toString(),
      ).toBe('ORIGINAL\n');
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it('rejects attempts to own shared schemas or destructive database controls', () => {
    expect(
      inspectMigrationSql(
        'alter table auth.users add column world_state jsonb; drop schema public cascade;',
      ),
    ).toEqual(
      expect.arrayContaining([
        'SHARED_SCHEMA_REFERENCE',
        'DESTRUCTIVE_NAMESPACE',
        'WORLD_V2_NAMESPACE_MISSING',
      ]),
    );
  });

  it('keeps the Supabase CLI wrapper read-only', () => {
    expect(classifySupabaseArguments(['status']).allowed).toBe(true);
    for (const command of [
      ['db', 'push'],
      ['db', 'reset'],
      ['migration', 'repair'],
      ['seed'],
      ['functions', 'deploy'],
    ]) {
      expect(classifySupabaseArguments(command).allowed).toBe(false);
    }
  });
});
