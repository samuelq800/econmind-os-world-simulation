import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseSocialWorkflowArguments,
  socialConnectionPlan,
  verifySocialConnection,
} from '../../tools/office-connection/social-workflow.mjs';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
const child = vi.mocked(spawnSync);
const completed = (status: number | null, signal: string | null = null) =>
  ({
    status,
    signal,
    stdout: '',
    stderr: '',
    pid: 1,
    output: [],
  }) as unknown as ReturnType<typeof spawnSync>;

beforeEach(() => {
  child.mockReset();
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Social connection workflow evidence boundary (mocked children; no native host)', () => {
  it('accepts only the three bounded commands and refuses source, result and host overrides', () => {
    expect(parseSocialWorkflowArguments(['plan'])).toBe('plan');
    expect(parseSocialWorkflowArguments(['--plan'])).toBe('plan');
    expect(parseSocialWorkflowArguments(['verify', '--fixture'])).toBe(
      'fixture',
    );
    expect(parseSocialWorkflowArguments(['verify', '--isolated-http'])).toBe(
      'isolated-http',
    );
    for (const args of [
      [],
      ['verify'],
      ['plan', '--execute'],
      ['verify', '--formal'],
      ['verify', '--fixture', '--receipt=old.json'],
      ['verify', '--isolated-http', '--host=https://foreign.invalid'],
    ]) {
      expect(() => parseSocialWorkflowArguments(args)).toThrow('no overrides');
    }
    expect(child).not.toHaveBeenCalled();
  });

  it('plan records implemented layers and outstanding formal/native prerequisites without granting evidence', () => {
    const plan = socialConnectionPlan();
    expect(plan).toMatchObject({
      classification: 'PLAN_ONLY_NOT_EXECUTION_EVIDENCE',
      sourceClass: 'SIMULATED_OPENING',
      sourceAdmitted: false,
      WorldClock: false,
      evidence: {
        fixture: 'NOT_RUN',
        nativeHttp: 'NOT_RUN',
        nativePersistence: 'NOT_RUN',
        browser: 'NOT_RUN',
        formal: 'BLOCKED',
      },
    });
    expect(plan.blockers.formal.join(' ')).toContain(
      'SocialOperatingCustodyPort',
    );
    expect(plan.blockers.nativePersistence.join(' ')).toContain(
      'incompatible F marker',
    );
    expect(child).not.toHaveBeenCalled();
  });

  it('refuses missing isolated opt-in before starting any child', () => {
    vi.stubEnv('ECONMIND_ENV', 'local');
    vi.stubEnv('ECONMIND_SOCIAL_OFFICE_DEMO', '');
    const result = verifySocialConnection('isolated-http');
    expect(result.exitCode).toBe(2);
    expect(result.report.evidence.nativeHttp).toBe('NOT_RUN');
    expect(result.report.evidence.formal).toBe('BLOCKED');
    expect(child).not.toHaveBeenCalled();
  });

  it('preserves an actual child nonzero exit and stops dependent commands', () => {
    child.mockReturnValueOnce(completed(0)).mockReturnValueOnce(completed(37));
    const result = verifySocialConnection('fixture');
    expect(result.exitCode).toBe(37);
    expect(child).toHaveBeenCalledTimes(2);
    expect(
      result.report.steps.map((s: { status: string }) => s.status),
    ).toEqual(['PASS', 'FAIL']);
    expect(result.report.classification).toBe('CURRENT_EXECUTION_INCOMPLETE');
    expect(result.report.evidence).toMatchObject({
      fixture: 'FAIL',
      nativeHttp: 'NOT_RUN',
      nativePersistence: 'NOT_RUN',
      formal: 'BLOCKED',
    });
  });

  it('treats a terminated or failed-to-start child as failure even without a numeric exit', () => {
    child.mockReturnValueOnce(completed(null, 'SIGTERM'));
    expect(verifySocialConnection('fixture').exitCode).toBe(1);
    child.mockReset();
    child.mockReturnValueOnce({
      ...completed(0),
      error: Object.assign(Error('missing'), { code: 'ENOENT' }),
    } as never);
    const failed = verifySocialConnection('fixture');
    expect(failed.exitCode).toBe(1);
    expect(failed.report.steps[0].errorCode).toBe('ENOENT');
    expect(failed.report.evidence.fixture).toBe('FAIL');
  });

  it('fixture orchestration cannot label native, browser or formal work as passed', () => {
    child.mockReturnValue(completed(0));
    const result = verifySocialConnection('fixture');
    expect(result.exitCode).toBe(0);
    expect(result.report.classification).toBe(
      'FIXTURE_CONFIRMED_FORMAL_BLOCKED',
    );
    expect(result.report.evidence).toEqual({
      fixture: 'PASS',
      nativeHttp: 'NOT_RUN',
      nativePersistence: 'NOT_RUN',
      browser: 'NOT_RUN',
      formal: 'BLOCKED',
    });
    expect(result.report.steps[2].command).toContain(
      'tests/world-core/c-social-office-actions.test.ts',
    );
    expect(result.report.steps[0]).toMatchObject({
      stdoutBytes: 0,
      stdoutSHA256:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
    expect(
      result.report.steps.flatMap((s: { command: string[] }) => s.command),
    ).not.toContain('tools/social-office-demo/verify.mjs');
  });

  it('HTTP orchestration calls only existing controlled entries and retains unrun native-persistence/browser/formal status', () => {
    vi.stubEnv('ECONMIND_ENV', 'local');
    vi.stubEnv('ECONMIND_SOCIAL_OFFICE_DEMO', '1');
    child.mockReturnValue(completed(0));
    const result = verifySocialConnection('isolated-http');
    expect(result.report.steps.map((s: { id: string }) => s.id)).toEqual([
      'finance-source-bytes',
      'fixed-host-build',
      'actual-isolated-http',
    ]);
    expect(result.report.steps[2].command.slice(1)).toEqual([
      'tools/social-office-demo/verify.mjs',
      '--isolated',
    ]);
    expect(result.report.evidence).toEqual({
      fixture: 'NOT_RUN',
      nativeHttp: 'PASS',
      nativePersistence: 'NOT_RUN',
      browser: 'NOT_RUN',
      formal: 'BLOCKED',
    });
    expect(result.report.sourceAdmitted).toBe(false);
    expect(result.report.WorldClock).toBe(false);
    expect(result.report.nativeCleanup).toBe('EXISTING_VERIFIER_COMPLETED');
  });

  it('a terminated HTTP verifier leaves native cleanup unknown and cannot certify the flow', () => {
    vi.stubEnv('ECONMIND_ENV', 'local');
    vi.stubEnv('ECONMIND_SOCIAL_OFFICE_DEMO', '1');
    child
      .mockReturnValueOnce(completed(0))
      .mockReturnValueOnce(completed(0))
      .mockReturnValueOnce(completed(null, 'SIGTERM'));
    const result = verifySocialConnection('isolated-http');
    expect(result.exitCode).toBe(1);
    expect(result.report.evidence.nativeHttp).toBe('FAIL');
    expect(result.report.nativeCleanup).toBe('UNKNOWN_PRESERVE_OWNED_EVIDENCE');
    expect(result.report.evidence.formal).toBe('BLOCKED');
  });
});
