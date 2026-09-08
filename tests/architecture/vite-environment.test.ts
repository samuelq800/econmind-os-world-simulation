import { spawnSync } from 'node:child_process';
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const viteExecutable = path.join(
  repositoryRoot,
  'node_modules/vite/bin/vite.js',
);
const syntheticSecret = 'review-fix-synthetic-service-role-value';

interface ViteResult {
  readonly exitCode: number | null;
  readonly output: string;
  readonly signal: NodeJS.Signals | null;
}

async function createViteFixture() {
  const fixtureRoot = await mkdtemp(
    path.join(repositoryRoot, '.vite-env-test-'),
  );
  const appRoot = path.join(fixtureRoot, 'apps/world-web');
  const scriptsRoot = path.join(fixtureRoot, 'scripts');
  await Promise.all([
    mkdir(appRoot, { recursive: true }),
    mkdir(scriptsRoot, { recursive: true }),
  ]);
  await Promise.all([
    cp(
      path.join(repositoryRoot, 'apps/world-web/src'),
      path.join(appRoot, 'src'),
      {
        recursive: true,
      },
    ),
    copyFile(
      path.join(repositoryRoot, 'apps/world-web/index.html'),
      path.join(appRoot, 'index.html'),
    ),
    copyFile(
      path.join(repositoryRoot, 'apps/world-web/vite.config.ts'),
      path.join(appRoot, 'vite.config.ts'),
    ),
    copyFile(
      path.join(repositoryRoot, 'scripts/vite-environment-policy.mjs'),
      path.join(scriptsRoot, 'vite-environment-policy.mjs'),
    ),
    symlink(
      path.join(repositoryRoot, 'apps/world-web/node_modules'),
      path.join(appRoot, 'node_modules'),
      'dir',
    ),
  ]);
  return { appRoot, fixtureRoot };
}

function runVite(appRoot: string, command: 'build' | 'dev'): ViteResult {
  const arguments_ =
    command === 'build'
      ? [
          viteExecutable,
          'build',
          '--config',
          'vite.config.ts',
          '--outDir',
          'dist-review',
        ]
      : [
          viteExecutable,
          '--config',
          'vite.config.ts',
          '--host',
          '127.0.0.1',
          '--port',
          '4179',
          '--strictPort',
        ];
  const result = spawnSync(process.execPath, arguments_, {
    cwd: appRoot,
    encoding: 'utf8',
    timeout: 10_000,
  });
  return {
    exitCode: result.status,
    output: `${result.stdout}${result.stderr}`,
    signal: result.signal,
  };
}

async function readTree(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? readTree(entryPath)
        : readFile(entryPath, 'utf8').catch(() => '');
    }),
  );
  return contents.join('\n');
}

describe('world-web effective Vite environment', () => {
  it('accepts a legitimate public variable through the actual build config', async () => {
    const { appRoot, fixtureRoot } = await createViteFixture();
    try {
      await writeFile(
        path.join(appRoot, '.env.local'),
        'VITE_WORLD_API_BASE_URL=https://safe.example.invalid\n',
      );

      const result = runVite(appRoot, 'build');

      expect(result.exitCode, result.output).toBe(0);
      expect(result.signal).toBeNull();
      expect(await readTree(path.join(appRoot, 'dist-review'))).not.toContain(
        syntheticSecret,
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('stops direct build and dev before an app-local service-role value can be emitted', async () => {
    const { appRoot, fixtureRoot } = await createViteFixture();
    try {
      await writeFile(
        path.join(appRoot, '.env.local'),
        `VITE_SUPABASE_SERVICE_ROLE_KEY=${syntheticSecret}\n`,
      );

      const buildResult = runVite(appRoot, 'build');
      const devResult = runVite(appRoot, 'dev');
      const buildOutput = await readTree(path.join(appRoot, 'dist-review'));

      expect(buildResult.exitCode).toBe(1);
      expect(buildResult.signal).toBeNull();
      expect(devResult.exitCode).toBe(1);
      expect(devResult.signal).toBeNull();
      for (const result of [buildResult, devResult]) {
        expect(result.output).toContain('VITE_SUPABASE_SERVICE_ROLE_KEY');
        expect(result.output).toContain('Supabase service-role credential');
        expect(result.output).not.toContain(syntheticSecret);
      }
      expect(buildOutput).not.toContain(syntheticSecret);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
