import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const recordPath = 'docs/reports/brand-shell-20261010/SOURCE.json';
const countryRecordPath = 'docs/reports/country-context-20261010/SOURCE.json';
// Fixed source package for this visual candidate; changing it requires review.
export const brandRecordSha256 =
  '6f18b13680d943d9de02d6d232de5f267629a7791d150a333e208a3ae21872c3';
export const countryRecordSha256 =
  '356cf7aabd1e5cd47bfbc60b6b0457c4edbda1c03e0b2f18807841b35b2c0855';
const deltaRecordPath =
  'docs/reports/G_SCENE_LAKE_REPAIR_20261018/BRAND_SOURCE_DELTA.json';
export const brandSourceDeltaSha256 =
  '2b381e93354c1e50b6d7f8e5f97eb05401e02c9660bd73ddab5ef6c6f523ab89';
const sourceDeltaProofs = new WeakMap();
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const pageMounts = Object.freeze({
  'season1-immersive/index.html':
    '<script type="module" src="../brand-shell.js" data-econmind-brand-mount></script>',
  'season1-immersive/countries/index.html':
    '<script type="module" src="../../brand-shell.js" data-econmind-brand-mount></script>',
  ...Object.fromEntries(
    Array.from({ length: 70 }, (_, index) => [
      `season1-immersive/countries/${String(index + 1).padStart(2, '0')}/index.html`,
      '<script type="module" src="../../../brand-shell.js" data-econmind-brand-mount></script>',
    ]),
  ),
});

export function verifyBrandRecord(bytes) {
  if (sha256(bytes) !== brandRecordSha256)
    throw new Error('BRAND_SOURCE_RECORD_HASH_MISMATCH');
  return JSON.parse(bytes.toString('utf8'));
}

// A separate fixed record preserves the old records and binds only four reviewed
// source postimages. It grants no changes to selected HTML, archives or map data.
export function verifyBrandSourceDelta(bytes) {
  if (sha256(bytes) !== brandSourceDeltaSha256)
    throw new Error('BRAND_SOURCE_DELTA_RECORD_HASH_MISMATCH');
  const delta = JSON.parse(bytes.toString('utf8'));
  const expected = [
    [recordPath, 'apps/world-web/package.json'],
    [recordPath, 'apps/world-web/src/world-preview/PublicWorldMap.tsx'],
    [recordPath, 'apps/world-web/src/world-preview/PublicWorldPreview.tsx'],
    [countryRecordPath, 'apps/world-web/src/map-explorer/WorldExplorer.tsx'],
  ];
  if (
    delta.schemaVersion !== 'BRAND_REVIEWED_SOURCE_DELTA_V1' ||
    delta.historicalRecordPins[recordPath] !== brandRecordSha256 ||
    delta.historicalRecordPins[countryRecordPath] !== countryRecordSha256 ||
    JSON.stringify(delta.rows.map((r) => [r.sourceRecord, r.path])) !==
      JSON.stringify(expected)
  )
    throw new Error('BRAND_SOURCE_DELTA_SCOPE_INVALID');
  const proof = Object.freeze({});
  sourceDeltaProofs.set(proof, delta.rows);
  return proof;
}

export function verifyBrandAdaptedSource(bytes, file, sourceRecord, proof) {
  const rows = sourceDeltaProofs.get(proof);
  if (!rows) throw new Error('BRAND_SOURCE_DELTA_PROOF_REQUIRED');
  const row = rows.find(
    (r) => r.path === file.path && r.sourceRecord === sourceRecord,
  );
  if (
    row &&
    (row.before.bytes !== file.bytes || row.before.sha256 !== file.sha256)
  )
    throw new Error('BRAND_SOURCE_DELTA_HISTORY_MISMATCH');
  const expected = row?.after ?? file;
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256)
    throw new Error(
      sourceRecord === countryRecordPath
        ? `COUNTRY_CONTEXT_SOURCE_HASH_MISMATCH:${file.path}`
        : `BRAND_ADAPTED_SOURCE_HASH_MISMATCH:${file.path}`,
    );
}

