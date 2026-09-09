import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assessEnvironment } from '../../scripts/environment-policy.mjs';
import {
  inspectMigrationSql,
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
        'CI must not receive production credential variable: PRODUCTION_SERVICE_ROLE_KEY',
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(syntheticSecret);
  });
});

describe('V02 migration and release chain', () => {
  it('validates the canonical ordered and hashed manifest', () => {
    expect(validateMigrationManifest(manifest, artifacts)).toEqual({
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
    const result = validateMigrationManifest(invalid, artifacts);
    expect(result.status).toBe('FAIL');
    expect(result.violations.join(' ')).toContain('WRONG_NAMESPACE');
    expect(result.violations.join(' ')).toContain('DUPLICATE_MIGRATION_ID');
    expect(result.violations.join(' ')).toContain('INVALID_RELEASE_ORDER');
    expect(result.violations.join(' ')).toContain(
      'UNAUTHORIZED_MIGRATION_PATH',
    );
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
