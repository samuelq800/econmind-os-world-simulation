import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from './migration-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await readFile(path.join(root, 'database/migrations/manifest.json'), 'utf8'),
);
const artifacts = new Map();
for (const migration of manifest.migrations) {
  const artifactPath = path.resolve(root, migration.path);
  if (!artifactPath.startsWith(`${root}${path.sep}`)) continue;
  artifacts.set(migration.path, await readFile(artifactPath));
}
const provenance = await readMigrationGitProvenance(root, manifest.migrations);
const result = validateMigrationManifest(manifest, artifacts, provenance);
console.log(JSON.stringify(result, null, 2));
if (result.status !== 'PASS') process.exitCode = 1;
