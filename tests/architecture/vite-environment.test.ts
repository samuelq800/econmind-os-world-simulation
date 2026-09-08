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
  try {
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
  } catch (error) {
    await rm(fixtureRoot, { recursive: true, force: true });
    throw error;
  }
}

function runVite(
  appRoot: string,
  command: 'build' | 'dev',
  environment: NodeJS.ProcessEnv = {},
  mode = 'production',
): ViteResult {
  const arguments_ =
    command === 'build'
      ? [
          viteExecutable,
          'build',
          '--config',
          'vite.config.ts',
          '--outDir',
          'dist-review',
          '--mode',
          mode,
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
    env: { ...process.env, ...environment },
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

  it.each([
    [
      'VITE_WORLD_DATABASE_URL',
      'postgresql://synthetic-user:synthetic-password@localhost/test',
    ],
    ['VITE_UNAPPROVED_PUBLIC_SETTING', 'synthetic-password'],
    [
      'VITE_WORLD_API_URL',
      'https://synthetic-user:synthetic-password@example.invalid/api',
    ],
    [
      'VITE_WORLD_API_URL',
      'postgres://synthetic-user:synthetic-password@localhost/test',
    ],
    [
      'VITE_WORLD_API_BASE_URL',
      'https://example.invalid/api?admin_token=synthetic-password',
    ],
    [
      'VITE_WORLD_API_URL',
      'https://example.invalid/postgresql%3A%2F%2Fsynthetic-password',
    ],
  ])(
    'rejects unsafe %s at real Vite dev/build and effective-env CLI entries',
    async (name, value) => {
      const { appRoot, fixtureRoot } = await createViteFixture();
      try {
        await writeFile(path.join(appRoot, '.env.local'), `${name}=${value}\n`);
        for (const command of ['build', 'dev'] as const) {
          const result = runVite(appRoot, command);
          expect(result.exitCode).toBe(1);
          expect(result.signal).toBeNull();
          expect(result.output).toContain(name);
          expect(result.output).toContain('FORBIDDEN_BROWSER_ENV');
          expect(result.output).not.toContain('synthetic-password');
        }
        for (const script of [
          'assert-safe-environment.mjs',
          'environment-policy.mjs',
        ]) {
          await copyFile(
            path.join(repositoryRoot, 'scripts', script),
            path.join(fixtureRoot, 'scripts', script),
          );
        }
        const check = spawnSync(
          process.execPath,
          [path.join(fixtureRoot, 'scripts/assert-safe-environment.mjs')],
          {
            cwd: fixtureRoot,
            encoding: 'utf8',
            timeout: 10_000,
          },
        );
        expect(check.status).toBe(1);
        expect(check.stderr).toContain(name);
        expect(`${check.stdout}${check.stderr}`).not.toContain(
          'synthetic-password',
        );
        expect(
          await readdir(path.join(appRoot, 'dist-review')).catch(() => []),
        ).toEqual([]);
        await rm(path.join(appRoot, '.env.local'));
        expect(runVite(appRoot, 'build').exitCode).toBe(0);
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it('rejects the database variable supplied by process.env', async () => {
    const { appRoot, fixtureRoot } = await createViteFixture();
    try {
      const result = runVite(appRoot, 'build', {
        VITE_WORLD_DATABASE_URL:
          'postgresql://synthetic-user:synthetic-password@localhost/test',
      });
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('VITE_WORLD_DATABASE_URL');
      expect(result.output).not.toContain('synthetic-password');
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each(['.env', '.env.local', '.env.review', '.env.review.local'])(
    'uses native mode-aware loading of %s',
    async (filename) => {
      const { appRoot, fixtureRoot } = await createViteFixture();
      try {
        await writeFile(
          path.join(appRoot, filename),
          'VITE_WORLD_DATABASE_URL=synthetic-password\n',
        );
        const result = runVite(appRoot, 'build', {}, 'review');
        expect(result.exitCode).toBe(1);
        expect(result.output).toContain('VITE_WORLD_DATABASE_URL');
        expect(result.output).not.toContain('synthetic-password');
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it('preserves native precedence, expansion, NODE_ENV, and the approved local API URL', async () => {
    const { appRoot, fixtureRoot } = await createViteFixture();
    try {
      await writeFile(
        path.join(appRoot, '.env'),
        'NODE_ENV=production\nREVIEW_API_PORT=4100\nVITE_WORLD_API_URL=postgresql://synthetic-password@localhost/db\n',
      );
      await writeFile(
        path.join(appRoot, '.env.production.local'),
        'VITE_WORLD_API_URL=http://127.0.0.1:${REVIEW_API_PORT}\n',
      );
      const result = runVite(appRoot, 'build');
      expect(result.exitCode, result.output).toBe(0);
      const override = runVite(appRoot, 'build', {
        VITE_WORLD_API_URL: 'https://synthetic-password@example.invalid',
      });
      expect(override.exitCode).toBe(1);
      expect(override.output).not.toContain('synthetic-password');
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('rejects server JWTs with noncanonical JSON headers inside approved URLs', async () => {
    const { appRoot, fixtureRoot } = await createViteFixture();
    const token = [
      Buffer.from('{ "alg": "HS256", "typ": "JWT" }').toString('base64url'),
      Buffer.from(JSON.stringify({ role: 'service_role' })).toString(
        'base64url',
      ),
      Buffer.from('synthetic-password').toString('base64url'),
    ].join('.');
    try {
      await writeFile(
        path.join(appRoot, '.env.local'),
        `VITE_WORLD_API_URL=https://example.invalid/${token}\n`,
      );
      const result = runVite(appRoot, 'build');
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('SERVER_AUTHENTICATION_TOKEN');
      expect(result.output).not.toContain(token);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
