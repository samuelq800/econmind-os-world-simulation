/** Fixed local evidence output. Refuses overwrites and never executes old models. */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCandidate, sha256, verifyBytes } from './candidate.mjs';

const out =
  '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261018/C/v1-candidate';
if (existsSync(out)) throw new Error('IMMUTABLE_OUTPUT_ALREADY_EXISTS');
const pinPath = fileURLToPath(new URL('./source-pins.json', import.meta.url));
const pins = JSON.parse(readFileSync(pinPath));
const receipt = [];
const input = Object.fromEntries(
  Object.entries(pins.sources).map(([key, pin]) => {
    const bytes = readFileSync(pin.path);
    const parsed = verifyBytes(bytes, pin);
    receipt.push({ key, ...pin, bytes: bytes.length, verification: 'PASS' });
    return [key, parsed];
  }),
);
mkdirSync(out, { recursive: true });
const files = [];
function save(name, value) {
  const bytes =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  writeFileSync(`${out}/${name}`, bytes, { flag: 'wx' });
  files.push({ name, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) });
}
save('SOURCE_RECEIPT.json', {
  scope:
    'Exact 12 pinned buffers; not all OS/tool IO; large raw journals and old replay not invoked',
  sources: receipt,
});
const repo = fileURLToPath(new URL('../..', import.meta.url));
const boundedChecks = [
  [
    'eslint',
    process.execPath,
    [
      'node_modules/eslint/bin/eslint.js',
      'tools/unknown2544-c-physical/candidate.mjs',
      'tools/unknown2544-c-physical/candidate.test.mjs',
      'tools/unknown2544-c-physical/run.mjs',
    ],
  ],
  [
    'format',
    process.execPath,
    [
      'node_modules/prettier/bin/prettier.cjs',
      '--check',
      'tools/unknown2544-c-physical',
    ],
  ],
  ['diff-check', 'git', ['diff', '--check']],
].map(([name, command, args]) => {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  save(`${name}.stdout.log`, result.stdout ?? '');
  save(`${name}.stderr.log`, result.stderr ?? '');
  return {
    name,
    command: [command, ...args],
    exitCode: result.status,
    error: result.error?.message ?? null,
  };
});
save('BOUNDED_CHECK_EXECUTION.json', boundedChecks);
if (boundedChecks.some((result) => result.exitCode !== 0))
  throw new Error('BOUNDED_CHECK_FAILED_LOGS_PRESERVED');
const test = spawnSync(
  process.execPath,
  ['--test', fileURLToPath(new URL('./candidate.test.mjs', import.meta.url))],
  { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
);
save('test.stdout.log', test.stdout ?? '');
save('test.stderr.log', test.stderr ?? '');
save('TEST_EXECUTION.json', {
  command: [
    process.execPath,
    '--test',
    'tools/unknown2544-c-physical/candidate.test.mjs',
  ],
  nodeVersion: process.version,
  exitCode: test.status,
  error: test.error?.message ?? null,
});
if (test.status !== 0) throw new Error('FOCUSED_TESTS_FAILED_LOGS_PRESERVED');
const candidate = buildCandidate(input);
const second = buildCandidate(input);
const replayMatch = JSON.stringify(candidate) === JSON.stringify(second);
if (!replayMatch) throw new Error('CANDIDATE_REPLAY_MISMATCH');
for (const pin of Object.values(pins.sources))
  verifyBytes(readFileSync(pin.path), pin);
const { coverage, ...support } = candidate;
save('CANDIDATE.json', support);
save('COVERAGE.json', {
  originalUniverse: 'UNKNOWN2544',
  sourceLedgerSha256: pins.sources.ledger.sha256,
  dependencies: candidate.dependencies,
  records: coverage,
});
save('SUMMARY.json', candidate.summary);
save('CHECKS.json', {
  focusedTestsExitCode: test.status,
  exact426KnownCostComparisons: 'PASS',
  exact560OriginalIdAndBatchCoverage: 'PASS',
  sourceBytesUnchangedAfterRun: 'PASS',
  deterministicTwoBuildReplay: replayMatch,
  originalFieldValidation: 'NOT_PASSED_MISSING_DEPENDENCIES',
  independentReview: 'NOT_RUN',
  repoWideChecks: 'NOT_RUN_NOT_RUNTIME_CHANGE',
  productionSeed: 'NOT_RUN',
  clock: 'NOT_STARTED',
});
const git = (args) => {
  const r = spawnSync('git', args, {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
save('CODE_RECEIPT.json', {
  baseCommit: pins.baseCommit,
  head: git(['rev-parse', 'HEAD']),
  tree: git(['rev-parse', 'HEAD^{tree}']),
  authoredFiles: [
    'source-pins.json',
    'candidate.mjs',
    'candidate.test.mjs',
    'run.mjs',
    'README.md',
  ].map((name) => ({
    name,
    sha256: sha256(readFileSync(new URL(name, import.meta.url))),
  })),
  unchangedArithmeticPrimitive: {
    path: 'packages/testkit/src/exact-decimal-oracle.ts',
    sha256: sha256(
      readFileSync(
        new URL(
          '../../packages/testkit/src/exact-decimal-oracle.ts',
          import.meta.url,
        ),
      ),
    ),
  },
});
save('MANIFEST.json', {
  scope:
    'C non-authoritative physical known-components candidate; not approval or field closure',
  files,
});
process.stdout.write(
  JSON.stringify({ out, summary: candidate.summary, replayMatch }) + '\n',
);
