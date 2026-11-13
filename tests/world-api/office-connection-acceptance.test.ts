import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// Non-authoritative acceptance tooling has no economic runtime mutation port.
// @ts-expect-error The repository's JavaScript CLI has no declaration file.
import * as acceptance from '../../tools/office-connection/acceptance.mjs';
const {
  loadCases,
  selectCases,
  buildRunPlan,
  inspectVitestReport,
  validateEvidence,
  sourceBinding,
  root,
} = acceptance;

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const cases = loadCases();
const cache = cases.find((item: { id: string }) => item.id === 'scoped-cache');
const binding = {
  commit: 'a'.repeat(40),
  manifestSha256: 'b'.repeat(64),
  sourceTreeSha256: 'c'.repeat(64),
  scopes: [{ caseId: cache.id, binding: 'TEST_FIXTURE_REFERENCES_ONLY' }],
};
function fixture() {
  const report = {
    success: true,
    startTime: 1000,
    numPassedTests: 1,
    numTotalTests: 1,
    numPendingTests: 0,
    numFailedTests: 0,
    testResults: [
      {
        name: path.join(root, cache.testFile),
        status: 'passed',
        assertionResults: [{ title: 'mechanism fixture', status: 'passed' }],
      },
    ],
  };
  const artifacts = new Map<string, string>([
    ['report.json', JSON.stringify(report)],
    ['run.log', 'actual command output'],
  ]);
  const row = {
    caseId: cache.id,
    backend: cache.backend,
    sourceClassification: cache.sourceClassification,
    status: 'PASS_TEST_ONLY',
    exitCode: 0,
    command: [
      process.execPath,
      path.join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      cache.testFile,
      '--reporter=json',
      '--outputFile=report.json',
    ],
    reportPath: 'report.json',
    reportSha256: sha(artifacts.get('report.json')!),
    logPath: 'run.log',
    logSha256: sha(artifacts.get('run.log')!),
    startedAt: new Date(999).toISOString(),
    finishedAt: new Date(2000).toISOString(),
  };
  const evidence = {
    schemaVersion: 'office-connection-evidence-v1',
    producer: 'office-connection/acceptance.mjs',
    binding,
    results: [row],
  };
  const read = (file: string) => {
    if (!artifacts.has(file)) throw new Error('missing');
    return Buffer.from(artifacts.get(file)!);
  };
  const check = () => validateEvidence(evidence, [cache], binding, read);
  return { evidence, row, report, artifacts, check };
}

