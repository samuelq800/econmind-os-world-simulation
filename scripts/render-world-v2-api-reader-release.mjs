import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from './migration-policy.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_ID = '0020_world_v2_official_country_reader';
const PREVIOUS_MIGRATION_COUNT = 19;
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

function releaseLedgerJson(migrations) {
  return JSON.stringify(
    migrations.map((entry) => ({
      migration_id: entry.migration_id,
      artifact_sha256: entry.sha256,
      source_repo_commit: entry.artifact_source_commit,
      release_order: entry.release_order,
    })),
  );
}

async function verifiedMigration(repositoryRoot) {
  const manifest = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'database/migrations/manifest.json'),
      'utf8',
    ),
  );
  const artifacts = new Map();
  for (const entry of manifest.migrations) {
    artifacts.set(
      entry.path,
      await readFile(path.join(repositoryRoot, entry.path)),
    );
  }
  const provenance = await readMigrationGitProvenance(
    repositoryRoot,
    manifest.migrations,
  );
  const result = validateMigrationManifest(manifest, artifacts, provenance);
  if (result.status !== 'PASS' || manifest.migrations.length !== 20) {
    throw new Error('WORLD_V2_API_READER_MIGRATION_CHAIN_INVALID');
  }
  const migration = manifest.migrations.at(-1);
  if (
    migration.migration_id !== MIGRATION_ID ||
    migration.release_order !== 20
  ) {
    throw new Error('WORLD_V2_API_READER_MIGRATION_ID_INVALID');
  }
  return Object.freeze({
    manifest,
    migration,
    sql: artifacts.get(migration.path).toString('utf8'),
  });
}

