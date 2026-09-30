import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWorldV2ApiReaderRelease } from './render-world-v2-api-reader-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = await renderWorldV2ApiReaderRelease(root);

assert.equal(
  release.migration.migration_id,
  '0020_world_v2_official_country_reader',
);
assert.equal(release.migration.release_order, 20);
assert.equal(
  release.migration.sha256,
  '083e06aca86763e4bc32a34347c1a86b26aa910f3c6a191b9393021347211618',
);
assert.ok(
  release.query.includes(
    'World V2 release ledger is not the exact reviewed 19-artifact baseline',
  ),
);
assert.ok(release.query.includes('create role world_v2_api_reader'));
assert.ok(release.query.includes('create role world_v2_api_login'));
assert.ok(
  release.query.includes('grant world_v2_api_reader to world_v2_api_login'),
);
assert.ok(
  release.query.includes(
    'country_candidate_artifact_selected_source_server_read',
  ),
);
assert.ok(release.query.includes("bundle_id = 'BALANCED_2026_09_28_V1'"));
assert.ok(
  release.query.includes(
    "artifact_path = 'source/646174612f636f756e74726965732e6a736f6e'",
  ),
);
assert.ok(release.query.includes('reader_membership'));
assert.ok(release.query.includes('set_option'));
assert.ok(release.query.includes('selected_source_policies'));
assert.ok(release.query.includes('column_select_privileges'));
assert.ok(release.query.includes('table_select_privileges'));
assert.ok(release.query.includes('nonselect_table_privileges'));
assert.ok(release.query.includes('schema_usage'));
assert.ok(
  Buffer.byteLength(JSON.stringify({ query: release.query })) < 100_000,
);

process.stdout.write(
  JSON.stringify({
    status: 'PASS',
    migrationId: release.migration.migration_id,
    requestBytes: Buffer.byteLength(JSON.stringify({ query: release.query })),
    authority: 'RENDER_ONLY_NOT_PUBLISHED',
  }) + '\n',
);
