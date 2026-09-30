import { Pool } from 'pg';

import type { OfficialCountrySqlReader } from './official-country-baseline.js';
import { createRoleScopedOfficialCountryReader } from './official-country-role-reader.js';

export { createRoleScopedOfficialCountryReader } from './official-country-role-reader.js';

export interface OfficialCountryDatabaseConfiguration {
  readonly connectionString: string;
  readonly loginRole: string;
  readonly readerRole: 'world_v2_api_reader';
}

function invalid(reason: string): never {
  throw new Error(`OFFICIAL_COUNTRY_DATABASE_CONFIGURATION_INVALID: ${reason}`);
}

function loopback(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

/** Separate opt-in from the historical World database setting. Missing or
 * partial activation never silently turns the public source endpoint on. */
export function readOfficialCountryDatabaseConfiguration(
  environment: NodeJS.ProcessEnv,
  environmentName: string,
): OfficialCountryDatabaseConfiguration | undefined {
  const enabled = environment.WORLD_API_OFFICIAL_COUNTRY_DB_ENABLED;
  if (enabled === undefined || enabled === 'false') return undefined;
  if (enabled !== 'true') invalid('enabled must be literal true or false');
  const connectionString = environment.WORLD_DATABASE_URL;
  const loginRole = environment.WORLD_API_DB_LOGIN_ROLE;
  const readerRole = environment.WORLD_API_DB_READER_ROLE;
  if (!connectionString || !loginRole || !readerRole)
    invalid('database URL, login role and reader role required');
  if (
    readerRole !== 'world_v2_api_reader' ||
    !/^[a-z][a-z0-9_]*$/u.test(loginRole) ||
    [
      'postgres',
      'supabase_admin',
      'service_role',
      'authenticated',
      'anon',
      readerRole,
    ].includes(loginRole)
  ) {
    invalid('dedicated login and fixed reader group role required');
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return invalid('database URL is invalid');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    decodeURIComponent(url.username) !== loginRole ||
    !url.hostname ||
    !url.pathname ||
    url.pathname === '/' ||
    url.hash !== '' ||
    [...url.searchParams.keys()].some((key) => key !== 'sslmode')
  )
    invalid('database URL must identify only the dedicated PostgreSQL reader');
  const isLocal = environmentName === 'local' || environmentName === 'ci';
  if (isLocal && !loopback(url.hostname))
    invalid('local/CI database must be loopback');
  if (
    !isLocal &&
    (loopback(url.hostname) ||
      !['require', 'verify-full'].includes(
        url.searchParams.get('sslmode') ?? '',
      ))
  ) {
    invalid('staging/production database must be remote with TLS');
  }
  if (
    environment.WORLD_DATABASE_FINGERPRINT !== `world-v2-${environmentName}` ||
    (environment.WORLD_DATABASE_NAMESPACE !== undefined &&
      environment.WORLD_DATABASE_NAMESPACE !== 'world_v2') ||
    (environment.WORLD_DATABASE_MUTATION_MODE !== undefined &&
      environment.WORLD_DATABASE_MUTATION_MODE !== 'disabled')
  )
    invalid(
      'World V2 environment fingerprint/namespace/read-only policy required',
    );
  return Object.freeze({ connectionString, loginRole, readerRole });
}

export interface ManagedOfficialCountryPool extends OfficialCountrySqlReader {
  end(): Promise<void>;
}

/** Even a misgranted server role cannot issue a write through this surface. */
export function createOfficialCountryReadPool(
  configuration: OfficialCountryDatabaseConfiguration,
): ManagedOfficialCountryPool {
  const pool = new Pool({
    connectionString: configuration.connectionString,
    max: 4,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    query_timeout: 5_500,
    statement_timeout: 5_000,
    options: '-c default_transaction_read_only=on',
    application_name: 'econmind-world-api-official-country-read',
  });
  const reader = createRoleScopedOfficialCountryReader(pool);
  return {
    query: (text, values) => reader.query(text, values),
    end: () => pool.end(),
  };
}
