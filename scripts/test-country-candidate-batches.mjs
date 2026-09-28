import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

import { renderCountryCandidateRelease } from './render-country-candidate-release.mjs';
import { renderCountryCandidateBatches } from './render-country-candidate-batches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await readFile(path.join(root, 'database/migrations/manifest.json'), 'utf8'),
);
const db = new PGlite();
try {
  for (const migration of manifest.migrations.slice(0, 17)) {
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
  const release = await renderCountryCandidateRelease(root);
  const batches = await renderCountryCandidateBatches(root);
  await db.exec(release.schema);
  for (const query of batches.queries.slice(0, 6)) await db.exec(query);
  for (const query of batches.queries) await db.exec(query);
  for (const query of batches.queries) await db.exec(query);
  await db.exec(batches.final);
  const result = await db.query(`select
    (select count(*)::int from world_v2.country_candidate_bundle) as bundles,
    (select count(*)::int from world_v2.country_candidate_artifact) as artifacts,
    (select count(*)::int from world_v2.country_candidate_profile) as countries,
    (select count(*)::int from world_v2.opening_seed) as opening_seeds,
    (select count(*)::int from world_v2.world_head) as world_heads,
    (select count(*)::int from world_v2.schema_release) as releases`);
  const row = result.rows[0];
  if (
    row.bundles !== 1 ||
    row.artifacts !== batches.storageRows ||
    row.countries !== 70 ||
    row.opening_seeds !== 0 ||
    row.world_heads !== 0 ||
    row.releases !== 18
  ) {
    throw new Error(
      `COUNTRY_CANDIDATE_BATCH_REHEARSAL_MISMATCH:${JSON.stringify(row)}`,
    );
  }
  process.stdout.write(
    JSON.stringify({
      status: 'PASS',
      database: 'PGlite disposable',
      batchCount: batches.queries.length,
      maxRequestBytes: batches.maxRequestBytes,
      sourceArtifacts: batches.sourceArtifacts,
      ...row,
    }) + '\n',
  );
} finally {
  await db.close();
}
