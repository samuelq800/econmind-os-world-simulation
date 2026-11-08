/** TEST_ONLY successor of the actually upgraded H3 checkpoint. The original
 * 76 receipts, inventory/labour forwards and committed 5+2 remain observations;
 * only the fixed domestic-model function forward can execute here. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PoolClient } from 'pg';
import {
  loadPostwarNativeReferenceMarker,
  clonePostwarNativeReference,
} from './postwar-native-reference-db.js';
import { readRetainedPostwarPowerCatalogFrom } from './postwar-retained-power-upgrade.js';
import { readRegisteredCurrentEconomicSnapshotFrom } from './registered-current-read-repair-checkpoint.js';
import { preparePostwarIndustryFirstDayDomesticModelForward } from './postwar-industry-first-day-domestic-model-forward.js';

const directory = '/workspace/.cloud-setup/evidence/power-current-native-01';
export const RETAINED_UPGRADED_POWER_CHECKPOINT =
  directory + '/pg/retained-checkpoint.json';
export const RETAINED_UPGRADED_POWER_CHECKPOINT_SHA256 =
  'cb8ebc85386700cd36c010a714294a087b7a1b2eef94a7b070e436bd89dd431b';
const hashes = {
  'power-upgrade/upgrade-receipt.json':
    'ceb664c85262c1a0b24ee1b4fc80daaf36f29887e31ebd43acfe91f1707288ca',
  'independent-checkpoint-readback.json':
    '0cc7a770e30427a27eb9e8a74182b7c3ae6edfdeb5a5a099b2d9a8f4b640425e',
} as const;
const sha = (raw: string) => createHash('sha256').update(raw).digest('hex');
type Catalog = Awaited<ReturnType<typeof readRetainedPostwarPowerCatalogFrom>>;
/** Catalog equality is evidence validation, never source/command authority. */
export function assertRetainedPowerSuccessorCatalog(input: {
  actual: Catalog;
  expected: Catalog;
  forwardedFunction?: Readonly<{
    signature: string;
    oldBodySha256: string;
    newBodySha256: string;
  }>;
}) {
  const expected = input.forwardedFunction
    ? {
        ...input.expected,
        functions: input.expected.functions.map((f) => {
          if (f.signature !== input.forwardedFunction!.signature) return f;
          assert.equal(f.body_sha256, input.forwardedFunction!.oldBodySha256);
          return { ...f, body_sha256: input.forwardedFunction!.newBodySha256 };
        }),
      }
    : input.expected;
  if (input.forwardedFunction)
    assert.equal(
      expected.functions.filter(
        (f) => f.signature === input.forwardedFunction!.signature,
      ).length,
      1,
    );
  assert.deepEqual(input.actual, expected, 'RETAINED_UPGRADED_CATALOG_DRIFT');
}
async function pinned(relative: keyof typeof hashes) {
  const raw = await readFile(path.join(directory, relative), 'utf8');
  assert.equal(
    sha(raw),
    hashes[relative],
    'ACTUAL_RETAINED_RECEIPT_BYTES_REQUIRED',
  );
  return JSON.parse(raw);
}
async function observe(client: PoolClient) {
  await client.query('begin isolation level repeatable read read only');
  try {
    const result = await readRetainedPostwarPowerCatalogFrom(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
export async function reuseRetainedPostwarPowerClone(input: {
  repositoryRoot: string;
  expectedCommit: string;
  evidenceDirectory: string;
  marker: Awaited<ReturnType<typeof loadPostwarNativeReferenceMarker>>;
  clone: Awaited<ReturnType<typeof clonePostwarNativeReference>>;
}) {
  assert.equal(process.env.ECONMIND_RETAINED_POWER_UPGRADE_NATIVE, '1');
  assert.match(input.expectedCommit, /^[a-f0-9]{40}$/u);
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: input.repositoryRoot,
      encoding: 'utf8',
    }).trim(),
    input.expectedCommit,
  );
  assert(
    input.evidenceDirectory.startsWith('/workspace/.cloud-setup/evidence/'),
  );
  const raw = await readFile(RETAINED_UPGRADED_POWER_CHECKPOINT, 'utf8');
  assert.equal(sha(raw), RETAINED_UPGRADED_POWER_CHECKPOINT_SHA256);
  const checkpoint = JSON.parse(raw) as {
    resourceState: string;
    templateDatabase: string;
    ownershipNonce: string;
    ownedContainer: string;
    powerUpgradeReceipt: string;
    isTemplate: boolean;
    allowConnections: boolean;
    head: unknown;
  };
  const receipt = await pinned('power-upgrade/upgrade-receipt.json');
  const readback = await pinned('independent-checkpoint-readback.json');
  assert.equal(
    receipt.status,
    'UPGRADED_CATALOG_AND_ROWS_VERIFIED_NOT_SOURCE_READY',
  );
  assert.equal(
    receipt.expectedCommit,
    '549642518b9ef2f90ccbe5e63d2b74732aec6a00',
  );
  assert.equal(receipt.database, checkpoint.templateDatabase);
  assert.equal(
    checkpoint.powerUpgradeReceipt,
    path.join(directory, 'power-upgrade/upgrade-receipt.json'),
  );
  assert.equal(checkpoint.resourceState, 'RETAINED_STOPPED');
  assert(checkpoint.isTemplate && !checkpoint.allowConnections);
  assert.equal(readback.status, 'READBACK_PASSED');
  assert.equal(readback.economicHashesUnchanged, true);
  assert.deepEqual(checkpoint.head, {
    world_version: '3',
    event_sequence: '3',
  });
  assert.deepEqual(
    receipt.phases.map((p: { status: string }) => p.status),
    Array(7).fill('DDL_COMMITTED'),
  );
  const forward = await preparePostwarIndustryFirstDayDomesticModelForward(
    input.repositoryRoot,
  );
  const { marker, clone } = input;
  assert.notEqual(clone.database, marker.database);
  assert.notEqual(clone.database, checkpoint.templateDatabase);
  assert.match(clone.database, /^postwar_clone_power_reuse_[a-z0-9]+$/u);
  assert.equal(
    (await clone.installer.query('select current_database() as name')).rows[0]
      ?.name,
    clone.database,
  );
  assert.equal(marker.ownershipNonce, checkpoint.ownershipNonce);
  assert.equal(marker.ownedContainer, checkpoint.ownedContainer);
  await mkdir(input.evidenceDirectory, { recursive: false });
  const report: Record<string, unknown> = {
    classification:
      'RETAINED_UPGRADED_H3_REUSE_AND_ONE_FIXED_FUNCTION_FORWARD_NOT_WORLD_INITIALIZATION',
    expectedCommit: input.expectedCommit,
    database: clone.database,
    parentCheckpoint: RETAINED_UPGRADED_POWER_CHECKPOINT,
    parentCheckpointSha256: RETAINED_UPGRADED_POWER_CHECKPOINT_SHA256,
    inheritedUpgradeReceipt: checkpoint.powerUpgradeReceipt,
    inheritedUpgradeReceiptSha256: hashes['power-upgrade/upgrade-receipt.json'],
    fiveUpgradesAndTwoFreshReplayed: false,
    singleFunctionForward: {
      signature: forward.signature,
      sha256: forward.sha256,
      oldBodySha256: forward.oldBodySha256,
      newBodySha256: forward.newBodySha256,
      sourceSha256: forward.sourceSha256,
    },
    status: 'VALIDATING_ACTUAL_CATALOG',
  };
  const receiptPath = path.join(input.evidenceDirectory, 'reuse-receipt.json');
  const save = () =>
    writeFile(receiptPath, JSON.stringify(report, null, 2) + '\n');
  const client = await clone.installer.connect();
  try {
    const before = await observe(client);
    assertRetainedPowerSuccessorCatalog({
      actual: before,
      expected: receipt.after.catalog,
    });
    const economicBefore = await readRegisteredCurrentEconomicSnapshotFrom(
      client,
      marker.worldId,
    );
    assert.deepEqual(
      economicBefore.economic,
      readback.economicAfter,
      'RETAINED_H3_ECONOMIC_HASH_DRIFT',
    );
    const firstDaySources = (
      await client.query(
        'select country_id,facility_id,source_ref,source_sha256,seed_fingerprint,admission_ref from world_v2.postwar_industry_first_day_source where world_id=$1 order by country_id,facility_id',
        [marker.worldId],
      )
    ).rows;
    const utilitySources = (
      await client.query(
        'select country_id,facility_id,source_ref,source_sha256 from world_v2.postwar_industry_utility_source where world_id=$1 order by country_id,facility_id',
        [marker.worldId],
      )
    ).rows;
    assert.deepEqual(
      firstDaySources,
      readback.queries.find(
        (q: { label: string }) =>
          q.label === 'FIRST_DAY_SOURCE_COMMITTED_SCOPE',
      ).rows,
      'RETAINED_FIRSTDAY_ORIGINAL_SCOPE_DRIFT',
    );
    assert.deepEqual(
      utilitySources,
      readback.queries.find(
        (q: { label: string }) => q.label === 'UTILITY_SOURCE_COMMITTED_SCOPE',
      ).rows,
      'RETAINED_UTILITY_ORIGINAL_SCOPE_DRIFT',
    );
    const seed = (
      await client.query(
        "select seed_id,seed_fingerprint,encode(sha256(convert_to(canonical_payload,'UTF8')),'hex')canonical_sha256 from world_v2.opening_seed where world_id=$1",
        [marker.worldId],
      )
    ).rows;
    assert.equal(seed.length, 1);
    assert.equal(seed[0].seed_id, marker.seedId);
    assert.equal(seed[0].seed_fingerprint, marker.seedFingerprint);
    assert.equal(
      seed[0].canonical_sha256,
      'fda043f64940ef8429ac98cc04c5f803fa5e93b84475509e43e8311cf06493f4',
    );
    report.before = {
      catalog: before,
      economic: economicBefore.economic,
      firstDaySources,
      utilitySources,
      seed,
    };

    await save();
    // This exact artifact owns its single transaction. An unknown outcome stops
    // this clone for catalog reconciliation; it never triggers a second write.
    await client.query(forward.sql);
    report.singleFunctionForwardStatus = 'DDL_COMMITTED';
    const after = await observe(client);
    assertRetainedPowerSuccessorCatalog({
      actual: after,
      expected: before,
      forwardedFunction: forward,
    });
    const economicAfter = await readRegisteredCurrentEconomicSnapshotFrom(
      client,
      marker.worldId,
    );
    assert.deepEqual(economicAfter.economic, economicBefore.economic);
    report.after = { catalog: after, economic: economicAfter.economic };
    report.status = 'REUSED_H3_AND_SINGLE_FORWARD_VERIFIED_NOT_SOURCE_READY';
    await save();
    return {
      marker,
      clone,
      reuseReceipt: receiptPath,
      close: () => clone.close(),
    };
  } catch (error) {
    report.status = 'STOPPED_FORWARD_OR_READBACK_FAILED_NO_AUTOMATIC_RETRY';
    report.error = {
      message: error instanceof Error ? error.message : String(error),
    };
    await save();
    throw error;
  } finally {
    client.release();
  }
}
