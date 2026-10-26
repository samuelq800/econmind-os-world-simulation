import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe.each(['check-boundaries.mjs', 'check-authoritative-patterns.mjs'])(
  '%s scan coverage',
  (scanner) => {
    it('fails closed for missing, empty, file and malformed roots, then scans a valid source', async () => {
      const fixture = await mkdtemp(path.join(tmpdir(), 'scan-root-safety-'));
      const run = (args: string[]) =>
        spawnSync(
          process.execPath,
          [path.join(root, 'scripts', scanner), ...args],
          {
            cwd: root,
            encoding: 'utf8',
            timeout: 15_000,
          },
        );
      try {
        const marker = path.join(fixture, 'marker.txt');
        await writeFile(marker, 'not a repository');
        for (const args of [
          ['--root', path.join(fixture, 'missing')],
          ['--root', fixture],
          ['--root', marker],
          ['--root', `"${fixture}"`],
          ['--root'],
          ['--root', ''],
          ['--root', '   '],
          ['--roo', fixture],
          ['--root', fixture, 'extra'],
        ]) {
          const result = run(args);
          expect(result.error).toBeUndefined();
          expect(result.status, `${result.stdout}${result.stderr}`).toBe(1);
          expect(result.stderr).toContain('"status":');
          expect(result.stdout).not.toContain('"PASS"');
        }
        const source = path.join(fixture, 'packages/core/src');
        await mkdir(source, { recursive: true });
        await writeFile(
          path.join(source, 'entry.ts'),
          'export const value = 1;',
        );
        const valid = run(['--root', fixture]);
        expect(valid.status, `${valid.stdout}${valid.stderr}`).toBe(0);
        expect(JSON.parse(valid.stdout)).toMatchObject({
          status: 'PASS',
          scannedFiles: 1,
        });
      } finally {
        await rm(fixture, { recursive: true, force: true });
      }
    });
  },
);
