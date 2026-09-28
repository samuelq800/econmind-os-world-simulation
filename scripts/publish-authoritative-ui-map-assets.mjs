import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'apps/world-web');
const manifest = JSON.parse(
  await readFile(
    path.join(root, 'artifacts/ui-authority/20260928T134420Z/MANIFEST.json'),
    'utf8',
  ),
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

let copied = 0;
for (const [kind, sourceDir] of [
  ['scenes', 'country-scenes'],
  ['details', 'country-detail'],
]) {
  const prefix = `role-prototypes/season1-immersive/countries/assets/${kind}/`;
  const rows = manifest.files.filter((entry) => entry.path.startsWith(prefix));
  if (rows.length !== 70) throw new Error(`UI_MAP_ASSET_COUNT_INVALID:${kind}`);
  const destinationDir = path.join(
    appRoot,
    'dist/season1-immersive/countries/assets',
    kind,
  );
  await mkdir(destinationDir, { recursive: true });
  for (const row of rows) {
    const filename = path.basename(row.path);
    const source = path.join(appRoot, 'src/assets', sourceDir, filename);
    const bytes = await readFile(source);
    if (bytes.length !== row.bytes || hash(bytes) !== row.sha256) {
      throw new Error(`UI_MAP_ASSET_SOURCE_MISMATCH:${row.path}`);
    }
    await copyFile(source, path.join(destinationDir, filename));
    copied += 1;
  }
}

process.stdout.write(
  JSON.stringify({ status: 'PASS', copiedMapAssets: copied }) + '\n',
);
