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
  '85222b07a85114bc29058c8e4b27181244ae0c208531a4ed811cb9cdb9974565';
export const countryRecordSha256 =
  'e3f80f09887fb395097179e7f9a492674bfa2b5fd96f8172732a2a28ae973876';
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
  for (const file of [
    ...countryRecord.immutableInputs,
    ...countryRecord.adaptedSources,
  ]) {
    const bytes = await readFile(path.join(root, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw new Error(`COUNTRY_CONTEXT_SOURCE_HASH_MISMATCH:${file.path}`);
  }
  for (const file of record.adaptedSources) {
    const bytes = await readFile(path.join(root, file.path));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw new Error(`BRAND_ADAPTED_SOURCE_HASH_MISMATCH:${file.path}`);
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
