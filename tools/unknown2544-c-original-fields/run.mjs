/** Freeze one small offline packet. Exclusive files; no source/register writes. */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { SOURCE_PINS, createOriginalFieldConsumer } from './bridge.mjs';
import { sha256 } from '../unknown2544-c-physical/candidate.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const out = process.argv[2];
const allowedParent =
  '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-resume-20261018/C/';
if (
  !out ||
  !isAbsolute(out) ||
  !resolve(out).startsWith(allowedParent) ||
  resolve(out) === allowedParent.slice(0, -1)
)
  throw new Error('EXPLICIT_C_EVIDENCE_CHILD_DIRECTORY_REQUIRED');
if (existsSync(out)) throw new Error('IMMUTABLE_OUTPUT_ALREADY_EXISTS');
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`GIT_READ_FAILED:${r.stderr}`);
  return r.stdout.trim();
};
if (git('status', '--porcelain') !== '')
  throw new Error('COMMIT_CANDIDATE_BEFORE_FREEZE');
if (process.version !== 'v24.20.0')
  throw new Error('PINNED_NODE_24_20_0_REQUIRED');
const target = {
  commitSha: git('rev-parse', 'HEAD'),
  treeSha: git('rev-parse', 'HEAD^{tree}'),
  baseCommit: SOURCE_PINS.baseCommit,
};
const registerPath =
  '/Users/samuel/Documents/econclub/.econmind-artifacts/unknown2544-closure-20261015/closure-register.json';
const registerBefore = sha256(readFileSync(registerPath));
mkdirSync(out, { recursive: false });
const files = [];
function save(name, value) {
  const bytes =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  writeFileSync(resolve(out, name), bytes, { flag: 'wx' });
  const pin = { name, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) };
  files.push(pin);
  return pin;
}
const checks = [];
const folder = 'tools/unknown2544-c-original-fields';
for (const [name, args] of [
  ['tests', ['--test', '--test-reporter=tap', `${folder}/bridge.test.mjs`]],
  [
    'eslint',
    [
      'node_modules/eslint/bin/eslint.js',
      `${folder}/bridge.mjs`,
      `${folder}/bridge.test.mjs`,
      `${folder}/run.mjs`,
    ],
  ],
  ['format', ['node_modules/prettier/bin/prettier.cjs', '--check', folder]],
]) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  save(`${name}.stdout.log`, r.stdout ?? '');
  save(`${name}.stderr.log`, r.stderr ?? '');
  checks.push({
    name,
    command: [process.execPath, ...args],
    exitCode: r.status,
    error: r.error?.message ?? null,
  });
}
const diffCheck = spawnSync(
  'git',
  ['diff', '--check', `${SOURCE_PINS.baseCommit}..HEAD`],
  { cwd: root, encoding: 'utf8' },
);
save('diff-check.stdout.log', diffCheck.stdout ?? '');
save('diff-check.stderr.log', diffCheck.stderr ?? '');
checks.push({
  name: 'diff-check',
  command: ['git', 'diff', '--check', `${SOURCE_PINS.baseCommit}..HEAD`],
  exitCode: diffCheck.status,
});
save('CHECKS.json', {
  ...target,
  node: process.version,
  checks,
  fullCI: 'NOT_RUN_ROOT_BATCH_ONLY',
});
if (checks.some((c) => c.exitCode !== 0))
  throw new Error('FOCUSED_CHECK_FAILED_EVIDENCE_PRESERVED');
