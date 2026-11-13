#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const manifestPath = 'config/office-connection/acceptance-cases.json';
const digest = (value) => createHash('sha256').update(value).digest('hex');
export const loadCases = () =>
  JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8')).cases;
const commandFor = (item, reportPath) => [
  process.execPath,
  path.join(root, 'node_modules/vitest/vitest.mjs'),
  'run',
  item.testFile,
  '--reporter=json',
  `--outputFile=${reportPath}`,
];

export function selectCases(cases, selector = {}) {
  const selected = cases.filter(
    (item) =>
      (!selector.ids?.length || selector.ids.includes(item.id)) &&
      (!selector.areas?.length ||
        selector.areas.some((area) => item.areas.includes(area))) &&
      (!selector.backend || item.backend === selector.backend),
  );
  for (const id of selector.ids ?? []) {
    if (!selected.some((item) => item.id === id))
      throw new Error(`Unknown or filtered case: ${id}`);
  }
  if (!selected.length) throw new Error('Selector matched no cases');
  return selected;
}

export function sourceBinding(
  cases,
  bindingRoot = root,
  gitRead = (...args) =>
    execFileSync('git', args, { cwd: bindingRoot, encoding: 'utf8' }).trim(),
) {
  // Include actual runtime, migrations, script, fixture and selected test bytes.
  // A matching HEAD alone is insufficient when the shared worktree is dirty.
  const inputs = gitRead(
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
  )
    .split('\0')
    .filter(
      (file) =>
        /^(?:apps|packages|database|scripts|tools|config)\//u.test(file) ||
        file.startsWith('tests/support/') ||
        /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vitest[^/]*|tsconfig[^/]*)$/u.test(
          file,
        ),
    );
  const files = [
    ...new Set([
      ...inputs,
      manifestPath,
      'tools/office-connection/acceptance.mjs',
      ...cases.flatMap((item) =>
        [item.testFile, ...item.scopeReferences].filter(Boolean),
      ),
    ]),
  ].sort();
  return {
    commit: gitRead('rev-parse', 'HEAD'),
    manifestSha256: digest(readFileSync(path.join(bindingRoot, manifestPath))),
    sourceTreeSha256: digest(
      JSON.stringify(
        files.map((file) => [
          file,
          digest(readFileSync(path.join(bindingRoot, file))),
        ]),
      ),
    ),
    scopes: cases.map((item) => ({
      caseId: item.id,
      binding: 'TEST_FIXTURE_REFERENCES_ONLY',
      dimensions: item.areas.filter((area) =>
        ['world', 'country', 'office', 'subject', 'org'].includes(area),
      ),
      references: item.scopeReferences.map((file) => ({
        file,
        sha256: digest(readFileSync(path.join(bindingRoot, file))),
      })),
    })),
  };
}

export function buildRunPlan(cases, binding = sourceBinding(cases)) {
  return {
    schemaVersion: 'office-connection-run-plan-v1',
    binding,
    operationalAcceptance: 'NOT_ASSESSED',
    cases: cases.map((item) => ({
      ...item,
      command: item.testFile
        ? [
            process.execPath,
            'node_modules/vitest/vitest.mjs',
            'run',
            item.testFile,
            '--reporter=json',
            '--outputFile=<fresh-report.json>',
          ]
        : (item.command ?? null),
      execution:
        item.availability !== 'READY'
          ? item.availability
          : item.backend === 'NATIVE_POSTGRES'
            ? 'EXTERNAL_NATIVE_OWNER_ONLY'
            : 'LOCAL_FOCUSED_TEST',
      status: 'NOT_RUN',
    })),
  };
}

