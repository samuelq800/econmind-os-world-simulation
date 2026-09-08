import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

it('the actual pnpm test:boundaries command rejects the outside-src review bridge', async () => {
  const fixtureRoot = await mkdtemp(
    path.join(os.tmpdir(), 'econmind-canonical-boundary-'),
  );
  try {
    const files = {
      'apps/world-web/src/entry.ts': "export * from '../bridge.mjs';",
      'apps/world-web/bridge.mjs': "export * from '../world-worker/index.js';",
      'apps/world-web/bridge.d.mts': 'export declare const authority: boolean;',
      'apps/world-worker/index.ts': 'export const authority = true;',
    };
    for (const [name, source] of Object.entries(files)) {
      const target = path.join(fixtureRoot, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, source);
    }
    // This file is outside boundaries.test.ts, so the script's focused suite
    // cannot recursively invoke this integration test.
    const result = spawnSync(
      'pnpm',
      ['test:boundaries', '--root', fixtureRoot],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.stderr).toContain('FORBIDDEN_ARCHITECTURE_DEPENDENCY');
    expect(result.stderr).toContain('bridge.mjs');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}, 40_000);
