import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import type {
  SqlDatabase,
  SqlExecutor,
  SqlQueryResult,
} from './sql-database.js';

function executor(client: PoolClient): SqlExecutor {
  return Object.freeze({
    query: async <Row extends object = Record<string, unknown>>(
      statement: string,
      parameters: readonly unknown[] = [],
    ): Promise<SqlQueryResult<Row>> => {
      const result = await client.query<Row & QueryResultRow>(statement, [
        ...parameters,
      ]);
      return Object.freeze({
        rowCount: result.rowCount,
        rows: Object.freeze([...result.rows]),
      });
    },
  });
}

/**
 * Thin PostgreSQL adapter for the private World Worker repository. It never
 * retries a transaction callback. If COMMIT acknowledgement is lost, the
 * error reaches the repository, which recovers by reading the immutable final
 * receipt through a fresh pooled query.
 */
export class PostgresSqlDatabase implements SqlDatabase {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async query<Row extends object = Record<string, unknown>>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<SqlQueryResult<Row>> {
    const result = await this.#pool.query<Row & QueryResultRow>(statement, [
      ...parameters,
    ]);
    return Object.freeze({
      rowCount: result.rowCount,
      rows: Object.freeze([...result.rows]),
    });
  }

  async transaction<Result>(
    operation: (transaction: SqlExecutor) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.#pool.connect();
    let began = false;
    let discardConnection: Error | undefined;
    try {
      await client.query('begin');
      began = true;
      const result = await operation(executor(client));
      await client.query('commit');
      began = false;
      return result;
    } catch (error) {
      if (began) {
        await client.query('rollback').catch(() => undefined);
      }
      discardConnection =
        error instanceof Error
          ? error
          : new Error('PostgreSQL transaction failed with an unknown error');
      throw error;
    } finally {
      client.release(discardConnection);
    }
  }
}
