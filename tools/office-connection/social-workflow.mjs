/** Bounded Social acceptance orchestration. Never admits sources or starts World/Clock. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const focused = [
  'tests/world-core/c-social-office-actions.test.ts',
  'tests/world-core/g-single-social-office-demo.test.ts',
  'tests/world-api/g-single-social-office-demo-api.test.ts',
  'tests/world-web/g-single-social-office-demo.test.ts',
];
const prefix =
  'bash /workspace/.cloud-setup/run.sh econmind-os-world-simulation';

export function parseSocialWorkflowArguments(args) {
  if (args.length === 1 && ['plan', '--plan'].includes(args[0])) return 'plan';
  if (args.length === 2 && args[0] === 'verify') {
    if (args[1] === '--fixture') return 'fixture';
    if (args[1] === '--isolated-http') return 'isolated-http';
  }
  throw Error(
    'Use plan, verify --fixture, or verify --isolated-http; no overrides.',
  );
}

export function socialConnectionPlan() {
  const gate = JSON.parse(
    readFileSync(path.join(repository, 'status/progress.json'), 'utf8'),
  ).current_gate;
  return {
    schemaVersion: 'social-connection-workflow-v1',
    classification: 'PLAN_ONLY_NOT_EXECUTION_EVIDENCE',
    scope: 'ONE_SELECTED_SIMULATED_SOCIAL_OFFICE',
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    WorldClock: false,
    layers: {
      domain:
        'Existing employment PLAN/MATCH, college admission/graduation, clinic service',
      persistence:
        'Existing simulated atomic repository, protected source custody, canonical replay and separated SQL roles',
      api: '/isolated/v1/social-office/{session,command,projection,receipt}',
      browser:
        'Existing dedicated Social page; controller tests are not actual browser acceptance',
      host: 'Existing owned private-socket PG16.15 host; preset days 0/1/10, fixed simulated identity and grants',
    },
    commands: {
      plan: `${prefix} node tools/office-connection/social-workflow.mjs plan`,
      fixture: `${prefix} node tools/office-connection/social-workflow.mjs verify --fixture`,
      isolatedHttp: `ECONMIND_ENV=local ECONMIND_SOCIAL_OFFICE_DEMO=1 ${prefix} node tools/office-connection/social-workflow.mjs verify --isolated-http`,
    },
    requirements: [
      'Pinned Node24.20.0 / pnpm12.3.4 and frozen installed dependencies',
      'HTTP mode starts only the existing isolated host: nonroot local/ci, explicit opt-in, no external DB environment, clean source build',
      'Linux host requires /usr/lib/postgresql/16/bin with exact PostgreSQL16.15; existence is not version/custody verification',
    ],
    observations: {
      platform: process.platform,
      linuxPostgresBinaryPresent: existsSync(
        '/usr/lib/postgresql/16/bin/postgres',
      ),
      currentRuntimeVerified: false,
    },
    formalGate: {
      source: 'status/progress.json',
      stepId: gate.step_id,
      status: gate.status,
      nextStepReady: gate.next_step_ready,
    },
    blockers: {
      formal: [
        'Admitted genesis and same-head original current boundary, minimum wage, offer and population availability plus physical attempt envelope',
        'Separately reviewed real SocialOperatingCustodyPort and cooperating source protection; constructor/fixture/hash is not admission',
        'Formal automatic MATCH publisher, durable grant and scheduling; manual composition currently supplies automaticAuthority:null',
        'Formal college/clinic consumer wiring, runtime hosting and authorization are not established by this isolated demonstration',
        'Formal gate authority remains status/progress.json; this workflow never promotes it',
      ],
      nativePersistence: [
        'D native suites require private owned D_SOCIAL_SOURCE_NATIVE_MARKER / D_SOCIAL_ATOMIC_NATIVE_MARKER, not arbitrary DSNs or the incompatible F marker',
        'No existing repository runner creates those D markers; HTTP verification does not execute those suites',
      ],
    },
    evidence: {
      fixture: 'NOT_RUN',
      nativeHttp: 'NOT_RUN',
      nativePersistence: 'NOT_RUN',
      browser: 'NOT_RUN',
      formal: 'BLOCKED',
    },
  };
}

/** Only fixed, newly executed child commands can populate this run's ledger. */
export function verifySocialConnection(mode) {
  if (!['fixture', 'isolated-http'].includes(mode))
    throw Error('Unsupported verification mode');
  /** @type {{id:string, command:string[], status:string, exitCode:number|null, signal:string|null, errorCode:string|null, stdoutBytes:number, stdoutSHA256:string, stderrBytes:number, stderrSHA256:string}[]} */
  const steps = [];
  const report = {
    schemaVersion: 'social-connection-workflow-v1',
    classification: 'CURRENT_EXECUTION_INCOMPLETE',
    mode,
    startedAt: new Date().toISOString(),
    sourceClass: 'SIMULATED_OPENING',
    sourceAdmitted: false,
    WorldClock: false,
    nativeCleanup: 'NOT_RUN',
    evidence: {
      fixture: 'NOT_RUN',
      nativeHttp: 'NOT_RUN',
      nativePersistence: 'NOT_RUN',
      browser: 'NOT_RUN',
      formal: 'BLOCKED',
    },
    steps,
  };
  if (process.versions.node !== '24.20.0') {
    report.reason = 'Pinned Node24.20.0 required';
    return { exitCode: 2, report };
  }
  if (
    mode === 'isolated-http' &&
    (!['local', 'ci'].includes(process.env.ECONMIND_ENV ?? '') ||
      process.env.ECONMIND_SOCIAL_OFFICE_DEMO !== '1')
  ) {
    report.reason =
      'Existing isolated host requires local/ci and ECONMIND_SOCIAL_OFFICE_DEMO=1';
    return { exitCode: 2, report };
  }
  const commands = [
    [
      'finance-source-bytes',
      process.execPath,
      ['tools/social-office-demo/check-opening-finance.mjs', '--check'],
    ],
    [
      'fixed-host-build',
      process.execPath,
      ['tools/social-office-demo/build-host.mjs', '--build'],
    ],
    mode === 'fixture'
      ? ['focused-fixture-tests', 'pnpm', ['exec', 'vitest', 'run', ...focused]]
      : [
          'actual-isolated-http',
          process.execPath,
          ['tools/social-office-demo/verify.mjs', '--isolated'],
        ],
  ];
  for (const [id, executable, args] of commands) {
    const result = spawnSync(executable, args, {
      cwd: repository,
      env: process.env,
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    const success =
      result.status === 0 && result.signal === null && !result.error;
    report.steps.push({
      id,
      command: [executable, ...args],
      status: success ? 'PASS' : 'FAIL',
      exitCode: result.status,
      signal: result.signal,
      errorCode: result.error?.code ?? null,
      stdoutBytes: Buffer.byteLength(result.stdout ?? ''),
      stdoutSHA256: createHash('sha256')
        .update(result.stdout ?? '')
        .digest('hex'),
      stderrBytes: Buffer.byteLength(result.stderr ?? ''),
      stderrSHA256: createHash('sha256')
        .update(result.stderr ?? '')
        .digest('hex'),
    });
    // Preserve diagnostics from this execution, never ingest a supplied old receipt.
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (id === 'actual-isolated-http')
      report.nativeCleanup = success
        ? 'EXISTING_VERIFIER_COMPLETED'
        : 'UNKNOWN_PRESERVE_OWNED_EVIDENCE';
    if (!success) {
      report.evidence[mode === 'fixture' ? 'fixture' : 'nativeHttp'] = 'FAIL';
      report.reason = `Current step failed: ${id}`;
      return {
        exitCode:
          Number.isInteger(result.status) && result.status > 0
            ? result.status
            : 1,
        report,
      };
    }
  }
  report.evidence[mode === 'fixture' ? 'fixture' : 'nativeHttp'] = 'PASS';
  report.classification =
    mode === 'fixture'
      ? 'FIXTURE_CONFIRMED_FORMAL_BLOCKED'
      : 'ISOLATED_NATIVE_HTTP_CONFIRMED_FORMAL_BLOCKED';
  return { exitCode: 0, report };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const mode = parseSocialWorkflowArguments(process.argv.slice(2));
    const result =
      mode === 'plan'
        ? { exitCode: 0, report: socialConnectionPlan() }
        : verifySocialConnection(mode);
    process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
