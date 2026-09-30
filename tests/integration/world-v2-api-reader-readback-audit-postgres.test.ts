import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { renderWorldV2ApiReaderReadbackAudit } from '../../scripts/render-world-v2-api-reader-readback-audit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const READER_ROLE = 'world_v2_api_reader';
const LOGIN_ROLE = 'world_v2_api_login';
const MIGRATION_ID = '0020_world_v2_official_country_reader';
const MIGRATION_SHA256 =
  '083e06aca86763e4bc32a34347c1a86b26aa910f3c6a191b9393021347211618';
const MIGRATION_SOURCE_COMMIT = 'f3413bae195b75e80d28d6afa314ca0e394bdfbc';
const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;

let admin: Pool | undefined;

function currentAdmin(): Pool {
  if (admin === undefined)
    throw new Error('WORLD_V2_API_READER_AUDIT_ADMIN_MISSING');
  return admin;
}

async function dropRole(role: string): Promise<void> {
  await currentAdmin().query(
    `select pg_terminate_backend(pid)
       from pg_stat_activity
      where usename = $1 and pid <> pg_backend_pid()`,
    [role],
  );
  await currentAdmin().query(`drop role if exists ${role}`);
}

async function resetWorldV2(): Promise<void> {
  await currentAdmin().query('drop schema if exists world_v2 cascade');
  await dropRole(LOGIN_ROLE);
  await dropRole(READER_ROLE);
  const manifest = JSON.parse(
    await readFile(
      path.join(root, 'database/migrations/manifest.json'),
      'utf8',
    ),
  ) as { migrations: readonly { readonly path: string }[] };
  for (const migration of manifest.migrations) {
    await currentAdmin().query(
      await readFile(path.join(root, migration.path), 'utf8'),
    );
  }
}

type AuditEvidence = {
  ledger_entries: {
    migration_id: string;
    artifact_sha256: string;
    source_repo_commit: string;
    release_order: number;
  }[];
};

postgresDescribe('World V2 reader readback audit / native PostgreSQL', () => {
  beforeAll(async () => {
    const environment = assertV09PostgresTestEnvironment();
    admin = new Pool({
      connectionString: environment.connectionString,
      max: 2,
    });
    await resetWorldV2();
    await currentAdmin().query(
      `insert into world_v2.schema_release
         (migration_id, release_order, artifact_sha256, source_repo_commit)
       values ($1, $2, $3, $4)`,
      [MIGRATION_ID, 20, MIGRATION_SHA256, MIGRATION_SOURCE_COMMIT],
    );
  }, 30_000);

  afterAll(async () => {
    if (admin !== undefined) {
      await currentAdmin().query('drop schema if exists world_v2 cascade');
      await dropRole(LOGIN_ROLE);
      await dropRole(READER_ROLE);
      await admin.end();
      admin = undefined;
    }
  });

  it('reads the actual schema_release row instead of manifest literals', async () => {
    const audit = await renderWorldV2ApiReaderReadbackAudit(root);
    const initial = await currentAdmin().query<{ evidence: AuditEvidence }>(
      audit.query,
    );
    expect(initial.rows).toHaveLength(1);
    expect(initial.rows[0]?.evidence.ledger_entries).toEqual([
      {
        migration_id: MIGRATION_ID,
        artifact_sha256: MIGRATION_SHA256,
        source_repo_commit: MIGRATION_SOURCE_COMMIT,
        release_order: 20,
      },
    ]);

    const replacementSha256 = 'f'.repeat(64);
    await currentAdmin().query(
      `update world_v2.schema_release
          set artifact_sha256 = $2
        where migration_id = $1`,
      [MIGRATION_ID, replacementSha256],
    );
    const changed = await currentAdmin().query<{ evidence: AuditEvidence }>(
      audit.query,
    );
    expect(changed.rows[0]?.evidence.ledger_entries).toEqual([
      {
        migration_id: MIGRATION_ID,
        artifact_sha256: replacementSha256,
        source_repo_commit: MIGRATION_SOURCE_COMMIT,
        release_order: 20,
      },
    ]);
  }, 30_000);
});
