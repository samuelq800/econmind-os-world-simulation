import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

export const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const NON_CODE_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.json',
]);

const RESERVED_WORKSPACE_PACKAGES = new Map([
  ['@econmind/contracts', 'packages/contracts'],
  ['@econmind/core', 'packages/core'],
  ['@econmind/registries', 'packages/registries'],
  ['@econmind/persistence', 'packages/persistence'],
  ['@econmind/integration', 'packages/integration'],
  ['@econmind/ui', 'packages/ui'],
  ['@econmind/testkit', 'packages/testkit'],
]);

const WEB_FORBIDDEN_OWNERS = new Set([
  'world-api',
  'world-worker',
  'persistence',
]);
const CORE_FORBIDDEN_OWNERS = new Set(['world-web', 'ui', 'persistence']);
const SERVER_IMPLEMENTATION_MARKERS =
  /(?:^|\/)(?:server-only|server-secret|service-role|authoritative-settlement)(?:\/|\.|-|$)/iu;

function normalizePath(value) {
  return value.replaceAll(path.sep, '/');
}

function safeRealpath(value) {
  return existsSync(value) ? realpathSync(value) : path.resolve(value);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function sourceOwner(repositoryRoot, filePath) {
  const relativePath = normalizePath(path.relative(repositoryRoot, filePath));
  const match = /^(?:apps|packages)\/([^/]+)(?:\/|$)/u.exec(relativePath);
  return match?.[1] ?? null;
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function discoverWorkspacePackages(repositoryRoot) {
  const packages = new Map();

  for (const parentName of ['apps', 'packages']) {
    const parentPath = path.join(repositoryRoot, parentName);
    if (!existsSync(parentPath)) {
      continue;
    }

    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageRoot = path.join(parentPath, entry.name);
      const manifestPath = path.join(packageRoot, 'package.json');
      if (!existsSync(manifestPath)) {
        continue;
      }

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (typeof manifest.name === 'string') {
        packages.set(manifest.name, packageRoot);
      }
    }
  }

  for (const [packageName, relativeRoot] of RESERVED_WORKSPACE_PACKAGES) {
    if (!packages.has(packageName)) {
      packages.set(packageName, path.join(repositoryRoot, relativeRoot));
    }
  }

  return packages;
}

function configuredCompilerOptions(repositoryRoot, filePath, cache) {
  const configPath = ts.findConfigFile(
    path.dirname(filePath),
    ts.sys.fileExists,
    'tsconfig.json',
  );

  if (!configPath || !isWithin(repositoryRoot, configPath)) {
    return {
      allowJs: true,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2024,
    };
  }

  if (cache.has(configPath)) {
    return cache.get(configPath);
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      `Unable to read ${normalizePath(path.relative(repositoryRoot, configPath))}: ${ts.flattenDiagnosticMessageText(config.error.messageText, '\n')}`,
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );
  const errors = parsed.errors.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      `Invalid ${normalizePath(path.relative(repositoryRoot, configPath))}: ${errors
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )
        .join('; ')}`,
    );
  }

  cache.set(configPath, parsed.options);
  return parsed.options;
}

function scriptKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
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

