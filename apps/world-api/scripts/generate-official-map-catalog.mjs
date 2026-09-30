import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const manifestPath = path.join(
  root,
  'artifacts/world-map-files-v1/manifest.json',
);
const outputPath = path.join(
  root,
  'apps/world-api/src/integration/generated/official-map-catalog.ts',
);
const expectedManifestSha =
  '9a83b2de3e0da39dae9e485e8de4be5bf236de26d68937c48c7941d7d50f795f';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = await readFile(manifestPath);
if (sha256(bytes) !== expectedManifestSha)
  throw new Error('OFFICIAL_MAP_MANIFEST_HASH_MISMATCH');
const manifest = JSON.parse(bytes.toString('utf8'));
if (
  manifest.packageId !== 'WORLD_MAP_FILES_V1_2026_09_28' ||
  manifest.authority !== 'VERSIONED_FILE_ASSETS_ONLY_NOT_WORLD_STATE' ||
  !Array.isArray(manifest.files) ||
  manifest.files.length !== 203
) {
  throw new Error('OFFICIAL_MAP_MANIFEST_INVALID');
}
const seen = new Set();
const scenes = new Set();
const details = new Set();
const entries = [];
for (const item of manifest.files) {
  if (
    typeof item.path !== 'string' ||
    ![
      'apps/world-web/src/assets/',
      'apps/world-web/src/map-lab/',
      'artifacts/world-geography/',
    ].some((prefix) => item.path.startsWith(prefix)) ||
    item.path
      .split('/')
      .some(
        (part) =>
          part === '' ||
          part === '.' ||
          part === '..' ||
          part.includes('\\') ||
          part.includes('\0'),
      ) ||
    seen.has(item.path) ||
    !Number.isSafeInteger(item.bytes) ||
    item.bytes < 0 ||
    typeof item.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(item.sha256)
  ) {
    throw new Error('OFFICIAL_MAP_FILE_ENTRY_INVALID');
  }
  seen.add(item.path);
  const source = await readFile(path.join(root, item.path));
  if (source.byteLength !== item.bytes || sha256(source) !== item.sha256)
    throw new Error(`OFFICIAL_MAP_FILE_HASH_MISMATCH:${item.path}`);
  const scene = item.path.match(
    /^apps\/world-web\/src\/assets\/country-scenes\/(\d{2})\.png$/u,
  );
  const detail = item.path.match(
    /^apps\/world-web\/src\/assets\/country-detail\/(\d{2})-[a-z-]+\.svg$/u,
  );
  const number = scene?.[1] ?? detail?.[1];
  if (number !== undefined) {
    if (Number(number) < 1 || Number(number) > 70)
      throw new Error('OFFICIAL_MAP_COUNTRY_ID_INVALID');
    (scene ? scenes : details).add(number);
  }
  entries.push({
    path: item.path,
    bytes: item.bytes,
    sha256: item.sha256,
    classification: scene
      ? 'COUNTRY_SCENE'
      : detail
        ? 'COUNTRY_DETAIL'
        : 'GLOBAL_OR_SUPPORT',
    sourceCountryId: number === undefined ? null : `visual-territory-${number}`,
    coreCountryId: number === undefined ? null : `COUNTRY_${number}`,
  });
}
if (scenes.size !== 70 || details.size !== 70)
  throw new Error('OFFICIAL_MAP_COUNTRY_COVERAGE_INVALID');
const sourceCode =
  `// Generated from the verified official map manifest. Run apps/world-api/scripts/generate-official-map-catalog.mjs --check.\n` +
  `export const OFFICIAL_MAP_PACKAGE_ID = 'WORLD_MAP_FILES_V1_2026_09_28' as const;\n` +
  `export const OFFICIAL_MAP_MANIFEST_SHA256 = '${expectedManifestSha}' as const;\n` +
  `export const OFFICIAL_MAP_ASSETS = ${JSON.stringify(entries, null, 2)} as const;\n`;
const generated = await prettier.format(sourceCode, {
  ...(await prettier.resolveConfig(outputPath)),
  filepath: outputPath,
});
if (process.argv.includes('--check')) {
  if ((await readFile(outputPath, 'utf8')) !== generated)
    throw new Error('OFFICIAL_MAP_CATALOG_OUT_OF_DATE');
  console.log(
    JSON.stringify({
      status: 'PASS',
      assets: entries.length,
      scenes: scenes.size,
      details: details.size,
    }),
  );
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated);
  console.log(
    JSON.stringify({
      status: 'GENERATED',
      assets: entries.length,
      scenes: scenes.size,
      details: details.size,
    }),
  );
}
