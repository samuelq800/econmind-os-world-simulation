import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadOfficialMapPublication,
  publicationDirectory,
  readVerifiedSource,
  renderOfficialMapDirectory,
  repositoryRoot,
  serializeOfficialMapIndex,
  sha256,
} from './official-map-publication-index.mjs';

async function walk(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('OFFICIAL_MAP_OUTPUT_SYMLINK');
    if (entry.isDirectory())
      files.push(
        ...(await walk(path.join(directory, entry.name), `${relative}/`)),
      );
    else files.push(relative);
  }
  return files.sort();
}

export async function verifyOfficialMapOutput(index, outputRoot) {
  const expected = [
    'index.json',
    'index.html',
    `${index.manifestSha256}/index.json`,
    ...index.files.map((entry) =>
      entry.publicationPath.slice(publicationDirectory.length + 1),
    ),
  ].sort();
  const actual = await walk(path.join(outputRoot, publicationDirectory));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('OFFICIAL_MAP_OUTPUT_INVENTORY_MISMATCH');
  for (const file of index.files) {
    const bytes = await readFile(path.join(outputRoot, file.publicationPath));
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw new Error(`OFFICIAL_MAP_OUTPUT_BYTES_MISMATCH:${file.sourcePath}`);
  }
  const serialized = serializeOfficialMapIndex(index);
  for (const relative of [
    `${publicationDirectory}/index.json`,
    index.immutableIndexUrl,
  ]) {
    if (
      (await readFile(path.join(outputRoot, relative), 'utf8')) !== serialized
    )
      throw new Error('OFFICIAL_MAP_OUTPUT_INDEX_MISMATCH');
  }
  if (
    (await readFile(
      path.join(outputRoot, publicationDirectory, 'index.html'),
      'utf8',
    )) !== renderOfficialMapDirectory(index)
  )
    throw new Error('OFFICIAL_MAP_OUTPUT_DIRECTORY_MISMATCH');
  return {
    status: 'PASS',
    ...index.counts,
    liveWorldState: false,
    deploymentVerified: false,
  };
}

export async function measureStaticOutput(outputRoot) {
  const files = await walk(outputRoot);
  let bytes = 0;
  for (const relative of files)
    bytes += (await stat(path.join(outputRoot, relative))).size;
  return { staticOutputFiles: files.length, staticOutputBytes: bytes };
}

// GitHub documents a 1 GB published-site limit. Use the conservative decimal
// byte interpretation; this check does not claim a successful Pages deployment.
export function assertStaticOutputBudget(measurement) {
  const staticOutputBudgetBytes = 1_000_000_000;
  if (
    !Number.isSafeInteger(measurement.staticOutputBytes) ||
    measurement.staticOutputBytes < 0 ||
    measurement.staticOutputBytes > staticOutputBudgetBytes
  )
    throw new Error('OFFICIAL_MAP_PAGES_STATIC_OUTPUT_BUDGET_EXCEEDED');
  return {
    staticOutputBudgetBytes,
    staticOutputRemainingBytes:
      staticOutputBudgetBytes - measurement.staticOutputBytes,
  };
}

export async function publishOfficialMapSources(
  root = repositoryRoot,
  outputRoot = path.join(root, 'apps/world-web/dist'),
) {
  const index = await loadOfficialMapPublication(root);
  const publicRoot = path.join(
    root,
    'apps/world-web/public',
    publicationDirectory,
  );
  // Fail rather than silently changing the committed derived catalogue at build.
  for (const [name, contents] of [
    ['index.json', serializeOfficialMapIndex(index)],
    ['index.html', renderOfficialMapDirectory(index)],
  ]) {
    if ((await readFile(path.join(publicRoot, name), 'utf8')) !== contents)
      throw new Error(`OFFICIAL_MAP_PUBLIC_INDEX_OUT_OF_DATE:${name}`);
  }
  const destination = path.join(outputRoot, publicationDirectory);
  await mkdir(path.join(destination, index.manifestSha256), {
    recursive: true,
  });
  await writeFile(
    path.join(destination, 'index.json'),
    serializeOfficialMapIndex(index),
  );
  await writeFile(
    path.join(destination, 'index.html'),
    renderOfficialMapDirectory(index),
  );
  await writeFile(
    path.join(outputRoot, index.immutableIndexUrl),
    serializeOfficialMapIndex(index),
  );
  for (const entry of index.files) {
    const bytes = await readVerifiedSource(root, entry);
    const fileDestination = path.join(outputRoot, entry.publicationPath);
    await mkdir(path.dirname(fileDestination), { recursive: true });
    await writeFile(fileDestination, bytes);
  }
  const verification = await verifyOfficialMapOutput(index, outputRoot);
  const measurement = await measureStaticOutput(outputRoot);
  return {
    ...verification,
    ...measurement,
    ...assertStaticOutputBudget(measurement),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 2)
    throw new Error('No custom paths accepted by publication CLI');
  console.log(JSON.stringify(await publishOfficialMapSources()));
}