export function inspectVitestReport(report, testFile) {
  const errors = [];
  const results = report?.testResults;
  const expected = path.resolve(root, testFile);
  if (
    !Array.isArray(results) ||
    results.length !== 1 ||
    path.resolve(results[0]?.name ?? '') !== expected
  ) {
    return {
      valid: false,
      errors: ['Report must contain exactly the selected test file'],
      passed: 0,
    };
  }
  const assertions = results[0].assertionResults;
  if (report.success !== true || results[0].status !== 'passed')
    errors.push('Suite did not pass');
  if (!Array.isArray(assertions) || !assertions.length)
    return {
      valid: false,
      errors: [...errors, 'No executed assertions'],
      passed: 0,
    };
  if (assertions?.some((item) => item.status !== 'passed'))
    errors.push('Skipped, pending, todo or failed assertion');
  if (
    report.numPendingTests !== 0 ||
    report.numFailedTests !== 0 ||
    (report.numTodoTests ?? 0) !== 0
  )
    errors.push('Nonzero skipped/pending/todo/failed count');
  if (
    report.numPassedTests !== assertions?.length ||
    report.numTotalTests !== assertions?.length
  )
    errors.push('Assertion count mismatch');
  return {
    valid: errors.length === 0,
    errors,
    passed: assertions?.filter((item) => item.status === 'passed').length ?? 0,
  };
}

export function validateEvidence(
  evidence,
  cases,
  binding = sourceBinding(cases),
  readArtifact = (file) => readFileSync(file),
) {
  const errors = [];
  if (evidence?.schemaVersion !== 'office-connection-evidence-v1')
    errors.push('Unsupported evidence schema');
  if (evidence?.producer !== 'office-connection/acceptance.mjs')
    errors.push('Evidence must identify the acceptance runner');
  if (JSON.stringify(evidence?.binding) !== JSON.stringify(binding))
    errors.push('Current commit/source/scopes binding mismatch');
  if (
    !Array.isArray(evidence?.results) ||
    evidence.results.length !== cases.length
  )
    errors.push('Selected case count mismatch');
  for (const item of cases) {
    const rows = Array.isArray(evidence?.results)
      ? evidence.results.filter((row) => row?.caseId === item.id)
      : [];
    if (rows.length !== 1) {
      errors.push(`${item.id}: missing or duplicate result`);
      continue;
    }
    const row = rows[0];
    if (item.availability !== 'READY' || !item.testFile) {
      errors.push(`${item.id}: ${item.availability} cannot be PASS`);
      continue;
    }
    if (
      row.status !== 'PASS_TEST_ONLY' ||
      row.exitCode !== 0 ||
      row.backend !== item.backend ||
      row.sourceClassification !== item.sourceClassification
    )
      errors.push(`${item.id}: result/backend/source mismatch`);
    if (
      JSON.stringify(row.command) !==
      JSON.stringify(commandFor(item, row.reportPath))
    )
      errors.push(`${item.id}: command mismatch`);
    if (
      !Number.isFinite(Date.parse(row.startedAt)) ||
      !Number.isFinite(Date.parse(row.finishedAt)) ||
      Date.parse(row.finishedAt) < Date.parse(row.startedAt)
    )
      errors.push(`${item.id}: invalid run interval`);
    try {
      if (digest(readArtifact(row.logPath)) !== row.logSha256)
        errors.push(`${item.id}: command log digest mismatch`);
      const bytes = readArtifact(row.reportPath);
      if (digest(bytes) !== row.reportSha256)
        errors.push(`${item.id}: report digest mismatch`);
      const report = JSON.parse(bytes.toString());
      const checked = inspectVitestReport(report, item.testFile);
      errors.push(...checked.errors.map((error) => `${item.id}: ${error}`));
      if (
        typeof report.startTime !== 'number' ||
        report.startTime < Date.parse(row.startedAt) ||
        report.startTime > Date.parse(row.finishedAt)
      )
        errors.push(`${item.id}: report is outside fresh run interval`);
      if (item.backend === 'NATIVE_POSTGRES') {
        if (
          row.nativeEvidence?.backend !== 'NATIVE_POSTGRES' ||
          row.nativeEvidence?.disposable !== true ||
          row.nativeEvidence?.productionAccess !== false ||
          typeof row.nativeEvidence?.serverVersion !== 'string' ||
          !row.nativeEvidence?.serverVersion ||
          !/^[a-f0-9]{64}$/.test(row.nativeEvidence?.provenanceSha256 ?? '')
        )
          errors.push(`${item.id}: missing native backend provenance`);
        else if (
          digest(readArtifact(row.nativeEvidence.provenancePath)) !==
          row.nativeEvidence.provenanceSha256
        )
          errors.push(`${item.id}: native provenance digest mismatch`);
      }
    } catch {
      errors.push(`${item.id}: missing or unreadable machine evidence`);
    }
  }
  return {
    valid: errors.length === 0,
    status: errors.length ? 'FAIL' : 'PASS_TEST_ONLY',
    errors,
    operationalAcceptance: 'NOT_ASSESSED',
    authenticity:
      'STRUCTURAL_CONSISTENCY_ONLY_EXTERNAL_JSON_IS_NOT_TRUSTED_ATTESTATION',
  };
}

