import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderCountryCandidateRelease } from './render-country-candidate-release.mjs';

const MAX_PART_BYTES = 180_000;
const MAX_REQUEST_BYTES = 420_000;
const sqlLiteral = (value) => `'${value.replaceAll("'", "''")}'`;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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

function migrationGuard(migration) {
  return `do $candidate_guard$
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
$candidate_guard$;`;
}

function bundleGuard(bundle) {
  return `do $bundle_guard$
begin
  if not exists (
    select 1 from world_v2.country_candidate_bundle
    where bundle_id = ${sqlLiteral(bundle.candidateId)}
      and source_thread_id = ${sqlLiteral(bundle.sourceThread)}
      and package_manifest_sha256 = ${sqlLiteral(bundle.manifestSha256)}
      and source_status = 'ILLUSTRATIVE_PLANNING_ONLY'
      and activation_allowed = false
  ) then
    raise exception 'Country candidate bundle identity mismatch';
  end if;
end;
$bundle_guard$;`;
}

function batchQuery(release, kind, index, rows) {
  const { bundle, migration } = release;
  let insert;
  let verify;
  if (kind === 'BUNDLE') {
    insert = `insert into world_v2.country_candidate_bundle
      (bundle_id, source_thread_id, package_manifest_sha256, source_status, activation_allowed)
      values (${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(bundle.sourceThread)},
              ${sqlLiteral(bundle.manifestSha256)}, 'ILLUSTRATIVE_PLANNING_ONLY', false)
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
    verify = `do $artifact_guard$
    begin
      if exists (
        select 1 from (values ${expected}) as e(path, hash)
        left join world_v2.country_candidate_artifact a
          on a.bundle_id = ${sqlLiteral(bundle.candidateId)} and a.artifact_path = e.path
        where a.content_sha256 is distinct from e.hash
      ) then raise exception 'Country candidate artifact batch mismatch'; end if;
    end;
    $artifact_guard$;`;
  } else {
    const values = bundle.countries
      .map(
        (row) =>
          `(${sqlLiteral(bundle.candidateId)}, ${sqlLiteral(row.countryId)}, ${sqlLiteral(JSON.stringify(row))}::jsonb)`,
      )
      .join(',\n');
    insert = `insert into world_v2.country_candidate_profile
      (bundle_id, country_id, source_record)
      values ${values}
      on conflict (bundle_id, country_id) do nothing;`;
    verify = `do $profile_guard$
    begin
      if (select count(*) from world_v2.country_candidate_profile
          where bundle_id = ${sqlLiteral(bundle.candidateId)}) <> 70 then
        raise exception 'Country candidate profile count mismatch';
      end if;
    end;
    $profile_guard$;`;
  }
  return `begin;
${migrationGuard(migration)}
${kind === 'BUNDLE' ? '' : bundleGuard(bundle)}
${insert}
${verify}
commit;
select jsonb_build_object('phase', 'BATCH', 'kind', ${sqlLiteral(kind)},
  'batch_index', ${index}, 'bundle_id', ${sqlLiteral(bundle.candidateId)},
  'batch_rows', ${rows.length}) as evidence;
`;
}

function finalQuery(release, storageCount) {
  const { bundle, migration } = release;
  const expected = bundle.artifacts
    .map(
      (artifact) =>
        `(${sqlLiteral(artifact.path)}, ${sqlLiteral(artifact.sha256)})`,
    )
    .join(',\n');
  return `begin;
${migrationGuard(migration)}
${bundleGuard(bundle)}
do $candidate_final$
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
        select string_agg(a.content_utf8, '' order by a.artifact_path)::jsonb -> 'country_summary'
        from world_v2.country_candidate_artifact a
        where a.bundle_id = ${sqlLiteral(bundle.candidateId)}
          and (a.artifact_path = 'tables/all_tables.json'
            or left(a.artifact_path, length('tables/all_tables.json') + 5) = 'tables/all_tables.json.part')
      )) source_row
      left join world_v2.country_candidate_profile p
        on p.bundle_id = ${sqlLiteral(bundle.candidateId)}
       and p.country_id = source_row ->> 'countryId'
      where p.source_record is distinct from source_row
    ) then
    raise exception 'Country candidate final integrity mismatch';
  end if;
