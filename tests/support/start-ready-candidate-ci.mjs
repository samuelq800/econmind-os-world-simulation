// Pure CI orchestration only: existing guarded disposable test, no production,
// credentials, deployment or admission. Never invokes the full check.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '42991acfee9d0eacc702ba47a380c938a4516f03';
export const CONFIGS = Object.freeze([
  'tests/support/tsconfig.formal-financial-opening.json',
  'tests/world-web/office-command.tsconfig.json',
  'tests/world-core/writer-lease-supervisor.tsconfig.json',
  'tests/support/tsconfig.f-v09-native-claim.json',
]);
export const REQUIRED_INPUTS = Object.freeze([
  ...CONFIGS,
  'apps/world-worker/src/preparation/formal-financial-opening-contract.ts',
  'apps/world-worker/src/preparation/formal-financial-opening-producer.ts',
  'tests/world-core/formal-financial-opening.test.ts',
  'apps/world-web/src/office-command/client.ts',
  'apps/world-web/src/office-command/contract.ts',
  'apps/world-web/src/office-command/controller.ts',
  'apps/world-web/src/office-command/view.ts',
  'apps/world-web/src/trusted-host/formal-session-adapter.ts',
  'tests/world-web/formal-session-adapter.test.ts',
  'tests/world-web/office-command.test.ts',
  'apps/world-worker/src/runtime-preparation/writer-lease-supervisor.ts',
  'tests/world-core/writer-lease-supervisor.test.ts',
  'tests/world-core/writer-lease-supervisor-postgres.test.ts',
  'tests/world-core/f-v09-native-claim-recovery.test.ts',
  'tests/support/f-v09-source-inheritance.mjs',
]);
export const TYPE_ARGUMENTS = Object.freeze([
  '--noEmit',
  '--strict',
  '--skipLibCheck',
  'false',
]);

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = fileURLToPath(new URL('../..', import.meta.url));
const git = (cwd, ...args) =>
  execFileSync('git', ['--no-replace-objects', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

export function sourceIdentity(cwd) {
  return {
    checkoutSha: git(cwd, 'rev-parse', 'HEAD'),
    checkoutTree: git(cwd, 'rev-parse', 'HEAD^{tree}'),
  };
}

export function missingInputs(cwd) {
  return REQUIRED_INPUTS.filter((file) => !existsSync(path.join(cwd, file)));
}

export function completeNativeResult(result) {
  return (
    result.success === true &&
    result.numPassedTests === 7 &&
    result.numFailedTests === 0 &&
    result.numPendingTests === 0 &&
    result.numTotalTests === 7
  );
}

export function freshReceipt(cwd) {
  return {
    schemaVersion: 'START_READY_CANDIDATE_CI_1',
    classification: 'NONDEPLOYABLE_CI_NOT_GATE_OR_ACTIVATION_APPROVAL',
    base: BASE,
    ...sourceIdentity(cwd),
    inputsStatus: 'NOT_RUN',
    fullCheck: {
      status: 'NOT_RUN_BY_SUPPLEMENTAL_CI',
      responsibleWorkflow:
        '.github/workflows/cloudflare-runtime-environment.yml',
      rule: 'External full result requires matching actual checkout SHA/tree; no inherited PASS',
      historicalReference: {
        run: '38048771913',
        job: '114203506317',
        metadataHead: '95926300c35645d9a684ec7dedd51114e1962935',
        actualCheckout: 'a61a26a90a0ea932401caa9f529a18a25eca0697',
        actualTree: '3bbed0dae40a2cc85b414e1a87893f514d26da7a',
        observedResult: 'FAIL_FORMAT_CHECK_C_REPORT_NATIVE_SKIPPED',
        scope: 'HISTORICAL_REFERENCE_ONLY_NOT_THIS_CI_CHECKOUT_RESULT',
      },
    },
    builds: ['@econmind/core', '@econmind/world-worker'].map((name) => ({
      name,
      status: 'NOT_RUN',
    })),
    strictTypes: CONFIGS.map((config) => ({ config, status: 'NOT_RUN' })),
    native: {
      dSupervisor: { status: 'NOT_RUN', expectedTests: 7, migrationPrefix: 6 },
      fClaimRecovery: {
        status: 'NOT_RUN',
        reason:
          'Machine-owned generation, fixed macOS data directory and PG160015 guard are not portable; no guard changed',
        independentLocalEvidence: {
          kind: 'REFERENCE_ONLY_NOT_CI_REEXECUTION_OR_BUILD_PROVENANCE_CLOSURE',
          commit: 'd9853754b3eb2080a5ac4d30c71cae4db013fe0c',
          path: 'docs/reports/start-ready-20261010/F/V09_EVIDENCE_RECEIPT.md',
          artifact:
            '/Users/samuel/Documents/econclub/artifacts/f-v09-claim-recovery-20261010.KgSwqT/NATIVE_RESULTS.json',
          artifactSha256:
            'fbba98a2b2214b1ea05cc512eaaa4a468af37e5abbabc28a5bdd9d6de3008fd7',
          limitation:
            'Producer-reported 2 PASS; original Core dist provenance limitation is retained; independent review remains separate',
          independentReview: {
            path: 'docs/reports/start-ready-20261010/reviews/D_F_review.md',
            sha256:
              '2ff88ab43b861eb9f9963c039985962c8830874d247ea6bc1ce98ab97efe1c2e',
            scope:
              'Independent D review of d985375 six-file candidate; not reexecution of native2',
          },
        },
      },
    },
    productionAccess: false,
    gatePromotion: false,
  };
}

// Tee raw bytes while retaining nonzero/signal/startup failures. Never retries.
export async function runLogged(command, args, cwd, logPath) {
  // Reserve the raw log before starting the child, not asynchronously after it.
  const log = createWriteStream(logPath, { fd: openSync(logPath, 'wx') });
  return new Promise((resolve, reject) => {
    log.on('error', reject);
    const child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (bytes) => {
        log.write(bytes);
        process.stdout.write(bytes);
      });
    }
    child.on('error', (error) => log.write(`${error.message}\n`));
    child.on('close', (exitCode, signal) => {
      const result = {
        command: [command, ...args],
        status: exitCode === 0 ? 'PASS' : 'FAIL',
        exitCode,
        signal,
      };
      log.end(() => resolve(result));
    });
  });
}

