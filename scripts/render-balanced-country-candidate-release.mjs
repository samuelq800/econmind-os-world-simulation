import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { loadBalancedCountryCandidate } from './balanced-country-candidate-intake.mjs';
import {
  readMigrationGitProvenance,
  validateMigrationManifest,
} from './migration-policy.mjs';

const execFileAsync = promisify(execFile);
const MIGRATION_ID = '0019_world_v2_balanced_candidate_status';
const MAX_PART_BYTES = 150_000;
const MAX_REQUEST_BYTES = 420_000;
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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
  if (result.status !== 'PASS' || manifest.migrations.length !== 19) {
    throw new Error('BALANCED_CANDIDATE_MIGRATION_CHAIN_INVALID');
  }
  const migration = manifest.migrations.at(-1);
  if (
    migration.migration_id !== MIGRATION_ID ||
    migration.release_order !== 19
  ) {
    throw new Error('BALANCED_CANDIDATE_MIGRATION_ID_INVALID');
  }
  return {
    manifest,
    migration,
    sql: artifacts.get(migration.path).toString('utf8'),
  };
}

function schemaQuery({ manifest, migration, sql }) {
  const previous = releaseLedgerJson(manifest.migrations.slice(0, 18));
  return `begin;
do $balanced_schema_preflight$
begin
  if (select coalesce(jsonb_agg(jsonb_build_object(
       'migration_id', migration_id,
       'artifact_sha256', artifact_sha256,
       'source_repo_commit', source_repo_commit,
       'release_order', release_order
     ) order by release_order), '[]'::jsonb)
      from world_v2.schema_release) <> ${sqlLiteral(previous)}::jsonb then
    raise exception 'World V2 release ledger is not the exact reviewed 18-artifact baseline';
  end if;
end;
$balanced_schema_preflight$;
${sql}
insert into world_v2.schema_release
  (migration_id, artifact_sha256, source_repo_commit, release_order)
values (${sqlLiteral(migration.migration_id)}, ${sqlLiteral(migration.sha256)},
        ${sqlLiteral(migration.artifact_source_commit)}, 19);
commit;
select jsonb_build_object(
  'phase', 'SCHEMA', 'migration_id', migration_id,
  'artifact_sha256', artifact_sha256,
  'source_repo_commit', source_repo_commit,
  'release_order', release_order
) as evidence from world_v2.schema_release
where migration_id = ${sqlLiteral(MIGRATION_ID)};`;
}

function migrationGuard(migration) {
  return `do $balanced_migration_guard$
begin
  if not exists (
    select 1 from world_v2.schema_release
    where migration_id = ${sqlLiteral(migration.migration_id)}
      and artifact_sha256 = ${sqlLiteral(migration.sha256)}
      and source_repo_commit = ${sqlLiteral(migration.artifact_source_commit)}
      and release_order = 19
  ) then raise exception 'Balanced candidate schema is not the reviewed release'; end if;
end;
$balanced_migration_guard$;`;
}

function bundleGuard(bundle) {
  return `do $balanced_bundle_guard$
begin
  if not exists (
    select 1 from world_v2.country_candidate_bundle
    where bundle_id = ${sqlLiteral(bundle.candidateId)}
      and source_thread_id = ${sqlLiteral(bundle.sourceThread)}
      and package_manifest_sha256 = ${sqlLiteral(bundle.manifestSha256)}
      and source_status = ${sqlLiteral(bundle.sourceStatus)}
      and activation_allowed = false
  ) then raise exception 'Balanced candidate bundle identity mismatch'; end if;
end;
$balanced_bundle_guard$;`;
}

function splitUtf8(content) {
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const character of content) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > MAX_PART_BYTES && current !== '') {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  if (current !== '') parts.push(current);
  return parts;
}

function storageArtifacts(artifacts) {
  return artifacts.flatMap((artifact) => {
    const parts = splitUtf8(artifact.content);
    if (parts.length === 1) return [artifact];
    return parts.map((content, index) => ({
      path: `${artifact.path}.part${String(index + 1).padStart(4, '0')}`,
      sha256: sha256(Buffer.from(content, 'utf8')),
      content,
    }));
  });
}

