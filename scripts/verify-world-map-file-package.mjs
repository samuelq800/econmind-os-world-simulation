import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(
  root,
  'artifacts/world-map-files-v1/manifest.json',
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isIncluded = (name) =>
  name.startsWith('artifacts/world-geography/') ||
  /^apps\/world-web\/src\/map-lab\/[^/]+\.json$/u.test(name) ||
  /^apps\/world-web\/src\/assets\/(?:asterra-satellite-terrain-v8\.png|(?:country-scenes|country-detail|continent-scenes)\/[^/]+\.(?:png|svg|json))$/u.test(
    name,
  );

const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'buffer',
  maxBuffer: 4 * 1024 * 1024,
});
const tracked = stdout.toString('utf8').split('\0').filter(Boolean);
const paths = tracked.filter(isIncluded).sort();
const count = (pattern) => paths.filter((name) => pattern.test(name)).length;
const expectedCounts = {
  countryScenes: count(
    /^apps\/world-web\/src\/assets\/country-scenes\/[0-9]{2}\.png$/u,
  ),
  countryDetails: count(
    /^apps\/world-web\/src\/assets\/country-detail\/[0-9]{2}-[^/]+\.svg$/u,
  ),
  continents: count(
    /^apps\/world-web\/src\/assets\/continent-scenes\/[^/]+\.png$/u,
  ),
  baseMaps: count(
    /^apps\/world-web\/src\/assets\/asterra-satellite-terrain-v8\.png$/u,
  ),
  geographyPreviews: count(
    /^artifacts\/world-geography\/previews\/[^/]+\.png$/u,
  ),
  atlasSourceJson: count(/^apps\/world-web\/src\/map-lab\/[^/]+\.json$/u),
};
if (
  expectedCounts.countryScenes !== 70 ||
  expectedCounts.countryDetails !== 70 ||
  expectedCounts.continents !== 4 ||
  expectedCounts.baseMaps !== 1 ||
  expectedCounts.geographyPreviews !== 15 ||
  expectedCounts.atlasSourceJson !== 4
) {
  throw new Error(
    `WORLD_MAP_FILE_COVERAGE_INVALID:${JSON.stringify(expectedCounts)}`,
  );
}
const files = [];
for (const name of paths) {
  const bytes = await readFile(path.join(root, name));
  files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
}
const computed = {
  packageId: 'WORLD_MAP_FILES_V1_2026_09_28',
  sourceThreadId: '01a0e1b0-603c-7e13-81de-2cddb9c5d4c1',
  authority: 'VERSIONED_FILE_ASSETS_ONLY_NOT_WORLD_STATE',
  files,
};
if (process.argv.includes('--write')) {
  await writeFile(manifestPath, JSON.stringify(computed, null, 2) + '\n');
} else {
  const recorded = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (JSON.stringify(recorded) !== JSON.stringify(computed)) {
    throw new Error('WORLD_MAP_FILE_MANIFEST_MISMATCH');
  }
}
process.stdout.write(
  JSON.stringify({
    status: 'PASS',
    packageId: computed.packageId,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    ...expectedCounts,
  }) + '\n',
);
