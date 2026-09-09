import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  analyzeBoundarySource,
  createBoundaryContext,
} from './boundary-rules.mjs';

import {
  GOVERNED_ROOTS,
  EXCLUDED_DIRECTORIES,
  SOURCE_EXTENSIONS,
} from './architecture-ownership.mjs';

const defaultRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

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
  const stat = await lstat(directory).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return [];
  if (stat.isSymbolicLink()) {
    throw new Error(
      `UNRESOLVED_ARCHITECTURE_IMPORT: governed source symlink ${directory}`,
    );
  }
  if (!stat.isDirectory()) {
    return SOURCE_EXTENSIONS.has(path.extname(directory).toLowerCase())
      ? [directory]
      : [];
  }
  const entries = await readdir(directory, { withFileTypes: true });

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (EXCLUDED_DIRECTORIES.has(entry.name)) return [];
      return listSourceFiles(entryPath);
    }),
  );

  return nested.flat();
}

export async function scanRepositoryBoundaries(repositoryRoot) {
  const context = createBoundaryContext(repositoryRoot);
  const files = [
    ...new Set(
      (
        await Promise.all(
          GOVERNED_ROOTS.map((root) =>
            listSourceFiles(path.join(context.repositoryRoot, root)),
          ),
        )
      ).flat(),
    ),
  ];
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
        guardedRoots: GOVERNED_ROOTS,
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