function batchQuery(release, kind, index, rows) {
  const { bundle, migration } = release;
  let insert;
  let verify;
  if (kind === 'BUNDLE') {
    insert = `insert into world_v2.country_candidate_bundle
      (bundle_id, source_thread_id, package_manifest_sha256, source_status, activation_allowed)
      values (${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(bundle.sourceThread)},
              ${sqlLiteral(bundle.manifestSha256)}, ${sqlLiteral(bundle.sourceStatus)}, false)
      on conflict (bundle_id) do nothing;`;
    verify = bundleGuard(bundle);
  } else if (kind === 'ARTIFACT') {
    const values = rows
      .map(
        (row) =>
          `(${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(row.path)}, ${sqlLiteral(row.sha256)}, ${sqlLiteral(row.content)})`,
      )
      .join(',\n');
    const expected = rows
      .map((row) => `(${sqlLiteral(row.path)}, ${sqlLiteral(row.sha256)})`)
      .join(',\n');
    insert = `insert into world_v2.country_candidate_artifact
      (bundle_id, artifact_path, content_sha256, content_utf8)
      values ${values}
      on conflict (bundle_id, artifact_path) do nothing;`;
    verify = `do $balanced_artifact_guard$
    begin
      if exists (
        select 1 from (values ${expected}) as e(path, hash)
        left join world_v2.country_candidate_artifact a
          on a.bundle_id = ${sqlLiteral(bundle.candidateId)} and a.artifact_path = e.path
        where a.content_sha256 is distinct from e.hash
      ) then raise exception 'Balanced candidate artifact batch mismatch'; end if;
    end;
    $balanced_artifact_guard$;`;
  } else {
    const values = rows
      .map(
        (row) =>
          `(${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(row.countryId)}, ${sqlLiteral(JSON.stringify(row))}::jsonb)`,
      )
      .join(',\n');
    insert = `insert into world_v2.country_candidate_profile
      (bundle_id, country_id, source_record)
      values ${values}
      on conflict (bundle_id, country_id) do nothing;`;
    verify = `do $balanced_profile_guard$
    begin
      if (select count(*) from world_v2.country_candidate_profile
          where bundle_id = ${sqlLiteral(bundle.candidateId)}) <> 70 then
        raise exception 'Balanced candidate profile count mismatch';
      end if;
    end;
    $balanced_profile_guard$;`;
  }
  return `begin;
${migrationGuard(migration)}
${kind === 'BUNDLE' ? '' : bundleGuard(bundle)}
${insert}
${verify}
commit;
select jsonb_build_object('phase', 'BATCH', 'kind', ${sqlLiteral(kind)},
  'batch_index', ${index}, 'bundle_id', ${sqlLiteral(bundle.candidateId)},
  'batch_rows', ${rows.length}) as evidence;`;
}

function finalQuery(release, storageCount) {
  const { bundle, migration } = release;
  const expected = bundle.artifacts
    .map(
      (artifact) =>
        `(${sqlLiteral(artifact.path)}, ${sqlLiteral(artifact.sha256)})`,
    )
    .join(',\n');
  const countriesPath = bundle.artifacts.find(
    (artifact) => artifact.sourcePath === 'data/countries.json',
  ).path;
  return `begin;
${migrationGuard(migration)}
${bundleGuard(bundle)}
do $balanced_final$
begin
  if (select count(*) from world_v2.country_candidate_artifact
      where bundle_id = ${sqlLiteral(bundle.candidateId)}) <> ${storageCount}
    or (select count(*) from world_v2.country_candidate_profile
        where bundle_id = ${sqlLiteral(bundle.candidateId)}) <> 70
    or exists (
      select 1 from (values ${expected}) as e(path, hash)
      where world_v2.authoritative_sha256((
        select string_agg(a.content_utf8, '' order by a.artifact_path)
        from world_v2.country_candidate_artifact a
        where a.bundle_id = ${sqlLiteral(bundle.candidateId)}
          and (a.artifact_path = e.path
            or left(a.artifact_path, length(e.path) + 5) = e.path || '.part')
      )) is distinct from e.hash
    )
    or exists (
      select 1 from jsonb_array_elements((
        select string_agg(a.content_utf8, '' order by a.artifact_path)::jsonb
        from world_v2.country_candidate_artifact a
        where a.bundle_id = ${sqlLiteral(bundle.candidateId)}
          and (a.artifact_path = ${sqlLiteral(countriesPath)}
            or left(a.artifact_path, length(${sqlLiteral(countriesPath)}) + 5)
              = ${sqlLiteral(countriesPath + '.part')})
      )) source_row
      left join world_v2.country_candidate_profile p
        on p.bundle_id = ${sqlLiteral(bundle.candidateId)}
       and p.country_id = source_row ->> 'id'
      where p.source_record - 'countryId' - 'activationAllowed'
        is distinct from source_row
    ) then raise exception 'Balanced candidate final integrity mismatch'; end if;
end;
$balanced_final$;
commit;
select jsonb_build_object(
  'phase', 'IMPORT', 'bundle_id', bundle_id,
  'source_thread_id', source_thread_id,
  'manifest_sha256', package_manifest_sha256,
  'source_status', source_status,
  'activation_allowed', activation_allowed,
  'source_artifact_count', ${bundle.artifacts.length},
  'storage_row_count', (select count(*) from world_v2.country_candidate_artifact a where a.bundle_id = b.bundle_id),
  'country_count', (select count(*) from world_v2.country_candidate_profile p where p.bundle_id = b.bundle_id),
  'world_head_count', (select count(*) from world_v2.world_head),
  'opening_seed_count', (select count(*) from world_v2.opening_seed)
) as evidence from world_v2.country_candidate_bundle b
where bundle_id = ${sqlLiteral(bundle.candidateId)};`;
}