async function main(mode) {
  const directory = process.env.CI_EVIDENCE_DIRECTORY;
  if (!directory || !path.isAbsolute(directory))
    throw Error('CI_EVIDENCE_DIRECTORY must be absolute');
  mkdirSync(directory, { recursive: true });
  const receiptPath = path.join(directory, 'receipt.json');
  const save = (receipt) =>
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  if (mode === 'initialize') {
    if (existsSync(receiptPath)) throw Error('CI receipt already exists');
    const receipt = freshReceipt(root);
    // Write identity before validation, including when combined inputs are absent.
    save(receipt);
    receipt.inputsStatus = 'FAIL';
    receipt.missingInputs = missingInputs(root);
    receipt.inputsSha256 = Object.fromEntries(
      [...REQUIRED_INPUTS, 'package.json', 'pnpm-lock.yaml']
        .filter((file) => existsSync(path.join(root, file)))
        .map((file) => [file, hash(readFileSync(path.join(root, file)))]),
    );
    save(receipt);
    git(root, 'merge-base', '--is-ancestor', BASE, 'HEAD');
    git(root, 'diff', '--exit-code', 'HEAD', '--');
    if (receipt.missingInputs.length)
      throw Error(
        `Combined candidate missing: ${receipt.missingInputs.join(', ')}`,
      );
    receipt.toolchain = {
      node: process.versions.node,
      pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    };
    save(receipt);
    if (
      receipt.toolchain.node !== '24.20.0' ||
      receipt.toolchain.pnpm !== '12.3.4'
    )
      throw Error('Pinned Node24.20.0/pnpm12.3.4 required');
    receipt.inputsStatus = 'PASS';
    save(receipt);
    return;
  }
  if (!['build', 'types', 'native-d', 'finalize'].includes(mode))
    throw Error('Unknown pure CI mode');
  const receipt = existsSync(receiptPath)
    ? JSON.parse(readFileSync(receiptPath, 'utf8'))
    : freshReceipt(root);
  if (mode !== 'finalize') {
    if (
      !existsSync(receiptPath) ||
      receipt.inputsStatus !== 'PASS' ||
      missingInputs(root).length
    )
      throw Error('Combined inputs must pass initialize before execution');
    if (
      JSON.stringify(sourceIdentity(root)) !==
      JSON.stringify({
        checkoutSha: receipt.checkoutSha,
        checkoutTree: receipt.checkoutTree,
      })
    )
      throw Error('Checkout changed after initialization');
    if (mode === 'build') {
      for (const [index, row] of receipt.builds.entries()) {
        if (row.status !== 'NOT_RUN') throw Error('Build may run only once');
        receipt.builds[index].status = 'RUNNING';
        save(receipt);
        receipt.builds[index] = {
          name: row.name,
          ...(await runLogged(
            'pnpm',
            ['--filter', row.name, 'build'],
            root,
            path.join(directory, `build-${index + 1}.log`),
          )),
        };
        save(receipt);
        if (receipt.builds[index].status !== 'PASS') {
          process.exitCode = 1;
          return;
        }
      }
    } else if (mode === 'types') {
      if (!receipt.builds.every((row) => row.status === 'PASS'))
        throw Error('Builds must pass before strict types');
      for (const [index, config] of CONFIGS.entries()) {
        if (receipt.strictTypes[index].status !== 'NOT_RUN')
          throw Error('Strict config may run only once');
        receipt.strictTypes[index].status = 'RUNNING';
        save(receipt);
        receipt.strictTypes[index] = {
          config,
          ...(await runLogged(
            'pnpm',
            ['exec', 'tsc', '-p', config, ...TYPE_ARGUMENTS],
            root,
            path.join(directory, `strict-types-${index + 1}.log`),
          )),
        };
        save(receipt);
      }
    } else {
      if (
        !receipt.builds.every((row) => row.status === 'PASS') ||
        receipt.native.dSupervisor.status !== 'NOT_RUN'
      )
        throw Error(
          'Native D requires successful builds and no earlier invocation',
        );
      receipt.native.dSupervisor.status = 'RUNNING';
      save(receipt);
      const guard = await runLogged(
        process.execPath,
        ['scripts/v09-postgres-test-environment.mjs'],
        root,
        path.join(directory, 'native-d-environment-guard.log'),
      );
      receipt.native.dSupervisor.guard = guard;
      save(receipt);
      if (guard.status !== 'PASS') {
        receipt.native.dSupervisor.status = 'FAIL';
      } else {
        const resultPath = path.join(directory, 'native-d-results.json');
        const execution = await runLogged(
          'pnpm',
          [
            'exec',
            'vitest',
            'run',
            'tests/world-core/writer-lease-supervisor-postgres.test.ts',
            '--reporter=default',
            '--reporter=json',
            `--outputFile.json=${resultPath}`,
          ],
          root,
          path.join(directory, 'native-d.log'),
        );
        receipt.native.dSupervisor.execution = execution;
        receipt.native.dSupervisor.status = 'FAIL';
        // Exit0 with a skipped/empty suite cannot become native PASS.
        if (execution.status === 'PASS' && existsSync(resultPath)) {
          const result = JSON.parse(readFileSync(resultPath, 'utf8'));
          receipt.native.dSupervisor.counts = {
            passed: result.numPassedTests,
            failed: result.numFailedTests,
            pending: result.numPendingTests,
            total: result.numTotalTests,
          };
          if (completeNativeResult(result))
            receipt.native.dSupervisor.status = 'PASS';
        }
      }
    }
    save(receipt);
    if (
      receipt.builds.some((row) => row.status === 'FAIL') ||
      receipt.strictTypes.some((row) => row.status === 'FAIL') ||
      receipt.native.dSupervisor.status === 'FAIL'
    )
      process.exitCode = 1;
    return;
  }
  receipt.finalSource = sourceIdentity(root);
  receipt.trackedChanges = git(root, 'diff', '--name-only', 'HEAD', '--');
  receipt.stepOutcomes = Object.fromEntries(
    [
      'INPUTS_OUTCOME',
      'INSTALL_OUTCOME',
      'CI_CONTRACT_OUTCOME',
      'BUILD_OUTCOME',
      'STRICT_TYPES_OUTCOME',
      'NATIVE_D_OUTCOME',
    ].map((name) => [name, process.env[name] || 'NOT_RUN']),
  );
  receipt.logsSha256 = Object.fromEntries(
    readdirSync(directory)
      .filter(
        (name) => name.endsWith('.log') || name === 'native-d-results.json',
      )
      .sort()
      .map((name) => [name, hash(readFileSync(path.join(directory, name)))]),
  );
  receipt.result =
    receipt.builds.every((row) => row.status === 'PASS') &&
    receipt.strictTypes.every((row) => row.status === 'PASS') &&
    receipt.native.dSupervisor.status === 'PASS' &&
    Object.values(receipt.stepOutcomes).every(
      (outcome) => outcome === 'success',
    ) &&
    receipt.finalSource.checkoutSha === receipt.checkoutSha &&
    receipt.finalSource.checkoutTree === receipt.checkoutTree &&
    receipt.trackedChanges === ''
      ? 'PASS_SUPPLEMENTAL_CI_ONLY_FULL_SEPARATE'
      : 'FAIL_OR_NOT_RUN';
  save(receipt);
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.result !== 'PASS_SUPPLEMENTAL_CI_ONLY_FULL_SEPARATE')
    process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv[2]);
}
