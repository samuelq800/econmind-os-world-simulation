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
const MIGRATION_SHA256 =
  '083e06aca86763e4bc32a34347c1a86b26aa910f3c6a191b9393021347211618';
const MIGRATION_SOURCE_COMMIT = 'f3413bae195b75e80d28d6afa314ca0e394bdfbc';

async function auditedMigration(repositoryRoot) {
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
  const migration = manifest.migrations.find(
    (entry) => entry.migration_id === MIGRATION_ID,
  );
  if (
    result.status !== 'PASS' ||
    migration === undefined ||
    migration.release_order !== 20 ||
    migration.sha256 !== MIGRATION_SHA256 ||
    migration.artifact_source_commit !== MIGRATION_SOURCE_COMMIT
  ) {
    throw new Error('WORLD_V2_API_READER_AUDIT_SOURCE_INVALID');
  }
  return migration;
}

function sqlLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function auditQuery(migration) {
  return [
    'select jsonb_build_object(',
    "  'phase', 'READBACK_AUDIT',",
    "  'migration_id', " + sqlLiteral(migration.migration_id) + ',',
    "  'artifact_sha256', " + sqlLiteral(migration.sha256) + ',',
    "  'source_repo_commit', " +
      sqlLiteral(migration.artifact_source_commit) +
      ',',
    "  'release_order', " + Number(migration.release_order) + ',',
    "  'reader_role', (",
    '    select jsonb_build_object(',
    "      'can_login', rolcanlogin,",
    "      'can_bypass_rls', rolbypassrls,",
    "      'is_superuser', rolsuper,",
    "      'inherits_privileges', rolinherit",
    "    ) from pg_roles where rolname = 'world_v2_api_reader'",
    '  ),',
    "  'login_role', (",
    '    select jsonb_build_object(',
    "      'can_login', rolcanlogin,",
    "      'can_bypass_rls', rolbypassrls,",
    "      'is_superuser', rolsuper,",
    "      'inherits_privileges', rolinherit",
    "    ) from pg_roles where rolname = 'world_v2_api_login'",
    '  ),',
    "  'control_plane_role', (",
    '    select jsonb_build_object(',
    "      'name', rolname,",
    "      'can_login', rolcanlogin,",
    "      'can_bypass_rls', rolbypassrls,",
    "      'is_superuser', rolsuper,",
    "      'can_create_role', rolcreaterole,",
    "      'inherits_privileges', rolinherit",
    "    ) from pg_roles where rolname = 'postgres'",
    '  ),',
    "  'reader_memberships', coalesce((",
    '    select jsonb_agg(jsonb_build_object(',
    "      'member', member_role.rolname,",
    "      'role', granted_role.rolname,",
    "      'grantor', grantor_role.rolname,",
    "      'admin_option', membership.admin_option,",
    "      'inherit_option', membership.inherit_option,",
    "      'set_option', membership.set_option",
    '    ) order by member_role.rolname)',
    '    from pg_auth_members membership',
    '    join pg_roles member_role on member_role.oid = membership.member',
    '    join pg_roles granted_role on granted_role.oid = membership.roleid',
    '    join pg_roles grantor_role on grantor_role.oid = membership.grantor',
    "    where granted_role.rolname = 'world_v2_api_reader'",
    "  ), '[]'::jsonb),",
    "  'schema_usage', coalesce((",
    '    select jsonb_agg(namespace.nspname order by namespace.nspname)',
    '    from pg_namespace namespace',
    "    where namespace.nspname in ('auth', 'public', 'storage', 'world_v2')",
    "      and has_schema_privilege('world_v2_api_reader', namespace.oid, 'USAGE')",
    "  ), '[]'::jsonb),",
    "  'column_select_privileges', coalesce((",
    '    select jsonb_agg(jsonb_build_object(',
    "      'schema', namespace.nspname,",
    "      'table', relation.relname,",
    "      'column', attribute.attname",
    '    ) order by namespace.nspname, relation.relname, attribute.attnum)',
    '    from pg_attribute attribute',
    '    join pg_class relation on relation.oid = attribute.attrelid',
    '    join pg_namespace namespace on namespace.oid = relation.relnamespace',
    "    where namespace.nspname in ('auth', 'public', 'storage', 'world_v2')",
    "      and relation.relkind in ('p', 'r')",
    '      and attribute.attnum > 0',
    '      and not attribute.attisdropped',
    "      and has_column_privilege('world_v2_api_reader', relation.oid, attribute.attname, 'SELECT')",
    "  ), '[]'::jsonb),",
    "  'table_privileges', coalesce((",
    '    select jsonb_agg(jsonb_build_object(',
    "      'schema', namespace.nspname,",
    "      'table', relation.relname,",
    "      'privilege', action.name",
    '    ) order by namespace.nspname, relation.relname, action.name)',
    '    from pg_class relation',
    '    join pg_namespace namespace on namespace.oid = relation.relnamespace',
    "    cross join (values ('DELETE'), ('INSERT'), ('SELECT'), ('TRUNCATE'), ('UPDATE'))",
    '      as action(name)',
    "    where namespace.nspname in ('auth', 'public', 'storage', 'world_v2')",
    "      and relation.relkind in ('p', 'r')",
    "      and has_table_privilege('world_v2_api_reader', relation.oid, action.name)",
    "  ), '[]'::jsonb),",
    "  'candidate_table_policies', coalesce((",
    '    select jsonb_agg(jsonb_build_object(',
    "      'schema', policy.schemaname,",
    "      'table', policy.tablename,",
    "      'name', policy.policyname,",
    "      'roles', to_jsonb(policy.roles),",
    "      'command', policy.cmd,",
    "      'permissive', policy.permissive,",
    "      'qual', policy.qual,",
    "      'with_check', policy.with_check",
    '    ) order by policy.policyname)',
    '    from pg_policies policy',
    "    where policy.schemaname = 'world_v2'",
    "      and policy.tablename in ('country_candidate_bundle', 'country_candidate_artifact')",
    "  ), '[]'::jsonb)",
    ') as evidence;',
  ].join('\n');
}

/**
 * Builds a read-only Management API query. It has no credentials and no
 * database side effect.
 */
export async function renderWorldV2ApiReaderReadbackAudit(
  repositoryRoot = root,
) {
  const migration = await auditedMigration(repositoryRoot);
  return Object.freeze({ migration, query: auditQuery(migration) });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [repositoryRoot, outputPath] = process.argv.slice(2);
  if (!repositoryRoot || !outputPath) {
    throw new Error(
      'usage: node render-world-v2-api-reader-readback-audit.mjs SOURCE_ROOT OUTPUT',
    );
  }
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repositoryRoot },
  );
  if (stdout.trim() !== '') {
    throw new Error('WORLD_V2_API_READER_AUDIT_SOURCE_NOT_CLEAN');
  }
  const result = await renderWorldV2ApiReaderReadbackAudit(
    path.resolve(repositoryRoot),
  );
  await writeFile(outputPath, JSON.stringify({ query: result.query }));
  process.stdout.write(
    JSON.stringify({
      migrationId: result.migration.migration_id,
      audit: 'READ_ONLY',
      requestBytes: Buffer.byteLength(JSON.stringify({ query: result.query })),
    }) + '\n',
  );
}
