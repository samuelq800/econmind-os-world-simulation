import { Pool } from 'pg';

import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
  type OfficialCountrySqlReader,
} from './official-country-baseline.js';
import { OFFICIAL_DATASETS } from './official-dataset-registry.js';
import { OFFICIAL_DATASET_SOURCE_QUERY } from './official-dataset-source.js';

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

/** Every SELECT is performed under the fixed NOLOGIN reader role in a bounded
 * read-only transaction. The login role must have explicit SET ROLE membership. */
export function createRoleScopedOfficialCountryReader(
  pool: Pick<Pool, 'connect'>,
): OfficialCountrySqlReader {
  return {
    async query(text, values) {
      const allowedCountry =
        text === OFFICIAL_COUNTRY_SOURCE_QUERY &&
        values[1] === OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH;
      const allowedDataset =
        text === OFFICIAL_DATASET_SOURCE_QUERY &&
        OFFICIAL_DATASETS.some((spec) => spec.storagePath === values[1]);
      if (
        values.length !== 2 ||
        values[0] !== OFFICIAL_COUNTRY_PACKAGE_ID ||
        (!allowedCountry && !allowedDataset)
      ) {
        throw new Error('OFFICIAL_COUNTRY_FIXED_QUERY_REQUIRED');
      }
      const client = await pool.connect();
      let transactionOpen = false;
      try {
        await client.query('begin read only');
        transactionOpen = true;
        await client.query('set local role world_v2_api_reader');
        const result = await client.query(text, [...values]);
        await client.query('commit');
        transactionOpen = false;
        return { rows: result.rows };
      } catch (error) {
        if (transactionOpen)
          await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
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
