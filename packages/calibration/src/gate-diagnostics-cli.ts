import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createC4GateDiagnosticsPack,
  createVerifiedC4GateDiagnosticsInputBundle,
  type C4GateDiagnosticsInputBytes,
} from './gate-diagnostics.js';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

async function readInputs(): Promise<C4GateDiagnosticsInputBytes> {
  const read = (relativePath: string): Promise<Buffer> =>
    readFile(path.resolve(repositoryRoot, relativePath));
  const [
    executionContract,
    featureAdmissionExecutionContract,
    featureAdmissionEvidence,
    c4Preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
    variableRegistry,
  ] = await Promise.all([
    read(
      'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
    ),
    read(
      'data/calibration/preflight/c4_feature_admission_execution_contract.v1.json',
    ),
    read('data/calibration/preflight/c4_feature_admission_evidence.v1.json'),
    read('data/calibration/preflight/c4_generation_preflight.v1.json'),
    read('data/calibration/exploration/c3_execution_contract.v1.json'),
    read('data/calibration/exploration/c3_exploration_summary.v1.json'),
    read('data/calibration/exploration/c3_uncertainty_register.v1.json'),
    read('data/calibration/exploration/c3_exploration_manifest.v1.json'),
    read('data/calibration/pilot/normalized_observations.v1.json'),
    read('data/calibration/pilot/quality_diagnostics.v1.json'),
    read('data/calibration/pilot/snapshot_manifest.v1.json'),
    read('data/calibration/pilot/pilot_report.v1.json'),
    read('data/calibration/variable_registry.v2.json'),
  ]);
  return {
    executionContract,
    featureAdmissionExecutionContract,
    featureAdmissionEvidence,
    c4Preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
    normalizedObservations,
    qualityDiagnostics,
    snapshotManifest,
    pilotReport,
    variableRegistry,
  };
}

async function run(): Promise<void> {
  const diagnostics = createC4GateDiagnosticsPack(
    createVerifiedC4GateDiagnosticsInputBundle(await readInputs()),
  );
  const outputPath = path.resolve(
    repositoryRoot,
    'data/calibration/preflight/c4_gate_diagnostics.v1.json',
  );
  await writeFile(
    outputPath,
    `${JSON.stringify(diagnostics, null, 2)}\n`,
    'utf8',
  );
  console.log(
    `C4_GATE_DIAGNOSTICS_VERIFIED_NOT_READY:${diagnostics.contentHash}`,
  );
}

void run();
