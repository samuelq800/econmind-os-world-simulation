import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

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

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function record(file, sourceFile, node, rule, detail) {
  violations.push({
    file: relative(file),
    line:
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1,
    rule,
    detail,
  });
}

function scriptKind(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (['.js', '.mjs', '.cjs'].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : null;
}

function moduleReference(node) {
  if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
    return { expression: node.moduleSpecifier, kind: 'import' };
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
    return { expression: node.moduleSpecifier, kind: 'export' };
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression
  ) {
    return {
      expression: node.moduleReference.expression,
      kind: 'import-equals',
    };
  }
  if (ts.isCallExpression(node)) {
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      return { expression: node.arguments[0], kind: 'dynamic-import' };
    }
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      return { expression: node.arguments[0], kind: 'require' };
    }
  }
  return null;
}

function packageName(specifier) {
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

function calleeContainsIdentifier(node, names) {
  let found = false;
  const visit = (candidate) => {
    if (ts.isIdentifier(candidate) && names.has(candidate.text)) found = true;
    if (!found) ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function coercionReference(node, aliases) {
  const current = unwrapExpression(node);
  if (ts.isIdentifier(current)) return aliases.has(current.text);
  if (ts.isPropertyAccessExpression(current)) {
    return aliases.has(current.name.text);
  }
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    const name = literalText(current.argumentExpression);
    return name !== null && aliases.has(name);
  }
  if (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    current.expression.name.text === 'bind'
  ) {
    return coercionReference(current.expression.expression, aliases);
  }
  return false;
}

function collectCoercionAliases(sourceFile) {
  const aliases = new Set(['Number', 'parseFloat', 'parseInt']);
  let changed = true;
  while (changed) {
    changed = false;
    const visit = (node) => {
      let target;
      let initializer;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer
      ) {
        target = node.name;
        initializer = node.initializer;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        target = node.left;
        initializer = node.right;
      }
      if (target && initializer) {
        if (
          coercionReference(initializer, aliases) &&
          !aliases.has(target.text)
        ) {
          aliases.add(target.text);
          changed = true;
        }
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer
      ) {
        for (const element of node.name.elements) {
          const sourceName = element.propertyName ?? element.name;
          if (
            ts.isIdentifier(element.name) &&
            ts.isIdentifier(sourceName) &&
            aliases.has(sourceName.text) &&
            !aliases.has(element.name.text)
          ) {
            aliases.add(element.name.text);
            changed = true;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return aliases;
}

function analyze(file) {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const fileName = relative(file);
  const core = fileName.startsWith('packages/core/src/');
  const decimalOwner =
    fileName === 'packages/core/src/numeric/world-decimal.ts';
  const simulationClockOwner =
    fileName === 'packages/core/src/time/simulation-clock.ts';
  const testOnly = fileName.startsWith('packages/testkit/');
  const forbiddenCoercionCallees = core
    ? collectCoercionAliases(sourceFile)
    : new Set();

  for (const diagnostic of sourceFile.parseDiagnostics ?? []) {
    violations.push({
      file: fileName,
      line:
        diagnostic.start === undefined
          ? null
          : sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
      rule: 'PARSE_ERROR',
      detail: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    });
  }

  function visit(node) {
    const reference = moduleReference(node);
    if (reference) {
      const specifier = reference.expression
        ? literalText(reference.expression)
        : null;
      if (specifier === null) {
        record(
          file,
          sourceFile,
          node,
          'UNRESOLVED_DYNAMIC_REFERENCE',
          `${reference.kind} must use a literal module specifier`,
        );
      } else {
        const dependency = packageName(specifier);
        if (core && dependency === 'decimal.js' && !decimalOwner) {
          record(
            file,
            sourceFile,
            node,
            'DECIMAL_DEPENDENCY_LEAK',
            'Only the Canonical Numeric Layer may import decimal.js',
          );
        }
        if (
          core &&
          (dependency === 'react' ||
            dependency === 'react-dom' ||
            dependency === 'fast-check' ||
            dependency.startsWith('@supabase/'))
        ) {
          record(
            file,
            sourceFile,
            node,
            'FORBIDDEN_CORE_DEPENDENCY',
            'World Core imported a UI, persistence, or test dependency',
          );
        }
        if (!testOnly && dependency === 'fast-check') {
          record(
            file,
            sourceFile,
            node,
            'FAST_CHECK_RUNTIME_LEAK',
            'fast-check is restricted to tests and packages/testkit',
          );
        }
      }
    }

    if (core) {
      if (
        ts.isIdentifier(node) &&
        ['Date', 'performance', 'setInterval', 'setTimeout'].includes(node.text)
      ) {
        record(
          file,
          sourceFile,
          node,
          'AMBIENT_TIME_LEAK',
          'World Core must receive recorded time input instead of reading ambient clocks or timers',
        );
      }
      if (
        !simulationClockOwner &&
        ts.isBinaryExpression(node) &&
        [ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(
          node.operatorToken.kind,
        ) &&
        [node.left, node.right].some(
          (operand) =>
            (ts.isNumericLiteral(operand) && operand.text === '10') ||
            (ts.isBigIntLiteral(operand) && operand.text === '10n'),
        )
      ) {
        record(
          file,
          sourceFile,
          node,
          'CLOCK_MULTIPLIER_LEAK',
          'Only the Simulation Clock owner may apply the formal 10x conversion',
        );
      }
      if (
        ts.isPrefixUnaryExpression(node) &&
        node.operator === ts.SyntaxKind.PlusToken
      ) {
        record(
          file,
          sourceFile,
          node,
          'FLOATING_POINT_LEAK',
          'Authoritative core code cannot coerce exact values with unary plus',
        );
      }
      if (ts.isCallExpression(node)) {
        const directCoercion =
          calleeContainsIdentifier(node.expression, forbiddenCoercionCallees) ||
          coercionReference(node.expression, forbiddenCoercionCallees);
        const reflectiveCoercion =
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Reflect' &&
          ['apply', 'construct'].includes(node.expression.name.text) &&
          node.arguments[0] !== undefined &&
          coercionReference(node.arguments[0], forbiddenCoercionCallees);
        const toNumber =
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'toNumber';
        if (
          directCoercion ||
          reflectiveCoercion ||
          (toNumber && !decimalOwner)
        ) {
          record(
            file,
            sourceFile,
            node,
            'FLOATING_POINT_LEAK',
            'Authoritative core code cannot convert exact values to JS number',
          );
        }
      }
      if (
        ts.isIdentifier(node) &&
        [
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'navigator',
        ].includes(node.text)
      ) {
        record(
          file,
          sourceFile,
          node,
          'BROWSER_API_LEAK',
          'World Core cannot depend on browser APIs',
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const coreFiles = filesUnder('packages/core/src');
const governedFiles = [
  ...new Set([...filesUnder('apps'), ...filesUnder('packages')]),
];
for (const file of governedFiles) analyze(file);

const result = {
  scannedCoreFiles: coreFiles.length,
  scannedFiles: governedFiles.length,
  status: violations.length === 0 ? 'PASS' : 'FAIL',
  violations,
};
console.log(JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
