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
          "import fc from 'fast-check'; export const runtime = fc.boolean();",
        ),
      ]);
      const result = run(fixture);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('DECIMAL_DEPENDENCY_LEAK');
      expect(result.stdout).toContain('FLOATING_POINT_LEAK');
      expect(result.stdout).toContain('BROWSER_API_LEAK');
      expect(result.stdout).toContain('FAST_CHECK_RUNTIME_LEAK');
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});
