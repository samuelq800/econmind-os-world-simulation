/** Fixed DATA/catalog evidence, never a restored source proof or authority. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { readRetainedPostwarPowerCatalogFrom } from './postwar-retained-power-upgrade.js';
const directory = '/workspace/.cloud-setup/evidence/c10-opening-base-repair-03';
export const RETAINED_OPENING_BASE_CHECKPOINT =
  directory + '/retained-checkpoint.json';
export const RETAINED_OPENING_BASE_CHECKPOINT_SHA256 =
  '0815580a31e72bce3e285f09c41a69b0d31cbc81c39c20c8800d143071760ffa';
const pins = {
  'catalog-after.json':
    'c11bc694e8c7166ec7fb7e1833c41c5a888432d13a987ff35a7a0952424db24a',
  'additional-ddl-receipt.json':
    'f4c94dc297347e572b364bbfb511423bd96ab6ac9e57bd8c06072cd5e7804e03',
  'checkpoint-resource-readback.json':
    '2608f1c4a61838d8541507ee5be8abdbb018729d5baea2d8239fefb27389729d',
  'report.json':
    'f403645b2607fc32f390f0a18a04677d0c42257e88d631c270dfa9c72f2fb42e',
} as const;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function readRetainedOpeningBaseEvidence(repositoryRoot: string) {
  const cpRaw = await readFile(RETAINED_OPENING_BASE_CHECKPOINT, 'utf8');
  assert.equal(sha(cpRaw), RETAINED_OPENING_BASE_CHECKPOINT_SHA256);
  const checkpoint = JSON.parse(cpRaw) as Record<string, unknown>;
  const read = async (name: keyof typeof pins) => {
    const raw = await readFile(path.join(directory, name), 'utf8');
    assert.equal(sha(raw), pins[name]);
    return JSON.parse(raw) as Record<string, unknown>;
  };
  const receipt = await read('additional-ddl-receipt.json'),
    resource = await read('checkpoint-resource-readback.json'),
    report = await read('report.json');
  assert.equal(
    checkpoint.templateDatabase,
    'postwar_clone_opening_bases_2673d31a7e',
  );
  assert.equal(receipt.database, checkpoint.templateDatabase);
  assert.equal(report.retainedTemplate, checkpoint.templateDatabase);
  assert.equal(receipt.status, 'DDL_COMMITTED_ACKNOWLEDGED');
  assert.equal(
    report.status,
    'SOURCE_BASE_REPAIR_PASSED_CURRENT_H3_CORE_PUBLICATION_NOT_RUN',
  );
  assert.equal(checkpoint.resourceState, 'RETAINED_STOPPED');
  assert.deepEqual(checkpoint.head, {
    world_version: '3',
    event_sequence: '3',
  });
  assert.equal(checkpoint.isTemplate, true);
  assert.equal(checkpoint.allowConnections, false);
  assert.equal(report.actualCanonicalSourceUnchanged, true);
  assert.equal(report.economicSevenUnchanged, true);
  assert.equal(report.oldDocumentsUnchanged, true);
  assert.deepEqual(resource.sourceTemplateReadback, {
    database: checkpoint.templateDatabase,
    isTemplate: true,
    allowConnections: false,
    sessions: 0,
  });
  assert.equal(
    resource.actualStopped,
    checkpoint.ownershipNonce + ' exited 0 false',
  );
  assert.equal(resource.volumeNonce, checkpoint.ownershipNonce);
  const extraParentPath =
    '/workspace/.cloud-setup/evidence/c10-retained-preflight-02/schema-ancestry-sidecar.json';
  const rawParent = await readFile(extraParentPath, 'utf8');
  assert.equal(
    sha(rawParent),
    '196737055610e5458c5a343c6197d6715ff90ce54f88bc7709ae17f9c4824dfe',
  );
  const parent = JSON.parse(rawParent) as {
    baseReuseReceipt: { path: string; sha256: string };
    additionalDdlReceipt: { path: string; sha256: string };
    actualAfterCatalog: { path: string; sha256: string };
  };
  for (const item of [
    parent.baseReuseReceipt,
    parent.additionalDdlReceipt,
    parent.actualAfterCatalog,
  ])
    assert.equal(sha(await readFile(item.path, 'utf8')), item.sha256);
  assert.equal(checkpoint.powerReuseReceipt, parent.baseReuseReceipt.path);
  assert.equal(
    sha(
      await readFile(
        path.join(
          repositoryRoot,
          'database/proposals/postwar-office-opening-read-base-repair.sql',
        ),
        'utf8',
      ),
    ),
    '09dc298f358a2162fbd55db2e7bb4328f4a82ecd3cf9bfe81f8aa1bbbc83918b',
  );
  const catalogRaw = await readFile(
    path.join(directory, 'catalog-after.json'),
    'utf8',
  );
  assert.equal(sha(catalogRaw), pins['catalog-after.json']);
  const documents = [
    ...(report.documents as Record<string, unknown>[]),
    ...(report.complete as Record<string, unknown>[]),
    ...(report.regional as Record<string, unknown>[]),
  ].sort((a, b) => (String(a.document_ref) < String(b.document_ref) ? -1 : 1));
  assert.equal(documents.length, 16);
  assert(documents.every((d) => d.country_id === 'COUNTRY_10'));
  return {
    checkpoint,
    catalog: JSON.parse(catalogRaw) as Awaited<
      ReturnType<typeof readRetainedPostwarPowerCatalogFrom>
    >,
    documents,
    provenance: report.provenance as Record<string, unknown>[],
    ancestry: {
      sourceBaseReceipt: parent.baseReuseReceipt.path,
      sourceBaseReceiptSha256: parent.baseReuseReceipt.sha256,
      openingRepairReceipt: path.join(directory, 'additional-ddl-receipt.json'),
      openingRepairReceiptSha256: pins['additional-ddl-receipt.json'],
      logisticsSchemaSidecar: extraParentPath,
      logisticsSchemaSidecarSha256: sha(rawParent),
      actualExpectedCatalog: path.join(directory, 'catalog-after.json'),
      actualExpectedCatalogSha256: pins['catalog-after.json'],
    },
  };
}
