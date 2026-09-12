import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import type {
  SqlDatabase,
  SqlExecutor,
  SqlQueryResult,
} from './sql-database.js';

export type PostgresTransactionFailureOutcome =
  | 'NOT_STARTED'
  | 'ROLLED_BACK'
  | 'ROLLBACK_UNCONFIRMED'
  | 'COMMIT_OUTCOME_UNKNOWN';

export class PostgresTransactionError extends Error {
  readonly outcome: PostgresTransactionFailureOutcome;
  readonly rollbackError: unknown;

  constructor(input: {
    readonly outcome: PostgresTransactionFailureOutcome;
    readonly cause: unknown;
    readonly rollbackError?: unknown;
  }) {
    super(`PostgreSQL transaction failed: ${input.outcome}`, {
      cause: input.cause,
    });
    this.name = 'PostgresTransactionError';
    this.outcome = input.outcome;
    this.rollbackError = input.rollbackError;
  }
}

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
    let phase: 'NOT_STARTED' | 'ACTIVE' | 'COMMITTING' | 'COMMITTED' =
      'NOT_STARTED';
    let discardConnection: Error | undefined;
    try {
      await client.query('begin');
      phase = 'ACTIVE';
      const result = await operation(executor(client));
      phase = 'COMMITTING';
      await client.query('commit');
      phase = 'COMMITTED';
      return result;
    } catch (error) {
      let transactionError: PostgresTransactionError;
      if (phase === 'ACTIVE') {
        try {
          await client.query('rollback');
          transactionError = new PostgresTransactionError({
            outcome: 'ROLLED_BACK',
            cause: error,
          });
        } catch (rollbackError) {
          transactionError = new PostgresTransactionError({
            outcome: 'ROLLBACK_UNCONFIRMED',
            cause: error,
            rollbackError,
          });
        }
      } else {
        transactionError = new PostgresTransactionError({
          outcome:
            phase === 'COMMITTING' ? 'COMMIT_OUTCOME_UNKNOWN' : 'NOT_STARTED',
          cause: error,
        });
      }
      discardConnection = transactionError;
      throw transactionError;
    } finally {
      client.release(discardConnection);
    }
  }
}
