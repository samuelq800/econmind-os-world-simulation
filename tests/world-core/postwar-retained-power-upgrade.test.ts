import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import {
  prepareRetainedPostwarPowerUpgrade,
  upgradeRetainedPostwarPowerClone,
  validateKnownRetainedLabourReceipt,
  assertKnownRetainedLabourCatalog,
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

// Plain metadata fixtures exercise validation only, never represent executed DDL
// or an actual catalog. Native independently queries both functions before DDL.
function labourReceipt() {
  const expectedFunctions = [
    {
      signature: 'world_v2.prepare_postwar_industry_labour_scopes(text)',
      operation: 'REPLACE',
      oldBodySha256:
        '3659e7890d46b581d1c3e0cefb8109418872c3023da8ecd4673d6d61d9d82de3',
      newBodySha256:
        'a41bd7decbcb53b4c4c1ff7f458a80f5a8b9a398adef39704384920d1d768d3e',
      owner: 'world_v2_postwar_projection_owner',
      executeRoles: ['world_v2_postwar_projection_publisher'],
      securityDefiner: true,
      searchPath: 'pg_catalog',
    },
    {
      signature:
        'world_v2.repair_postwar_industry_regional_source_capacity(text,text)',
      operation: 'CREATE',
      oldBodySha256: null,
      newBodySha256:
        'd36417b6ab909625d95be7f6e8b0747390c8027351ee67049d22331331e2562b',
      owner: 'world_v2_postwar_projection_owner',
      executeRoles: ['world_v2_postwar_projection_publisher'],
      securityDefiner: true,
      searchPath: 'pg_catalog',
    },
  ];
  return {
    schemaVersion: 'postwar-industry-labour-function-forward-ddl-receipt-v1',
    status: 'DDL_COMMITTED',
    executionClassification: 'LOCAL_OWNED_CHECKPOINT_FUNCTION_ONLY_FORWARD',
    candidateCommit: 'd3e1caecb87bc8fd9fa3cd85b09fc7f0de52b6ad',
    predecessorSourceSha256:
      '3b5f065737ed2bd88f30831f60acb951859bd91a91df380aa8183f6d5a864a0e',
    nextSourceSha256:
      '15791060eb27bd953a6909816a001eb7ba1750dbab936c255857455fd425fa60',
    artifactSha256:
      '84db02e76299341686e407da3dca71ea220f2bdbf5c6d48cfb36d25bd03f0645',
    baselineAnd76ProposalReceiptsUnchanged: true,
    freshWholeProposalInstalled: false,
    expectedFunctions,
    observedFunctions: expectedFunctions.map((f) => ({
      signature: f.signature,
      owner: f.owner,
      prosecdef: true,
      proconfig: ['search_path=pg_catalog'],
      proacl:
        '{world_v2_postwar_projection_owner=X/world_v2_postwar_projection_owner,world_v2_postwar_projection_publisher=X/world_v2_postwar_projection_owner}',
      body_sha256: f.newBodySha256,
    })),
  };
}

it('recognizes only the reviewed two-function labour forward without executing or replaying it', () => {
  expect(
    validateKnownRetainedLabourReceipt(labourReceipt()).functions,
  ).toHaveLength(2);
  for (const patch of [
    { nextSourceSha256: '0'.repeat(64) },
    { artifactSha256: '0'.repeat(64) },
    { candidateCommit: '0'.repeat(40) },
    { schemaVersion: 'arbitrary-forward-v1' },
  ]) {
    expect(() =>
      validateKnownRetainedLabourReceipt({ ...labourReceipt(), ...patch }),
    ).toThrow();
  }
});

it('rejects broadened receipt ACLs instead of accepting a DDL_COMMITTED status alone', () => {
  const receipt = labourReceipt();
  receipt.observedFunctions[0]!.proacl =
    '{=X/world_v2_postwar_projection_owner}';
  expect(() => validateKnownRetainedLabourReceipt(receipt)).toThrow();
});

it('requires fresh matching function body, owner, private EXEC and search path independently of the inherited receipt', () => {
  const functions = labourReceipt().observedFunctions.map((f, i) => ({
    signature: f.signature,
    oid: i + 1,
    owner: f.owner,
    body_sha256: f.body_sha256,
    acl: f.proacl,
    readers: ['world_v2_postwar_projection_publisher'],
    security_definer: f.prosecdef,
    config: f.proconfig,
  }));
  expect(() => assertKnownRetainedLabourCatalog(functions)).not.toThrow();
  for (const patch of [
    { body_sha256: '0'.repeat(64) },
    { owner: 'different_owner' },
    { readers: ['PUBLIC'] },
    { security_definer: false },
    { config: ['search_path=public'] },
  ]) {
    expect(() =>
      assertKnownRetainedLabourCatalog([
        { ...functions[0]!, ...patch },
        functions[1]!,
      ]),
    ).toThrow();
  }
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
