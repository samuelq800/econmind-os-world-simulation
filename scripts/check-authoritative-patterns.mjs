import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const rootIndex = process.argv.indexOf('--root');
const root =
  rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : defaultRoot;
const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.mts',
  '.cts',
  '.cjs',
]);
const excluded = new Set(['node_modules', 'dist', 'coverage', '.git']);
const violations = [];

function filesUnder(relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (sourceExtensions.has(path.extname(entry.name)))
        files.push(target);
    }
  };
  visit(absoluteRoot);
  return files;
}

function record(file, rule, detail) {
  violations.push({
    file: path.relative(root, file).replaceAll(path.sep, '/'),
    rule,
    detail,
  });
}

for (const file of filesUnder('packages/core/src')) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const source = readFileSync(file, 'utf8');
  if (
    /from\s+['"]decimal\.js['"]|require\(['"]decimal\.js['"]\)/u.test(source) &&
    relative !== 'packages/core/src/numeric/world-decimal.ts'
  ) {
    record(
      file,
      'DECIMAL_DEPENDENCY_LEAK',
      'Only the Canonical Numeric Layer may import decimal.js',
    );
  }
  if (
    /\b(?:parseFloat|Number)\s*\(|\.toNumber\s*\(/u.test(source) &&
    relative !== 'packages/core/src/numeric/world-decimal.ts'
  ) {
    record(
      file,
      'FLOATING_POINT_LEAK',
      'Authoritative core code cannot convert exact values to JS number',
    );
  }
  if (
    /\b(?:window|document|localStorage|sessionStorage|navigator)\b/u.test(
      source,
    )
  ) {
    record(
      file,
      'BROWSER_API_LEAK',
      'World Core cannot depend on browser APIs',
    );
  }
  if (/from\s+['"](?:react|react-dom|@supabase\/|fast-check)/u.test(source)) {
    record(
      file,
      'FORBIDDEN_CORE_DEPENDENCY',
      'World Core imported a UI, persistence, or test dependency',
    );
  }
}

for (const parent of ['apps', 'packages']) {
  for (const file of filesUnder(parent)) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    if (relative.startsWith('packages/testkit/')) continue;
    const source = readFileSync(file, 'utf8');
    if (
      /from\s+['"]fast-check['"]|require\(['"]fast-check['"]\)/u.test(source)
    ) {
      record(
        file,
        'FAST_CHECK_RUNTIME_LEAK',
        'fast-check is restricted to tests and packages/testkit',
      );
    }
  }
}

const result = {
  scannedCoreFiles: filesUnder('packages/core/src').length,
  status: violations.length === 0 ? 'PASS' : 'FAIL',
  violations,
};
console.log(JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
