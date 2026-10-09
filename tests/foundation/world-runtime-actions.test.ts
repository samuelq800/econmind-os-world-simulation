import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  HOLD_RELEASE,
  verifyPublishEnvironment,
  verifyExistingHold,
  verifySource,
  verifyArtifact,
  publish,
} from '../../scripts/world-runtime-actions.mjs';

const context = {
  GITHUB_REPOSITORY: HOLD_RELEASE.repository,
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  PUBLISH_CONFIRMATION: 'PUBLISH_REVIEWED_HOLD',
  CLOUDFLARE_ACCOUNT_ID: HOLD_RELEASE.account,
  CLOUDFLARE_API_TOKEN: 'TEST_ONLY_NOT_A_CLOUDFLARE_TOKEN',
};
const mode = { name: 'RUNTIME_MODE', type: 'plain_text', text: 'HOLD' };
const service = {
  name: 'WORLD_EXECUTOR',
  type: 'service',
  service: 'econmind-world-executor-staging',
  environment: 'production',
};
describe('fixed reviewed HOLD Actions release boundary (no cloud writes)', () => {
  it('accepts only the manual main context for the registered account', () => {
    expect(() => verifyPublishEnvironment(context)).not.toThrow();
  });
  it.each([
    ['GITHUB_REPOSITORY', 'other/repository'],
    ['GITHUB_EVENT_NAME', 'pull_request'],
    ['GITHUB_EVENT_NAME', 'push'],
    ['GITHUB_REF', 'refs/heads/codex/unreviewed'],
    ['PUBLISH_CONFIRMATION', ''],
    ['CLOUDFLARE_ACCOUNT_ID', 'different-account'],
    ['CLOUDFLARE_API_TOKEN', ''],
  ])(
    'refuses changed context %s before source or provider access',
    (key, value) => {
      expect(() =>
        verifyPublishEnvironment({ ...context, [key]: value }),
      ).toThrow();
    },
  );
  it('stops without a deployment token before even reading a source path', async () => {
    await expect(
      publish('NOT_AN_ABSOLUTE_SOURCE', 'NO_ARTIFACT', 'NO_TOOL', {
        ...context,
        CLOUDFLARE_API_TOKEN: '',
      }),
    ).rejects.toThrow('CLOUDFLARE_DEPLOY_TOKEN_REQUIRED');
  });
  it('refuses the actual caller checkout as the deployment source', () => {
    expect(() => verifySource(process.cwd())).toThrow(
      'REVIEWED_HOLD_SOURCE_REQUIRED',
    );
  });
  it('rejects altered downloaded bytes before provider access', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'world-hold-artifact-'),
    );
    const file = path.join(directory, 'executor.js');
    try {
      await writeFile(file, 'TEST_ONLY_ALTERED_BUNDLE');
      await expect(verifyArtifact(directory)).rejects.toThrow(
        'REVIEWED_HOLD_BUNDLE_REQUIRED',
      );
    } finally {
      await unlink(file);
      await rmdir(directory);
    }
  });
  it.each(['executor', 'api'])(
    'accepts the existing %s HOLD topology',
    (kind) => {
      expect(() =>
        verifyExistingHold(
          kind,
          { bindings: kind === 'api' ? [mode, service] : [mode] },
          { enabled: kind === 'api', previews_enabled: false },
          { schedules: [] },
        ),
      ).not.toThrow();
    },
  );
  it.each([
    [
      'additional database binding',
      { bindings: [mode, service, { name: 'DATABASE', type: 'hyperdrive' }] },
      { enabled: true, previews_enabled: false },
      { schedules: [] },
    ],
    [
      'active mode',
      { bindings: [{ ...mode, text: 'ACTIVE' }, service] },
      { enabled: true, previews_enabled: false },
      { schedules: [] },
    ],
    [
      'missing mode',
      { bindings: [service] },
      { enabled: true, previews_enabled: false },
      { schedules: [] },
    ],
    [
      'unknown service',
      { bindings: [mode, { ...service, service: 'other-worker' }] },
      { enabled: true, previews_enabled: false },
      { schedules: [] },
    ],
    [
      'preview URL',
      { bindings: [mode, service] },
      { enabled: true, previews_enabled: true },
      { schedules: [] },
    ],
    [
      'automatic schedule',
      { bindings: [mode, service] },
      { enabled: true, previews_enabled: false },
      { schedules: [{ cron: '* * * * *' }] },
    ],
  ])(
    'refuses %s instead of overwriting a future runtime',
    (_name, settings, subdomain, schedules) => {
      expect(() =>
        verifyExistingHold('api', settings, subdomain, schedules),
      ).toThrow('EXISTING_HOLD_TOPOLOGY_REQUIRED');
    },
  );
  it('refuses a public executor', () => {
    expect(() =>
      verifyExistingHold(
        'executor',
        { bindings: [mode] },
        { enabled: true, previews_enabled: false },
        { schedules: [] },
      ),
    ).toThrow('EXISTING_HOLD_TOPOLOGY_REQUIRED');
  });
});
