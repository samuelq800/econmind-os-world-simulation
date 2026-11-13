/** TEST_ONLY successor of the actually upgraded H3 checkpoint. The original
 * 76 receipts, inventory/labour forwards and committed 5+2 remain observations;
 * the fixed domestic-model forward is already applied and is never replayed. */
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
import {
  RETAINED_OPENING_BASE_CHECKPOINT,
  RETAINED_OPENING_BASE_CHECKPOINT_SHA256,
  readRetainedOpeningBaseEvidence,
} from './postwar-retained-opening-base-evidence.js';

/** pg returns this one timestamptz column as Date; the saved JSON evidence
 * uses its ISO wire value. Preserve every other metadata/pin/hash verbatim. */
export function retainedOpeningDocumentWire(row: Record<string, unknown>) {
  assert(
    row.generated_at instanceof Date &&
      Number.isFinite(row.generated_at.getTime()),
  );
  return { ...row, generated_at: row.generated_at.toISOString() };
}
export {
  RETAINED_OPENING_BASE_CHECKPOINT,
  RETAINED_OPENING_BASE_CHECKPOINT_SHA256,
} from './postwar-retained-opening-base-evidence.js';

const directory = '/workspace/.cloud-setup/evidence/power-current-native-05';
export const RETAINED_UPGRADED_POWER_CHECKPOINT =
  directory + '/pg/retained-checkpoint.json';
export const RETAINED_UPGRADED_POWER_CHECKPOINT_SHA256 =
  'f7ada9091ce0e8bbfa9e00b63a25fb071bcbbc8e1d7850af28c011028bcb1eb0';
