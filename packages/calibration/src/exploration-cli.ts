import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Bytes } from './canonical.js';
import {
  contractCanonicalHash,
  createC3ExplorationManifest,
  createC3ExplorationSummary,
  createC3UncertaintyRegister,
  type ArtifactHashBinding,
  type C3DiagnosticCount,
  type C3ExplorationContract,
  type C3ProviderRun,
  type C3UncertaintyEvidence,
} from './exploration.js';
import type { NormalizedObservation } from './types.js';

interface C2NormalizedArtifact {
  readonly status: string;
  readonly observations: readonly NormalizedObservation[];
}

interface C2QualityArtifact {
  readonly status: string;
  readonly diagnostics: readonly { readonly code: string }[];
}

interface C2SnapshotManifest {
  readonly snapshots: readonly {
    readonly sourceId: string;
    readonly endpointIdentity: string;
  }[];
}

interface C2PilotReport {
  readonly status: string;
  readonly providerRuns: readonly C3ProviderRun[];
  readonly revisionVintageObservations: readonly string[];
  readonly providerSpecificCaveats: Readonly<Record<string, string>>;
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../',
);
const explorationDirectory = path.join(
  repositoryRoot,
  'data/calibration/exploration',
);
const REQUIRED_C2_INPUT_PATHS = Object.freeze([
  'data/calibration/pilot/normalized_observations.v1.json',
  'data/calibration/pilot/quality_diagnostics.v1.json',
  'data/calibration/pilot/snapshot_manifest.v1.json',
  'data/calibration/pilot/pilot_report.v1.json',
]);

function compareText(left: string, right: string): -1 | 0 | 1 {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function absoluteRepositoryPath(relativePath: string): string {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  if (!absolutePath.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error(`C3_INPUT_PATH_OUTSIDE_REPOSITORY:${relativePath}`);
  }
  return absolutePath;
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(absoluteRepositoryPath(relativePath), 'utf8'),
  ) as T;
}

async function readBoundArtifacts(
  contract: C3ExplorationContract,
): Promise<readonly ArtifactHashBinding[]> {
  return Promise.all(
    contract.c2ReviewTarget.inputArtifacts.map(async ({ path: inputPath }) => ({
      path: inputPath,
      sha256: sha256Bytes(await readFile(absoluteRepositoryPath(inputPath))),
    })),
  );
}

function validateC3InputPaths(contract: C3ExplorationContract): void {
  const configured = contract.c2ReviewTarget.inputArtifacts
    .map(({ path: inputPath }) => inputPath)
    .sort(compareText);
  const required = [...REQUIRED_C2_INPUT_PATHS].sort(compareText);
  if (
    configured.length !== required.length ||
    configured.some((inputPath, index) => inputPath !== required[index])
  ) {
    throw new Error('C3_INPUT_PATH_SET_MISMATCH');
  }
}

function diagnosticCounts(
  diagnostics: readonly { readonly code: string }[],
): readonly C3DiagnosticCount[] {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([code, count]) => ({ code, count }));
}

function validateC2ProviderTruth(
  contract: C3ExplorationContract,
  report: C2PilotReport,
  manifest: C2SnapshotManifest,
): void {
  if (report.status !== contract.c2ReviewTarget.normalizedObservationStatus) {
    throw new Error('C3_C2_REPORT_STATUS_MISMATCH');
  }
  const wto = report.providerRuns.find(
    ({ sourceId }) => sourceId === 'WTO_TIMESERIES_V1',
  );
  if (
    wto?.status !== 'NOT_FETCHED' ||
    !wto.issues.includes('WTO_API_KEY_MISSING')
  ) {
    throw new Error('C3_WTO_PARTIAL_PILOT_TRUTH_NOT_PRESERVED');
  }
  const comtradeSnapshots = manifest.snapshots.filter(
    ({ sourceId }) => sourceId === 'UN_COMTRADE_V1',
  );
  if (
    comtradeSnapshots.length === 0 ||
    comtradeSnapshots.some(
      ({ endpointIdentity }) =>
        endpointIdentity !== 'UN_COMTRADE_PUBLIC_PREVIEW_V1',
    )
  ) {
    throw new Error('C3_COMTRADE_PUBLIC_PREVIEW_TRUTH_NOT_PRESERVED');
  }
  if (!manifest.snapshots.some(({ sourceId }) => sourceId === 'WB_WDI_V2')) {
    throw new Error('C3_WDI_PILOT_TRUTH_NOT_PRESERVED');
  }
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
  const contract = await readJson<C3ExplorationContract>(
    'data/calibration/exploration/c3_execution_contract.v1.json',
  );
  validateC3InputPaths(contract);
  const artifactBindings = await readBoundArtifacts(contract);
  const [normalized, quality, manifest, report] = await Promise.all([
    readJson<C2NormalizedArtifact>(
      'data/calibration/pilot/normalized_observations.v1.json',
    ),
    readJson<C2QualityArtifact>(
      'data/calibration/pilot/quality_diagnostics.v1.json',
    ),
    readJson<C2SnapshotManifest>(
      'data/calibration/pilot/snapshot_manifest.v1.json',
    ),
    readJson<C2PilotReport>('data/calibration/pilot/pilot_report.v1.json'),
  ]);
  if (
    normalized.status !== contract.c2ReviewTarget.normalizedObservationStatus
  ) {
    throw new Error('C3_C2_NORMALIZED_STATUS_MISMATCH');
  }
  if (quality.status !== normalized.status) {
    throw new Error('C3_C2_QUALITY_STATUS_MISMATCH');
  }
  validateC2ProviderTruth(contract, report, manifest);
  const input = {
    c2ReviewTargetCommit: contract.c2ReviewTarget.commit,
    contractCanonicalHash: contractCanonicalHash(contract),
    artifacts: [...artifactBindings].sort((left, right) =>
      compareText(left.path, right.path),
    ),
  };
  const summary = createC3ExplorationSummary(
    contract,
    input,
    normalized.observations,
  );
  const uncertaintyEvidence: C3UncertaintyEvidence = {
    diagnosticCounts: diagnosticCounts(quality.diagnostics),
    providerRuns: report.providerRuns,
    revisionVintageObservations: report.revisionVintageObservations,
    providerSpecificCaveats: report.providerSpecificCaveats,
  };
  const uncertainty = createC3UncertaintyRegister(
    contract,
    input,
    uncertaintyEvidence,
  );
  const outputManifest = createC3ExplorationManifest(
    contract,
    input,
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