function schemaQuery({ manifest, migration, sql }) {
  const previous = releaseLedgerJson(
    manifest.migrations.slice(0, PREVIOUS_MIGRATION_COUNT),
  );
  return `begin;
do $world_v2_api_reader_preflight$
begin
  if (select coalesce(jsonb_agg(jsonb_build_object(
       'migration_id', migration_id,
       'artifact_sha256', artifact_sha256,
       'source_repo_commit', source_repo_commit,
       'release_order', release_order
     ) order by release_order), '[]'::jsonb)
      from world_v2.schema_release) <> ${sqlLiteral(previous)}::jsonb then
    raise exception 'World V2 release ledger is not the exact reviewed 19-artifact baseline';
  end if;
end;
$world_v2_api_reader_preflight$;
${sql}
insert into world_v2.schema_release
  (migration_id, artifact_sha256, source_repo_commit, release_order)
values (${sqlLiteral(migration.migration_id)}, ${sqlLiteral(migration.sha256)},
        ${sqlLiteral(migration.artifact_source_commit)}, 20);
commit;
select jsonb_build_object(
  'phase', 'SCHEMA',
  'migration_id', migration_id,
  'artifact_sha256', artifact_sha256,
  'source_repo_commit', source_repo_commit,
  'release_order', release_order,
  'reader_role', (
    select jsonb_build_object(
      'can_login', rolcanlogin,
      'can_bypass_rls', rolbypassrls,
      'is_superuser', rolsuper,
      'inherits_privileges', rolinherit
    ) from pg_roles where rolname = 'world_v2_api_reader'
  ),
  'login_role', (
    select jsonb_build_object(
      'can_login', rolcanlogin,
      'can_bypass_rls', rolbypassrls,
      'is_superuser', rolsuper,
      'inherits_privileges', rolinherit
    ) from pg_roles where rolname = 'world_v2_api_login'
  ),
  'reader_memberships', coalesce((
    select jsonb_agg(jsonb_build_object(
      'member', member_role.rolname,
      'role', granted_role.rolname,
      'admin_option', membership.admin_option,
      'inherit_option', membership.inherit_option,
      'set_option', membership.set_option
    ) order by member_role.rolname)
    from pg_auth_members membership
    join pg_roles member_role on member_role.oid = membership.member
    join pg_roles granted_role on granted_role.oid = membership.roleid
    where granted_role.rolname = 'world_v2_api_reader'
  ), '[]'::jsonb),
  'schema_usage', coalesce((
    select jsonb_agg(namespace.nspname order by namespace.nspname)
    from pg_namespace namespace
    where namespace.nspname in ('auth', 'public', 'storage', 'world_v2')
      and has_schema_privilege(
        'world_v2_api_reader', namespace.oid, 'USAGE'
      )
  ), '[]'::jsonb),
  'column_select_privileges', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', relation.relname,
      'column', attribute.attname
    ) order by relation.relname, attribute.attnum)
    from pg_attribute attribute
    join pg_class relation on relation.oid = attribute.attrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('auth', 'public', 'storage', 'world_v2')
      and relation.relkind in ('p', 'r')
      and attribute.attnum > 0
      and not attribute.attisdropped
      and has_column_privilege(
        'world_v2_api_reader', relation.oid, attribute.attname, 'SELECT'
      )
  ), '[]'::jsonb),
  'table_select_privileges', coalesce((
    select jsonb_agg(relation.relname order by relation.relname)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('auth', 'public', 'storage', 'world_v2')
      and relation.relkind in ('p', 'r')
      and has_table_privilege(
        'world_v2_api_reader', relation.oid, 'SELECT'
      )
  ), '[]'::jsonb),
  'nonselect_table_privileges', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', relation.relname,
      'privilege', action.name
    ) order by relation.relname, action.name)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join (values ('DELETE'), ('INSERT'), ('TRUNCATE'), ('UPDATE'))
      as action(name)
    where namespace.nspname in ('auth', 'public', 'storage', 'world_v2')
      and relation.relkind in ('p', 'r')
      and has_table_privilege(
        'world_v2_api_reader', relation.oid, action.name
      )
  ), '[]'::jsonb),
  'selected_source_policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', policy.schemaname,
      'table', policy.tablename,
      'name', policy.policyname,
      'roles', to_jsonb(policy.roles),
      'command', policy.cmd,
      'permissive', policy.permissive,
      'qual', policy.qual,
      'with_check', policy.with_check
    ) order by policy.policyname)
    from pg_policies policy
    where policy.schemaname = 'world_v2'
      and policy.policyname in (
        'country_candidate_bundle_selected_source_server_read',
        'country_candidate_artifact_selected_source_server_read'
      )
  ), '[]'::jsonb)
) as evidence from world_v2.schema_release
where migration_id = ${sqlLiteral(MIGRATION_ID)};`;
}

/**
 * Builds one reviewed Management API request. This module has no credentials,
 * no network client, and no production side effect.
 */
export async function renderWorldV2ApiReaderRelease(repositoryRoot = root) {
  const release = await verifiedMigration(repositoryRoot);
  return Object.freeze({
    migration: release.migration,
    query: schemaQuery(release),
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [repositoryRoot, outputPath] = process.argv.slice(2);
  if (!repositoryRoot || !outputPath) {
    throw new Error(
      'usage: node render-world-v2-api-reader-release.mjs SOURCE_ROOT OUTPUT',
    );
  }
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repositoryRoot },
  );
  if (stdout.trim() !== '') {
    throw new Error('WORLD_V2_API_READER_SOURCE_NOT_CLEAN');
  }
  const result = await renderWorldV2ApiReaderRelease(
    path.resolve(repositoryRoot),
  );
  await writeFile(outputPath, JSON.stringify({ query: result.query }));
  process.stdout.write(
    JSON.stringify({
      migrationId: result.migration.migration_id,
      migrationSha256: result.migration.sha256,
      sourceCommit: result.migration.artifact_source_commit,
      requestBytes: Buffer.byteLength(JSON.stringify({ query: result.query })),
    }) + '\n',
  );
}
