import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { loadCountryCandidate } from './country-candidate-intake.mjs';
import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from './migration-policy.mjs';

const execFileAsync = promisify(execFile);
const MIGRATION_ID = '0018_world_v2_country_candidate_intake';
const EXPECTED_PREVIOUS_MIGRATIONS = 17;
const EXPECTED_ARTIFACTS = 23;
const EXPECTED_COUNTRIES = 70;
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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
  if (result.status !== 'PASS' || manifest.migrations.length !== 18) {
    throw new Error('COUNTRY_CANDIDATE_MIGRATION_CHAIN_INVALID');
  }
  const migration = manifest.migrations.at(-1);
  if (
    migration.migration_id !== MIGRATION_ID ||
    migration.release_order !== 18
  ) {
    throw new Error('COUNTRY_CANDIDATE_MIGRATION_ID_INVALID');
  }
  return {
    manifest,
    migration,
    sql: artifacts.get(migration.path).toString('utf8'),
  };
}

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

function schemaSql({ manifest, migration, sql }) {
  const previous = releaseLedgerJson(
    manifest.migrations.slice(0, EXPECTED_PREVIOUS_MIGRATIONS),
  );
  return `begin;
do $country_candidate_preflight$
begin
  if (select coalesce(jsonb_agg(jsonb_build_object(
       'migration_id', migration_id,
       'artifact_sha256', artifact_sha256,
       'source_repo_commit', source_repo_commit,
       'release_order', release_order
     ) order by release_order), '[]'::jsonb)
      from world_v2.schema_release) <> ${sqlLiteral(previous)}::jsonb then
    raise exception 'World V2 release ledger is not the exact reviewed 17-artifact baseline';
  end if;
end;
$country_candidate_preflight$;
${sql}
insert into world_v2.schema_release
  (migration_id, artifact_sha256, source_repo_commit, release_order)
values (${sqlLiteral(migration.migration_id)}, ${sqlLiteral(migration.sha256)},
        ${sqlLiteral(migration.artifact_source_commit)}, 18);
commit;
select jsonb_build_object(
  'phase', 'SCHEMA',
  'migration_id', migration_id,
  'artifact_sha256', artifact_sha256,
  'source_repo_commit', source_repo_commit,
  'release_order', release_order,
  'candidate_table_count', (
    select count(*) from information_schema.tables
    where table_schema = 'world_v2' and table_name like 'country_candidate_%'
  )
) as evidence from world_v2.schema_release where migration_id = ${sqlLiteral(MIGRATION_ID)};
`;
}

