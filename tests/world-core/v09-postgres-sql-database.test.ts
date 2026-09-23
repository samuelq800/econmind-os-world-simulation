// PREPARATION_ONLY_NOT_V09_2_STARTED: adapter failure classification only.

import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  PostgresSqlDatabase,
  PostgresTransactionError,
} from '../../apps/world-worker/src/persistence/postgres-sql-database.js';

function databaseWithClient(
  query: (statement: string) => Promise<{ rowCount: number; rows: never[] }>,
) {
  const client = {
    query: vi.fn(query),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return {
    client,
    database: new PostgresSqlDatabase(pool),
  };
}

const emptyResult = Object.freeze({ rowCount: 0, rows: [] as never[] });

describe('V09 PostgreSQL transaction outcome classification', () => {
  it('reports a confirmed rollback without hiding the operation failure', async () => {
    const operationError = new Error('OPERATION_FAILED');
    const { client, database } = databaseWithClient(async () => emptyResult);

    await expect(
      database.transaction(async () => {
        throw operationError;
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        cause: operationError,
        name: PostgresTransactionError.name,
        outcome: 'ROLLED_BACK',
      }),
    );
    expect(client.query.mock.calls.map(([statement]) => statement)).toEqual([
      'begin',
      'rollback',
    ]);
    expect(client.release).toHaveBeenCalledWith(expect.any(Error));
  });

  it('reports cleanup incomplete when rollback itself fails', async () => {
    const operationError = new Error('OPERATION_FAILED');
    const rollbackError = new Error('ROLLBACK_FAILED');
    const { database } = databaseWithClient(async (statement) => {
      if (statement === 'rollback') throw rollbackError;
      return emptyResult;
    });

    await expect(
      database.transaction(async () => {
        throw operationError;
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        cause: operationError,
        outcome: 'ROLLBACK_UNCONFIRMED',
        rollbackError,
      }),
    );
  });

  it('does not claim rollback when COMMIT acknowledgement fails', async () => {
    const commitError = new Error('COMMIT_ACKNOWLEDGEMENT_LOST');
    const { client, database } = databaseWithClient(async (statement) => {
      if (statement === 'commit') throw commitError;
      return emptyResult;
    });

    await expect(database.transaction(async () => 'result')).rejects.toEqual(
      expect.objectContaining({
        cause: commitError,
        outcome: 'COMMIT_OUTCOME_UNKNOWN',
      }),
    );
    expect(client.query.mock.calls.map(([statement]) => statement)).toEqual([
      'begin',
      'commit',
    ]);
  });

  it('distinguishes a transaction that never began', async () => {
    const beginError = new Error('BEGIN_FAILED');
    const { client, database } = databaseWithClient(async () => {
      throw beginError;
    });

    await expect(
      database.transaction(async () => 'unreachable'),
    ).rejects.toEqual(
      expect.objectContaining({
        cause: beginError,
        outcome: 'NOT_STARTED',
      }),
    );
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
