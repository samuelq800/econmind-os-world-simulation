import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isBuiltin } from 'node:module';

import ts from 'typescript';

import {
  architecturalEdgeViolation,
  classifyArchitecturePath,
  OWNERS,
  PACKAGE_OWNERS,
} from './architecture-ownership.mjs';

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

  for (const relativeRoot of PACKAGE_OWNERS.keys()) {
    const packageName = `@econmind/${path.basename(relativeRoot)}`;
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
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'glob' &&
        ts.isMetaProperty(node.expression.expression) &&
        node.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        record(node, 'vite-glob', null);
      } else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
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

function cleanSpecifier(specifier) {
  // Vite postfixes do not change the architectural owner of local modules.
  return specifier.replace(/[?#].+$/u, (postfix, offset) =>
    offset === 0 ? postfix : '',
  );
}

function resolveTarget({ compilerOptions, filePath, specifier }) {
  const resolution = ts.resolveModuleName(
    specifier,
    filePath,
    compilerOptions,
    ts.sys,
  ).resolvedModule;
  if (resolution) return safeRealpath(resolution.resolvedFileName);
  // TypeScript does not resolve styles/images; existing local assets still have
  // an owner. Never silently exempt an unresolved path based on its extension.
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    const assetPath = path.resolve(path.dirname(filePath), specifier);
    if (existsSync(assetPath)) return safeRealpath(assetPath);
  }
  return null;
}

function externalViolation(source, specifier) {
  const name = packageNameFromSpecifier(specifier);
  if (
    source.packageName === 'core' &&
    (name === 'react' || name === 'react-dom' || name.startsWith('@supabase/'))
  ) {
    return `core cannot depend on ${name}`;
  }
  if (
    (source.owner === OWNERS.WORLD_WEB ||
      source.owner === OWNERS.SHARED_PUBLIC) &&
    source.context !== 'WEB_BUILD_CONFIG' &&
    (isBuiltin(specifier) || name === 'server-only')
  ) {
    return `${source.packageName} cannot depend on server-only module ${name}`;
  }
  return null;
}

export function analyzeBoundarySource({
  repositoryRoot,
  filePath,
  source,
  compilerOptionsCache = new Map(),
  workspacePackages = discoverWorkspacePackages(repositoryRoot),
}) {
  const relativeFile = normalizePath(path.relative(repositoryRoot, filePath));
  const sourceArchitecture = classifyArchitecturePath(repositoryRoot, filePath);
  const { references, parseErrors } = parseModuleReferences(source, filePath);
  const violations = parseErrors.map((error) => ({
    file: relativeFile,
    line: error.line,
    rule: 'PARSE_ERROR',
    detail: error.message,
  }));
  if (!sourceArchitecture.governed) {
    violations.push({
      file: relativeFile,
      rule: 'UNKNOWN_ARCHITECTURE_SOURCE',
      detail: 'executable source requires an explicit architectural owner',
    });
  }
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
        detail:
          reference.kind === 'vite-glob'
            ? 'Vite glob imports require an explicit architecture policy; not permitted in V00.1'
            : `${reference.kind} must use a statically resolvable module string`,
      });
      continue;
    }

    const specifier = cleanSpecifier(reference.specifier);
    const target = resolveTarget({ compilerOptions, filePath, specifier });
    const hintedTarget = workspaceTarget(specifier, workspacePackages);
    const targetArchitecture = classifyArchitecturePath(
      repositoryRoot,
      target ?? hintedTarget ?? repositoryRoot,
    );
    const externalReason = externalViolation(sourceArchitecture, specifier);
    const localSpecifier =
      specifier.startsWith('.') || path.isAbsolute(specifier);
    const installedExternal =
      !localSpecifier &&
      !hintedTarget &&
      target &&
      normalizePath(target).includes('/node_modules/') &&
      targetArchitecture.owner === OWNERS.UNKNOWN;
    let rule;
    let detail;
    if (externalReason) {
      rule = 'FORBIDDEN_ARCHITECTURE_DEPENDENCY';
      detail = externalReason;
    } else if (
      (installedExternal || isBuiltin(specifier)) &&
      sourceArchitecture.governed
    ) {
      continue;
    } else {
      rule = architecturalEdgeViolation(sourceArchitecture, targetArchitecture);
      // A reserved forbidden package retains a useful ownership diagnostic even
      // before it exists. An unresolved allowed package cannot become safe.
      if (rule !== 'FORBIDDEN_ARCHITECTURE_DEPENDENCY' && !target) {
        rule = 'UNRESOLVED_ARCHITECTURE_IMPORT';
      }
      detail =
        rule === 'FORBIDDEN_ARCHITECTURE_DEPENDENCY'
          ? `${sourceArchitecture.packageName} cannot import ${targetArchitecture.packageName} implementation (${sourceArchitecture.owner}/${sourceArchitecture.context} -> ${targetArchitecture.owner}/${targetArchitecture.context})`
          : 'local/workspace import has no verified source ownership; boundary check fails closed';
    }
    if (rule) {
      violations.push({
        file: relativeFile,
        line: reference.line,
        import: reference.specifier,
        resolvedTarget: target
          ? normalizePath(path.relative(repositoryRoot, target))
          : null,
        rule,
        detail,
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
