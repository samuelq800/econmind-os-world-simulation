import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

import { renderBalancedCountryCandidateRelease } from './render-balanced-country-candidate-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await readFile(path.join(root, 'database/migrations/manifest.json'), 'utf8'),
);
const release = await renderBalancedCountryCandidateRelease(root);
if (
  release.sourceArtifacts !== 87 ||
  release.countries !== 70 ||
  release.bundle.population !== 14_712_146_434 ||
  release.maxRequestBytes > 420_000 ||
  release.bundle.sourceDrift.length !== 3
) {
  throw new Error('BALANCED_CANDIDATE_INPUT_REHEARSAL_MISMATCH');
}

const db = new PGlite();
try {
  for (const migration of manifest.migrations.slice(0, 18)) {
    await db.exec(await readFile(path.join(root, migration.path), 'utf8'));
    await db.query(
      `insert into world_v2.schema_release
       (migration_id, artifact_sha256, source_repo_commit, release_order)
       values ($1, $2, $3, $4)`,
      [
        migration.migration_id,
        migration.sha256,
        migration.artifact_source_commit,
        migration.release_order,
      ],
    );
  }
  await db.query(
    `insert into world_v2.country_candidate_bundle
       (bundle_id, source_thread_id, package_manifest_sha256, source_status)
     values ($1, $2, $3, $4)`,
    [
      'PREVIOUS_MAP_LOCKED',
      'previous-source',
      'a'.repeat(64),
      'ILLUSTRATIVE_PLANNING_ONLY',
    ],
  );
  await db.exec(release.schema);
  for (const query of release.queries.slice(0, 5)) await db.exec(query);
  let partialRejected = false;
  try {
    await db.exec(release.final);
  } catch (error) {
    partialRejected = String(error).includes(
      'Balanced candidate final integrity mismatch',
    );
    await db.exec('rollback;');
  }
  if (!partialRejected)
    throw new Error('BALANCED_CANDIDATE_PARTIAL_IMPORT_NOT_REJECTED');
  for (const query of release.queries.slice(5)) await db.exec(query);
  for (const query of release.queries.slice(0, 5)) await db.exec(query);
  await db.exec(release.final);
  await db.exec(release.final);
  const { rows } = await db.query(`select
    (select count(*)::int from world_v2.country_candidate_bundle) as bundles,
    (select count(*)::int from world_v2.country_candidate_artifact
      where bundle_id = 'BALANCED_2026_09_28_V1') as artifacts,
    (select count(*)::int from world_v2.country_candidate_profile
      where bundle_id = 'BALANCED_2026_09_28_V1') as countries,
    (select count(*)::int from world_v2.country_candidate_bundle
      where bundle_id = 'PREVIOUS_MAP_LOCKED'
        and source_status = 'ILLUSTRATIVE_PLANNING_ONLY') as preserved,
    (select count(*)::int from world_v2.opening_seed) as opening_seeds,
    (select count(*)::int from world_v2.world_head) as world_heads,
    (select count(*)::int from world_v2.schema_release) as releases`);
  const row = rows[0];
  if (
    row.bundles !== 2 ||
    row.artifacts !== release.storageRows ||
    row.countries !== 70 ||
    row.preserved !== 1 ||
    row.opening_seeds !== 0 ||
    row.world_heads !== 0 ||
    row.releases !== 19
  ) {
    throw new Error(
      `BALANCED_CANDIDATE_RELEASE_REHEARSAL_MISMATCH:${JSON.stringify(row)}`,
    );
  }
  process.stdout.write(
    JSON.stringify({
      status: 'PASS',
      database: 'PGlite disposable',
      partialRejected,
      batchCount: release.queries.length,
      maxRequestBytes: release.maxRequestBytes,
      sourceArtifacts: release.sourceArtifacts,
      sourceDriftCount: release.bundle.sourceDrift.length,
      ...row,
    }) + '\n',
  );
} finally {
  await db.close();
}