function options(args) {
  const result = {};
  while (args.length) {
    const key = args.shift();
    if (
      !['--case', '--area', '--backend', '--evidence', '--out'].includes(key) ||
      !args.length ||
      args[0].startsWith('--')
    )
      throw new Error(`Invalid option: ${key}`);
    const value = args.shift();
    if (key === '--case' || key === '--area')
      (result[key === '--case' ? 'ids' : 'areas'] ??= []).push(
        ...value.split(','),
      );
    else result[key.slice(2)] = value;
  }
  return result;
}

function cli() {
  const [requested = 'list', ...args] = process.argv.slice(2);
  const command = requested === '--plan' ? 'plan' : requested;
  const flags = options(args);
  const cases = selectCases(loadCases(), flags);
  let output;
  if (command === 'list') output = cases;
  else if (command === 'plan') output = buildRunPlan(cases);
  else if (command === 'validate') {
    if (!flags.evidence) throw new Error('validate requires --evidence');
    output = validateEvidence(
      JSON.parse(readFileSync(flags.evidence, 'utf8')),
      cases,
    );
    if (!output.valid) process.exitCode = 1;
  } else if (command === 'run') {
    if (!flags.ids?.length && !flags.areas?.length && !flags.backend)
      throw new Error(
        'run requires an explicit selector; full suite execution is forbidden',
      );
    if (!flags.out) throw new Error('run requires --out <evidence.json>');
    if (
      cases.some(
        (item) =>
          item.availability !== 'READY' ||
          item.backend === 'NATIVE_POSTGRES' ||
          !item.testFile,
      )
    )
      throw new Error(
        'run supports READY pure/PGlite tests only; use plan for native/gap/rehearsal cases',
      );
    const binding = sourceBinding(cases);
    const directory = mkdtempSync(path.join(tmpdir(), 'office-acceptance-'));
    const results = [];
    for (const item of cases) {
      const reportPath = path.join(directory, `${item.id}.json`);
      const logPath = path.join(directory, `${item.id}.log`);
      const command = commandFor(item, reportPath);
      const startedAt = new Date().toISOString();
      const execution = spawnSync(command[0], command.slice(1), {
        cwd: root,
        encoding: 'utf8',
        timeout: 300_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const finishedAt = new Date().toISOString();
      const log = `${execution.stdout ?? ''}\n${execution.stderr ?? ''}\n${execution.error ? 'PROCESS_EXECUTION_ERROR' : ''}`;
      writeFileSync(logPath, log);
      let reportSha256 = null;
      let checked = { valid: false, passed: 0 };
      try {
        const bytes = readFileSync(reportPath);
        reportSha256 = digest(bytes);
        checked = inspectVitestReport(
          JSON.parse(bytes.toString()),
          item.testFile,
        );
      } catch {
        /* no report is a failed run */
      }
      results.push({
        caseId: item.id,
        backend: item.backend,
        sourceClassification: item.sourceClassification,
        command,
        logPath,
        logSha256: digest(log),
        status:
          execution.status === 0 && checked.valid ? 'PASS_TEST_ONLY' : 'FAIL',
        exitCode: execution.status,
        startedAt,
        finishedAt,
        reportPath,
        reportSha256,
        passedAssertions: checked.passed,
      });
    }
    const evidence = {
      schemaVersion: 'office-connection-evidence-v1',
      producer: 'office-connection/acceptance.mjs',
      binding,
      results,
      operationalAcceptance: 'NOT_ASSESSED',
    };
    mkdirSync(path.dirname(path.resolve(flags.out)), { recursive: true });
    writeFileSync(flags.out, `${JSON.stringify(evidence, null, 2)}\n`);
    output = {
      evidence: path.resolve(flags.out),
      ...validateEvidence(evidence, cases),
    };
    if (!output.valid) process.exitCode = 1;
  } else throw new Error(`Unknown command: ${command}`);
  console.log(JSON.stringify(output, null, 2));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    cli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
