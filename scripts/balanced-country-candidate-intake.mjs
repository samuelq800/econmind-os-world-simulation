import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const BALANCED_CANDIDATE_ID = 'BALANCED_2026_09_28_V1';
export const BALANCED_CANDIDATE_SOURCE_THREAD =
  '01a0e1b0-603c-7e13-81de-2cddb9c5d4c1';
export const BALANCED_CANDIDATE_ROOT = 'artifacts/world-balanced-candidate-v1';
export const BALANCED_POPULATION = 14_712_146_434;
const EXPECTED_CHECKSUM_ENTRIES = 86;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function checkedRelativePath(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.startsWith('../') ||
    value === '..'
  ) {
    throw new Error('BALANCED_CANDIDATE_INVALID_SOURCE_PATH');
  }
  return value;
}

function storagePath(relativePath) {
  // The existing candidate table deliberately permits ASCII-only keys. A
  // reversible UTF-8 hex path preserves Chinese source filenames exactly.
  return `source/${Buffer.from(relativePath, 'utf8').toString('hex')}`;
}

async function verifiedUtf8File(root, sourcePath, expected) {
  const relativePath = checkedRelativePath(sourcePath);
  const bytes = await readFile(path.join(root, relativePath));
  const actualHash = sha256(bytes);
  if (bytes.length !== expected.bytes || actualHash !== expected.sha256) {
    throw new Error(`BALANCED_CANDIDATE_SOURCE_MISMATCH:${relativePath}`);
  }
  const content = bytes.toString('utf8');
  if (!Buffer.from(content, 'utf8').equals(bytes)) {
    throw new Error(`BALANCED_CANDIDATE_NOT_UTF8:${relativePath}`);
  }
  return Object.freeze({
    sourcePath: relativePath,
    path: storagePath(relativePath),
    sha256: actualHash,
    content,
  });
}

export async function loadBalancedCountryCandidate(repositoryRoot) {
  const root = path.join(repositoryRoot, BALANCED_CANDIDATE_ROOT);
  const checksumBytes = await readFile(path.join(root, 'CHECKSUMS.json'));
  const checksumText = checksumBytes.toString('utf8');
  if (!Buffer.from(checksumText, 'utf8').equals(checksumBytes)) {
    throw new Error('BALANCED_CANDIDATE_CHECKSUMS_NOT_UTF8');
  }
  const manifestHash = sha256(checksumBytes);
  const checksums = JSON.parse(checksumText);
  if (
    !Array.isArray(checksums) ||
    checksums.length !== EXPECTED_CHECKSUM_ENTRIES ||
    new Set(checksums.map((entry) => entry.path)).size !== checksums.length
  ) {
    throw new Error('BALANCED_CANDIDATE_CHECKSUM_MANIFEST_INVALID');
  }
  const artifacts = [];
  for (const entry of checksums) {
    if (
      typeof entry?.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0
    ) {
      throw new Error('BALANCED_CANDIDATE_CHECKSUM_ENTRY_INVALID');
    }
    artifacts.push(await verifiedUtf8File(root, entry.path, entry));
  }
  artifacts.push(
    Object.freeze({
      sourcePath: 'CHECKSUMS.json',
      path: storagePath('CHECKSUMS.json'),
      sha256: manifestHash,
      content: checksumText,
    }),
  );
  const contentBySourcePath = new Map(
    artifacts.map((artifact) => [artifact.sourcePath, artifact.content]),
  );
  const manifest = JSON.parse(contentBySourcePath.get('data/manifest.json'));
  const validation = JSON.parse(contentBySourcePath.get('VALIDATION.json'));
  if (
    manifest.version !== 'WORLD_BALANCED_CANDIDATE_V1' ||
    manifest.status !== 'IMPLEMENTED_UNVERIFIED_CANDIDATE' ||
    manifest.activationAllowed !== false ||
    manifest.worldIdentity !== 'CANDIDATE_ONLY_NO_PRODUCTION_WORLD_ID' ||
    manifest.populationTotalPreserved !== BALANCED_POPULATION ||
    validation.candidateStatus !== 'PASS' ||
    validation.activationAllowed !== false ||
    validation.coreSimulation !== 'NOT_RUN' ||
    validation.independentReview !== 'NOT_CLAIMED' ||
    validation.countries !== 70 ||
    !Array.isArray(validation.candidateChecks) ||
    validation.candidateChecks.some((check) => check.status !== 'PASS')
  ) {
    throw new Error('BALANCED_CANDIDATE_AUTHORITY_OR_VALIDATION_MISMATCH');
  }
  const countries = JSON.parse(contentBySourcePath.get('data/countries.json'));
  const expectedIds = Array.from(
    { length: 70 },
    (_, index) => `visual-territory-${String(index + 1).padStart(2, '0')}`,
  );
  if (
    !Array.isArray(countries) ||
    countries.length !== 70 ||
    countries.reduce((sum, country) => sum + country.population, 0) !==
      BALANCED_POPULATION ||
    countries.some(
      (country, index) =>
        country.id !== expectedIds[index] ||
        !Number.isSafeInteger(country.population) ||
        country.population <= 0,
    )
  ) {
    throw new Error('BALANCED_CANDIDATE_COUNTRY_INVARIANT_FAILED');
  }
  const sourceDrift = [];
  for (const snapshot of manifest.sourceSnapshots) {
    const frozen = contentBySourcePath.get(`inputs/${snapshot.snapshot}`);
    if (
      frozen === undefined ||
      sha256(Buffer.from(frozen, 'utf8')) !== snapshot.sha256
    ) {
      throw new Error(
        `BALANCED_CANDIDATE_FROZEN_INPUT_MISMATCH:${snapshot.snapshot}`,
      );
    }
    const currentBytes = await readFile(
      path.join(repositoryRoot, checkedRelativePath(snapshot.sourcePath)),
    );
    const currentHash = sha256(currentBytes);
    if (currentHash !== snapshot.sha256) {
      sourceDrift.push(
        Object.freeze({
          path: snapshot.sourcePath,
          frozenSha256: snapshot.sha256,
          currentSha256: currentHash,
        }),
      );
    }
  }
  const profiles = countries.map((country) =>
    Object.freeze({
      ...country,
      countryId: country.id,
      activationAllowed: false,
    }),
  );
  return Object.freeze({
    candidateId: BALANCED_CANDIDATE_ID,
    sourceThread: BALANCED_CANDIDATE_SOURCE_THREAD,
    manifestSha256: manifestHash,
    sourceStatus: manifest.status,
    activationAllowed: false,
    artifacts: Object.freeze(artifacts),
    countries: Object.freeze(profiles),
    sourceDrift: Object.freeze(sourceDrift),
    population: BALANCED_POPULATION,
  });
}
