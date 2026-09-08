import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { violationsFor } from '../../scripts/boundary-rules.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('repository import boundaries', () => {
  it('detects a forbidden persistence import in the web application', async () => {
    const fixturePath =
      'tests/fixtures/architecture-invalid/world-web-imports-persistence.ts';
    const source = await readFile(
      path.join(repositoryRoot, fixturePath),
      'utf8',
    );
    const violations = violationsFor('apps/world-web/src/invalid.ts', source);

    expect(violations).toEqual([
      {
        file: 'apps/world-web/src/invalid.ts',
        import: '@econmind/persistence',
      },
    ]);
  });

  it('allows a regular React import in the web application', () => {
    const violations = violationsFor(
      'apps/world-web/src/valid.tsx',
      "import { StrictMode } from 'react';",
    );

    expect(violations).toEqual([]);
  });

  it('detects React and Supabase imports in core', () => {
    const violations = violationsFor(
      'packages/core/src/invalid.ts',
      "import React from 'react'; import { createClient } from '@supabase/supabase-js';",
    );

    expect(violations.map((violation) => violation.import)).toEqual([
      'react',
      '@supabase/supabase-js',
    ]);
  });
});
