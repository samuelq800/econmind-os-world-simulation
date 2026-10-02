import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

import {
  readMigrationGitProvenance,
  validateMigrationManifest,
  STORAGE_VETO_MIGRATION_ID,
} from './migration-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  await readFile(path.join(root, 'database/migrations/manifest.json'), 'utf8'),
);
const artifacts = new Map();
for (const migration of manifest.migrations) {
  artifacts.set(
    migration.path,
    await readFile(path.join(root, migration.path)),
  );
}
const provenance = await readMigrationGitProvenance(root, manifest.migrations);
const validation = validateMigrationManifest(manifest, artifacts, provenance);
if (validation.status !== 'PASS') {
  console.error(JSON.stringify(validation, null, 2));
  process.exit(1);
}

async function applyChain(database, migrations) {
  for (const migration of migrations) {
    await database.exec(artifacts.get(migration.path).toString('utf8'));
    await database.query(
      `insert into world_v2.schema_release
        (migration_id, artifact_sha256, source_repo_commit, release_order)
       values ($1, $2, $3, $4)
       on conflict (migration_id) do nothing`,
      [
        migration.migration_id,
        migration.sha256,
        migration.artifact_source_commit,
        migration.release_order,
      ],
    );
  }
}

async function rehearse(mode) {
  const database = new PGlite();
  try {
    if (mode === 'existing-schema') {
      await database.exec(
        'create schema world_v2; create table world_v2.preexisting_marker (id integer primary key);',
      );
    }
    const legacy = manifest.migrations.filter(
      (m) => m.migration_id !== STORAGE_VETO_MIGRATION_ID,
    );
    await applyChain(database, legacy);
    const release = await database.query(
      'select migration_id, artifact_sha256, source_repo_commit, release_order from world_v2.schema_release order by release_order',
    );
    const shared = await database.query(
      "select schema_name from information_schema.schemata where schema_name in ('auth', 'public', 'storage') order by schema_name",
    );
    if (release.rows.length !== legacy.length)
      throw new Error(`${mode} release ledger mismatch`);
    if (
      release.rows.some(
        (row, index) =>
          row.source_repo_commit !==
          manifest.migrations[index]?.artifact_source_commit,
      )
    ) {
      throw new Error(`${mode} release provenance mismatch`);
    }
    if (
      shared.rows.some(
        (row) => row.schema_name === 'auth' || row.schema_name === 'storage',
      )
    )
      throw new Error(`${mode} created a shared Supabase-owned schema`);
    // The complete historical no-shared-schema assertion above stays intact.
    // Only a disposable, preexisting Storage fixture supports the new veto.
    const veto = manifest.migrations.find(
      (m) => m.migration_id === STORAGE_VETO_MIGRATION_ID,
    );
    if (veto) {
      await database.exec(`create role anon nologin; create role authenticated nologin;
        create schema storage; create table storage.objects(bucket_id text);
        alter table storage.objects enable row level security;
        create policy existing_fixture on storage.objects for all to public using(true) with check(true);`);
      await applyChain(database, [veto]);
      const policies = await database.query(
        "select policyname from pg_policies where schemaname='storage' order by policyname",
      );
      if (
        JSON.stringify(policies.rows.map((p) => p.policyname)) !==
        JSON.stringify([
          'existing_fixture',
          'world_v2_snapshot_objects_delete_deny',
          'world_v2_snapshot_objects_insert_deny',
        ])
      )
        throw new Error(
          `${mode} Storage delta is not exactly the two reviewed policies`,
        );
    }
    return {
      mode,
      legacyReleaseRows: release.rows.length,
      releaseRows: manifest.migrations.length,
      existingSharedSchemaAssertion: 'PASS_BEFORE_DISPOSABLE_STORAGE_FIXTURE',
      status: 'PASS',
    };
  } finally {
    await database.close();
  }
}

const results = [
  await rehearse('clean-baseline'),
  await rehearse('existing-schema'),
];
console.log(
  JSON.stringify(
    {
      database: 'PGlite ephemeral PostgreSQL',
      productionAccess: false,
      results,
      status: 'PASS',
    },
    null,
    2,
  ),
);
