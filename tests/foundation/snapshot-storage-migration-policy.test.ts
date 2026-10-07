import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  inspectMigrationSql,
  validateMigrationManifest,
  readMigrationGitProvenance,
  STORAGE_VETO_PATH,
  STORAGE_VETO_MIGRATION_ID,
  historicalWorldOnlyMigrations,
} from '../../scripts/migration-policy.mjs';
const sql = readFileSync(STORAGE_VETO_PATH, 'utf8');
const manifest = JSON.parse(
  readFileSync('database/migrations/manifest.json', 'utf8'),
);
const artifacts = new Map(
  manifest.migrations.map((m: { path: string }) => [
    m.path,
    readFileSync(m.path),
  ]),
);
const provenance = await readMigrationGitProvenance(
  process.cwd(),
  manifest.migrations,
);
const vetoIndex = manifest.migrations.findIndex(
  (migration: { migration_id: string }) =>
    migration.migration_id === STORAGE_VETO_MIGRATION_ID,
);
describe('exact two-policy World-owned forward exception', () => {
  it('validates immutable provenance while keeping sole main-site publisher and unapproved production', () => {
    expect(
      validateMigrationManifest(manifest, artifacts, provenance).status,
    ).toBe('PASS');
    expect(manifest.production_publisher).toBe('main-site-release-chain');
    expect(manifest.world_repository_production_mutation).toBe(false);
    expect(vetoIndex).toBe(21);
    expect(manifest.migrations[vetoIndex].production_approval).toBeNull();
    expect(inspectMigrationSql(sql)).toEqual([]);
  });
  it('does not admit arbitrary Storage DDL, changed scope/property or added statements', () => {
    for (const changed of [
      sql.replace('as restrictive', 'as permissive'),
      sql.replace('world-v2-official-source-v1', 'old-avatar-fixture'),
      sql + '\nrevoke all on storage.objects from public;',
    ])
      expect(inspectMigrationSql(changed)).toContain('SHARED_SCHEMA_REFERENCE');
    for (const change of [
      { affected_schemas: ['public'] },
      { migration_id: '0022_other' },
      { path: 'database/migrations/artifacts/other.sql' },
      { scope_authority: 'SELF_APPROVED' },
      { production_approval: true },
    ]) {
      const altered = structuredClone(manifest);
      Object.assign(altered.migrations[vetoIndex], change);
      expect(
        validateMigrationManifest(altered, artifacts, provenance).status,
      ).toBe('FAIL');
    }
  });
  it('selects the exact additive World-only suffix without executing the Storage companion', () => {
    const legacy = manifest.migrations.slice(0, 21);
    expect(historicalWorldOnlyMigrations(legacy)).toBe(legacy);
    expect(
      historicalWorldOnlyMigrations(manifest.migrations.slice(0, 22)),
    ).toEqual(legacy);
    const selected = historicalWorldOnlyMigrations(manifest.migrations);
    expect(selected).toEqual([...legacy, manifest.migrations[22]]);
    expect(
      selected.some(
        (migration: { migration_id: string }) =>
          migration.migration_id === STORAGE_VETO_MIGRATION_ID,
      ),
    ).toBe(false);
    expect(selected.at(-1).production_approval).toBeNull();
  });
  it('rejects changed Storage identity, arbitrary suffixes and production relabeling', () => {
    for (const change of [
      { sha256: '0'.repeat(64) },
      { artifact_source_commit: '0'.repeat(40) },
      { affected_schemas: ['world_v2'] },
      { release_order: 21 },
      { production_approval: 'SELF_APPROVED' },
    ]) {
      const altered = structuredClone(manifest.migrations);
      Object.assign(altered[vetoIndex], change);
      expect(() => historicalWorldOnlyMigrations(altered)).toThrow(
        'STORAGE_VETO_HISTORICAL_PREFIX_INVALID',
      );
    }
    for (const change of [
      { migration_id: '0023_arbitrary' },
      { path: 'database/migrations/artifacts/other.sql' },
      { sha256: '0'.repeat(64) },
      { artifact_source_commit: '0'.repeat(40) },
      { affected_schemas: ['storage'] },
      { release_order: 24 },
      { scope_authority: 'SELF_APPROVED' },
      { production_approval: 'SELF_APPROVED' },
      { rls_or_grants_changed: true },
      { backfill: 'ALL' },
    ]) {
      const altered = structuredClone(manifest.migrations);
      Object.assign(altered[22], change);
      expect(() => historicalWorldOnlyMigrations(altered)).toThrow(
        'WORLD_ONLY_REHEARSAL_SUFFIX_INVALID',
      );
    }
    expect(() =>
      historicalWorldOnlyMigrations([
        ...manifest.migrations,
        { migration_id: '0024_arbitrary' },
      ]),
    ).toThrow('STORAGE_VETO_HISTORICAL_PREFIX_INVALID');
  });
});
