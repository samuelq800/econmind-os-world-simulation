import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeBoundarySource,
  createBoundaryContext,
  SOURCE_EXTENSIONS,
} from './boundary-rules.mjs';

const defaultRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const guardedRoots = ['apps/world-web/src', 'packages/core/src'];

function parseArguments(arguments_) {
  if (arguments_.length === 0) {
    return { repositoryRoot: defaultRepositoryRoot };
  }
  if (arguments_.length === 2 && arguments_[0] === '--root') {
    return { repositoryRoot: path.resolve(arguments_[1]) };
  }
  throw new Error('Usage: node scripts/check-boundaries.mjs [--root <path>]');
}

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
      return SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ? [entryPath]
        : [];
    }),
  );

  return nested.flat();
}

export async function scanRepositoryBoundaries(repositoryRoot) {
  const context = createBoundaryContext(repositoryRoot);
  const files = (
    await Promise.all(
      guardedRoots.map((root) =>
        listSourceFiles(path.join(context.repositoryRoot, root)),
      ),
    )
  ).flat();
  const violations = [];

  for (const filePath of files) {
    const source = await readFile(filePath, 'utf8');
    violations.push(
      ...analyzeBoundarySource({
        ...context,
        filePath,
        source,
      }),
    );
  }

  return { files, violations };
}

async function main() {
  const { repositoryRoot } = parseArguments(process.argv.slice(2));
  const { files, violations } = await scanRepositoryBoundaries(repositoryRoot);

  if (violations.length > 0) {
    console.error(JSON.stringify({ status: 'FAIL', violations }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        scannedFiles: files.length,
        guardedRoots,
        sourceExtensions: [...SOURCE_EXTENSIONS],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      { status: 'FAIL', configurationError: error.message },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
