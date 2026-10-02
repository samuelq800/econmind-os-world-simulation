import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  inspectMigrationSql,
  validateMigrationManifest,
  readMigrationGitProvenance,
  STORAGE_VETO_PATH,
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
describe('exact two-policy World-owned forward exception', () => {
  it('validates immutable provenance while keeping sole main-site publisher and unapproved production', () => {
    expect(
      validateMigrationManifest(manifest, artifacts, provenance).status,
    ).toBe('PASS');
    expect(manifest.production_publisher).toBe('main-site-release-chain');
    expect(manifest.world_repository_production_mutation).toBe(false);
    expect(manifest.migrations.at(-1).production_approval).toBeNull();
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
      Object.assign(altered.migrations.at(-1), change);
      expect(
        validateMigrationManifest(altered, artifacts, provenance).status,
      ).toBe('FAIL');
    }
  });
});