end;
$candidate_final$;
commit;
select jsonb_build_object(
  'phase', 'IMPORT',
  'bundle_id', bundle_id,
  'source_thread_id', source_thread_id,
  'manifest_sha256', package_manifest_sha256,
  'activation_allowed', activation_allowed,
  'source_artifact_count', ${bundle.artifacts.length},
  'storage_row_count', (select count(*) from world_v2.country_candidate_artifact a where a.bundle_id = b.bundle_id),
  'country_count', (select count(*) from world_v2.country_candidate_profile p where p.bundle_id = b.bundle_id),
  'world_head_count', (select count(*) from world_v2.world_head),
  'opening_seed_count', (select count(*) from world_v2.opening_seed)
) as evidence from world_v2.country_candidate_bundle b
where bundle_id = ${sqlLiteral(bundle.candidateId)};
`;
}

export async function renderCountryCandidateBatches(repositoryRoot) {
  const release = await renderCountryCandidateRelease(repositoryRoot);
  const stored = storageArtifacts(release.bundle.artifacts);
  const queries = [batchQuery(release, 'BUNDLE', 0, [])];
  let current = [];
  for (const artifact of stored) {
    const next = [...current, artifact];
    const candidateQuery = batchQuery(
      release,
      'ARTIFACT',
      queries.length,
      next,
    );
    if (
      Buffer.byteLength(JSON.stringify({ query: candidateQuery })) >
      MAX_REQUEST_BYTES
    ) {
      if (current.length === 0)
        throw new Error('COUNTRY_CANDIDATE_ARTIFACT_TOO_LARGE');
      queries.push(batchQuery(release, 'ARTIFACT', queries.length, current));
      current = [artifact];
    } else {
      current = next;
    }
  }
  if (current.length > 0)
    queries.push(batchQuery(release, 'ARTIFACT', queries.length, current));
  queries.push(
    batchQuery(release, 'PROFILE', queries.length, release.bundle.countries),
  );
  if (
    queries.some(
      (query) =>
        Buffer.byteLength(JSON.stringify({ query })) > MAX_REQUEST_BYTES,
    )
  ) {
    throw new Error('COUNTRY_CANDIDATE_REQUEST_LIMIT_EXCEEDED');
  }
  const final = finalQuery(release, stored.length);
  if (Buffer.byteLength(JSON.stringify({ query: final })) > MAX_REQUEST_BYTES) {
    throw new Error('COUNTRY_CANDIDATE_FINAL_REQUEST_TOO_LARGE');
  }
  return Object.freeze({
    queries: Object.freeze(queries),
    final,
    sourceArtifacts: release.bundle.artifacts.length,
    storageRows: stored.length,
    countries: release.bundle.countries.length,
    maxRequestBytes: Math.max(
      ...queries.map((query) => Buffer.byteLength(JSON.stringify({ query }))),
      Buffer.byteLength(JSON.stringify({ query: final })),
    ),
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const [repositoryRoot, outputDirectory] = process.argv.slice(2);
  if (!repositoryRoot || !outputDirectory) {
    throw new Error(
      'usage: node render-country-candidate-batches.mjs SOURCE_ROOT OUTPUT_DIRECTORY',
    );
  }
  const result = await renderCountryCandidateBatches(
    path.resolve(repositoryRoot),
  );
  await mkdir(outputDirectory, { recursive: true });
  for (const [index, query] of result.queries.entries()) {
    await writeFile(
      path.join(
        outputDirectory,
        `batch-${String(index).padStart(3, '0')}.json`,
      ),
      JSON.stringify({ query }),
    );
  }
  await writeFile(
    path.join(outputDirectory, 'final.json'),
    JSON.stringify({ query: result.final }),
  );
  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    JSON.stringify({
      batchCount: result.queries.length,
      sourceArtifacts: result.sourceArtifacts,
      storageRows: result.storageRows,
      countries: result.countries,
      maxRequestBytes: result.maxRequestBytes,
    }),
  );
  process.stdout.write(
    JSON.stringify({
      batchCount: result.queries.length,
      sourceArtifacts: result.sourceArtifacts,
      storageRows: result.storageRows,
      countries: result.countries,
      maxRequestBytes: result.maxRequestBytes,
    }) + '\n',
  );
}
