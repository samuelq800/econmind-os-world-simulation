import { createHash } from 'node:crypto';
import {
  constants,
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assessEconomicObservation } from './e-economic-assertions.mjs';

const LEDGER_SHA =
  'cedd88979d3cd8dd148d151906ebf5ddee76a76c5c706659676796f58b3a9ccb';
function readPinned(path, expected) {
  if (!/^[a-f0-9]{64}$/u.test(expected)) throw new Error('INVALID_PIN');
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024)
      throw new Error('INVALID_FILE');
    const bytes = readFileSync(fd);
    if (
      bytes.length !== stat.size ||
      createHash('sha256').update(bytes).digest('hex') !== expected
    )
      throw new Error('PIN_MISMATCH');
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    closeSync(fd);
  }
}

export function reviewEconomicInput(ledger, input) {
  if (
    input.schema !== 'e-economic-review-input-v1' ||
    !Array.isArray(input.observations) ||
    input.observations.length === 0 ||
    input.observations.length > 2544
  )
    throw new Error('INVALID_REVIEW_INPUT');
  const rows = new Map(ledger.records.map((r) => [r.stableId, r]));
  if (rows.size !== 2544 || ledger.records.length !== 2544)
    throw new Error('INVALID_ORIGINAL_LEDGER');
  const seen = new Set();
  const results = input.observations.map((o) => {
    if (!rows.has(o.stableId) || seen.has(o.stableId))
      throw new Error('FOREIGN_OR_DUPLICATE_ORIGINAL_ID');
    seen.add(o.stableId);
    return assessEconomicObservation(rows.get(o.stableId), o);
  });
  return {
    schema: 'e-economic-review-result-v1',
    status: 'IMPLEMENTED_UNVERIFIED_REVIEW_ONLY',
    originalPopulation: 2544,
    reviewedObservations: results.length,
    results,
    trust:
      'Pins identify selected bytes, not legal/source/adoption authority. All observations remain declarations.',
    originalClosuresProposed: 0,
    sourceAdopted: false,
    runtimeActivated: false,
    rootRegisterWritten: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 5) throw new Error('USAGE');
    const ledger = readPinned(process.argv[2], LEDGER_SHA);
    const input = readPinned(process.argv[3], process.argv[4]);
    const result = reviewEconomicInput(ledger, input);
    result.inputPins = { ledger: LEDGER_SHA, observations: process.argv[4] };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.results.some(
      (r) => r.conclusion === 'CONTRADICTED',
    )
      ? 1
      : 0;
  } catch {
    process.stderr.write('E_ECONOMIC_REVIEW_INPUT_REJECTED\n');
    process.exitCode = 2;
  }
}