const hashes = {
  'power-reuse/reuse-receipt.json':
    '7380ee561ea79dbf986029b4061c871a463ea84c5aced827dad25d653271cf16',
  'independent-checkpoint-readback.json':
    '5415c7abb9a20bcdae7834bee0cbd67638af26520d801c8795ac494128fcfaf5',
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
  checkpointProfile?: 'C10_OPENING_BASES_H3';
}) {
  assert.equal(process.env.ECONMIND_RETAINED_POWER_UPGRADE_NATIVE, '1');
  assert(
    input.checkpointProfile === undefined ||
      input.checkpointProfile === 'C10_OPENING_BASES_H3',
    'EXACT_RETAINED_CATALOG_PROFILE_REQUIRED',
  );
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
  const repaired = input.checkpointProfile
    ? await readRetainedOpeningBaseEvidence(input.repositoryRoot)
    : undefined;
  const checkpointPath = repaired
    ? RETAINED_OPENING_BASE_CHECKPOINT
    : RETAINED_UPGRADED_POWER_CHECKPOINT;
  const checkpointSha256 = repaired
    ? RETAINED_OPENING_BASE_CHECKPOINT_SHA256
    : RETAINED_UPGRADED_POWER_CHECKPOINT_SHA256;
  const raw = await readFile(checkpointPath, 'utf8');
  assert.equal(sha(raw), checkpointSha256);
  const checkpoint = JSON.parse(raw) as {
    resourceState: string;
    templateDatabase: string;
    ownershipNonce: string;
    ownedContainer: string;
    powerUpgradeReceipt: string;
    powerReuseReceipt: string;
    isTemplate: boolean;
    allowConnections: boolean;
    head: unknown;
  };
  const receipt = await pinned('power-reuse/reuse-receipt.json');
  const readback = await pinned('independent-checkpoint-readback.json');
  assert.equal(
    receipt.status,
    'REUSED_POST_FORWARD_H3_READBACK_VERIFIED_NOT_SOURCE_READY',
  );
  assert.equal(
    receipt.expectedCommit,
    'cfb9ed174058185a3339e1caef1205e831ffb82b',
  );
  if (!repaired) {
    assert.equal(receipt.database, checkpoint.templateDatabase);
    assert.equal(
      checkpoint.powerReuseReceipt,
      path.join(directory, 'power-reuse/reuse-receipt.json'),
    );
  }
  assert.equal(checkpoint.resourceState, 'RETAINED_STOPPED');
  assert(checkpoint.isTemplate && !checkpoint.allowConnections);
  assert.equal(readback.status, 'READBACK_PASSED');
  assert.equal(readback.childGone, true);
  assert.equal(readback.gracefulNodeDrainAcknowledged, true);
  assert.equal(readback.cleanup.inspectionCloneDropped, true);
  assert.equal(readback.cleanup.retainedCheckpointUntouched, true);
  assert.equal(
    readback.cleanup.actualState,
    checkpoint.ownershipNonce + ' exited 0 false',
  );
  assert.deepEqual(readback.sourceCatalog, [
    {
      datname: repaired ? receipt.database : checkpoint.templateDatabase,
      datistemplate: true,
      datallowconn: false,
      active_connections: '0',
    },
  ]);
  const sourceRows = (label: string): unknown[] => {
    const matches = readback.queries.filter(
      (q: { label: string }) => q.label === label,
    );
    assert.equal(matches.length, 1, 'EXACT_INDEPENDENT_SOURCE_READ_REQUIRED');
    assert(Array.isArray(matches[0].rows));
    return matches[0].rows;
  };
  assert.equal(readback.economicHashesUnchanged, true);
  assert.deepEqual(checkpoint.head, {
    world_version: '3',
    event_sequence: '3',
  });
  assert.equal(receipt.fiveUpgradesAndTwoFreshReplayed, false);
  assert.equal(
    receipt.singleFunctionForwardStatus,
    'ALREADY_APPLIED_CATALOG_VERIFIED_NOT_REPLAYED',
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
    classification: repaired
      ? 'RETAINED_OPENING_BASES_H3_EXACT_CATALOG_DATA_READBACK_NO_DDL_OR_SOURCE_PROOF'
      : 'RETAINED_POST_FORWARD_H3_CATALOG_DATA_READBACK_NO_DDL_OR_WORLD_INITIALIZATION',
    expectedCommit: input.expectedCommit,
    database: clone.database,
    parentCheckpoint: checkpointPath,
    parentCheckpointSha256: checkpointSha256,
    ...(repaired ? { schemaAncestry: repaired.ancestry } : {}),
    originalSourceDataReadback: path.join(
      directory,
      'independent-checkpoint-readback.json',
    ),
    inheritedUpgradeReceipt: checkpoint.powerUpgradeReceipt,
    inheritedSingleForwardReceipt: checkpoint.powerReuseReceipt,
    inheritedSingleForwardReceiptSha256:
      repaired?.ancestry.sourceBaseReceiptSha256 ??
      hashes['power-reuse/reuse-receipt.json'],
    inheritedReceiptScope: 'HISTORICAL_ANCESTRY_ONLY_NOT_CURRENT_SCHEMA_PROOF',
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
      expected: repaired?.catalog ?? receipt.after.catalog,
    });
    const economicBefore = await readRegisteredCurrentEconomicSnapshotFrom(
      client,
      marker.worldId,
    );
    report.before = { catalog: before, economic: economicBefore.economic };
    await save();
    assert.deepEqual(
      economicBefore.economic,
      readback.economicAfter,
      'RETAINED_H3_ECONOMIC_HASH_DRIFT',
    );
    if (repaired) {
      const documents = (
        await client.query(
          'select * from world_v2.postwar_office_projection_document where world_id=$1 and country_id=\'COUNTRY_10\' order by document_ref collate "C"',
          [marker.worldId],
        )
      ).rows;
      assert.deepEqual(
        documents.map(retainedOpeningDocumentWire),
        repaired.documents,
        'RETAINED_C10_OPENING_DOCUMENT_DRIFT',
      );
      const provenance = (
        await client.query(
          "select * from world_v2.postwar_inventory_provenance_v2 where world_id=$1 and country_id='COUNTRY_10' order by office_id",
          [marker.worldId],
        )
      ).rows;
      assert.deepEqual(
        provenance,
        [...repaired.provenance].sort((a, b) =>
          String(a.office_id) < String(b.office_id) ? -1 : 1,
        ),
        'RETAINED_C10_PROVENANCE_DRIFT',
      );
      const pages = (
        await client.query(
          `select d.document_ref,count(distinct p.page_index)::text page_count,count(x.value)::text total_rows,
          bool_and(p.page_sha256=encode(sha256(convert_to(p.rows_text,'UTF8')),'hex')and p.row_count=jsonb_array_length(p.rows_text::jsonb))pages_valid,
          encode(sha256(convert_to(coalesce(jsonb_agg(x.value order by p.row_offset,x.ordinality)filter(where x.value is not null),'[]'::jsonb)::text,'UTF8')),'hex')document_sha256
          from world_v2.postwar_office_projection_document d left join world_v2.postwar_office_projection_page p using(document_ref)
          left join lateral jsonb_array_elements(p.rows_text::jsonb)with ordinality x on true
          where d.world_id=$1 and d.country_id='COUNTRY_10' group by d.document_ref order by d.document_ref collate "C"`,
          [marker.worldId],
        )
      ).rows;
      assert.equal(pages.length, repaired.documents.length);
      for (const page of pages) {
        const d: Record<string, unknown> = repaired.documents.find(
          (v) => v.document_ref === page.document_ref,
        )!;
        assert.equal(page.pages_valid, true);
        assert.equal(page.page_count, String(d.page_count));
        assert.equal(page.total_rows, String(d.total_rows));
        assert.equal(page.document_sha256, d.document_sha256);
      }
      report.openingReadBaseVerification = {
        documents: documents.length,
        provenance: provenance.length,
        allPageAndDocumentHashesVerified: true,
      };
    }
    const firstDaySources = (
      await client.query(
        "select country_id,facility_id,source_ref,source_sha256,seed_fingerprint,admission_ref,(source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex'))raw_hash_valid from world_v2.postwar_industry_first_day_source where world_id=$1 order by country_id,facility_id",
        [marker.worldId],
      )
    ).rows;
    const utilitySources = (
      await client.query(
        "select country_id,facility_id,source_ref,source_sha256,(source_sha256=encode(sha256(convert_to(source_text,'UTF8')),'hex'))raw_hash_valid from world_v2.postwar_industry_utility_source where world_id=$1 order by country_id,facility_id",
        [marker.worldId],
      )
    ).rows;
    assert(
      firstDaySources.every((row) => row.raw_hash_valid === true),
      'RETAINED_FIRSTDAY_RAW_HASH_INVALID',
    );
    assert.deepEqual(
      firstDaySources.map((row) => {
        const original = { ...row };
        delete original.raw_hash_valid;
        return original;
      }),
      sourceRows('FIRST_DAY_SOURCE_COMMITTED_SCOPE'),
      'RETAINED_FIRSTDAY_ORIGINAL_SCOPE_DRIFT',
    );
    assert(
      utilitySources.every((row) => row.raw_hash_valid === true),
      'RETAINED_UTILITY_RAW_HASH_INVALID',
    );
    assert.deepEqual(
      utilitySources.map((row) => {
        const original = { ...row };
        delete original.raw_hash_valid;
        return original;
      }),
      sourceRows('UTILITY_SOURCE_COMMITTED_SCOPE'),
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
    const alreadyForwarded = before.functions.filter(
      (f) => f.signature === forward.signature,
    );
    assert.equal(alreadyForwarded.length, 1);
    assert.equal(alreadyForwarded[0]!.body_sha256, forward.newBodySha256);
    report.singleFunctionForwardStatus =
      'ALREADY_APPLIED_CATALOG_VERIFIED_NOT_REPLAYED';
    const revocations: Record<string, unknown> = {};
    for (const [table, query] of [
      [
        'runtime_admission_publication_revocation',
        'select count(*)::text count from world_v2.runtime_admission_publication_revocation r join world_v2.runtime_admission_publication_permit p using(authorization_id) where p.world_id=$1',
      ],
      [
        'social_operating_source_revocation',
        'select count(*)::text count from world_v2.social_operating_source_revocation r join world_v2.social_operating_source_registration s using(registration_ref) where s.world_id=$1',
      ],
      [
        'postwar_industry_original_revocation',
        'select count(*)::text count from world_v2.postwar_industry_original_revocation where world_id=$1',
      ],
      [
        'postwar_industry_first_day_source_revocation',
        'select count(*)::text count from world_v2.postwar_industry_first_day_source_revocation where world_id=$1',
      ],
    ] as const) {
      const rows = (await client.query(query, [marker.worldId])).rows;
      assert.equal(
        rows[0]?.count,
        '0',
        'RETAINED_WORLD_SOURCE_OR_ADMISSION_REVOKED:' + table,
      );
      revocations[table] = rows;
    }
    report.revocations = revocations;
    const after = await observe(client);
    assertRetainedPowerSuccessorCatalog({ actual: after, expected: before });
    const economicAfter = await readRegisteredCurrentEconomicSnapshotFrom(
      client,
      marker.worldId,
    );
    assert.deepEqual(economicAfter.economic, economicBefore.economic);
    report.after = { catalog: after, economic: economicAfter.economic };
    report.status = repaired
      ? 'REUSED_OPENING_BASES_H3_READBACK_VERIFIED_NOT_SOURCE_READY'
      : 'REUSED_POST_FORWARD_H3_READBACK_VERIFIED_NOT_SOURCE_READY';
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
