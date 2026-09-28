import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { loadBalancedCountryCandidate } from './balanced-country-candidate-intake.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selection = JSON.parse(
  await readFile(path.join(root, 'status/world-data-selection.json'), 'utf8'),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

if (
  selection.decision !== 'OWNER_SELECTED_OFFICIAL_WORLD_V2_DATA_BASELINE' ||
  selection.balancedData.packageId !== 'BALANCED_2026_09_28_V1' ||
  selection.balancedData.path !== 'artifacts/world-balanced-candidate-v1' ||
  selection.mapFiles.packageId !== 'WORLD_MAP_FILES_V1_2026_09_28' ||
  selection.mapFiles.manifestPath !==
    'artifacts/world-map-files-v1/manifest.json' ||
  selection.runtime.worldId !== null ||
  selection.runtime.openingSeedCommitted !== false ||
  selection.runtime.workerStarted !== false
) {
  throw new Error('WORLD_DATA_SELECTION_INVALID');
}

const source = await loadBalancedCountryCandidate(root);
const countries = await readFile(
  path.join(
    root,
    selection.balancedData.path,
    selection.balancedData.countriesPath,
  ),
);
if (
  source.candidateId !== selection.balancedData.packageId ||
  source.manifestSha256 !== selection.balancedData.checksumsSha256 ||
  source.artifacts.length !== selection.balancedData.checksumEntries + 1 ||
  source.countries.length !== selection.balancedData.countryCount ||
  source.population !== selection.balancedData.populationTotal ||
  hash(countries) !== selection.balancedData.countriesSha256 ||
  source.sourceDrift.length !== 3
) {
  throw new Error('WORLD_DATA_SELECTION_SOURCE_MISMATCH');
}

const mapManifest = await readFile(
  path.join(root, selection.mapFiles.manifestPath),
);
const mapFiles = JSON.parse(mapManifest.toString('utf8')).files;
if (
  hash(mapManifest) !== selection.mapFiles.manifestSha256 ||
  mapFiles.length !== selection.mapFiles.fileCount
) {
  throw new Error('WORLD_DATA_SELECTION_MAP_MANIFEST_MISMATCH');
}
await execFileAsync('node', ['scripts/verify-world-map-file-package.mjs'], {
  cwd: root,
});

process.stdout.write(
  JSON.stringify({
    status: 'PASS',
    decision: selection.decision,
    countryCount: source.countries.length,
    population: source.population,
    sourceArtifacts: source.artifacts.length,
    mapFiles: mapFiles.length,
    currentAtlasDriftedSnapshots: source.sourceDrift.length,
    operationalWorldCreated: false,
  }) + '\n',
);
