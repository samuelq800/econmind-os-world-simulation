import path from 'node:path';

export const OWNERS = Object.freeze({
  WORLD_WEB: 'WORLD_WEB',
  WORLD_API: 'WORLD_API',
  WORLD_WORKER: 'WORLD_WORKER',
  SHARED_PUBLIC: 'SHARED_PUBLIC',
  SERVER_ONLY: 'SERVER_ONLY',
  UNKNOWN: 'UNKNOWN',
});

// One registry defines both ownership and complete scan coverage. Unknown new
// packages require an explicit architecture decision, not an implicit public edge.
export const PACKAGE_OWNERS = new Map([
  ['apps/world-web', OWNERS.WORLD_WEB],
  ['apps/world-api', OWNERS.WORLD_API],
  ['apps/world-worker', OWNERS.WORLD_WORKER],
  ['packages/contracts', OWNERS.SHARED_PUBLIC],
  ['packages/core', OWNERS.SHARED_PUBLIC],
  ['packages/registries', OWNERS.SHARED_PUBLIC],
  ['packages/ui', OWNERS.SHARED_PUBLIC],
  ['packages/persistence', OWNERS.SERVER_ONLY],
  ['packages/integration', OWNERS.SERVER_ONLY],
  ['packages/testkit', OWNERS.SERVER_ONLY],
]);

export const BUILD_HELPERS = [
  'scripts/vite-environment-policy.mjs',
  'scripts/vite-environment-policy.d.mts',
];
export const GOVERNED_ROOTS = ['apps', 'packages', ...BUILD_HELPERS];
export const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.vite',
]);
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

export function classifyArchitecturePath(repositoryRoot, filePath) {
  const relativePath = path
    .relative(repositoryRoot, filePath)
    .split(path.sep)
    .join('/');
  const parts = relativePath.split('/');
  const packageRoot = parts.slice(0, 2).join('/');
  const owner = PACKAGE_OWNERS.get(packageRoot) ?? OWNERS.UNKNOWN;
  const excluded = parts.some((part) => EXCLUDED_DIRECTORIES.has(part));
  const helper = BUILD_HELPERS.includes(relativePath);
  const buildConfig =
    relativePath === 'apps/world-web/vite.config.ts' || helper;
  return {
    owner: helper ? OWNERS.SERVER_ONLY : owner,
    context: buildConfig ? 'WEB_BUILD_CONFIG' : 'RUNTIME',
    packageName: parts[1] ?? null,
    relativePath,
    governed: !excluded && (helper || owner !== OWNERS.UNKNOWN),
  };
}

export function architecturalEdgeViolation(source, target) {
  if (!source.governed || !target.governed) {
    return 'UNRESOLVED_ARCHITECTURE_IMPORT';
  }
  if (source.context === 'WEB_BUILD_CONFIG') {
    return target.context === 'WEB_BUILD_CONFIG'
      ? null
      : 'FORBIDDEN_ARCHITECTURE_DEPENDENCY';
  }
  if (target.context === 'WEB_BUILD_CONFIG') {
    return 'FORBIDDEN_ARCHITECTURE_DEPENDENCY';
  }
  if (source.owner === OWNERS.WORLD_WEB) {
    return [OWNERS.WORLD_WEB, OWNERS.SHARED_PUBLIC].includes(target.owner)
      ? null
      : 'FORBIDDEN_ARCHITECTURE_DEPENDENCY';
  }
  if (source.owner === OWNERS.SHARED_PUBLIC) {
    if (target.owner !== OWNERS.SHARED_PUBLIC) {
      return 'FORBIDDEN_ARCHITECTURE_DEPENDENCY';
    }
    if (source.packageName === 'core' && target.packageName === 'ui') {
      return 'FORBIDDEN_ARCHITECTURE_DEPENDENCY';
    }
  }
  return null;
}
