/** Read-only fixed review-artifact loader. No DB, caller SQL/path, source
 * publication, credential, World, Clock, running-host upgrade or approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function preparePostwarSocialEmploymentCreationForward(
  repositoryRoot: string,
) {
  assert(path.isAbsolute(repositoryRoot));
  const manifestPath =
    'database/upgrades/postwar-social-employment-creation.manifest.json';
  const forwardPath =
    'database/upgrades/postwar-social-employment-creation.sql';
  const [raw, sql] = await Promise.all([
    readFile(path.join(repositoryRoot, manifestPath), 'utf8'),
    readFile(path.join(repositoryRoot, forwardPath), 'utf8'),
  ]);
  const manifestSha256 =
    'aa0c2ee8b42798deb7776c8e3644023039df18f1c4110852febd4cdcfa4e35b0';
  const sha256 =
    'b998b0fd648470a495f2f2a6fbe0632f916d99c1de44c0cee556fa63e9109a8f';
  assert.equal(sha(raw), manifestSha256);
  assert.equal(sha(sql), sha256);
  assert(Buffer.byteLength(sql) <= 262144 && Buffer.byteLength(raw) <= 32768);
  const manifest = JSON.parse(raw) as {
    predecessorWorldCommit: string;
    targetSourceCommit: string;
    installationAllowed: boolean;
    productionApproval: string;
    upgrade: { path: string; sha256: string; bytes: number };
    sourcePins: readonly { path: string; newSha256: string }[];
    newSupplement: { path: string; sha256: string };
    functions: readonly {
      signature: string;
      oldBodySha256: string;
      newBodySha256: string;
    }[];
  };
  assert.equal(
    manifest.predecessorWorldCommit,
    'dc5dc7daf562c5c18b3a1f7a22fc5ac29cdcf7d4',
  );
  assert.equal(
    manifest.targetSourceCommit,
    '37fe83971e7a4de01e24919cb8b8584fdb148ced',
  );
  assert.equal(manifest.installationAllowed, false);
  assert.equal(manifest.productionApproval, 'NOT_GRANTED');
  assert.equal(manifest.upgrade.path, forwardPath);
  assert.equal(manifest.upgrade.sha256, sha256);
  assert.equal(manifest.upgrade.bytes, Buffer.byteLength(sql));
  assert.equal(manifest.functions.length, 13);
  for (const source of [
    ...manifest.sourcePins.map((p) => ({ path: p.path, sha256: p.newSha256 })),
    manifest.newSupplement,
  ]) {
    assert.equal(
      sha(await readFile(path.join(repositoryRoot, source.path), 'utf8')),
      source.sha256,
    );
  }
  return Object.freeze({
    schemaVersion: 'postwar-social-employment-creation-forward-v1',
    classification: 'FIXED_REVIEW_ARTIFACT_NOT_APPROVAL_OR_SOURCE_AUTHORITY',
    sourceEnvelope: 'SOURCE_BEGIN_COMMIT',
    predecessorWorldCommit: manifest.predecessorWorldCommit,
    targetSourceCommit: manifest.targetSourceCommit,
    manifestPath,
    manifestSha256,
    forwardPath,
    sha256,
    sql,
    functions: Object.freeze(
      manifest.functions.map((f) => Object.freeze({ ...f })),
    ),
    operatorPrecondition:
      'ALL_CONSUMERS_AND_SOURCE_PUBLICATION_TRANSACTIONS_STOPPED_AND_DRAINED',
    uncertainCommit: 'STOP_INSPECT_CATALOG_AND_RECEIPTS_NO_BLIND_RETRY',
    sourceInitializer: Object.freeze({
      signature:
        'world_v2.prepare_postwar_social_employment_creation_licences(text)',
      role: 'world_v2_postwar_projection_publisher',
      separateTransaction: true,
      performed: false,
    }),
  });
}
