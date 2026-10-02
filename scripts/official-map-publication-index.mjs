import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const manifestPath = 'artifacts/world-map-files-v1/manifest.json';
const manifestSha256 =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
const packageId = 'WORLD_MAP_FILES_V1_2026_09_28';
export const publicationDirectory = 'official-map-source';
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

function safeSourcePath(value) {
  return (
    typeof value === 'string' &&
    [
      'apps/world-web/src/assets/',
      'apps/world-web/src/map-lab/',
      'artifacts/world-geography/',
    ].some((prefix) => value.startsWith(prefix)) &&
    value
      .split('/')
      .every(
        (segment) =>
          /^[\p{L}\p{N}._-]+$/u.test(segment) &&
          segment !== '.' &&
          segment !== '..',
      )
  );
}

export async function readVerifiedSource(root, entry) {
  if (!safeSourcePath(entry.sourcePath))
    throw new Error('OFFICIAL_MAP_SOURCE_PATH_INVALID');
  const physicalRoot = await realpath(root);
  const physicalSource = await realpath(path.join(root, entry.sourcePath));
  if (!physicalSource.startsWith(`${physicalRoot}${path.sep}`))
    throw new Error('OFFICIAL_MAP_SOURCE_OUTSIDE_REPOSITORY');
  const bytes = await readFile(physicalSource);
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256)
    throw new Error(`OFFICIAL_MAP_SOURCE_BYTES_MISMATCH:${entry.sourcePath}`);
  return bytes;
}

