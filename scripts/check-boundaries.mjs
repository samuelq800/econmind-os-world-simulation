import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { violationsFor } from './boundary-rules.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const roots = ['apps/world-web/src', 'packages/core/src'];
const extensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

async function listSourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listSourceFiles(entryPath);
      }
      return extensions.has(path.extname(entry.name)) ? [entryPath] : [];
    }),
  );

  return nested.flat();
}

const files = (
  await Promise.all(
    roots.map((root) => listSourceFiles(path.join(repositoryRoot, root))),
  )
).flat();
const violations = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const relativePath = path.relative(repositoryRoot, file);
  violations.push(...violationsFor(relativePath, source));
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL', violations }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    { status: 'PASS', scannedFiles: files.length, guardedRoots: roots },
    null,
    2,
  ),
);
