// Read-only immutable provenance; no network, database, READY or gate mutation.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const git = (...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const baseline = '42991acfee9d0eacc702ba47a380c938a4516f03';
// Actions headSha is the PR head, NOT the actual checked-out merge SHA.
// Both native job raw logs explicitly git log -1 this immutable commit.
const evidenceCheckout = 'ac3123ed43864a4e5214bb907f62e1b73fadb4be';
const scopes = [
  'packages/core',
  'packages/testkit',
  'apps/world-worker',
  'apps/world-api',
  'tests/world-core',
  'tests/property',
  'tests/support',
  'tests/fixtures',
  'scripts',
  '.github/workflows/v09-postgres.yml',
  '.github/workflows/v09-renewal-supplement.yml',
  'database',
  'pnpm-lock.yaml',
  'package.json',
  'tsconfig.base.json',
  'vitest.config.ts',
  'pnpm-workspace.yaml',
];
function index(ref) {
  return git('ls-tree', '-r', ref, '--', ...scopes)
    .split('\n')
    .map((line) => {
      const [metadata, path] = line.split('\t');
      return { path, blob: metadata.split(' ')[2] };
    });
}
const before = index(evidenceCheckout),
  after = index(baseline);
const lookup = new Map(before.map((row) => [row.path, row.blob]));
const identical = after.filter((row) => lookup.get(row.path) === row.blob);
const changed = after.filter((row) => lookup.get(row.path) !== row.blob);
const deleted = before.filter(
  (row) => !after.some((next) => row.path === next.path),
);
const critical = [
  'tests/world-core/v10.4-local-acceptance.test.ts',
  'tests/world-core/v09-atomic-recovery-postgres.test.ts',
  'tests/world-core/v09-world-recovery-preparation.test.ts',
  'tests/world-core/world-writer-lease-renewal-postgres.test.ts',
  'tests/support/renewal-frozen-migration-fixture.ts',
  'apps/world-worker/src/persistence/atomic-transition-repository.ts',
  'apps/world-worker/src/persistence/postgres-sql-database.ts',
  'apps/world-worker/src/recovery/world-recovery.ts',
];
const pins = critical.map((path) => ({
  path,
  evidenceBlob: git('rev-parse', `${evidenceCheckout}:${path}`),
  baselineBlob: git('rev-parse', `${baseline}:${path}`),
  sha256: sha(
    execFileSync(
      'git',
      ['--no-replace-objects', 'show', `${baseline}:${path}`],
      { cwd: root },
    ),
  ),
}));
const manifestBytes = execFileSync(
  'git',
  [
    '--no-replace-objects',
    'show',
    `${baseline}:database/migrations/manifest.json`,
  ],
  { cwd: root },
);
const result = {
  schemaVersion: 'F_V09_SOURCE_INHERITANCE-1',
  classification: 'BLOB_IDENTITY_ONLY_NOT_REEXECUTION_OR_GATE_APPROVAL',
  workflowHead: '7ad2313cedb26fe1ff8e854208c1965d3a80bb9b',
  evidenceCheckout,
  baseline,
  baselineTree: git('rev-parse', `${baseline}^{tree}`),
  scopes,
  identicalCount: identical.length,
  identicalIndexSha256: sha(JSON.stringify(identical)),
  changed,
  deleted,
  critical: pins,
  migrationManifestSha256: sha(manifestBytes),
  nativePrefix: JSON.parse(manifestBytes)
    .migrations.slice(0, 12)
    .map((m) => ({
      path: m.path,
      sha256: m.sha256,
      sourceCommit: m.artifact_source_commit,
    })),
};
console.log(JSON.stringify(result, null, 2));
// An unrelated HOLD deployment runner difference is disclosed, never inherited.
if (
  deleted.length ||
  changed.some((row) => row.path !== 'scripts/world-runtime-actions.mjs') ||
  pins.some((pin) => pin.evidenceBlob !== pin.baselineBlob)
)
  process.exitCode = 1;