const buffers = Object.fromEntries(
  Object.entries(SOURCE_PINS.sources).map(([key, pin]) => [
    key,
    readFileSync(resolve(root, pin.path)),
  ]),
);
const consumer = createOriginalFieldConsumer(buffers);
const packet = consumer.snapshot();
const candidatePin = save('CANDIDATE_16.json', packet);
const reads = packet.rows.map((row, index) => {
  const request = {
    mode: 'REFERENCE_INPUTS_ONLY',
    stableId: row.stableId,
    countryId: row.countryId,
    originalUnit: row.candidateMeasure.unit,
    currency: null,
    periodOrValueDate: null,
  };
  return {
    rowPointer: `/rows/${index}`,
    request,
    result: consumer.read(request),
  };
});
save('ISOLATED_READS.json', {
  ...target,
  command: [process.execPath, fileURLToPath(import.meta.url), out],
  environment: 'LOCAL_OFFLINE_NO_WORLD_NO_CLOCK_NO_NETWORK_NO_SQL',
  candidatePin,
  reads,
  interpretation:
    '16 executed reference-input reads; zero original actual/minimum/complete-cost acceptance',
});
const rejects = [];
for (const [name, changes] of [
  ['actual', { mode: 'ACTUAL' }],
  ['minimum', { mode: 'MINIMUM' }],
  ['complete-cost', { mode: 'COMPLETE_COST' }],
  ['wrong-country', { countryId: 'COUNTRY_53' }],
  ['wrong-unit', { originalUnit: 'WORKER_DAY' }],
  ['invented-period', { periodOrValueDate: 'DAY_1' }],
  ['invented-currency', { currency: 'XAA' }],
  ['forged-adoption', { formallyAdopted: true }],
  ['double-count-wages', { addWagesAgain: true }],
  ['fixture-promotion', { evidenceClass: 'TEST_ONLY' }],
  [
    'outside-subset',
    { stableId: 'U2544::COUNTRY::COUNTRY_13::transportMinimum' },
  ],
]) {
  try {
    consumer.read({ ...reads[0].request, ...changes });
    rejects.push({ name, status: 'UNEXPECTED_ACCEPT' });
  } catch (error) {
    rejects.push({ name, status: 'REJECTED', diagnostic: error.message });
  }
}
try {
  createOriginalFieldConsumer({ ...buffers, repair: Buffer.from('{}') });
  rejects.push({ name: 'source-drift', status: 'UNEXPECTED_ACCEPT' });
} catch (error) {
  rejects.push({
    name: 'source-drift',
    status: 'REJECTED',
    diagnostic: error.message,
  });
}
save('REJECTIONS.json', rejects);
if (rejects.some((r) => r.status !== 'REJECTED'))
  throw new Error('REJECTION_FAILED');
const registerAfter = sha256(readFileSync(registerPath));
if (registerBefore !== registerAfter)
  throw new Error('REGISTER_CHANGED_EXTERNALLY_DURING_RUN');
save('INTAKE.json', {
  ...target,
  author: 'C',
  status: 'IMPLEMENTED_UNVERIFIED',
  candidatePin,
  subset: packet.subset,
  perId: packet.rows.map((row, i) => ({
    stableId: row.stableId,
    parentBatch: row.parentBatch,
    immutableCandidate: {
      ...target,
      author: 'C',
      artifactPath: resolve(out, candidatePin.name),
      artifactSha256: candidatePin.sha256,
      rowPointer: `/rows/${i}`,
    },
    isolatedReadReceipt: {
      path: resolve(out, 'ISOLATED_READS.json'),
      pointer: `/reads/${i}`,
    },
    actualResultStatus: 'BLOCKED_MISSING_SOURCE_OR_ADOPTION',
    independentAcceptance: null,
  })),
  reviewRequest: {
    reviewers: [
      'B: exact subset binding and isolated engineering reads/rejections',
      'E: reference semantics, source/adoption boundaries; no new economic choice approved',
    ],
    exactCodeTarget: target,
    RootOnlyRegisterWriter: true,
  },
  originalFieldsClosed: 0,
  runtimeWiring: 'NOT_IMPLEMENTED_NOT_AUTHORIZED',
  nonCOwnedSeamsReadOnly: [
    'packages/core/src/water/foundation.ts',
    'apps/world-worker/src/preparation/official-water-opening-adoption.ts',
  ],
  register: {
    path: registerPath,
    beforeSha256: registerBefore,
    afterSha256: registerAfter,
    written: false,
  },
  sourceReadScope:
    '9 small pinned buffers; reused C derived receipts; no 107MB journals, no 426-action rebuild or 140-day model run',
  fullCI: 'NOT_RUN_ROOT_BATCH_ONLY',
  productionWrites: false,
  WorldClockStarted: false,
});
save('MANIFEST.json', {
  ...target,
  files: [...files],
  sourcePins: SOURCE_PINS,
  selfHashOmitted: true,
});
console.log(
  JSON.stringify({
    out,
    ...target,
    candidatePin,
    rows: reads.length,
    rejects: rejects.length,
    originalFieldsClosed: 0,
  }),
);
