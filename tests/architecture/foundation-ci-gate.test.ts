import { describe, expect, it } from 'vitest';

import { assessFoundationGate } from '../../scripts/foundation-gate-policy.mjs';

const validScripts = {
  build: 'pnpm -r --if-present build',
  'env:check': 'ECONMIND_ENV=local node scripts/assert-safe-environment.mjs',
  'format:check': 'prettier --check .',
  lint: 'eslint .',
  'migration:rehearse': 'node scripts/rehearse-migrations.mjs',
  'migration:validate': 'node scripts/validate-migrations.mjs',
  'secrets:check': 'node scripts/check-repository-secrets.mjs',
  test: 'vitest run',
  'test:boundaries':
    'vitest run tests/architecture && node scripts/check-boundaries.mjs && node scripts/check-authoritative-patterns.mjs',
  'test:property': 'vitest run tests/property',
  typecheck: 'pnpm -r --if-present typecheck',
};

describe('V04 protected Foundation gate', () => {
  it('accepts real protected commands and enabled tests', () => {
    expect(
      assessFoundationGate(
        validScripts,
        new Map([['test.ts', 'it("x", () => 1);']]),
      ),
    ).toEqual({ status: 'PASS', violations: [] });
  });

  it('rejects missing, echo-pass, skipped, and unwired protection', () => {
    const invalid = {
      ...validScripts,
      lint: 'echo pass',
      'test:boundaries': 'vitest run',
    };
    delete (invalid as Partial<typeof validScripts>)['migration:rehearse'];
    const result = assessFoundationGate(
      invalid,
      new Map([
        [
          'tests/property/invalid.test.ts',
          ['it', 'skip("hidden", () => 1);'].join('.'),
        ],
      ]),
    );
    expect(result.status).toBe('FAIL');
    expect(result.violations).toEqual(
      expect.arrayContaining([
        'BYPASSED_PROTECTED_SCRIPT:lint',
        'MISSING_PROTECTED_SCRIPT:migration:rehearse',
        'ARCHITECTURE_SCANNERS_NOT_WIRED',
        'DISABLED_PROTECTED_TEST:tests/property/invalid.test.ts',
      ]),
    );
  });
});
