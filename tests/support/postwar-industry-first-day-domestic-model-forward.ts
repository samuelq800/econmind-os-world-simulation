/** Fixed TEST_ONLY native review input. Reads two pinned repository artifacts;
 * no DB, caller SQL, source publication, credentials or runtime proof issuance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
export async function preparePostwarIndustryFirstDayDomesticModelForward(
  repositoryRoot: string,
) {
  assert(path.isAbsolute(repositoryRoot));
  const sourcePath = 'database/proposals/postwar-industry-first-day-source.sql';
  const forwardPath =
    'database/upgrades/postwar-industry-first-day-domestic-model-upgrade.sql';
  const [source, sql] = await Promise.all([
    readFile(path.join(repositoryRoot, sourcePath), 'utf8'),
    readFile(path.join(repositoryRoot, forwardPath), 'utf8'),
  ]);
  assert(Buffer.byteLength(source) <= 65536 && Buffer.byteLength(sql) <= 65536);
  const sourceSha256 =
    'cb45c39d0f8ff968a0f28ece812a2695e938a4d60f6a7e5d03e5003d67c0efb8';
  const sha256 =
    '35b8685a569000df425c7cb5c8cbac1da1b6f6579ecc4aa41f3151151a336e89';
  const oldBodySha256 =
    '71a52c4a5f14db4ebefcb494bdaf134ad9b82023c3cfe4f01c78a730fafe0cd6';
  const newBodySha256 =
    '9d4e3fdea08fd177070e1e5de8ab52c36fceb285733e24ed7ea4fa7a0f9d6077';
  assert.equal(sha(source), sourceSha256);
  assert.equal(sha(sql), sha256);
  const body = source.match(
    /create function world_v2\.publish_postwar_industry_first_day_source\([\s\S]*?as \$\$([\s\S]*?)\$\$;/u,
  )?.[1];
  assert(body);
  assert.equal(sha(body), newBodySha256);
  assert(sql.includes(body));
  return Object.freeze({
    schemaVersion: 'postwar-industry-first-day-domestic-model-forward-v1',
    classification: 'FUNCTION_ONLY_FORWARD_NOT_SOURCE_ADOPTION_OR_EXECUTION',
    sourcePath,
    sourceSha256,
    forwardPath,
    sha256,
    oldBodySha256,
    newBodySha256,
    signature:
      'world_v2.publish_postwar_industry_first_day_source(text,text,text,text,text,text,text)',
    owner: 'world_v2_industry_source_owner',
    executeRoles: Object.freeze(['world_v2_industry_source_publisher']),
    sql,
  });
}
