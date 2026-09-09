import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

import { validateMigrationManifest } from './migration-policy.mjs';

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
const validation = validateMigrationManifest(manifest, artifacts);
if (validation.status !== 'PASS') {
  console.error(JSON.stringify(validation, null, 2));
  process.exit(1);
}

async function applyChain(database) {
  for (const migration of manifest.migrations) {
    await database.exec(artifacts.get(migration.path).toString('utf8'));
    await database.query(
      `insert into world_v2.schema_release
        (migration_id, artifact_sha256, source_repo_commit, release_order)
       values ($1, $2, $3, $4)
       on conflict (migration_id) do nothing`,
      [
        migration.migration_id,
        migration.sha256,
        migration.created_from_commit,
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
    await applyChain(database);
    const release = await database.query(
      'select migration_id, artifact_sha256, release_order from world_v2.schema_release order by release_order',
    );
    const shared = await database.query(
      "select schema_name from information_schema.schemata where schema_name in ('auth', 'public', 'storage') order by schema_name",
    );
    if (release.rows.length !== manifest.migrations.length)
      throw new Error(`${mode} release ledger mismatch`);
    if (
      shared.rows.some(
        (row) => row.schema_name === 'auth' || row.schema_name === 'storage',
      )
    )
      throw new Error(`${mode} created a shared Supabase-owned schema`);
    return { mode, releaseRows: release.rows.length, status: 'PASS' };
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
