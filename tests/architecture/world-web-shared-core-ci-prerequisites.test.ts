import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('fresh CI public contract prerequisites', () => {
  it.each(['trusted-country-runtime.yml', 'world-web-atlas-candidate.yml'])(
    '%s builds the actual shared contract before tests and web compilation',
    (name) => {
      const source = readFileSync(
        new URL(`../../.github/workflows/${name}`, import.meta.url),
        'utf8',
      );
      const build = source.indexOf('pnpm --filter @econmind/core build');
      expect(build).toBeGreaterThan(-1);
      expect(build).toBeLessThan(source.indexOf('pnpm exec vitest run'));
      expect(build).toBeLessThan(
        source.indexOf('pnpm --filter @econmind/world-web'),
      );
      expect(source).toContain('- packages/core/**');
      expect(source).toContain('contents: read');
      expect(source).toContain('(no deploy)');
      expect(source).not.toContain('continue-on-error: true');
      expect(source).not.toContain('pnpm --filter @econmind/core --if-present');
    },
  );

  it('formal static Pages builds public contracts without activating server or database', () => {
    const source = readFileSync(
      new URL('../../.github/workflows/deploy-world-web.yml', import.meta.url),
      'utf8',
    );
    const build = source.indexOf('pnpm --filter @econmind/core build');
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(
      source.indexOf('pnpm --filter @econmind/world-web build'),
    );
    expect(source).toContain('- packages/core/**');
    expect(source).toContain('contents: read');
    expect(source).not.toContain('continue-on-error: true');
    expect(source).not.toContain('pnpm --filter @econmind/core --if-present');
    expect(source).not.toMatch(
      /supabase|migration:|seed:|world-worker (?:dev|start)/u,
    );
  });

  it('reviewed schema CI retains Git provenance and runs direct ephemeral regressions', () => {
    const source = readFileSync(
      new URL(
        '../../.github/workflows/trusted-country-runtime.yml',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain('fetch-depth: 0');
    expect(source).toContain('- database/migrations/**');
    expect(source).toContain('pnpm migration:validate');
    expect(source).toContain(
      'node --test tests/foundation/migration-rehearsal-filtered-provenance.test.mjs',
    );
    expect(source).toContain(
      'tests/world-core/production-posting-schema.test.ts',
    );
    expect(source).toContain(
      'tests/foundation/snapshot-storage-migration-policy.test.ts',
    );
    expect(source).toContain('--no-file-parallelism');
    expect(source).not.toMatch(
      /workflow_dispatch|supabase|service_role|management\/v1/u,
    );
    expect(source).not.toContain('continue-on-error');
  });
});
