import { findForbiddenBrowserVariables } from './vite-environment-policy.mjs';

const SAFE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SUPPORTED_ENVIRONMENTS = new Set([
  'local',
  'ci',
  'staging',
  'production',
]);

export function assessEnvironment(environment) {
  const name = environment.ECONMIND_ENV;
  const violations = [];

  if (name === undefined || name === '') {
    violations.push('ECONMIND_ENV is required');
  } else if (!SUPPORTED_ENVIRONMENTS.has(name)) {
    violations.push(`Unsupported ECONMIND_ENV: ${name}`);
  }

  for (const { name, category } of findForbiddenBrowserVariables(environment)) {
    violations.push(
      `${name} must never be exposed to browser code; reason=${category}`,
    );
  }

  const configuredUrls = [
    environment.WORLD_DATABASE_URL,
    environment.DATABASE_URL,
  ].filter(Boolean);
  if (configuredUrls.length === 2 && configuredUrls[0] !== configuredUrls[1]) {
    violations.push('WORLD_DATABASE_URL conflicts with DATABASE_URL');
  }
  const databaseUrl = configuredUrls[0];
  let parsedDatabaseUrl;
  if (databaseUrl) {
    try {
      parsedDatabaseUrl = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
        violations.push('World database URL must use PostgreSQL');
      }
      if (
        (name === 'local' || name === 'ci') &&
        !SAFE_LOCAL_HOSTS.has(parsedDatabaseUrl.hostname)
      ) {
        violations.push(`${name} DATABASE_URL must resolve to a loopback host`);
      }
      if (
        name === 'production' &&
        SAFE_LOCAL_HOSTS.has(parsedDatabaseUrl.hostname)
      ) {
        violations.push(
          'production database URL must not resolve to a development host',
        );
      }
    } catch {
      violations.push('World database URL is not valid');
    }
  }

  const expectedFingerprint = name ? `world-v2-${name}` : undefined;
  const fingerprint = environment.WORLD_DATABASE_FINGERPRINT;
  if (databaseUrl && fingerprint !== expectedFingerprint) {
    violations.push(
      `WORLD_DATABASE_FINGERPRINT must identify ${expectedFingerprint ?? 'a valid environment'}`,
    );
  }
  if ((name === 'staging' || name === 'production') && !databaseUrl) {
    violations.push(`${name} requires an explicit World database URL`);
  }
  if (
    environment.WORLD_DATABASE_NAMESPACE !== undefined &&
    environment.WORLD_DATABASE_NAMESPACE !== 'world_v2'
  ) {
    violations.push('WORLD_DATABASE_NAMESPACE must be world_v2');
  }
  if (
    environment.WORLD_DATABASE_MUTATION_MODE !== undefined &&
    environment.WORLD_DATABASE_MUTATION_MODE !== 'disabled'
  ) {
    violations.push(
      'World database mutation is disabled during the Foundation Sprint',
    );
  }
  if (name === 'ci') {
    for (const key of Object.keys(environment)) {
      if (
        environment[key] &&
        /(?:PRODUCTION|SERVICE_ROLE|SUPABASE_DB_PASSWORD)/iu.test(key)
      ) {
        violations.push(
          `CI must not receive production credential variable: ${key}`,
        );
      }
    }
  }

  return {
    databaseConfigured: Boolean(parsedDatabaseUrl),
    name: name ?? 'MISSING',
    violations,
  };
}
