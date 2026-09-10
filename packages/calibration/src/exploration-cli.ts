import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createC3ExplorationManifest,
  createC3ExplorationSummary,
  createC3UncertaintyRegister,
  createVerifiedC3FrozenInputBundle,
  type C3FrozenInputBytes,
} from './exploration.js';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const explorationDirectory = path.join(
  repositoryRoot,
  'data/calibration/exploration',
);

function absoluteRepositoryPath(relativePath: string): string {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  if (!absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error(`C3_INPUT_PATH_OUTSIDE_REPOSITORY:${relativePath}`);
  }
  return absolutePath;
}

async function readFrozenInputs(): Promise<C3FrozenInputBytes> {
  const [
    executionContract,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
  ] = await Promise.all([
    readFile(
      absoluteRepositoryPath(
        'data/calibration/exploration/c3_execution_contract.v1.json',
      ),
    ),
    readFile(
      absoluteRepositoryPath(
        'data/calibration/pilot/normalized_observations.v1.json',
      ),
    ),
    readFile(
      absoluteRepositoryPath(
        'data/calibration/pilot/quality_diagnostics.v1.json',
      ),
    ),
    readFile(
      absoluteRepositoryPath(
        'data/calibration/pilot/snapshot_manifest.v1.json',
      ),
    ),
    readFile(
      absoluteRepositoryPath('data/calibration/pilot/pilot_report.v1.json'),
    ),
  ]);
  return {
    executionContract,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
  };
}

async function writeJson(relativePath: string, value: unknown): Promise<void> {
  await writeFile(
    path.join(explorationDirectory, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

async function run(): Promise<void> {
  await mkdir(explorationDirectory, { recursive: true });
  const bundle = createVerifiedC3FrozenInputBundle(await readFrozenInputs());
  const summary = createC3ExplorationSummary(bundle);
  const uncertainty = createC3UncertaintyRegister(bundle);
  const outputManifest = createC3ExplorationManifest(
    bundle,
    summary,
    uncertainty,
  );
  await Promise.all([
    writeJson('c3_exploration_summary.v1.json', summary),
    writeJson('c3_uncertainty_register.v1.json', uncertainty),
    writeJson('c3_exploration_manifest.v1.json', outputManifest),
  ]);
}

await run();
