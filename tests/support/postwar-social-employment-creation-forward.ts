/** Read-only fixed review-artifact loaders. No DB, caller SQL/path, source
 * publication, credential, World, Clock, running-host upgrade or approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function preparePostwarSocialEmploymentCreationForward(
  repositoryRoot: string,
) {
  return prepareFixed(repositoryRoot, {
    manifestPath:
      'database/upgrades/postwar-social-employment-creation.manifest.json',
    manifestSha256:
      'fec489c6828cc7b91e99584e468e83b97ac63a4eea89cc64504a84964238a4da',
    forwardPath: 'database/upgrades/postwar-social-employment-creation.sql',
    sha256: '3d32a51261c891576121a1dc405977fee3a529d99149acafb6477e5c1a7b4db0',
    predecessorWorldCommit: 'dc5dc7daf562c5c18b3a1f7a22fc5ac29cdcf7d4',
    targetSourceCommit: '67cfcdc65f866d8e32ccddab38943d6ac064967a',
    functionCount: 13,
    schemaVersion: 'postwar-social-employment-creation-forward-v2',
  });
}
export async function preparePostwarSocialEmploymentCreationOrdinalForward(
  repositoryRoot: string,
) {
  return prepareFixed(repositoryRoot, {
    manifestPath:
      'database/upgrades/postwar-social-employment-creation-ordinal.manifest.json',
    manifestSha256:
      '8e38cf586741eae985def7f92ae64186e28ab4e335a5a53e4aad53448b0abb22',
    forwardPath:
      'database/upgrades/postwar-social-employment-creation-ordinal-upgrade.sql',
    sha256: 'e51c8b48c4e9b1ffa01808e18bd26a1a6eab444e5e3a19b2b5258bca4dfd6b95',
    predecessorWorldCommit: '16f1bedd09df119fda4aba846227f86a69bfd3f3',
    targetSourceCommit: '67cfcdc65f866d8e32ccddab38943d6ac064967a',
    functionCount: 1,
    schemaVersion: 'postwar-social-employment-creation-ordinal-forward-v1',
  });
}
async function prepareFixed(
  repositoryRoot: string,
  expected: {
    manifestPath: string;
    manifestSha256: string;
    forwardPath: string;
    sha256: string;
    predecessorWorldCommit: string;
    targetSourceCommit: string;
    functionCount: number;
    schemaVersion: string;
  },
) {
  assert(path.isAbsolute(repositoryRoot));
  const { manifestPath, manifestSha256, forwardPath, sha256 } = expected;
  const [raw, sql] = await Promise.all([
    readFile(path.join(repositoryRoot, manifestPath), 'utf8'),
    readFile(path.join(repositoryRoot, forwardPath), 'utf8'),
  ]);
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
    expected.predecessorWorldCommit,
  );
  assert.equal(manifest.targetSourceCommit, expected.targetSourceCommit);
  assert.equal(manifest.installationAllowed, false);
  assert.equal(manifest.productionApproval, 'NOT_GRANTED');
  assert.equal(manifest.upgrade.path, forwardPath);
  assert.equal(manifest.upgrade.sha256, sha256);
  assert.equal(manifest.upgrade.bytes, Buffer.byteLength(sql));
  assert.equal(manifest.functions.length, expected.functionCount);
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
    schemaVersion: expected.schemaVersion,
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