export async function renderBalancedCountryCandidateRelease(repositoryRoot) {
  const migration = await verifiedMigration(repositoryRoot);
  const bundle = await loadBalancedCountryCandidate(repositoryRoot);
  const release = { bundle, migration: migration.migration };
  const stored = storageArtifacts(bundle.artifacts);
  const queries = [batchQuery(release, 'BUNDLE', 0, [])];
  let current = [];
  for (const artifact of stored) {
    const next = [...current, artifact];
    const candidate = batchQuery(release, 'ARTIFACT', queries.length, next);
    if (
      Buffer.byteLength(JSON.stringify({ query: candidate })) >
      MAX_REQUEST_BYTES
    ) {
      if (current.length === 0)
        throw new Error('BALANCED_CANDIDATE_ARTIFACT_TOO_LARGE');
      queries.push(batchQuery(release, 'ARTIFACT', queries.length, current));
      current = [artifact];
    } else {
      current = next;
    }
  }
  if (current.length > 0)
    queries.push(batchQuery(release, 'ARTIFACT', queries.length, current));
  queries.push(
    batchQuery(release, 'PROFILE', queries.length, bundle.countries),
  );
  const final = finalQuery(release, stored.length);
  const requestBytes = [...queries, final].map((query) =>
    Buffer.byteLength(JSON.stringify({ query })),
  );
  if (requestBytes.some((size) => size > MAX_REQUEST_BYTES)) {
    throw new Error('BALANCED_CANDIDATE_REQUEST_LIMIT_EXCEEDED');
  }
  return Object.freeze({
    schema: schemaQuery(migration),
    queries: Object.freeze(queries),
    final,
    migration: migration.migration,
    bundle,
    sourceArtifacts: bundle.artifacts.length,
    storageRows: stored.length,
    countries: bundle.countries.length,
    maxRequestBytes: Math.max(...requestBytes),
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [repositoryRoot, phase, outputPath] = process.argv.slice(2);
  if (
    !repositoryRoot ||
    !['schema', 'batches'].includes(phase) ||
    !outputPath
  ) {
    throw new Error(
      'usage: node render-balanced-country-candidate-release.mjs SOURCE_ROOT schema|batches OUTPUT',
    );
  }
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: repositoryRoot },
  );
  if (stdout.trim() !== '')
    throw new Error('BALANCED_CANDIDATE_SOURCE_NOT_CLEAN');
  const result = await renderBalancedCountryCandidateRelease(
    path.resolve(repositoryRoot),
  );
  if (phase === 'schema') {
    await writeFile(outputPath, JSON.stringify({ query: result.schema }));
  } else {
    await mkdir(outputPath, { recursive: true });
    for (const [index, query] of result.queries.entries()) {
      await writeFile(
        path.join(outputPath, `batch-${String(index).padStart(3, '0')}.json`),
        JSON.stringify({ query }),
      );
    }
    await writeFile(
      path.join(outputPath, 'final.json'),
      JSON.stringify({ query: result.final }),
    );
    await writeFile(
      path.join(outputPath, 'manifest.json'),
      JSON.stringify({
        batchCount: result.queries.length,
        sourceArtifacts: result.sourceArtifacts,
        storageRows: result.storageRows,
        countries: result.countries,
        maxRequestBytes: result.maxRequestBytes,
        manifestSha256: result.bundle.manifestSha256,
        sourceStatus: result.bundle.sourceStatus,
        sourceDrift: result.bundle.sourceDrift,
      }),
    );
  }
  process.stdout.write(
    JSON.stringify({
      phase,
      migrationId: result.migration.migration_id,
      migrationSha256: result.migration.sha256,
      sourceCommit: result.migration.artifact_source_commit,
      bundleId: result.bundle.candidateId,
      manifestSha256: result.bundle.manifestSha256,
      sourceArtifacts: result.sourceArtifacts,
      storageRows: result.storageRows,
      countries: result.countries,
      batchCount: result.queries.length,
      maxRequestBytes: result.maxRequestBytes,
      sourceDriftCount: result.bundle.sourceDrift.length,
    }) + '\n',
  );
}
