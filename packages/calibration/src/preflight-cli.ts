import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyC4GenerationPreflight,
  type C4GenerationPreflightBytes,
} from './preflight.js';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

async function readPreflightBytes(): Promise<C4GenerationPreflightBytes> {
  const read = (relativePath: string): Promise<Buffer> =>
    readFile(path.resolve(repositoryRoot, relativePath));
  const [
    preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
  ] = await Promise.all([
    read('data/calibration/preflight/c4_generation_preflight.v1.json'),
    read('data/calibration/exploration/c3_execution_contract.v1.json'),
    read('data/calibration/exploration/c3_exploration_summary.v1.json'),
    read('data/calibration/exploration/c3_uncertainty_register.v1.json'),
    read('data/calibration/exploration/c3_exploration_manifest.v1.json'),
  ]);
  return {
    preflight,
    c3ExecutionContract,
    c3Summary,
    c3UncertaintyRegister,
    c3Manifest,
  };
}

async function run(): Promise<void> {
  const preflight = verifyC4GenerationPreflight(await readPreflightBytes());
  if (preflight.finalGeneratorReady) {
    throw new Error('C4_PREFLIGHT_MUST_NOT_AUTHORIZE_FINAL_GENERATOR');
  }
  console.log(`C4_PREFLIGHT_VERIFIED_NOT_READY:${preflight.contentHash}`);
}

void run();
