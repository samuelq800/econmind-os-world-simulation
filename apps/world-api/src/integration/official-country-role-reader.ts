import {
  OFFICIAL_COUNTRY_PACKAGE_ID,
  OFFICIAL_COUNTRY_SOURCE_QUERY,
  OFFICIAL_COUNTRY_SOURCE_STORAGE_PATH,
  type OfficialCountrySqlReader,
} from './official-country-baseline.js';
import { OFFICIAL_DATASETS } from './official-dataset-registry.js';
import { OFFICIAL_DATASET_SOURCE_QUERY } from './official-dataset-source.js';

interface OfficialReadClient {
  query(
    text: string,
    values?: string[],
  ): Promise<{ readonly rows: readonly unknown[] }>;
  release(): void;
}

interface OfficialReadPool {
  connect(): Promise<OfficialReadClient>;
}

/** The only SQL admitted to the public source route is frozen at build time.
 * Each request gets a single read-only transaction and a transaction-local
 * NOLOGIN role; this also works through a transaction-mode pooler. */
export function createRoleScopedOfficialCountryReader(
  pool: OfficialReadPool,
  { statementTimeoutMillis }: { readonly statementTimeoutMillis?: number } = {},
): OfficialCountrySqlReader {
  if (
    statementTimeoutMillis !== undefined &&
    (!Number.isSafeInteger(statementTimeoutMillis) ||
      statementTimeoutMillis < 1 ||
      statementTimeoutMillis > 5_000)
  ) {
    throw new Error('OFFICIAL_COUNTRY_STATEMENT_TIMEOUT_INVALID');
  }
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
        if (statementTimeoutMillis !== undefined)
          await client.query(
            `set local statement_timeout = ${statementTimeoutMillis}`,
          );
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