export function deriveBrandPage(page, bytes, record) {
  const input = record.immutablePageInputs.find((row) => row.path === page);
  const mount = pageMounts[page];
  if (!input || !mount) throw new Error('BRAND_PAGE_NOT_SELECTED');
  if (bytes.length !== input.bytes || sha256(bytes) !== input.sha256)
    throw new Error('BRAND_PAGE_INPUT_HASH_MISMATCH');
  const html = bytes.toString('utf8');
  if (
    html.split('</head>').length !== 2 ||
    html.includes('data-econmind-brand-mount')
  )
    throw new Error('BRAND_PAGE_MOUNT_INVALID');
  const derived = Buffer.from(html.replace('</head>', `${mount}</head>`));
  if (!Buffer.from(derived.toString('utf8').replace(mount, '')).equals(bytes))
    throw new Error('BRAND_PAGE_RECONSTRUCTION_MISMATCH');
  return derived;
}

export function verifyDerivedBrandPage(page, original, output, record) {
  if (!deriveBrandPage(page, original, record).equals(output))
    throw new Error('BRAND_DERIVED_PAGE_HASH_MISMATCH');
}

export async function publishBrandShell(root = repositoryRoot) {
  const record = verifyBrandRecord(await readFile(path.join(root, recordPath)));
  const countryBytes = await readFile(path.join(root, countryRecordPath));
  if (sha256(countryBytes) !== countryRecordSha256)
    throw new Error('COUNTRY_CONTEXT_RECORD_HASH_MISMATCH');
  const countryRecord = JSON.parse(countryBytes.toString('utf8'));
  const deltaProof = verifyBrandSourceDelta(
    await readFile(path.join(root, deltaRecordPath)),
  );
  for (const file of [
    ...countryRecord.immutableInputs,
    ...countryRecord.adaptedSources,
  ]) {
    const bytes = await readFile(path.join(root, file.path));
    verifyBrandAdaptedSource(bytes, file, countryRecordPath, deltaProof);
  }
  for (const file of record.adaptedSources) {
    const bytes = await readFile(path.join(root, file.path));
    verifyBrandAdaptedSource(bytes, file, recordPath, deltaProof);
  }
  const outputRoot = path.join(root, 'apps/world-web/dist');
  const entry = await readFile(path.join(outputRoot, 'brand-shell.js'));
  const prepared = [];
  for (const page of Object.keys(pageMounts)) {
    const source = await readFile(
      path.join(root, 'apps/world-web/public', page),
    );
    const destination = path.join(outputRoot, page);
    const current = await readFile(destination);
    // Before the existing read-config stage, Vite must have copied exact originals.
    if (!current.equals(source))
      throw new Error('BRAND_BUILD_INPUT_NOT_SOURCE');
    const derived = deriveBrandPage(page, source, record);
    verifyDerivedBrandPage(page, source, derived, record);
    prepared.push({ page, destination, source, derived });
  }
  // Validate the whole package before writing either derived HTML output.
  for (const row of prepared) await writeFile(row.destination, row.derived);
  const provenance = {
    sourceRecordSha256: brandRecordSha256,
    countryContextRecordSha256: countryRecordSha256,
    sourceDeltaRecordSha256: brandSourceDeltaSha256,
    sourceCommit: record.sourceCommit,
    worldBaseCommit: record.worldBaseCommit,
    phase: 'before existing official-source-read configuration',
    entry: {
      path: 'brand-shell.js',
      bytes: entry.length,
      sha256: sha256(entry),
    },
    pages: prepared.map(({ page, source, derived }) => ({
      path: page,
      original: { bytes: source.length, sha256: sha256(source) },
      output: { bytes: derived.length, sha256: sha256(derived) },
    })),
  };
  await writeFile(
    path.join(outputRoot, 'brand-shell-provenance.json'),
    JSON.stringify(provenance, null, 2) + '\n',
  );
  return {
    status: 'PASS',
    pages: prepared.length,
    sourceRecordSha256: brandRecordSha256,
    sourceArchivesChanged: false,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 2)
    throw new Error('No custom CLI paths accepted');
  console.log(JSON.stringify(await publishBrandShell()));
}
