const IMPORT_PATTERN =
  /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/gu;

const WEB_FORBIDDEN = [
  /^@econmind\/persistence(?:\/|$)/u,
  /^@econmind\/world-api(?:\/|$)/u,
  /^@econmind\/world-worker(?:\/|$)/u,
  /server-only/u,
  /service-role/u,
  /authoritative-settlement/u,
];

const CORE_FORBIDDEN = [
  /^react(?:\/|$)/u,
  /^react-dom(?:\/|$)/u,
  /^@supabase\//u,
  /^@econmind\/ui(?:\/|$)/u,
];

export function extractImportSpecifiers(source) {
  return [...source.matchAll(IMPORT_PATTERN)].map(
    (match) => match[1] ?? match[2] ?? match[3],
  );
}

export function violationsFor(relativePath, source) {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const rules = normalizedPath.startsWith('apps/world-web/')
    ? WEB_FORBIDDEN
    : normalizedPath.startsWith('packages/core/')
      ? CORE_FORBIDDEN
      : [];

  return extractImportSpecifiers(source).flatMap((specifier) =>
    rules.some((rule) => rule.test(specifier))
      ? [{ file: normalizedPath, import: specifier }]
      : [],
  );
}
