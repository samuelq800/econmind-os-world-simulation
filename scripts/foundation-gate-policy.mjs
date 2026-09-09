import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SCRIPTS = [
  'lint',
  'format:check',
  'typecheck',
  'test',
  'test:property',
  'test:boundaries',
  'env:check',
  'migration:validate',
  'migration:rehearse',
  'secrets:check',
  'build',
];
const BYPASS =
  /(?:^|\s)(?:echo|true)(?:\s|$)|\|\|\s*true|--passWithNoTests|--no-verify/u;
const DISABLED_TEST = /\b(?:describe|it|test)\.(?:skip|only|todo)\s*\(/u;

export function assessFoundationGate(scripts, testSources) {
  const violations = [];
  for (const name of REQUIRED_SCRIPTS) {
    const command = scripts[name];
    if (typeof command !== 'string' || command.trim() === '') {
      violations.push(`MISSING_PROTECTED_SCRIPT:${name}`);
    } else if (BYPASS.test(command)) {
      violations.push(`BYPASSED_PROTECTED_SCRIPT:${name}`);
    }
  }
  if (!scripts['test:property']?.includes('tests/property')) {
    violations.push('PROPERTY_SUITE_NOT_WIRED');
  }
  if (
    !scripts['test:boundaries']?.includes('check-boundaries.mjs') ||
    !scripts['test:boundaries']?.includes('check-authoritative-patterns.mjs')
  ) {
    violations.push('ARCHITECTURE_SCANNERS_NOT_WIRED');
  }
  for (const [file, source] of testSources) {
    if (DISABLED_TEST.test(source))
      violations.push(`DISABLED_PROTECTED_TEST:${file}`);
  }
  return { status: violations.length === 0 ? 'PASS' : 'FAIL', violations };
}

function readTests(root) {
  const testRoot = path.join(root, 'tests');
  const sources = new Map();
  if (!existsSync(testRoot)) return sources;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.test\.[cm]?[jt]sx?$/u.test(entry.name)) {
        sources.set(
          path.relative(root, target).replaceAll(path.sep, '/'),
          readFileSync(target, 'utf8'),
        );
      }
    }
  };
  visit(testRoot);
  return sources;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const result = assessFoundationGate(manifest.scripts ?? {}, readTests(root));
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}
