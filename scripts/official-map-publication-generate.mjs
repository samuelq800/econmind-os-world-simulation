import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  loadOfficialMapPublication,
  publicationDirectory,
  renderOfficialMapDirectory,
  repositoryRoot,
  serializeOfficialMapIndex,
} from './official-map-publication-index.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 || !['--check', '--write'].includes(args[0]))
  throw new Error(
    'Use --check or --write; original source files are never regenerated',
  );
const index = await loadOfficialMapPublication();
const publicRoot = path.join(
  repositoryRoot,
  'apps/world-web/public',
  publicationDirectory,
);
for (const [name, contents] of [
  ['index.json', serializeOfficialMapIndex(index)],
  ['index.html', renderOfficialMapDirectory(index)],
]) {
  const destination = path.join(publicRoot, name);
  if (args[0] === '--check') {
    if ((await readFile(destination, 'utf8')) !== contents)
      throw new Error(`OFFICIAL_MAP_PUBLIC_INDEX_OUT_OF_DATE:${name}`);
  } else {
    await mkdir(publicRoot, { recursive: true });
    await writeFile(destination, contents);
  }
}
console.log(
  JSON.stringify({
    status: args[0] === '--check' ? 'PASS' : 'GENERATED',
    ...index.counts,
    sourceFilesModified: false,
  }),
);
