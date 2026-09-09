import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const scanner = path.join(root, 'scripts/check-authoritative-patterns.mjs');

function run(rootDirectory = root) {
  return spawnSync(process.execPath, [scanner, '--root', rootDirectory], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('V04 authoritative architecture gates', () => {
  it('passes against the real repository', () => {
    const result = run();
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('"status": "PASS"');
  });

  it('rejects direct decimal, JS-number, browser, and fast-check leakage', async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), 'econmind-v04-gate-'));
    try {
      await Promise.all([
        mkdir(path.join(fixture, 'packages/core/src/engine'), {
          recursive: true,
        }),
        mkdir(path.join(fixture, 'apps/world-api/src'), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          path.join(fixture, 'packages/core/src/engine/invalid.ts'),
          "import Decimal from 'decimal.js'; const x = Number(new Decimal('1')); console.log(window, x);",
        ),
        writeFile(
          path.join(fixture, 'apps/world-api/src/invalid.ts'),
          "void import('fast-check');",
        ),
        writeFile(
          path.join(fixture, 'packages/core/src/engine/dynamic.ts'),
          "void import('decimal.js'); const canonicalValue = '1'; const Numeric = Number; export const leaked = +canonicalValue + Numeric(canonicalValue);",
        ),
        writeFile(
          path.join(fixture, 'packages/core/src/engine/alias.ts'),
          "const Numeric = globalThis['Number']; const Bound = Numeric.bind(null); export const leaked = Reflect.apply(Bound, null, ['1']);",
        ),
        writeFile(
          path.join(fixture, 'packages/core/src/engine/ambient-time.ts'),
          'export const now = Date.now(); export const converted = 1n * 10n; setTimeout(() => undefined, 1);',
        ),
      ]);
      const result = run(fixture);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('DECIMAL_DEPENDENCY_LEAK');
      expect(result.stdout).toContain('FLOATING_POINT_LEAK');
      expect(result.stdout).toContain('BROWSER_API_LEAK');
      expect(result.stdout).toContain('FAST_CHECK_RUNTIME_LEAK');
      expect(result.stdout).toContain('dynamic.ts');
      expect(result.stdout).toContain('alias.ts');
      expect(result.stdout).toContain('AMBIENT_TIME_LEAK');
      expect(result.stdout).toContain('CLOCK_MULTIPLIER_LEAK');
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it('allows the designated decimal owner and testkit fast-check imports', async () => {
    const fixture = await mkdtemp(
      path.join(os.tmpdir(), 'econmind-v04-allowed-'),
    );
    try {
      await Promise.all([
        mkdir(path.join(fixture, 'packages/core/src/numeric'), {
          recursive: true,
        }),
        mkdir(path.join(fixture, 'packages/testkit/src'), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          path.join(fixture, 'packages/core/src/numeric/world-decimal.ts'),
          "import Decimal from 'decimal.js'; export const exact = new Decimal('1');",
        ),
        writeFile(
          path.join(fixture, 'packages/testkit/src/property.ts'),
          "import fc from 'fast-check'; export const testOnly = fc.boolean();",
        ),
      ]);
      const result = run(fixture);
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
