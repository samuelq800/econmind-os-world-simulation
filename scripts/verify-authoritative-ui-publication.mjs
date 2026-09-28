import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'apps/world-web/public');
const manifest = JSON.parse(
  await readFile(
    path.join(root, 'artifacts/ui-authority/20260928T134420Z/MANIFEST.json'),
    'utf8',
  ),
);
const selection = JSON.parse(
  await readFile(path.join(root, 'status/ui-selection.json'), 'utf8'),
);
const packageRecord = JSON.parse(
  await readFile(
    path.join(root, 'artifacts/ui-authority/20260928T134420Z/PACKAGE.json'),
    'utf8',
  ),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));

if (
  selection.decision !== 'OWNER_SELECTED_SOLE_PAGE_UI_BASELINE' ||
  selection.selectionId !== packageRecord.selectionId ||
  selection.archiveSha256 !== packageRecord.sha256 ||
  selection.sourcePayloadFiles !== expected.size ||
  selection.countryCount !== 70 ||
  selection.offices.length !== 6 ||
  selection.authorityBoundary.localScenarioValues !==
    'PREVIEW_ONLY_NOT_WORLD_STATE' ||
  selection.authorityBoundary.supabaseMutation !== false
) {
  throw new Error('UI_SELECTION_RECORD_INVALID');
}

let verifiedFiles = 0;
async function verifyFile(absolutePath, sourcePath) {
  const entry = expected.get(sourcePath);
  if (!entry) throw new Error(`UI_FILE_NOT_IN_SOURCE_MANIFEST:${sourcePath}`);
  const bytes = await readFile(absolutePath);
  if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) {
    throw new Error(`UI_FILE_HASH_MISMATCH:${sourcePath}`);
  }
  verifiedFiles += 1;
}

async function verifyCopiedTree(relativePath) {
  const absolutePath = path.join(publicRoot, relativePath);
  for (const item of await readdir(absolutePath, { withFileTypes: true })) {
    const child = path.posix.join(relativePath, item.name);
    if (item.isSymbolicLink()) {
      throw new Error(`UI_UNEXPECTED_SYMLINK:${child}`);
    }
    if (item.isDirectory()) {
      await verifyCopiedTree(child);
    } else if (item.isFile()) {
      await verifyFile(
        path.join(publicRoot, child),
        `role-prototypes/${child}`,
      );
    } else {
      throw new Error(`UI_UNEXPECTED_FILE_TYPE:${child}`);
    }
  }
}

await verifyCopiedTree('season1-immersive');
await verifyCopiedTree('shared');
await verifyCopiedTree('specs-markdown-2026-09-27');

for (const [kind, sourceDir, deployedDir] of [
  [
    'scenes',
    'apps/world-web/src/assets/country-scenes',
    'season1-immersive/countries/assets/scenes',
  ],
  [
    'details',
    'apps/world-web/src/assets/country-detail',
    'season1-immersive/countries/assets/details',
  ],
]) {
  const sourcePrefix = `role-prototypes/season1-immersive/countries/assets/${kind}/`;
  const sourceRows = manifest.files.filter((row) =>
    row.path.startsWith(sourcePrefix),
  );
  if (sourceRows.length !== 70) {
    throw new Error(`UI_MAP_ASSET_COUNT_MISMATCH:${kind}`);
  }
  for (const row of sourceRows) {
    await verifyFile(
      path.join(root, sourceDir, path.basename(row.path)),
      row.path,
    );
  }
  if (deployedDir !== `season1-immersive/countries/assets/${kind}`) {
    throw new Error(`UI_MAP_ASSET_DESTINATION_MISMATCH:${kind}`);
  }
}

for (let index = 1; index <= 70; index += 1) {
  const number = String(index).padStart(2, '0');
  for (const relative of [
    `season1-immersive/countries/${number}/index.html`,
    `season1-immersive/countries/data/${number}.json`,
  ]) {
    await readFile(path.join(publicRoot, relative));
  }
}

const siteEntry = await readFile(path.join(root, selection.siteEntry), 'utf8');
if (
  !siteEntry.includes(
    'url=season1-immersive/?role=finance&amp;country=01#country',
  )
) {
  throw new Error('UI_DEFAULT_SITE_ENTRY_MISMATCH');
}
await readFile(path.join(root, selection.legacyEntry));

process.stdout.write(
  JSON.stringify({
    status: 'PASS',
    selectionId: selection.selectionId,
    verifiedPublishedFiles: verifiedFiles,
    countryPages: 70,
    reusedMapAssets: 140,
    economicStateConnected: false,
  }) + '\n',
);