describe('Office acceptance selector, run-plan and evidence consistency', () => {
  it.each([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'vitest.config.ts',
    'tsconfig.base.json',
    'tools/dependency.mjs',
    'config/runtime.json',
  ])('invalidates same-commit evidence after %s changes', (changedFile) => {
    const directory = mkdtempSync(
      path.join(tmpdir(), 'acceptance-binding-test-'),
    );
    const files = [
      ...new Set([
        'config/office-connection/acceptance-cases.json',
        'tools/office-connection/acceptance.mjs',
        cache.testFile,
        ...cache.scopeReferences,
        changedFile,
      ]),
    ];
    try {
      for (const file of files) {
        mkdirSync(path.dirname(path.join(directory, file)), {
          recursive: true,
        });
        writeFileSync(path.join(directory, file), 'before');
      }
      // Real file bytes, isolated from the shared worktree. Only the git
      // inventory and immutable HEAD are substituted for this fixture.
      const gitRead = (...args: string[]) =>
        args[0] === 'ls-files' ? files.join('\0') : 'a'.repeat(40);
      const before = sourceBinding([cache], directory, gitRead);
      const evidenceFixture = fixture();
      evidenceFixture.evidence.binding = before;
      expect(
        validateEvidence(
          evidenceFixture.evidence,
          [cache],
          before,
          (file: string) => Buffer.from(evidenceFixture.artifacts.get(file)!),
        ).valid,
      ).toBe(true);
      writeFileSync(path.join(directory, changedFile), 'after');
      const after = sourceBinding([cache], directory, gitRead);
      expect(after.commit).toBe(before.commit);
      expect(after.sourceTreeSha256).not.toBe(before.sourceTreeSha256);
      expect(
        validateEvidence(
          evidenceFixture.evidence,
          [cache],
          after,
          (file: string) => Buffer.from(evidenceFixture.artifacts.get(file)!),
        ).valid,
      ).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('selects exact case/area/backend and rejects unknown or empty selections', () => {
    expect(selectCases(cases, { ids: ['scoped-cache'] })).toEqual([cache]);
    expect(selectCases(cases, { areas: ['cache'], backend: 'NONE' })).toEqual([
      cache,
    ]);
    expect(() => selectCases(cases, { ids: ['invented'] })).toThrow();
    expect(() => selectCases(cases, { areas: ['invented'] })).toThrow();
    expect(new Set(cases.map((item: { id: string }) => item.id)).size).toBe(
      cases.length,
    );
  });
  it('keeps native tests external, absent routes absent, and every plan NOT_RUN', () => {
    const plan = buildRunPlan(cases, binding);
    expect(plan.operationalAcceptance).toBe('NOT_ASSESSED');
    expect(
      plan.cases.every((item: { status: string }) => item.status === 'NOT_RUN'),
    ).toBe(true);
    expect(
      plan.cases.find(
        (item: { id: string }) => item.id === 'native-social-atomic',
      ),
    ).toMatchObject({
      execution: 'EXTERNAL_NATIVE_OWNER_ONLY',
      sourceClassification: 'SIMULATED_SOURCE',
    });
    expect(
      plan.cases.find(
        (item: { id: string }) => item.id === 'organization-isolation',
      ),
    ).toMatchObject({ execution: 'GAP', command: null });
    expect(
      plan.cases.find((item: { id: string }) => item.id === 'office-export'),
    ).toMatchObject({ execution: 'NOT_PRESENT', command: null });
  });
  it('supports --plan as a single-JSON stdout integration entry point', () => {
    const output = execFileSync(
      process.execPath,
      [
        'tools/office-connection/acceptance.mjs',
        '--plan',
        '--case',
        'scoped-cache',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toMatchObject({
      schemaVersion: 'office-connection-run-plan-v1',
      binding: { commit: expect.stringMatching(/^[a-f0-9]{40}$/) },
    });
  });
  it('accepts only matching fresh machine evidence, without operational approval', () => {
    expect(fixture().check()).toMatchObject({
      valid: true,
      status: 'PASS_TEST_ONLY',
      operationalAcceptance: 'NOT_ASSESSED',
      authenticity: expect.stringContaining('STRUCTURAL_CONSISTENCY_ONLY'),
    });
  });
  it('returns structured rejection for malformed external envelope and assertion collections', () => {
    const malformed = fixture();
    expect(
      validateEvidence(
        { ...malformed.evidence, results: {} },
        [cache],
        binding,
        () => Buffer.from('{}'),
      ),
    ).toMatchObject({ valid: false, status: 'FAIL' });
    expect(
      inspectVitestReport(
        {
          ...malformed.report,
          testResults: [
            { ...malformed.report.testResults[0], assertionResults: {} },
          ],
        },
        cache.testFile,
      ),
    ).toMatchObject({ valid: false });
  });
  it.each(['commit', 'manifestSha256', 'sourceTreeSha256', 'scopes'])(
    'rejects stale or substituted %s binding',
    (field) => {
      const f = fixture();
      f.evidence.binding = { ...binding, [field]: 'other' };
      expect(f.check().valid).toBe(false);
    },
  );
  it.each([
    'backend',
    'sourceClassification',
    'exitCode',
    'command',
    'reportSha256',
    'logSha256',
    'status',
  ])('rejects substituted %s result', (field) => {
    const f = fixture();
    Object.assign(f.row, { [field]: 'invented' });
    expect(f.check().valid).toBe(false);
  });
  it('rejects absent log/report, duplicate rows, unknown producer and stale report time', () => {
    const missing = fixture();
    missing.artifacts.delete('report.json');
    expect(missing.check().valid).toBe(false);
    const duplicate = fixture();
    duplicate.evidence.results.push(duplicate.row);
    expect(duplicate.check().valid).toBe(false);
    const producer = fixture();
    producer.evidence.producer = 'hand-authored';
    expect(producer.check().valid).toBe(false);
    const old = fixture();
    old.row.startedAt = new Date(1500).toISOString();
    expect(old.check().valid).toBe(false);
  });
  it.each(['pending', 'skipped', 'todo', 'failed'])(
    'never counts %s as pass even with success=true',
    (status) => {
      const f = fixture();
      f.report.testResults[0]!.assertionResults[0]!.status = status;
      expect(inspectVitestReport(f.report, cache.testFile).valid).toBe(false);
    },
  );
  it('rejects zero assertions, wrong file, mixed files and mismatched counts', () => {
    const empty = fixture();
    empty.report.testResults[0]!.assertionResults = [];
    expect(inspectVitestReport(empty.report, cache.testFile).valid).toBe(false);
    const wrong = fixture();
    wrong.report.testResults[0]!.name = '/wrong.test.ts';
    expect(inspectVitestReport(wrong.report, cache.testFile).valid).toBe(false);
    const mixed = fixture();
    mixed.report.testResults.push(mixed.report.testResults[0]!);
    expect(inspectVitestReport(mixed.report, cache.testFile).valid).toBe(false);
    const count = fixture();
    count.report.numTotalTests = 8;
    expect(inspectVitestReport(count.report, cache.testFile).valid).toBe(false);
  });
  it('does not promote gaps or plan-only migration commands from supplied PASS labels', () => {
    for (const id of [
      'organization-isolation',
      'migration-rollback',
      'migration-rehearsal',
      'office-export',
    ]) {
      const f = fixture();
      const gap = cases.find((item: { id: string }) => item.id === id);
      f.row.caseId = id;
      expect(
        validateEvidence(f.evidence, [gap], binding, () => Buffer.from('{}'))
          .valid,
      ).toBe(false);
    }
  });
});
