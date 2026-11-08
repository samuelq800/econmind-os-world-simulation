import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import {
  prepareRetainedPostwarPowerUpgrade,
  upgradeRetainedPostwarPowerClone,
} from '../support/postwar-retained-power-upgrade.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();

it('prepares only the immutable five-upgrade/two-POWER package and thirteen inherited repair proofs without DB IO', async () => {
  const plan = await prepareRetainedPostwarPowerUpgrade({
    repositoryRoot,
    expectedCommit,
  });
  expect(plan.artifacts).toHaveLength(7);
  expect(
    plan.artifacts
      .slice(0, 5)
      .every((a) => a.path.startsWith('database/upgrades/')),
  ).toBe(true);
  expect(plan.artifacts.slice(5).map((a) => a.path)).toEqual([
    'database/proposals/postwar-industry-power-service-source.sql',
    'database/proposals/postwar-industry-power-service-current.sql',
  ]);
  expect(plan.repairFunctions).toHaveLength(13);
  expect(plan.repairFunctions.at(-1)).toEqual({
    signature:
      'world_v2.postwar_projection_current_inventory_balance(text,jsonb,bigint)',
    bodySha256:
      '03215136ec048d9eb60efa91c14c3a92e4bdab4e86b75405d2b6a29b0020f38b',
  });
});

it('rejects a modified SQL artifact even when the caller supplies its own checkout with the same git HEAD', async () => {
  const original = await prepareRetainedPostwarPowerUpgrade({
    repositoryRoot,
    expectedCommit,
  });
  const directory = await mkdtemp(
    path.join(repositoryRoot, '.retained-upgrade-test-'),
  );
  try {
    const manifest =
      'database/upgrades/postwar-0cf65bc0-to-4b6d400c.manifest.json';
    for (const p of [manifest, ...original.artifacts.map((a) => a.path)]) {
      await mkdir(path.dirname(path.join(directory, p)), { recursive: true });
      await copyFile(path.join(repositoryRoot, p), path.join(directory, p));
    }
    await appendFile(
      path.join(directory, original.artifacts[0]!.path),
      '\n-- unreviewed caller bytes\n',
    );
    await expect(
      prepareRetainedPostwarPowerUpgrade({
        repositoryRoot: directory,
        expectedCommit,
      }),
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('rejects the wrong candidate before collecting an upgrade plan', async () => {
  await expect(
    prepareRetainedPostwarPowerUpgrade({
      repositoryRoot,
      expectedCommit: '0'.repeat(40),
    }),
  ).rejects.toThrow();
});

it('requires the exact explicit retained-clone opt-in before filesystem or DB actions', async () => {
  const previous = process.env.ECONMIND_RETAINED_POWER_UPGRADE_NATIVE;
  delete process.env.ECONMIND_RETAINED_POWER_UPGRADE_NATIVE;
  try {
    await expect(
      upgradeRetainedPostwarPowerClone({
        repositoryRoot,
        expectedCommit,
        parentCheckpointPath: '/not-used',
        parentCheckpointSha256: '0'.repeat(64),
        evidenceDirectory: '/not-created',
      }),
    ).rejects.toThrow('EXPLICIT_RETAINED_UPGRADE_OPT_IN_REQUIRED');
  } finally {
    if (previous === undefined)
      delete process.env.ECONMIND_RETAINED_POWER_UPGRADE_NATIVE;
    else process.env.ECONMIND_RETAINED_POWER_UPGRADE_NATIVE = previous;
  }
});
