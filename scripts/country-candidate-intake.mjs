import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COUNTRY_CANDIDATE_ID = 'MAP_LOCKED_2026_09_28';
export const COUNTRY_CANDIDATE_SOURCE_THREAD =
  '01a0e1b0-603c-7e13-81de-2cddb9c5d4c1';
export const COUNTRY_CANDIDATE_ROOT =
  'data/country-candidates/2026-09-28-map-locked';
export const EXPECTED_COUNTRY_COUNT = 70;
export const EXPECTED_POPULATION = 14714012813;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readVerified(root, relativePath, expectedHash) {
  const bytes = await readFile(path.join(root, relativePath));
  const actualHash = sha256(bytes);
  if (actualHash !== expectedHash) {
    throw new Error(`COUNTRY_CANDIDATE_HASH_MISMATCH:${relativePath}`);
  }
  const content = bytes.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(bytes)) {
    throw new Error(`COUNTRY_CANDIDATE_NOT_UTF8:${relativePath}`);
  }
  return Object.freeze({ path: relativePath, sha256: actualHash, content });
}

export async function loadCountryCandidate(repositoryRoot) {
  const root = path.join(repositoryRoot, COUNTRY_CANDIDATE_ROOT);
  const handoff = JSON.parse(
    await readFile(path.join(root, 'handoff-manifest.json'), 'utf8'),
  );
  const manifestBytes = await readFile(
    path.join(root, 'package-manifest.json'),
  );
  const manifestHash = sha256(manifestBytes);
  if (
    handoff.recipientThread !== '01a08bf9-fe19-7440-88fa-159677b611bd' ||
    handoff.files?.dataManifest?.sha256 !== manifestHash ||
    handoff.verification?.activationAllowed !== false
  ) {
    throw new Error('COUNTRY_CANDIDATE_HANDOFF_MISMATCH');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (
    manifest.status !== 'ILLUSTRATIVE_PLANNING_ONLY' ||
    manifest.authority !== 'NOT_CORE_OR_PRODUCTION'
  ) {
    throw new Error('COUNTRY_CANDIDATE_AUTHORITY_MISMATCH');
  }
  const artifacts = [];
  for (const [name, hash] of Object.entries(manifest.sourceJson)) {
    artifacts.push(await readVerified(root, name, hash));
  }
  for (const [name, metadata] of Object.entries(manifest.tables)) {
    const artifact = await readVerified(
      root,
      `tables/${name}.csv`,
      metadata.sha256,
    );
    const rows = artifact.content.trimEnd().split(/\r?\n/u);
    if (rows.length !== metadata.rows + 1) {
      throw new Error(`COUNTRY_CANDIDATE_ROW_COUNT_MISMATCH:${name}`);
    }
    artifacts.push(artifact);
  }
  const allTables = await readVerified(
    root,
    'tables/all_tables.json',
    manifest.allTablesJsonSha256,
  );
  artifacts.push(allTables);
  artifacts.push(
    Object.freeze({
      path: 'package-manifest.json',
      sha256: manifestHash,
      content: manifestBytes.toString('utf8'),
    }),
  );
  const validationBytes = await readFile(
    path.join(root, 'package-validation.json'),
  );
  artifacts.push(
    Object.freeze({
      path: 'package-validation.json',
      sha256: sha256(validationBytes),
      content: validationBytes.toString('utf8'),
    }),
  );
  if (artifacts.length !== 23)
    throw new Error('COUNTRY_CANDIDATE_ARTIFACT_COUNT');

  const tables = JSON.parse(allTables.content);
  for (const [name, metadata] of Object.entries(manifest.tables)) {
    if (!Array.isArray(tables[name]) || tables[name].length !== metadata.rows) {
      throw new Error(`COUNTRY_CANDIDATE_JSON_ROW_COUNT_MISMATCH:${name}`);
    }
  }
  const countries = tables.country_summary;
  const ids = new Set(countries.map((row) => row.countryId));
  if (
    countries.length !== EXPECTED_COUNTRY_COUNT ||
    ids.size !== EXPECTED_COUNTRY_COUNT ||
    countries.some(
      (row) =>
        !/^visual-territory-(?:0[1-9]|[1-6][0-9]|70)$/u.test(row.countryId) ||
        row.activationAllowed !== false ||
        row.bindingStatus !== 'UNBOUND' ||
        row.facilityLifecycle !== 'CANDIDATE_NOT_OPERATIONAL',
    ) ||
    countries.reduce((sum, row) => sum + row.population, 0) !==
      EXPECTED_POPULATION
  ) {
    throw new Error('COUNTRY_CANDIDATE_COUNTRY_INVARIANT_FAILED');
  }
  const validation = JSON.parse(validationBytes.toString('utf8'));
  if (validation.status !== 'PASS') {
    throw new Error('COUNTRY_CANDIDATE_SOURCE_VALIDATION_FAILED');
  }
  return Object.freeze({
    candidateId: COUNTRY_CANDIDATE_ID,
    sourceThread: COUNTRY_CANDIDATE_SOURCE_THREAD,
    manifestSha256: manifestHash,
    sourceStatus: manifest.status,
    activationAllowed: false,
    artifacts: Object.freeze(artifacts),
    countries: Object.freeze(countries),
    tableCounts: Object.freeze(
      Object.fromEntries(
        Object.entries(manifest.tables).map(([name, meta]) => [
          name,
          meta.rows,
        ]),
      ),
    ),
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const repositoryRoot = path.resolve(process.argv[2] ?? '.');
  const bundle = await loadCountryCandidate(repositoryRoot);
  process.stdout.write(
    JSON.stringify(
      {
        status: 'PASS',
        candidateId: bundle.candidateId,
        sourceThread: bundle.sourceThread,
        manifestSha256: bundle.manifestSha256,
        artifactCount: bundle.artifacts.length,
        countryCount: bundle.countries.length,
        population: EXPECTED_POPULATION,
        activationAllowed: bundle.activationAllowed,
        tableCounts: bundle.tableCounts,
      },
      null,
      2,
    ) + '\n',
  );
}
