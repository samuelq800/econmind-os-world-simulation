/** One guarded forward on the owned resumed clone. SQL contains its exact
 * predecessor and successor/OID/ACL guards; this does not reinstall sources. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import type { restoreCommittedRegisteredCheckpoint } from './restore-completed-fresh-h0.js';
export async function prepareResumedPendingPrefix(input: {
  prepared: Awaited<ReturnType<typeof restoreCommittedRegisteredCheckpoint>>;
  repositoryRoot: string;
  evidencePath: string;
}) {
  assert.equal(process.env.ECONMIND_RESUMED_REGISTERED_NODE_NATIVE, '1');
  const {
    fixture: { clone, marker },
    setup,
  } = input.prepared;
  assert.match(clone.database, /^postwar_clone_committed_resume_[a-f0-9]+$/u);
  const file = 'database/proposals/postwar-pending-programme-target-prefix.sql';
  const manifest = JSON.parse(
    await readFile(
      path.join(input.repositoryRoot, file.replace('.sql', '.manifest.json')),
      'utf8',
    ),
  );
  const sql = await readFile(path.join(input.repositoryRoot, file), 'utf8');
  const sha = (bytes: string) =>
    createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(sql), manifest.sqlSha256);
  assert.equal(
    manifest.schemaVersion,
    'postwar-pending-programme-target-guarded-v1',
  );
  for (const [file, hash] of Object.entries(manifest.requiredPredecessorFiles))
    assert.equal(
      sha(await readFile(path.join(input.repositoryRoot, file), 'utf8')),
      hash,
    );
  const before = await setup.counts();
  const report: Record<string, unknown> = {
    classification: 'TEST_ONLY_GUARDED_FORWARD_NOT_PRODUCTION',
    database: clone.database,
    sqlSha256: sha(sql),
    before,
    status: 'PRECHECKED_FILE_NOT_EXECUTED',
    denials: [],
  };
  const save = () =>
    writeFile(input.evidencePath, JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    await clone.installer.query(sql);
    report.status =
      'COMMIT_ACKNOWLEDGED_WITH_SQL_PREDECESSOR_AND_SUCCESSOR_GUARDS';
    report.after = await setup.counts();
    assert.deepEqual(report.after, before);
    await save();
    for (const role of [setup.roles.read, setup.roles.intake]) {
      const pool = new Pool({
        host: marker.socket,
        port: marker.port,
        database: clone.database,
        user: role,
        password: async () => '',
        ssl: false,
        max: 1,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 1000,
      });
      try {
        let denied = false;
        try {
          await pool.query(
            'select world_v2.postwar_social_programme_effect_scoped($1,$2,$3::jsonb,$4::jsonb,$5::bigint)',
            [marker.worldId, 'COUNTRY_02', '{}', '{}', '1'],
          );
        } catch (error) {
          assert.equal((error as { code?: string }).code, '42501');
          denied = true;
        }
        assert(denied, 'INTERNAL_PREFIX_MUST_DENY_RUNTIME_ROLE');
        (report.denials as unknown[]).push({
          role,
          sqlState: '42501',
          internalProgrammeEffectDenied: true,
        });
      } finally {
        await pool.end();
      }
    }
    assert.deepEqual(await setup.counts(), before);
    report.status = 'GUARDED_FORWARD_AND_RUNTIME_INTERNAL_DENIALS_PASSED';
    await save();
    return report;
  } catch (error) {
    report.error = { message: String(error) };
    await save();
    throw error;
  }
}
