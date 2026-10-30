import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  assertImmutableCommit,
  buildDryRunArguments,
  inspectReadDeclarations,
  safeBundleEnvironment,
  verifyCandidateSource,
} from '../../tools/office-connection/postwar-read-release-preparation.mjs';

const candidate = {
  main: '../../apps/world-api/cloudflare/runtime-api.mjs',
  compatibility_date: '2026-10-09',
  compatibility_flags: ['nodejs_compat'],
  preview_urls: false,
  env: {
    staging: {
      name: 'econmind-world-api-staging',
      vars: { RUNTIME_MODE: 'HOLD' },
      services: [
        {
          binding: 'WORLD_EXECUTOR',
          service: 'econmind-world-executor-staging',
        },
      ],
    },
  },
};
describe('immutable postwar API preparation has no publication authority', () => {
  it('always invokes a build-only command with isolated dotenv and no autoconfiguration', () => {
    expect(buildDryRunArguments('/fixture/output')).toEqual([
      'deploy',
      '--dry-run',
      '--autoconfig=false',
      '--install-skills=false',
      '--config',
      '/fixture/output/dry-run.wrangler.json',
      '--env-file',
      '/fixture/output/empty.env',
      '--outdir',
      '/fixture/output/bundle',
      '--metafile',
      '/fixture/output/bundle-meta.json',
    ]);
  });
  it.each([
    'main',
    'refs/heads/main',
    'a'.repeat(39),
    'a'.repeat(41),
    '0'.repeat(40),
    '$(echo unsafe)',
  ])('rejects mutable or malformed source %s', (commit) => {
    expect(() => assertImmutableCommit(commit)).toThrow(
      'FULL_IMMUTABLE_COMMIT_REQUIRED',
    );
  });
  it('accepts a full SHA but refuses a mismatched actual checkout', () => {
    expect(() => assertImmutableCommit('a'.repeat(40))).not.toThrow();
    expect(() => verifyCandidateSource(process.cwd(), 'a'.repeat(40))).toThrow(
      'EXACT_CLEAN_CANDIDATE_REQUIRED',
    );
  });
  it('reports existing HOLD configuration as incomplete without stopping bundling', () => {
    expect(inspectReadDeclarations(candidate)).toEqual({
      blockers: [
        'ADMITTED_READ_ONLY_NOT_DECLARED',
        'PINNED_SERVER_CONFIGURATION_ABSENT',
        'EXISTING_POSTWAR_READER_BINDING_NOT_DECLARED',
      ],
      declaredReadConfigurationValid: false,
      remoteBindingsVerified: false,
      databasePermissionsVerified: false,
    });
  });
  it('rejects redirected API targets and executor services', () => {
    const target = structuredClone(candidate);
    target.env.staging.name = 'different-worker';
    expect(() => inspectReadDeclarations(target)).toThrow(
      'FIXED_EXISTING_API_TARGET_REQUIRED',
    );
    const service = structuredClone(candidate);
    service.env.staging.services[0]!.service = 'different-executor';
    expect(() => inspectReadDeclarations(service)).toThrow(
      'EXISTING_EXECUTOR_SERVICE_REQUIRED',
    );
  });
  it('rejects placeholder server pins even with a declared binding', async () => {
    const metadata = await readFile(
      'config/cloudflare/postwar-read.server.example.json',
      'utf8',
    );
    const configured = structuredClone(candidate) as typeof candidate & {
      env: { staging: { hyperdrive: unknown[]; vars: Record<string, string> } };
    };
    configured.env.staging.vars = {
      RUNTIME_MODE: 'ADMITTED_READ_ONLY',
      POSTWAR_READ_CONFIGURATION_JSON: metadata,
    };
    configured.env.staging.hyperdrive = [
      { binding: 'POSTWAR_READER', id: 'a'.repeat(32) },
    ];
    const result = inspectReadDeclarations(configured);
    expect(result.blockers).toEqual(['PINNED_SERVER_CONFIGURATION_INVALID']);
    expect(result.declaredReadConfigurationValid).toBe(false);
    expect(result.remoteBindingsVerified).toBe(false);
  });
  it('strips provider tokens, database URLs, proxy credentials and Node preload', () => {
    const environment = safeBundleEnvironment(
      {
        PATH: '/fixture/bin',
        CLOUDFLARE_API_TOKEN: 'TEST_ONLY',
        GH_TOKEN: 'TEST_ONLY',
        DATABASE_URL: 'TEST_ONLY',
        HTTPS_PROXY: 'TEST_ONLY',
        NODE_OPTIONS: '--import /untrusted',
        WRANGLER_DOT_ENV_FILE: '/untrusted',
      },
      '/fixture/home',
    );
    expect(environment).toEqual({
      PATH: '/fixture/bin',
      TMPDIR: '/fixture/home',
      HOME: '/fixture/home',
      XDG_CONFIG_HOME: '/fixture/home',
      WRANGLER_SEND_METRICS: 'false',
      CI: 'true',
    });
  });
  it('accepts complete declaration fields without claiming remote authority', async () => {
    const metadata = JSON.parse(
      await readFile(
        'config/cloudflare/postwar-read.server.example.json',
        'utf8',
      ),
    );
    metadata.read.authorizationPublisherRole =
      'existing_authorization_publisher';
    metadata.read.endpointPins.deploymentRef = 'CANDIDATE_' + 'A'.repeat(40);
    metadata.read.admittedWorldPins = {
      worldId: 'WORLD_CANDIDATE',
      seedRef: 'SEED_CANDIDATE',
      contentHash: 'sha256:' + 'a'.repeat(64),
      admissionRef: 'ADMISSION_CANDIDATE',
      minimumWorldVersion: '0',
    };
    const configured = structuredClone(candidate) as typeof candidate & {
      env: { staging: { hyperdrive: unknown[]; vars: Record<string, string> } };
    };
    configured.env.staging.vars = {
      RUNTIME_MODE: 'ADMITTED_READ_ONLY',
      POSTWAR_READ_CONFIGURATION_JSON: JSON.stringify(metadata),
    };
    configured.env.staging.hyperdrive = [
      { binding: 'POSTWAR_READER', id: 'a'.repeat(32) },
    ];
    expect(inspectReadDeclarations(configured)).toEqual({
      blockers: [],
      declaredReadConfigurationValid: true,
      remoteBindingsVerified: false,
      databasePermissionsVerified: false,
    });
    for (const [record, field] of [
      [metadata.read.endpointPins, 'deploymentRef'],
      [metadata.read.admittedWorldPins, 'worldId'],
      [metadata.read.admittedWorldPins, 'seedRef'],
      [metadata.read.admittedWorldPins, 'admissionRef'],
    ] as const) {
      const original = record[field];
      record[field] = 'lowercase_invalid';
      configured.env.staging.vars.POSTWAR_READ_CONFIGURATION_JSON =
        JSON.stringify(metadata);
      expect(inspectReadDeclarations(configured).blockers).toContain(
        'PINNED_SERVER_CONFIGURATION_INVALID',
      );
      record[field] = original;
    }
    metadata.read.readerRole = 'postgres';
    configured.env.staging.vars.POSTWAR_READ_CONFIGURATION_JSON =
      JSON.stringify(metadata);
    expect(inspectReadDeclarations(configured).blockers).toContain(
      'PINNED_SERVER_CONFIGURATION_INVALID',
    );
  });
  it('workflow has only read permission, fixed toolchain and no publishing step', async () => {
    const workflow = await readFile(
      '.github/workflows/postwar-read-release-preparation.yml',
      'utf8',
    );
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('wrangler@4.148.0');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toMatch(/^\s+publish:/mu);
    expect(workflow).not.toContain('id-token: write');
  });
});
