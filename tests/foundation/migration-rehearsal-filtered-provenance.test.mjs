// TEST_ONLY: imports the actual script, executing its two isolated in-memory
// PGlite rehearsals. No native/production database URL or economic caller used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assertRehearsalReleaseProvenance } from '../../scripts/rehearse-migrations.mjs';
import {
  historicalWorldOnlyMigrations,
  readMigrationGitProvenance,
  STORAGE_VETO_MIGRATION_ID,
  validateMigrationManifest,
} from '../../scripts/migration-policy.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const manifest = JSON.parse(
  await readFile(path.join(root, 'database/migrations/manifest.json'), 'utf8'),
);
const legacy = manifest.migrations.filter(
  (migration) => migration.migration_id !== STORAGE_VETO_MIGRATION_ID,
);
const rows = legacy.map((migration) => ({
  migration_id: migration.migration_id,
  artifact_sha256: migration.sha256,
  source_repo_commit: migration.artifact_source_commit,
  release_order: migration.release_order,
}));

test('actual filtered 21+0023 aligns last source with 0023, never excluded Storage0022', () => {
  assert.equal(manifest.migrations.length, 23);
  assert.equal(legacy.length, 22);
  assert.equal(
    legacy[21].migration_id,
    '0023_world_v2_production_consumption_posting',
  );
  assert.equal(manifest.migrations[21].migration_id, STORAGE_VETO_MIGRATION_ID);
  assert.notEqual(
    rows[21].source_repo_commit,
    manifest.migrations[21].artifact_source_commit,
  );
  assert.doesNotThrow(() =>
    assertRehearsalReleaseProvenance('clean-baseline', legacy, rows),
  );
  assert.doesNotThrow(() =>
    assertRehearsalReleaseProvenance('existing-schema', legacy, rows),
  );
});

for (const field of [
  'migration_id',
  'artifact_sha256',
  'source_repo_commit',
  'release_order',
]) {
  test(`rejects wrong ${field} at the post-gap executed row`, () => {
    const changed = rows.map((row) => ({ ...row }));
    changed[21][field] = field === 'release_order' ? 22 : 'WRONG';
    assert.throws(
      () => assertRehearsalReleaseProvenance('negative', legacy, changed),
      /negative release provenance mismatch/u,
    );
  });
}

test('does not renumber the release-order gap or compare to the excluded source', () => {
  assert.equal(rows[21].release_order, 23);
  const changed = rows.map((row) => ({ ...row }));
  changed[21].source_repo_commit =
    manifest.migrations[21].artifact_source_commit;
  assert.throws(
    () => assertRehearsalReleaseProvenance('negative', legacy, changed),
    /release provenance mismatch/u,
  );
});

test('rejects missing, duplicate, reordered and extra release rows', () => {
  assert.throws(
    () =>
      assertRehearsalReleaseProvenance('negative', legacy, rows.slice(0, -1)),
    /release ledger mismatch/u,
  );
  assert.throws(
    () =>
      assertRehearsalReleaseProvenance('negative', legacy, [...rows, rows[0]]),
    /release ledger mismatch/u,
  );
  const duplicate = [...rows];
  duplicate[21] = rows[20];
  assert.throws(
    () => assertRehearsalReleaseProvenance('negative', legacy, duplicate),
    /release provenance mismatch/u,
  );
  const reordered = [...rows];
  [reordered[0], reordered[21]] = [reordered[21], reordered[0]];
  assert.throws(
    () => assertRehearsalReleaseProvenance('negative', legacy, reordered),
    /release provenance mismatch/u,
  );
});

test('unfiltered historical chains still compare exact id/hash/source/order', () => {
  const historical = manifest.migrations.slice(0, 21);
  assert.doesNotThrow(() =>
    assertRehearsalReleaseProvenance(
      'historical',
      historical,
      rows.slice(0, 21),
    ),
  );
});

test('complete artifact-path/hash/Git provenance preflight remains strict', async () => {
  const artifacts = new Map(
    await Promise.all(
      manifest.migrations.map(async (migration) => [
        migration.path,
        await readFile(path.join(root, migration.path)),
      ]),
    ),
  );
  const provenance = await readMigrationGitProvenance(
    root,
    manifest.migrations,
  );
  assert.equal(
    validateMigrationManifest(manifest, artifacts, provenance).status,
    'PASS',
  );
  const altered = structuredClone(manifest);
  altered.migrations[22].path = '../outside.sql';
  const wrongPath = validateMigrationManifest(altered, artifacts, provenance);
  assert.equal(wrongPath.status, 'FAIL');
  assert(
    wrongPath.violations.includes(
      'UNAUTHORIZED_MIGRATION_PATH:0023_world_v2_production_consumption_posting',
    ),
  );
  const missing = new Map(provenance);
  missing.delete(`${legacy[21].artifact_source_commit}:${legacy[21].path}`);
  assert.equal(
    validateMigrationManifest(manifest, artifacts, missing).status,
    'FAIL',
  );
});

test('preserves the already pinned rehearsal suffix and rejects unknown suffixes', () => {
  assert.equal(
    historicalWorldOnlyMigrations(manifest.migrations.slice(0, 21)).length,
    21,
  );
  assert.equal(
    historicalWorldOnlyMigrations(manifest.migrations.slice(0, 22)).length,
    21,
  );
  assert.deepEqual(historicalWorldOnlyMigrations(manifest.migrations), legacy);
  const altered = structuredClone(manifest.migrations);
  altered[22].sha256 = '0'.repeat(64);
  assert.throws(
    () => historicalWorldOnlyMigrations(altered),
    /WORLD_ONLY_REHEARSAL_SUFFIX_INVALID/u,
  );
  const unknown = structuredClone(manifest.migrations);
  unknown.push({
    ...unknown[22],
    migration_id: '0024_unreviewed',
    release_order: 24,
  });
  assert.throws(
    () => historicalWorldOnlyMigrations(unknown),
    /STORAGE_VETO_HISTORICAL_PREFIX_INVALID/u,
  );
});

test('shared migration policy and independent 20/21 staging allowlist are unchanged', async () => {
  for (const file of [
    'scripts/migration-policy.mjs',
    'scripts/v09-staging-evidence-policy.mjs',
    'scripts/v09-staging-evidence-runner.mjs',
    'database/migrations/manifest.json',
  ]) {
    const base = execFileSync(
      'git',
      [
        '--no-replace-objects',
        'show',
        `13fd4ce820d5c5a9296c9a3cc9bc2ece32ef8fe5:${file}`,
      ],
      { cwd: root },
    );
    assert.deepEqual(await readFile(path.join(root, file)), base);
  }
});

test('existing apply-chain/shared-schema/Storage/gate blocks are byte-identical to fixed base', async () => {
  const file = 'scripts/rehearse-migrations.mjs';
  const base = execFileSync(
    'git',
    [
      '--no-replace-objects',
      'show',
      `13fd4ce820d5c5a9296c9a3cc9bc2ece32ef8fe5:${file}`,
    ],
    { cwd: root },
  ).toString('utf8');
  const current = await readFile(path.join(root, file), 'utf8');
  assert.equal(
    current.slice(0, current.indexOf('// Compare against')),
    base.slice(0, base.indexOf('async function rehearse')),
  );
  const marker = '    if (\n      shared.rows.some(';
  assert.notEqual(current.indexOf(marker), -1);
  assert.notEqual(base.indexOf(marker), -1);
  assert.equal(
    current.slice(current.indexOf(marker)),
    base.slice(base.indexOf(marker)),
  );
});
