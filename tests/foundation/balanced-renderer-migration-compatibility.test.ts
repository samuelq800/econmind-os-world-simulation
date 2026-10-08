import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderBalancedCountryCandidateRelease } from '../../scripts/render-balanced-country-candidate-release.mjs';
import { assertV09StagingMigrationAllowlist } from '../../scripts/v09-staging-evidence-policy.mjs';
import { historicalWorldOnlyMigrations } from '../../scripts/migration-policy.mjs';

const root = process.cwd();
const manifest = JSON.parse(
  await readFile(path.join(root, 'database/migrations/manifest.json'), 'utf8'),
);
const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

// Only mutable migration fixtures are copied. Original candidate/map/source
// packages stay read-only inputs; no generated package replaces those inputs.
async function fixture(
  run: (fixtureRoot: string, copy: typeof manifest) => Promise<void>,
) {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'balanced-renderer-'));
  try {
    await mkdir(path.join(fixtureRoot, 'database'), { recursive: true });
    await cp(
      path.join(root, 'database/migrations'),
      path.join(fixtureRoot, 'database/migrations'),
      { recursive: true },
    );
    for (const entry of ['.git', 'artifacts', 'apps', 'packages']) {
      await symlink(path.join(root, entry), path.join(fixtureRoot, entry));
    }
    await run(fixtureRoot, structuredClone(manifest));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

async function saveManifest(fixtureRoot: string, copy: typeof manifest) {
  await writeFile(
    path.join(fixtureRoot, 'database/migrations/manifest.json'),
    JSON.stringify(copy),
  );
}

describe('balanced 0019 renderer exact reviewed migration suffix compatibility', () => {
  it('keeps the staging allowlist capped even when the renderer accepts exact 0023', () => {
    expect(() =>
      assertV09StagingMigrationAllowlist(
        historicalWorldOnlyMigrations(manifest.migrations),
      ),
    ).toThrow('V09_STAGING_MIGRATION_CHAIN_NOT_REVIEWED');
  });

  it('renders identical 0019 SQL, exact 18-prefix and frozen inputs for chains 20/21/22/23', async () => {
    await fixture(async (fixtureRoot, copy) => {
      copy.migrations = manifest.migrations.slice(0, 20);
      await saveManifest(fixtureRoot, copy);
      const legacy = await renderBalancedCountryCandidateRelease(fixtureRoot);
      expect(legacy.migration).toEqual(manifest.migrations[18]);
      expect(legacy.countries).toBe(70);
      expect(legacy.sourceArtifacts).toBe(87);
      expect(legacy.bundle.activationAllowed).toBe(false);
      const ledger = JSON.stringify(
        manifest.migrations
          .slice(0, 18)
          .map(
            (entry: {
              migration_id: string;
              sha256: string;
              artifact_source_commit: string;
              release_order: number;
            }) => ({
              migration_id: entry.migration_id,
              artifact_sha256: entry.sha256,
              source_repo_commit: entry.artifact_source_commit,
              release_order: entry.release_order,
            }),
          ),
      );
      expect(legacy.schema).toContain(
        "<> '" + ledger.replaceAll("'", "''") + "'::jsonb",
      );
      for (const length of [21, 22, 23]) {
        copy.migrations = manifest.migrations.slice(0, length);
        await saveManifest(fixtureRoot, copy);
        const current =
          await renderBalancedCountryCandidateRelease(fixtureRoot);
        expect(current.migration).toEqual(legacy.migration);
        expect(current.schema).toBe(legacy.schema);
        expect(current.queries).toEqual(legacy.queries);
        expect(current.final).toBe(legacy.final);
        expect(current.bundle.manifestSha256).toBe(
          legacy.bundle.manifestSha256,
        );
        expect(current.bundle.sourceThread).toBe(legacy.bundle.sourceThread);
        expect(current.bundle.sourceDrift).toEqual(legacy.bundle.sourceDrift);
        expect(current.maxRequestBytes).toBe(legacy.maxRequestBytes);
        expect(current.schema).not.toContain(
          manifest.migrations[22].migration_id,
        );
        expect(current.schema).not.toContain(
          manifest.migrations[21].migration_id,
        );
      }
    });
  });

  it.each([
    [0, { migration_id: '0001_other_prefix' }],
    [18, { sha256: '0'.repeat(64) }],
    [18, { artifact_source_commit: '0'.repeat(40) }],
    [18, { path: 'database/migrations/artifacts/other.sql' }],
    [
      20,
      {
        sha256: manifest.migrations[19].sha256,
        artifact_source_commit: manifest.migrations[19].artifact_source_commit,
        path: manifest.migrations[19].path,
      },
    ],
    [21, { affected_schemas: ['world_v2'] }],
    [22, { migration_id: '0023_unknown' }],
    [22, { sha256: '0'.repeat(64) }],
    [22, { artifact_source_commit: '0'.repeat(40) }],
    [22, { path: 'database/migrations/artifacts/other.sql' }],
    [22, { affected_schemas: ['storage'] }],
    [22, { scope_authority: 'SELF_APPROVED' }],
    [22, { release_order: 24 }],
    [22, { production_approval: 'SELF_APPROVED' }],
    [22, { rls_or_grants_changed: true }],
    [22, { backfill: 'ALL' }],
  ])(
    'rejects altered prefix/suffix metadata at index %s: %j',
    async (index, change) => {
      await fixture(async (fixtureRoot, copy) => {
        Object.assign(copy.migrations[index], change);
        // Keep a changed path accessible, so failure is validation, not ENOENT.
        if ('path' in change && change.path.endsWith('/other.sql')) {
          await cp(
            path.join(root, manifest.migrations[index].path),
            path.join(fixtureRoot, change.path),
          );
        }
        await saveManifest(fixtureRoot, copy);
        await expect(
          renderBalancedCountryCandidateRelease(fixtureRoot),
        ).rejects.toThrow('BALANCED_CANDIDATE_MIGRATION_CHAIN_INVALID');
      });
    },
  );

  it('rejects unknown 0024 rather than blindly slicing', async () => {
    await fixture(async (fixtureRoot, copy) => {
      copy.migrations.push({
        ...copy.migrations[22],
        migration_id: '0024_unknown',
        path: 'database/migrations/artifacts/0024_unknown.sql',
        release_order: 24,
      });
      await cp(
        path.join(root, manifest.migrations[22].path),
        path.join(fixtureRoot, copy.migrations[23].path),
      );
      await saveManifest(fixtureRoot, copy);
      await expect(
        renderBalancedCountryCandidateRelease(fixtureRoot),
      ).rejects.toThrow('BALANCED_CANDIDATE_MIGRATION_CHAIN_INVALID');
      // Even if independent SQL/Git validation admitted a future artifact,
      // the exact historical selector rejects the chain before prefix slicing.
      expect(() => historicalWorldOnlyMigrations(copy.migrations)).toThrow(
        'STORAGE_VETO_HISTORICAL_PREFIX_INVALID',
      );
    });
  });

  it.each([0, 22])(
    'validates current SQL and Git bytes before ignoring later SQL (%s)',
    async (index) => {
      await fixture(async (fixtureRoot, copy) => {
        const entry = copy.migrations[index];
        const artifactPath = path.join(fixtureRoot, entry.path);
        const changed = Buffer.concat([
          await readFile(artifactPath),
          Buffer.from('\ngrant select on world_v2.schema_release to public;\n'),
        ]);
        await writeFile(artifactPath, changed);
        await saveManifest(fixtureRoot, copy);
        await expect(
          renderBalancedCountryCandidateRelease(fixtureRoot),
        ).rejects.toThrow('BALANCED_CANDIDATE_MIGRATION_CHAIN_INVALID');
        // Rehashing local bytes cannot replace immutable source-commit bytes.
        entry.sha256 = sha256(changed);
        await saveManifest(fixtureRoot, copy);
        await expect(
          renderBalancedCountryCandidateRelease(fixtureRoot),
        ).rejects.toThrow('BALANCED_CANDIDATE_MIGRATION_CHAIN_INVALID');
      });
    },
  );
});
