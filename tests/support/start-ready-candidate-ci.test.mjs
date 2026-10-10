// Bounded pure CI controls. No full check, compiler, database or provider runs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  BASE,
  CONFIGS,
  REQUIRED_INPUTS,
  TYPE_ARGUMENTS,
  completeNativeResult,
  freshReceipt,
  missingInputs,
  runLogged,
  sourceIdentity,
} from './start-ready-candidate-ci.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'start-ready-ci-contract-'));
const fixture = path.join(directory, 'git-fixture');
mkdirSync(fixture);
const git = (...args) =>
  execFileSync('git', args, {
    cwd: fixture,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'CI Contract',
      GIT_AUTHOR_EMAIL: 'ci@example.invalid',
      GIT_COMMITTER_NAME: 'CI Contract',
      GIT_COMMITTER_EMAIL: 'ci@example.invalid',
    },
  }).trim();
git('init', '--quiet');
writeFileSync(path.join(fixture, 'fixture.txt'), 'pure CI identity\n');
git('add', 'fixture.txt');
git('commit', '--quiet', '-m', 'Pure CI identity fixture');

test('exact base, four mandatory configs and strict compiler switches', () => {
  assert.equal(BASE, '42991acfee9d0eacc702ba47a380c938a4516f03');
  assert.deepEqual(CONFIGS, [
    'tests/support/tsconfig.formal-financial-opening.json',
    'tests/world-web/office-command.tsconfig.json',
    'tests/world-core/writer-lease-supervisor.tsconfig.json',
    'tests/support/tsconfig.f-v09-native-claim.json',
  ]);
  assert.deepEqual(TYPE_ARGUMENTS, [
    '--noEmit',
    '--strict',
    '--skipLibCheck',
    'false',
  ]);
  assert.ok(CONFIGS.every((config) => REQUIRED_INPUTS.includes(config)));
});

test('missing combined inputs are reported, never optional or silently skipped', () => {
  assert.deepEqual(missingInputs(fixture), REQUIRED_INPUTS);
  const config = path.join(fixture, CONFIGS[0]);
  mkdirSync(path.dirname(config), { recursive: true });
  writeFileSync(config, '{}\n');
  assert.equal(missingInputs(fixture).length, REQUIRED_INPUTS.length - 1);
  assert.ok(missingInputs(fixture).includes(CONFIGS[3]));
});

test('actual checkout SHA/tree, not event metadata, identify the tested source', () => {
  assert.deepEqual(sourceIdentity(fixture), {
    checkoutSha: git('rev-parse', 'HEAD'),
    checkoutTree: git('rev-parse', 'HEAD^{tree}'),
  });
  assert.match(sourceIdentity(fixture).checkoutSha, /^[0-9a-f]{40}$/u);
  assert.notEqual(sourceIdentity(fixture).checkoutSha, BASE);
});

test('fresh receipts retain NOT_RUN and nonportable local evidence limitations', () => {
  const receipt = freshReceipt(fixture);
  assert.equal(receipt.fullCheck.status, 'NOT_RUN_BY_SUPPLEMENTAL_CI');
  assert.equal(
    receipt.fullCheck.responsibleWorkflow,
    '.github/workflows/cloudflare-runtime-environment.yml',
  );
  assert.match(receipt.fullCheck.rule, /no inherited PASS/u);
  assert.equal(
    receipt.fullCheck.historicalReference.observedResult,
    'FAIL_FORMAT_CHECK_C_REPORT_NATIVE_SKIPPED',
  );
  assert.equal(receipt.inputsStatus, 'NOT_RUN');
  assert.ok(receipt.strictTypes.every((row) => row.status === 'NOT_RUN'));
  assert.equal(receipt.native.dSupervisor.status, 'NOT_RUN');
  assert.equal(receipt.native.fClaimRecovery.status, 'NOT_RUN');
  assert.match(
    receipt.native.fClaimRecovery.independentLocalEvidence.limitation,
    /provenance limitation/u,
  );
  assert.equal(receipt.productionAccess, false);
  assert.equal(receipt.gatePromotion, false);
});

