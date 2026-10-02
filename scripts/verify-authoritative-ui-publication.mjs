import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const visualArtifactPath =
  'apps/world-web/public/shared/econmind-os-visual.css';
const visualSourcePath = 'role-prototypes/shared/econmind-os-visual.css';
const immersiveSourcePath = 'role-prototypes/season1-immersive/index.html';
const visualMount = Buffer.from(
  '<link rel="stylesheet" href="../shared/econmind-os-visual.css">',
);

// A reviewed visual integration has two exact exceptions; the archive remains immutable.
// SOURCE.json is a review-bound derived artifact record, never a replacement UI MANIFEST.
export function verifyVisualOrOriginalBytes({
  sourcePath,
  bytes,
  entry,
  adaptedOutput,
}) {
  if (sourcePath === visualSourcePath) {
    if (
      adaptedOutput?.path !== visualArtifactPath ||
      !Number.isSafeInteger(adaptedOutput.bytes) ||
      adaptedOutput.bytes <= 0 ||
      !/^[a-f0-9]{64}$/u.test(adaptedOutput.sha256 ?? '')
    )
      throw new Error('UI_VISUAL_ARTIFACT_RECORD_INVALID');
    if (
      bytes.length !== adaptedOutput.bytes ||
      hash(bytes) !== adaptedOutput.sha256
    ) {
      throw new Error(`UI_VISUAL_ARTIFACT_HASH_MISMATCH:${sourcePath}`);
    }
    return 'visual';
  }
  if (!entry) throw new Error(`UI_FILE_NOT_IN_SOURCE_MANIFEST:${sourcePath}`);
  if (sourcePath === immersiveSourcePath) {
    const offset = bytes.indexOf(visualMount);
    if (
      offset < 0 ||
      bytes.indexOf(visualMount, offset + visualMount.length) >= 0
    ) {
      throw new Error('UI_VISUAL_MOUNT_NOT_UNIQUE');
    }
    if (
      !bytes
        .subarray(offset + visualMount.length, offset + visualMount.length + 7)
        .equals(Buffer.from('</head>'))
    ) {
      throw new Error('UI_VISUAL_MOUNT_LOCATION_INVALID');
    }
    const restored = Buffer.concat([
      bytes.subarray(0, offset),
      bytes.subarray(offset + visualMount.length),
    ]);
    if (restored.length !== entry.bytes || hash(restored) !== entry.sha256) {
      throw new Error(`UI_FILE_HASH_MISMATCH:${sourcePath}`);
    }
    return 'visual';
  }
  if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) {
    throw new Error(`UI_FILE_HASH_MISMATCH:${sourcePath}`);
  }
  return 'original';
}

async function main() {
  const publicRoot = path.join(root, 'apps/world-web/public');
  const { adaptedOutput } = JSON.parse(
    await readFile(
      path.join(root, 'docs/reports/world-shared-visual/SOURCE.json'),
      'utf8',
    ),
  );
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
  const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
  // The owner-selected UI remains the visual source. These reviewed integration
  // files intentionally diverge to bind the selected 70-country opening data and
  // suppress the old North Harbour local-settlement sample in country mode.
  const derivedUiFiles = new Set(
    [
      'season1-immersive/countries/data/index.json',
      'season1-immersive/countries/countries.js',
      'season1-immersive/game.js',
      'season1-immersive/country-context.js',
      'season1-immersive/country-game.js',
      ...Array.from(
        { length: 70 },
        (_, index) =>
          `season1-immersive/countries/data/${String(index + 1).padStart(2, '0')}.json`,
      ),
    ].map((name) => `role-prototypes/${name}`),
  );

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
  let derivedFiles = 0;
  let visualIntegrationFiles = 0;
  async function verifyFile(absolutePath, sourcePath) {
    const entry = expected.get(sourcePath);
    const bytes = await readFile(absolutePath);
    if (derivedUiFiles.has(sourcePath)) {
      if (!entry)
        throw new Error(`UI_FILE_NOT_IN_SOURCE_MANIFEST:${sourcePath}`);
      if (
        bytes.length === 0 ||
        (bytes.length === entry.bytes && hash(bytes) === entry.sha256)
      ) {
        throw new Error(`UI_DERIVED_FILE_NOT_UPDATED:${sourcePath}`);
      }
      derivedFiles += 1;
      return;
    }
    const kind = verifyVisualOrOriginalBytes({
      sourcePath,
      bytes,
      entry,
      adaptedOutput,
    });
    if (kind === 'visual') visualIntegrationFiles += 1;
    else verifiedFiles += 1;
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
  if (visualIntegrationFiles !== 2)
    throw new Error('UI_VISUAL_INTEGRATION_FILE_COUNT_MISMATCH');
  if (derivedFiles !== derivedUiFiles.size) {
    throw new Error('UI_DERIVED_FILE_COUNT_MISMATCH');
  }

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

  const siteEntry = await readFile(
    path.join(root, selection.siteEntry),
    'utf8',
  );
  if (
    !siteEntry.includes('<div id="root"></div>') ||
    !siteEntry.includes('src="/src/main.tsx"') ||
    !siteEntry.includes(
      'href="./season1-immersive/?role=finance&amp;country=01#country"',
    ) ||
    siteEntry.includes('http-equiv="refresh"')
  ) {
    throw new Error('UI_DEFAULT_SITE_ENTRY_MISMATCH');
  }
  await readFile(path.join(root, selection.legacyEntry));

  process.stdout.write(
    JSON.stringify({
      status: 'PASS',
      selectionId: selection.selectionId,
      verifiedPublishedFiles: verifiedFiles,
      derivedFiles,
      visualIntegrationFiles,
      countryPages: 70,
      reusedMapAssets: 140,
      economicStateConnected: false,
    }) + '\n',
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
