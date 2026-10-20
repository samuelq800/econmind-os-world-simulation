import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recover } from './recover.mjs';
import { sha256 } from '../unknown2544-c-physical/candidate.mjs';

const out =
  '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261018/C/v2-water-design';
if (existsSync(out)) throw new Error('FROZEN_OUTPUT_EXISTS');
const repo = fileURLToPath(new URL('../..', import.meta.url));
mkdirSync(out, { recursive: true });
const manifest = [];
function save(name, value) {
  const bytes =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  writeFileSync(`${out}/${name}`, bytes, { flag: 'wx' });
  manifest.push({
    name,
    bytes: Buffer.byteLength(bytes),
    sha256: sha256(bytes),
  });
}
const checks = [
  [
    'eslint',
    process.execPath,
    [
      'node_modules/eslint/bin/eslint.js',
      'tools/unknown2544-c-water-service/recover.mjs',
      'tools/unknown2544-c-water-service/recover.test.mjs',
      'tools/unknown2544-c-water-service/run.mjs',
    ],
  ],
  [
    'format',
    process.execPath,
    [
      'node_modules/prettier/bin/prettier.cjs',
      '--check',
      'tools/unknown2544-c-water-service',
    ],
  ],
  [
    'tests',
    process.execPath,
    ['--test', 'tools/unknown2544-c-water-service/recover.test.mjs'],
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
save('CHECKS.json', {
  node: process.version,
  checks,
  independentEconomicDesignReview: 'PENDING',
  independentEngineeringReview: 'PENDING',
  serviceProducer: 'NOT_IMPLEMENTED_BEFORE_REVIEW',
  old426Replay: 'NOT_RUN',
  oldModels: 'NOT_RUN',
  productionSeed: 'NOT_RUN',
  clock: 'NOT_STARTED',
});
if (checks.some((c) => c.exitCode !== 0))
  throw new Error('CHECK_FAILED_LOGS_PRESERVED');
const result = recover(),
  second = recover();
if (JSON.stringify(result) !== JSON.stringify(second))
  throw new Error('SOURCE_DELTA_REPLAY_MISMATCH');
save('SOURCE_DELTA.json', result);
save(
  'INPUT_CONTRACT_CANDIDATE.json',
  readFileSync(
    new URL('./INPUT_CONTRACT_CANDIDATE.json', import.meta.url),
    'utf8',
  ),
);
const git = (args) => {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
};
save('FREEZE.json', {
  head: git(['rev-parse', 'HEAD']),
  tree: git(['rev-parse', 'HEAD^{tree}']),
  parent: git(['rev-parse', 'HEAD^']),
  d69ParentUnchanged: 'd69d5479f43dcf465f4e8d817f476e384d7141a2',
  scope:
    'COUNTRY_01 unit water-operation recipe source recovery and proposed exact input contract; no national minimum or complete-cost acceptance',
  deterministicTwoRecoveryPasses: true,
  sourceAccounting:
    '13 distinct pinned source buffers per recovery; two top-level recovery passes plus one recovery in child tests; configuration/tool/module reads and other process IO are outside this source-buffer count',
  rawNumericTokensPreserved: true,
  originalFieldsClosed: 0,
  codeFiles: [
    'source-pins.json',
    'INPUT_CONTRACT_CANDIDATE.json',
    'recover.mjs',
    'recover.test.mjs',
    'run.mjs',
    'README.md',
  ].map((name) => ({
    name,
    sha256: sha256(readFileSync(new URL(name, import.meta.url))),
  })),
});
save('MANIFEST.json', {
  purpose:
    'Immutable proposed design/source delta for E-first economic/units review and B necessary seam review; not approval or adoption',
  files: manifest,
});
process.stdout.write(
  JSON.stringify({
    out,
    sourceBuffers: result.receipt.length,
    operationSkillCoefficients: result.coefficients.workerDaysBySkill.map(
      (r) => r.canonicalDecimal,
    ),
    candidateNetYield: result.combinedCandidateYield.amount,
    conflicts: result.conflicts.length,
    independentReview: 'PENDING',
    serviceProducer: 'NOT_IMPLEMENTED_BEFORE_REVIEW',
  }) + '\n',
);
