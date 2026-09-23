import { fileURLToPath } from 'node:url';

import { assessEnvironment } from './environment-policy.mjs';

const TEST_DATABASE_URL = 'V09_TEST_DATABASE_URL';
const TEST_FINGERPRINT = 'V09_TEST_DATABASE_FINGERPRINT';

function invalid(message) {
  throw new Error(`Unsafe V09 PostgreSQL test environment: ${message}`);
}

/**
 * Keeps the V09 real-PostgreSQL probe confined to an explicitly named,
 * disposable local/CI target. Runtime DATABASE_URL variables are rejected so
 * a test can never silently reuse a configured World environment.
 */
export function assertV09PostgresTestEnvironment(environment = process.env) {
  const name = environment.ECONMIND_ENV;
  const connectionString = environment[TEST_DATABASE_URL];
  if (name !== 'local' && name !== 'ci') {
    invalid('ECONMIND_ENV must be local or ci');
  }
  if (!connectionString) {
    invalid(`${TEST_DATABASE_URL} is required`);
  }
  if (
    environment.WORLD_DATABASE_URL !== undefined ||
    environment.DATABASE_URL !== undefined
  ) {
    invalid('must not share WORLD_DATABASE_URL or DATABASE_URL with runtime');
  }
  if (environment[TEST_FINGERPRINT] !== `world-v2-v09-test-${name}`) {
    invalid(
      `${TEST_FINGERPRINT} does not identify the disposable ${name} target`,
    );
  }

  const assessment = assessEnvironment({
    ...environment,
    WORLD_DATABASE_FINGERPRINT: `world-v2-${name}`,
    WORLD_DATABASE_MUTATION_MODE: 'disabled',
    WORLD_DATABASE_NAMESPACE: 'world_v2',
    WORLD_DATABASE_URL: connectionString,
  });
  if (assessment.violations.length > 0) {
    invalid(assessment.violations.join('; '));
  }
  return Object.freeze({
    connectionString,
    environment: name,
    fingerprint: environment[TEST_FINGERPRINT],
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = assertV09PostgresTestEnvironment();
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        environment: result.environment,
        fingerprint: result.fingerprint,
        target: 'DISPOSABLE_LOOPBACK_POSTGRESQL',
        runtimeDatabaseShared: false,
        runtimeDatabaseMutation: false,
        testDatabaseMutation: 'DISPOSABLE_TEST_ONLY',
        productionAccess: false,
      },
      null,
      2,
    ),
  );
}