function importSql(bundle, migration) {
  const artifactValues = bundle.artifacts
    .map(
      (artifact) =>
        `(${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(artifact.path)}, ${sqlLiteral(artifact.sha256)}, ${sqlLiteral(artifact.content)})`,
    )
    .join(',\n');
  const profileValues = bundle.countries
    .map(
      (country) =>
        `(${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(country.countryId)}, ${sqlLiteral(JSON.stringify(country))}::jsonb)`,
    )
    .join(',\n');
  const expectedHashes = bundle.artifacts
    .map(
      (artifact) =>
        `(${sqlLiteral(artifact.path)}, ${sqlLiteral(artifact.sha256)})`,
    )
    .join(',\n');
  return `begin;
do $country_candidate_schema_guard$
begin
  if not exists (
    select 1 from world_v2.schema_release
    where migration_id = ${sqlLiteral(migration.migration_id)}
      and artifact_sha256 = ${sqlLiteral(migration.sha256)}
      and source_repo_commit = ${sqlLiteral(migration.artifact_source_commit)}
      and release_order = 18
  ) then
    raise exception 'Country candidate intake schema is not the reviewed release';
  end if;
end;
$country_candidate_schema_guard$;
insert into world_v2.country_candidate_bundle
  (bundle_id, source_thread_id, package_manifest_sha256, source_status, activation_allowed)
values (${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(bundle.sourceThread)},
        ${sqlLiteral(bundle.manifestSha256)}, ${sqlLiteral(bundle.sourceStatus)}, false)
on conflict (bundle_id) do nothing;
insert into world_v2.country_candidate_artifact
  (bundle_id, artifact_path, content_sha256, content_utf8)
values ${artifactValues}
on conflict (bundle_id, artifact_path) do nothing;
insert into world_v2.country_candidate_profile
  (bundle_id, country_id, source_record)
values ${profileValues}
on conflict (bundle_id, country_id) do nothing;
do $country_candidate_verify$
begin
  if not exists (
    select 1 from world_v2.country_candidate_bundle
    where bundle_id = ${sqlLiteral(bundle.candidateId)}
      and source_thread_id = ${sqlLiteral(bundle.sourceThread)}
      and package_manifest_sha256 = ${sqlLiteral(bundle.manifestSha256)}
      and source_status = 'ILLUSTRATIVE_PLANNING_ONLY'
      and activation_allowed = false
  ) or (select count(*) from world_v2.country_candidate_artifact
           where bundle_id = ${sqlLiteral(bundle.candidateId)}) <> ${EXPECTED_ARTIFACTS}
    or (select count(*) from world_v2.country_candidate_profile
           where bundle_id = ${sqlLiteral(bundle.candidateId)}) <> ${EXPECTED_COUNTRIES}
    or exists (
      select 1 from (values ${expectedHashes}) as expected(path, hash)
      left join world_v2.country_candidate_artifact actual
        on actual.bundle_id = ${sqlLiteral(bundle.candidateId)}
       and actual.artifact_path = expected.path
      where actual.content_sha256 is distinct from expected.hash
    )
    or exists (
      select 1 from world_v2.country_candidate_artifact artifact,
                   jsonb_array_elements(artifact.content_utf8::jsonb -> 'country_summary') country
      left join world_v2.country_candidate_profile profile
        on profile.bundle_id = ${sqlLiteral(bundle.candidateId)}
       and profile.country_id = country ->> 'countryId'
      where artifact.bundle_id = ${sqlLiteral(bundle.candidateId)}
        and artifact.artifact_path = 'tables/all_tables.json'
        and profile.source_record is distinct from country
    ) then
    raise exception 'Country candidate import verification failed';
  end if;
end;
$country_candidate_verify$;
commit;
select jsonb_build_object(
  'phase', 'IMPORT',
  'bundle_id', bundle_id,
  'source_thread_id', source_thread_id,
  'manifest_sha256', package_manifest_sha256,
  'activation_allowed', activation_allowed,
  'artifact_count', (select count(*) from world_v2.country_candidate_artifact a where a.bundle_id = b.bundle_id),
  'country_count', (select count(*) from world_v2.country_candidate_profile p where p.bundle_id = b.bundle_id)
) as evidence from world_v2.country_candidate_bundle b
where bundle_id = ${sqlLiteral(bundle.candidateId)};
`;
}

export async function renderCountryCandidateRelease(repositoryRoot) {
  const { manifest, migration, sql } = await verifiedMigration(repositoryRoot);
  const bundle = await loadCountryCandidate(repositoryRoot);
  if (
    bundle.artifacts.length !== EXPECTED_ARTIFACTS ||
    bundle.countries.length !== EXPECTED_COUNTRIES
  ) {
    throw new Error('COUNTRY_CANDIDATE_INPUT_COUNT_INVALID');
  }
  return Object.freeze({
    migration,
    bundle,
    schema: schemaSql({ manifest, migration, sql }),
    import: importSql(bundle, migration),
    inputSha256: sha256(
      Buffer.from(
        bundle.artifacts
          .map((entry) => `${entry.path}:${entry.sha256}`)
          .join('\n'),
      ),
    ),
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [repositoryRoot, phase, outputPath] = process.argv.slice(2);
  if (!repositoryRoot || !['schema', 'import'].includes(phase) || !outputPath) {
    throw new Error(
      'usage: node render-country-candidate-release.mjs SOURCE_ROOT schema|import OUTPUT',
    );
  }
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    {
      cwd: repositoryRoot,
    },
  );
  if (stdout.trim() !== '')
    throw new Error('COUNTRY_CANDIDATE_SOURCE_NOT_CLEAN');
  const release = await renderCountryCandidateRelease(
    path.resolve(repositoryRoot),
  );
  await writeFile(outputPath, JSON.stringify({ query: release[phase] }));
  process.stdout.write(
    JSON.stringify({
      phase,
      migrationId: release.migration.migration_id,
      migrationSha256: release.migration.sha256,
      sourceCommit: release.migration.artifact_source_commit,
      bundleId: release.bundle.candidateId,
      manifestSha256: release.bundle.manifestSha256,
      inputSha256: release.inputSha256,
      artifactCount: release.bundle.artifacts.length,
      countryCount: release.bundle.countries.length,
    }) + '\n',
  );
}
