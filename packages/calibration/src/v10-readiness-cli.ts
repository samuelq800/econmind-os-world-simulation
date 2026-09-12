import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createV10DataHandoffReadinessAssessment,
  createVerifiedV10DataHandoffPolicyBundle,
} from './v10-readiness.js';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

async function run(): Promise<void> {
  const read = (relativePath: string): Promise<Buffer> =>
    readFile(path.resolve(repositoryRoot, relativePath));
  const [policyContract, diagnosticsExecutionContract, diagnosticsPack] =
    await Promise.all([
      read(
        'data/calibration/preflight/v10_data_handoff_readiness_contract.v1.json',
      ),
      read(
        'data/calibration/preflight/c4_gate_diagnostics_execution_contract.v1.json',
      ),
      read('data/calibration/preflight/c4_gate_diagnostics.v1.json'),
    ]);
  const assessment = createV10DataHandoffReadinessAssessment(
    createVerifiedV10DataHandoffPolicyBundle({
      policyContract,
      diagnosticsExecutionContract,
      diagnosticsPack,
    }),
  );
  const outputPath = path.resolve(
    repositoryRoot,
    'data/calibration/preflight/v10_data_handoff_readiness.v1.json',
  );
  await writeFile(
    outputPath,
    `${JSON.stringify(assessment, null, 2)}\n`,
    'utf8',
  );
  console.log(
    `V10_DATA_HANDOFF_NOT_READY:${assessment.summary.openGateCount}:${assessment.contentHash}`,
  );
}

void run();