// Only this selected manifest supplies the file list. No independent inventory.
export async function loadOfficialMapPublication(root = repositoryRoot) {
  const selectionBytes = await readFile(
    path.join(root, 'status/world-data-selection.json'),
  );
  const selection = JSON.parse(selectionBytes.toString('utf8'));
  const selected = selection.mapFiles;
  if (
    selection.decision !== 'OWNER_SELECTED_OFFICIAL_WORLD_V2_DATA_BASELINE' ||
    selected?.packageId !== packageId ||
    selected.manifestPath !== manifestPath ||
    selected.manifestSha256 !== manifestSha256 ||
    selected.fileCount !== 203 ||
    selected.role !== 'OFFICIAL_VERSIONED_MAP_AND_PRESENTATION_ASSETS'
  ) {
    throw new Error('OFFICIAL_MAP_SELECTION_INVALID');
  }
  const manifestBytes = await readFile(path.join(root, manifestPath));
  if (sha256(manifestBytes) !== selected.manifestSha256)
    throw new Error('OFFICIAL_MAP_MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (
    manifest.packageId !== packageId ||
    manifest.authority !== 'VERSIONED_FILE_ASSETS_ONLY_NOT_WORLD_STATE' ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== selected.fileCount
  ) {
    throw new Error('OFFICIAL_MAP_MANIFEST_INVALID');
  }
  const seen = new Set();
  const scenes = new Set();
  const details = new Set();
  const files = [];
  for (const file of manifest.files) {
    if (
      !safeSourcePath(file.path) ||
      seen.has(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      typeof file.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(file.sha256)
    ) {
      throw new Error('OFFICIAL_MAP_MANIFEST_ENTRY_INVALID');
    }
    seen.add(file.path);
    const scene =
      /^apps\/world-web\/src\/assets\/country-scenes\/([0-9]{2})\.png$/u.exec(
        file.path,
      );
    const detail =
      /^apps\/world-web\/src\/assets\/country-detail\/([0-9]{2})-[a-z-]+\.svg$/u.exec(
        file.path,
      );
    const countryNumber = scene?.[1] ?? detail?.[1] ?? null;
    if (countryNumber !== null) {
      if (!/^(?:0[1-9]|[1-6][0-9]|70)$/u.test(countryNumber))
        throw new Error('OFFICIAL_MAP_COUNTRY_INVALID');
      (scene ? scenes : details).add(countryNumber);
    }
    const entry = Object.freeze({
      sourcePath: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      publicationPath: `${publicationDirectory}/${manifestSha256}/files/${file.path}`,
      publicUrl: `${publicationDirectory}/${manifestSha256}/files/${file.path.split('/').map(encodeURIComponent).join('/')}`,
      countryNumber,
      sourceCountryId:
        countryNumber === null ? null : `visual-territory-${countryNumber}`,
      coreCountryId: countryNumber === null ? null : `COUNTRY_${countryNumber}`,
      classification: scene
        ? 'COUNTRY_SCENE'
        : detail
          ? 'COUNTRY_DETAIL'
          : 'GLOBAL_OR_SUPPORT',
      kind: /\.(?:png|svg)$/u.test(file.path) ? 'IMAGE' : 'SUPPORT',
      fileType: path.extname(file.path).slice(1).toUpperCase(),
      thirdPartyRights: 'UNKNOWN',
      nature: 'OFFICIAL_VERSIONED_SOURCE_FILE_NOT_LIVE',
      // File access is not a coordinate projection. Source bytes remain intact.
      coordinates: null,
      coordinateStatus: 'NOT_PROJECTED_SOURCE_FILE_ONLY',
    });
    await readVerifiedSource(root, entry);
    files.push(entry);
  }
  const images = files.filter((file) => file.kind === 'IMAGE').length;
  if (scenes.size !== 70 || details.size !== 70 || images !== 160)
    throw new Error('OFFICIAL_MAP_COVERAGE_INVALID');
  return Object.freeze({
    schemaVersion: 'OFFICIAL_MAP_PUBLICATION_V1',
    packageId,
    authority: manifest.authority,
    selectionPath: 'status/world-data-selection.json',
    selectionSha256: sha256(selectionBytes),
    manifestPath,
    manifestSha256,
    urlBase: 'SITE_ROOT_RELATIVE_REQUIRES_TRAILING_SLASH_SITE_BASE',
    immutableIndexUrl: `${publicationDirectory}/${manifestSha256}/index.json`,
    publicationState: 'BUILD_OUTPUT_REQUIRED_NOT_DEPLOYMENT_EVIDENCE',
    liveWorldState: false,
    proposalFieldsAreExecuted: false,
    sourceFilesModified: false,
    publicationAuthority: 'OWNER_SELECTED_SOURCE_FILES_ONLY',
    thirdPartyRights: 'UNKNOWN',
    thirdPartyRightsProofProvided: false,
    supportFilesExecuted: false,
    counts: Object.freeze({
      files: files.length,
      images,
      support: files.length - images,
      countries: scenes.size,
      countryAssociatedFiles: scenes.size + details.size,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    }),
    files: Object.freeze(files),
  });
}

export function findOfficialMapSource(index, sourcePath) {
  if (!safeSourcePath(sourcePath))
    throw new Error('OFFICIAL_MAP_SOURCE_PATH_INVALID');
  const file = index.files.find((entry) => entry.sourcePath === sourcePath);
  if (!file) throw new Error('OFFICIAL_MAP_SOURCE_NOT_SELECTED');
  return file;
}

export function resolveOfficialMapPublicUrl(index, sourcePath, siteBase) {
  const file = findOfficialMapSource(index, sourcePath);
  const base = new URL(siteBase);
  if (
    !['https:', 'http:'].includes(base.protocol) ||
    !base.pathname.endsWith('/') ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  ) {
    throw new Error('OFFICIAL_MAP_SITE_BASE_INVALID');
  }
  return new URL(file.publicUrl, base).href;
}

export function serializeOfficialMapIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function renderOfficialMapDirectory(index) {
  const rows = index.files
    .map(
      (file) =>
        `<tr><td>${file.countryNumber ?? 'Global / support'}</td><td><a href="./${file.publicUrl.slice(publicationDirectory.length + 1)}">${file.sourcePath}</a></td><td>${file.bytes}</td><td><code>${file.sha256}</code></td></tr>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Official map source files</title></head>
<body><h1>Official map source files</h1>
<p>Selected source files, not live World State. No coordinates or economic permissions are inferred.</p>
<p>Publication follows the owner's source selection. Third-party rights remain UNKNOWN; no third-party rights proof is claimed. Supporting files are source downloads, not executable operations.</p>
<p>${index.counts.files} files: ${index.counts.images} images and ${index.counts.support} supporting files. <a href="./index.json">JSON catalogue</a></p>
<p>Package: <code>${index.packageId}</code><br>Manifest SHA-256: <code>${index.manifestSha256}</code></p>
<table><caption>Original files with verified byte sizes and SHA-256 hashes</caption><thead><tr><th scope="col">Country</th><th scope="col">Source file</th><th scope="col">Bytes</th><th scope="col">SHA-256</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>\n`;
}
