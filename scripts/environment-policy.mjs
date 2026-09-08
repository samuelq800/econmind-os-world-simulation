import { findForbiddenBrowserVariables } from './vite-environment-policy.mjs';

const SAFE_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SUPPORTED_ENVIRONMENTS = new Set([
  'local',
  'ci',
  'staging',
  'production',
]);

export function assessEnvironment(environment) {
  const name = environment.ECONMIND_ENV ?? 'local';
  const violations = [];

  if (!SUPPORTED_ENVIRONMENTS.has(name)) {
    violations.push(`Unsupported ECONMIND_ENV: ${name}`);
  }

  for (const { name, category } of findForbiddenBrowserVariables(environment)) {
    violations.push(
      `${name} must never be exposed to browser code; reason=${category}`,
    );
  }

  const databaseUrl = environment.DATABASE_URL;
  if ((name === 'local' || name === 'ci') && databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      if (!SAFE_LOCAL_HOSTS.has(parsed.hostname)) {
        violations.push(`${name} DATABASE_URL must resolve to a loopback host`);
      }
    } catch {
      violations.push('DATABASE_URL is not a valid URL');
    }
  }

  return { name, violations };
}
