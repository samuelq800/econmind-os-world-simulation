import { existsSync, readFileSync } from 'node:fs';
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

  it('trusted CI runs the explicit Office transport with strict types without activating a host', () => {
    const source = readFileSync(
      new URL(
        '../../.github/workflows/trusted-country-runtime.yml',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toContain(
      'tests/world-api/https-authenticated-office-command-route.test.ts',
    );
    expect(source).toContain(
      'pnpm exec tsc --noEmit -p tests/world-api/tsconfig.https-office-command-route.json',
    );
    expect(source).not.toMatch(
      /world-worker (?:dev|start)|workflow_dispatch|supabase db/u,
    );
  });

  it('explicit opening and host compositions retain strict candidate coverage without activation', () => {
    const source = readFileSync(
      new URL(
        '../../.github/workflows/trusted-country-runtime.yml',
        import.meta.url,
      ),
      'utf8',
    );
    for (const path of [
      'apps/world-web/src/trusted-host/**',
      'apps/world-worker/src/preparation/official-opening-bundle-*.ts',
      'apps/world-api/src/integration/nonactivated-runtime-api-host.ts',
      'tests/world-core/official-opening-bundle-preflight.test.ts',
      'tests/world-api/nonactivated-runtime-api-host.test.ts',
      'tests/world-web/trusted-host-session.test.ts',
      'tests/world-web/trusted-host-financial-privacy.test.ts',
      'tests/support/g-runtime-api-host-test-only-fixture.ts',
    ])
      expect(source).toContain(path);
    for (const config of [
      'tests/support/tsconfig.official-opening-bundle-preflight.json',
      'tests/world-api/tsconfig.nonactivated-runtime-api-host.json',
      'tests/world-web/trusted-host-session.tsconfig.json',
    ])
      expect(source).toContain(`pnpm exec tsc --noEmit -p ${config}`);
    expect(source).not.toMatch(
      /continue-on-error|workflow_dispatch|world-worker (?:dev|start)|supabase db/u,
    );
  });

  it('every explicit trusted-CI test, helper and config path exists instead of being silently omitted', () => {
    const source = readFileSync(
      new URL(
        '../../.github/workflows/trusted-country-runtime.yml',
        import.meta.url,
      ),
      'utf8',
    );
    const paths = [
      ...new Set(
        source.match(/(?:tests|scripts)\/[A-Za-z0-9_./-]+\.(?:ts|mjs|json)/gu),
      ),
    ];
    expect(paths.length).toBeGreaterThan(20);
    for (const file of paths) {
      expect(existsSync(new URL(`../../${file}`, import.meta.url)), file).toBe(
        true,
      );
    }
  });
});