test('raw stdout and stderr survive successful command execution', async () => {
  const log = path.join(directory, 'success.log');
  const result = await runLogged(
    process.execPath,
    [
      '-e',
      'process.stdout.write("STDOUT_CONTROL\\n"); process.stderr.write("STDERR_CONTROL\\n")',
    ],
    fixture,
    log,
  );
  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.match(readFileSync(log, 'utf8'), /STDOUT_CONTROL/u);
  assert.match(readFileSync(log, 'utf8'), /STDERR_CONTROL/u);
});

test('nonzero command failure is retained with its exact exit code', async () => {
  const log = path.join(directory, 'failure.log');
  const result = await runLogged(
    process.execPath,
    ['-e', 'process.stderr.write("EXPECTED_FAILURE\\n"); process.exitCode=7'],
    fixture,
    log,
  );
  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 7);
  assert.match(readFileSync(log, 'utf8'), /EXPECTED_FAILURE/u);
});

test('missing executable is FAIL rather than PASS or skipped', async () => {
  const log = path.join(directory, 'missing.log');
  const result = await runLogged(
    path.join(directory, 'absent-executable'),
    [],
    fixture,
    log,
  );
  assert.equal(result.status, 'FAIL');
  assert.notEqual(result.exitCode, 0);
  assert.match(readFileSync(log, 'utf8'), /ENOENT/u);
});

test('native PASS requires all seven applicable cases, not exit0/empty/skipped evidence', () => {
  const passed = {
    success: true,
    numPassedTests: 7,
    numFailedTests: 0,
    numPendingTests: 0,
    numTotalTests: 7,
  };
  assert.equal(completeNativeResult(passed), true);
  for (const changed of [
    { success: false },
    { numPassedTests: 6 },
    { numFailedTests: 1 },
    { numPendingTests: 1 },
    { numTotalTests: 0 },
  ])
    assert.equal(completeNativeResult({ ...passed, ...changed }), false);
});

test('an existing raw log prevents child execution rather than retrying', async () => {
  const log = path.join(directory, 'existing.log');
  writeFileSync(log, 'original evidence\n');
  await assert.rejects(
    runLogged(process.execPath, ['-e', 'process.exitCode=19'], fixture, log),
    { code: 'EEXIST' },
  );
  assert.equal(readFileSync(log, 'utf8'), 'original evidence\n');
});

test('workflow has bounded triggers, readonly permissions and no deployment inputs', () => {
  const workflow = readFileSync(
    new URL(
      '../../.github/workflows/start-ready-candidate.yml',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(
    workflow,
    / {2}workflow_dispatch:\n {2}pull_request:\n {4}paths:/u,
  );
  assert.match(workflow, /permissions:\n {2}contents: read\n/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /node-version: 24\.20\.0/u);
  assert.match(workflow, /version: 12\.3\.4/u);
  assert.equal(
    (workflow.match(/pnpm install --frozen-lockfile/gu) || []).length,
    1,
  );
  assert.doesNotMatch(
    workflow,
    /pnpm check|candidate-ci\.mjs check|workflow_dispatch:\n\s+inputs:/u,
  );
  assert.match(
    workflow,
    /strict_types\n {8}if: always\(\) && steps\.inputs\.outcome == 'success' && steps\.install\.outcome == 'success'/u,
  );
  assert.match(
    workflow,
    /Finalize actual-source receipt[\s\S]*?if: always\(\)/u,
  );
  assert.match(
    workflow,
    /Always retain raw logs and receipt\n {8}if: always\(\)/u,
  );
  assert.match(
    workflow,
    /V09_TEST_DATABASE_URL: postgresql:\/\/postgres@127\.0\.0\.1:5432\/econmind_v09_d_supervisor_ci/u,
  );
  assert.match(workflow, /candidate-ci\.mjs native-d/u);
  assert.doesNotMatch(
    workflow,
    /secrets\.|pull_request_target|\n {2}push:|\n\s+environment:|contents: write|continue-on-error|F_NATIVE_CLAIM_RECOVERY/u,
  );
});
