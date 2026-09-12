// PREPARATION_ONLY_NOT_V09_2_STARTED: test infrastructure only.

import { PGlite } from '@electric-sql/pglite';
import { Pool, type PoolClient } from 'pg';

import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import {
  V09TransactionCleanupIncompleteError,
  V09TransactionCommitUnknownError,
  V09TransactionRolledBackError,
  type SqlResult,
  type V09AtomicSqlClient,
  type V09AtomicTestDatabase,
} from './v09-atomic-contract.js';

interface PGliteQueryable {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: readonly Row[] }>;
}

function pgliteClient(database: PGliteQueryable): V09AtomicSqlClient {
  return {
    async query<Row extends Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<SqlResult<Row>> {
      const result = await database.query<Row>(text, values);
      return { rows: result.rows };
    },
  };
}

export function createPGliteV09AtomicTestDatabase(): V09AtomicTestDatabase {
  const database = new PGlite();
  const client = pgliteClient(database as unknown as PGliteQueryable);
  let queue: Promise<void> = Promise.resolve();

  return {
    kind: 'PGLITE',
    supportsParallelTransactions: false,
    close: () => database.close(),
    query: client.query,
    async transaction<Result>(
      operation: (transactionClient: V09AtomicSqlClient) => Promise<Result>,
    ): Promise<Result> {
      const previous = queue;
      let release = (): void => undefined;
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      let commitAttempted = false;
      try {
        await client.query('begin');
        const result = await operation(client);
        commitAttempted = true;
        await client.query('commit');
        return result;
      } catch (error) {
        if (commitAttempted) {
          throw new V09TransactionCommitUnknownError(error);
        }
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          throw new V09TransactionCleanupIncompleteError(
            Object.freeze({ operationError: error, rollbackError }),
          );
        }
        throw new V09TransactionRolledBackError(error);
      } finally {
        release();
      }
    },
  };
}

function postgresClient(client: Pool | PoolClient): V09AtomicSqlClient {
  return {
    async query<Row extends Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = [],
    ): Promise<SqlResult<Row>> {
      const result = await client.query<Row>(text, [...values]);
      return { rows: result.rows };
    },
  };
}

export function createLocalPostgresV09AtomicTestDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): V09AtomicTestDatabase {
  const authorized = assertV09PostgresTestEnvironment(environment);
  const pool = new Pool({
    connectionString: authorized.connectionString,
    max: 4,
  });
  const queryClient = postgresClient(pool);

  return {
    kind: 'POSTGRESQL',
    supportsParallelTransactions: true,
    close: () => pool.end(),
    query: queryClient.query,
    async transaction<Result>(
      operation: (client: V09AtomicSqlClient) => Promise<Result>,
    ): Promise<Result> {
      const connection = await pool.connect();
      const client = postgresClient(connection);
      let commitAttempted = false;
      try {
        await client.query('begin');
        await client.query("set local lock_timeout = '2s'");
        await client.query("set local statement_timeout = '10s'");
        const result = await operation(client);
        commitAttempted = true;
        await client.query('commit');
        return result;
      } catch (error) {
        if (commitAttempted) {
          throw new V09TransactionCommitUnknownError(error);
        }
        try {
          await client.query('rollback');
        } catch (rollbackError) {
          throw new V09TransactionCleanupIncompleteError(
            Object.freeze({ operationError: error, rollbackError }),
          );
        }
        throw new V09TransactionRolledBackError(error);
      } finally {
        connection.release(true);
      }
    },
  };
}