export function parseModuleReferences(source, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );
  const references = [];

  function record(node, kind, expression) {
    const specifier = expression ? literalText(expression) : null;
    references.push({
      kind,
      specifier,
      line:
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      record(node, 'import', node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      record(node, 'export', node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      record(node, 'import-equals', node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node)) {
      const argument = ts.isLiteralTypeNode(node.argument)
        ? node.argument.literal
        : node.argument;
      record(node, 'import-type', argument);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        record(node, 'dynamic-import', node.arguments[0]);
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        record(node, 'require', node.arguments[0]);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const parseErrors = sourceFile.parseDiagnostics ?? [];
  return {
    references,
    parseErrors: parseErrors.map((diagnostic) => ({
      line:
        diagnostic.start === undefined
          ? null
          : sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    })),
  };
}

function workspaceTarget(specifier, workspacePackages) {
  const packageName = packageNameFromSpecifier(specifier);
  const packageRoot = workspacePackages.get(packageName);
  if (!packageRoot) {
    return null;
  }

  const subpath =
    specifier === packageName ? '' : specifier.slice(packageName.length + 1);
  return path.join(packageRoot, subpath);
}

function resolveTarget({
  compilerOptions,
  filePath,
  specifier,
  workspacePackages,
}) {
  const mappedWorkspaceTarget = workspaceTarget(specifier, workspacePackages);
  if (mappedWorkspaceTarget) {
    return safeRealpath(mappedWorkspaceTarget);
  }

  const resolution = ts.resolveModuleName(
    specifier,
    filePath,
    compilerOptions,
    ts.sys,
  ).resolvedModule;
  return resolution ? safeRealpath(resolution.resolvedFileName) : null;
}

function forbiddenDependencyReason({
  sourceLayer,
  specifier,
  targetLayer,
  targetRelativePath,
}) {
  const packageName = packageNameFromSpecifier(specifier);

  if (sourceLayer === 'world-web') {
    if (targetLayer && WEB_FORBIDDEN_OWNERS.has(targetLayer)) {
      return `world-web cannot import ${targetLayer} implementation`;
    }
    if (
      packageName === 'server-only' ||
      SERVER_IMPLEMENTATION_MARKERS.test(specifier) ||
      (targetRelativePath &&
        SERVER_IMPLEMENTATION_MARKERS.test(targetRelativePath))
    ) {
      return 'world-web cannot import server-only or authority-bearing implementation';
    }
  }

  if (sourceLayer === 'core') {
    if (targetLayer && CORE_FORBIDDEN_OWNERS.has(targetLayer)) {
      return `core cannot import ${targetLayer} implementation`;
    }
    if (
      packageName === 'react' ||
      packageName === 'react-dom' ||
      packageName.startsWith('@supabase/')
    ) {
      return `core cannot depend on ${packageName}`;
    }
  }

  return null;
}

function isCodeLikeSpecifier(specifier) {
  const extension = path.extname(specifier).toLowerCase();
  return extension === '' || !NON_CODE_EXTENSIONS.has(extension);
}

export function analyzeBoundarySource({
  repositoryRoot,
  filePath,
  source,
  compilerOptionsCache = new Map(),
  workspacePackages = discoverWorkspacePackages(repositoryRoot),
}) {
  const relativeFile = normalizePath(path.relative(repositoryRoot, filePath));
  const sourceLayer = sourceOwner(repositoryRoot, filePath);
  const { references, parseErrors } = parseModuleReferences(source, filePath);
  const violations = parseErrors.map((error) => ({
    file: relativeFile,
    line: error.line,
    rule: 'PARSE_ERROR',
    detail: error.message,
  }));
  const compilerOptions = configuredCompilerOptions(
    repositoryRoot,
    filePath,
    compilerOptionsCache,
  );

  for (const reference of references) {
    if (reference.specifier === null) {
      violations.push({
        file: relativeFile,
        line: reference.line,
        rule: 'UNRESOLVED_DYNAMIC_REFERENCE',
        detail: `${reference.kind} must use a statically resolvable module string`,
      });
      continue;
    }

    const target = resolveTarget({
      compilerOptions,
      filePath,
      specifier: reference.specifier,
      workspacePackages,
    });
    const targetWithinRepository = target && isWithin(repositoryRoot, target);
    const targetRelativePath = targetWithinRepository
      ? normalizePath(path.relative(repositoryRoot, target))
      : null;
    const targetLayer = targetWithinRepository
      ? sourceOwner(repositoryRoot, target)
      : null;
    const reason = forbiddenDependencyReason({
      sourceLayer,
      specifier: reference.specifier,
      targetLayer,
      targetRelativePath,
    });

    if (reason) {
      violations.push({
        file: relativeFile,
        line: reference.line,
        import: reference.specifier,
        resolvedTarget: targetRelativePath,
        rule: 'FORBIDDEN_ARCHITECTURE_DEPENDENCY',
        detail: reason,
      });
      continue;
    }

    if (!target && isCodeLikeSpecifier(reference.specifier)) {
      violations.push({
        file: relativeFile,
        line: reference.line,
        import: reference.specifier,
        resolvedTarget: null,
        rule: 'UNRESOLVED_CODE_IMPORT',
        detail:
          'code import could not be resolved; boundary check fails closed',
      });
    }
  }

  return violations;
}

export function createBoundaryContext(repositoryRoot) {
  const resolvedRoot = safeRealpath(repositoryRoot);
  return {
    repositoryRoot: resolvedRoot,
    compilerOptionsCache: new Map(),
    workspacePackages: discoverWorkspacePackages(resolvedRoot),
  };
}
