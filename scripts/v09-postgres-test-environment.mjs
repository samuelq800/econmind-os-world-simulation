import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { assessEnvironment } from './environment-policy.mjs';

const TEST_DATABASE_URL = 'V09_TEST_DATABASE_URL';
const TEST_FINGERPRINT = 'V09_TEST_DATABASE_FINGERPRINT';
const DISPOSABLE_DATABASE = /^econmind_v09(?:_[a-z0-9_]+)?$/u;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);
const FORBIDDEN_PG_CONNECTION_VARIABLES = Object.freeze([
  'PGDATABASE',
  'PGHOST',
  'PGHOSTADDR',
  'PGOPTIONS',
  'PGPASSFILE',
  'PGPASSWORD',
  'PGPORT',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGSSLCERT',
  'PGSSLCRL',
  'PGSSLKEY',
  'PGSSLMODE',
  'PGSSLNEGOTIATION',
  'PGSSLROOTCERT',
  'PGSSLSNI',
  'PGUSER',
]);

function invalid(message) {
  throw new Error(`Unsafe V09 PostgreSQL test environment: ${message}`);
}

function canonicalDisposableConnectionString(connectionString) {
  let connection;
  try {
    connection = new URL(connectionString);
  } catch {
    invalid(`${TEST_DATABASE_URL} must be a canonical PostgreSQL URL`);
  }

  if (connection.protocol !== 'postgresql:') {
    invalid(`${TEST_DATABASE_URL} must use the canonical postgresql scheme`);
  }
  if (connection.search !== '' || connection.hash !== '') {
    invalid(
      `${TEST_DATABASE_URL} must not contain query or fragment connection overrides`,
    );
  }
  if (connection.username !== 'postgres' || connection.password !== '') {
    invalid(
      `${TEST_DATABASE_URL} must use the disposable postgres role without URL credentials`,
    );
  }
  if (!LOOPBACK_HOSTS.has(connection.hostname)) {
    invalid(`${TEST_DATABASE_URL} must use an exact loopback host`);
  }
  if (
    !/^[1-9][0-9]{0,4}$/u.test(connection.port) ||
    Number(connection.port) > 65535
  ) {
    invalid(
      `${TEST_DATABASE_URL} must include an explicit numeric PostgreSQL port`,
    );
  }

  const database = decodeURIComponent(connection.pathname.slice(1));
  if (
    !DISPOSABLE_DATABASE.test(database) ||
    connection.pathname !== `/${database}`
  ) {
    invalid(
      `${TEST_DATABASE_URL} must name a canonical econmind_v09 disposable database`,
    );
  }

  const canonical = `postgresql://postgres@${connection.hostname}:${connection.port}/${database}`;
  if (connectionString !== canonical) {
    invalid(`${TEST_DATABASE_URL} must be in canonical form`);
  }
  return Object.freeze({
    connectionString: canonical,
    database,
    host: connection.hostname,
    port: Number(connection.port),
    user: connection.username,
  });
}

function assertPgRuntimeMatchesCanonicalTarget(target) {
  let parameters;
  try {
    parameters = new Client({
      connectionString: target.connectionString,
    }).connectionParameters;
  } catch (error) {
    invalid(
      `pg runtime could not parse ${TEST_DATABASE_URL}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (
    parameters.host !== target.host ||
    parameters.port !== target.port ||
    parameters.database !== target.database ||
    parameters.user !== target.user ||
    parameters.password !== null ||
    parameters.ssl !== false
  ) {
    invalid(`${TEST_DATABASE_URL} does not resolve to the approved pg target`);
  }
}

function assertNoPgConnectionOverrides(environment) {
  for (const name of FORBIDDEN_PG_CONNECTION_VARIABLES) {
    if (environment[name] !== undefined && environment[name] !== '') {
      invalid(`${name} must be absent from disposable PostgreSQL tests`);
    }
  }
}

/**
 * Keeps the V09 real-PostgreSQL probe confined to an explicitly named,
 * disposable local/CI target. Runtime DATABASE_URL variables are rejected so
 * a test can never silently reuse a configured World environment.
 */
export function assertV09PostgresTestEnvironment(environment = process.env) {
  const name = environment.ECONMIND_ENV;
  const configuredConnectionString = environment[TEST_DATABASE_URL];
  if (name !== 'local' && name !== 'ci') {
    invalid('ECONMIND_ENV must be local or ci');
  }
  if (!configuredConnectionString) {
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

  const target = canonicalDisposableConnectionString(
    configuredConnectionString,
  );
  assertNoPgConnectionOverrides(environment);
  assertPgRuntimeMatchesCanonicalTarget(target);

  const assessment = assessEnvironment({
    ...environment,
    WORLD_DATABASE_FINGERPRINT: `world-v2-${name}`,
    WORLD_DATABASE_MUTATION_MODE: 'disabled',
    WORLD_DATABASE_NAMESPACE: 'world_v2',
    WORLD_DATABASE_URL: target.connectionString,
  });
  if (assessment.violations.length > 0) {
    invalid(assessment.violations.join('; '));
  }
  return Object.freeze({
    connectionString: target.connectionString,
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
