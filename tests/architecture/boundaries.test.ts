import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const scannerPath = path.join(repositoryRoot, 'scripts/check-boundaries.mjs');
const invalidPackageFixture = path.join(
  repositoryRoot,
  'tests/fixtures/architecture-invalid/world-web-imports-persistence.ts',
);

interface FixtureOptions {
  readonly coreSource?: string;
  readonly source: string;
  readonly sourceName?: string;
  readonly tsconfig?: object;
  readonly webFiles?: Readonly<Record<string, string>>;
}

async function runBoundaryFixture(options: FixtureOptions) {
  const fixtureRoot = await mkdtemp(
    path.join(os.tmpdir(), 'econmind-boundary-'),
  );
  try {
    const webRoot = path.join(fixtureRoot, 'apps/world-web');
    const workerRoot = path.join(fixtureRoot, 'apps/world-worker');
    await Promise.all([
      mkdir(path.join(webRoot, 'src'), { recursive: true }),
      mkdir(path.join(workerRoot, 'src'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        path.join(webRoot, 'package.json'),
        JSON.stringify({ name: '@econmind/world-web', private: true }),
      ),
      writeFile(
        path.join(workerRoot, 'package.json'),
        JSON.stringify({ name: '@econmind/world-worker', private: true }),
      ),
      writeFile(
        path.join(workerRoot, 'src/index.ts'),
        'export const workerAuthority = true;\n',
      ),
      writeFile(
        path.join(webRoot, 'src', options.sourceName ?? 'probe.ts'),
        options.source,
      ),
    ]);

    if (options.tsconfig) {
      await writeFile(
        path.join(webRoot, 'tsconfig.json'),
        JSON.stringify(options.tsconfig),
      );
    }
    for (const [fileName, source] of Object.entries(options.webFiles ?? {})) {
      await writeFile(path.join(webRoot, 'src', fileName), source);
    }
    if (options.coreSource) {
      const coreRoot = path.join(fixtureRoot, 'packages/core');
      await mkdir(path.join(coreRoot, 'src'), { recursive: true });
      await Promise.all([
        writeFile(
          path.join(coreRoot, 'package.json'),
          JSON.stringify({ name: '@econmind/core', private: true }),
        ),
        writeFile(path.join(coreRoot, 'src/probe.ts'), options.coreSource),
      ]);
    }

    const result = spawnSync(
      process.execPath,
      [scannerPath, '--root', fixtureRoot],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
      },
    );
    return {
      exitCode: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

describe('resolved repository authority boundaries', () => {
  it('fails the CLI for a direct forbidden workspace package import', async () => {
    const source = await readFile(invalidPackageFixture, 'utf8');
    const result = await runBoundaryFixture({ source });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('FORBIDDEN_ARCHITECTURE_DEPENDENCY');
    expect(result.output).toContain('@econmind/persistence');
  });

  it('fails for a relative web-to-worker import resolved through .js-to-.ts substitution', async () => {
    const result = await runBoundaryFixture({
      source:
        "import { workerAuthority } from '../../world-worker/src/index.js';\nexport { workerAuthority };\n",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('apps/world-worker/src/index.ts');
    expect(result.output).toContain('world-web cannot import world-worker');
  });

  it('parses compact valid import syntax', async () => {
    const result = await runBoundaryFixture({
      source: "import{workerAuthority}from'@econmind/world-worker';\n",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('@econmind/world-worker');
  });

  it('scans alternate authority-bearing source extensions including .mts', async () => {
    const result = await runBoundaryFixture({
      source: "export * from '@econmind/world-worker';\n",
      sourceName: 'probe.mts',
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('probe.mts');
    expect(result.output).toContain('@econmind/world-worker');
  });

  it('resolves configured TypeScript path aliases before applying ownership rules', async () => {
    const result = await runBoundaryFixture({
      source: "import { workerAuthority } from '@worker/index.js';\n",
      tsconfig: {
        compilerOptions: {
          baseUrl: '.',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          paths: { '@worker/*': ['../world-worker/src/*'] },
        },
      },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('apps/world-worker/src/index.ts');
  });

  it('checks dynamic import and require when they use static module strings', async () => {
    const dynamicResult = await runBoundaryFixture({
      source: "void import('../../world-worker/src/index.js');\n",
    });
    const requireResult = await runBoundaryFixture({
      source:
        "const worker = require('../../world-worker/src/index.js');\nvoid worker;\n",
      sourceName: 'probe.cjs',
    });

    expect(dynamicResult.exitCode).not.toBe(0);
    expect(requireResult.exitCode).not.toBe(0);
  });

  it('fails closed for a non-literal dynamic module reference', async () => {
    const result = await runBoundaryFixture({
      source: "const target = './local.js';\nvoid import(target);\n",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('UNRESOLVED_DYNAMIC_REFERENCE');
  });

  it('allows imports that resolve within world-web', async () => {
    const result = await runBoundaryFixture({
      source:
        "import { publicValue } from './public.js';\nexport { publicValue };\n",
      webFiles: { 'public.ts': 'export const publicValue = 1;\n' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('"status": "PASS"');
  });

  it('preserves core isolation from React, UI, persistence, and Supabase', async () => {
    const result = await runBoundaryFixture({
      source: 'export {};\n',
      coreSource:
        "import React from 'react';\nimport { ui } from '@econmind/ui';\nimport { db } from '@econmind/persistence';\nimport { createClient } from '@supabase/supabase-js';\nvoid React; void ui; void db; void createClient;\n",
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain('core cannot depend on react');
    expect(result.output).toContain('core cannot import ui implementation');
    expect(result.output).toContain(
      'core cannot import persistence implementation',
    );
    expect(result.output).toContain(
      'core cannot depend on @supabase/supabase-js',
    );
  });
});
