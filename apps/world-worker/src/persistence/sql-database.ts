export interface SqlQueryResult<Row extends object = Record<string, unknown>> {
  readonly rowCount: number | null;
  readonly rows: readonly Row[];
}

export interface SqlExecutor {
  query<Row extends object = Record<string, unknown>>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<SqlQueryResult<Row>>;
}

/**
 * Server-owned transaction boundary. Implementations must issue one database
 * BEGIN/COMMIT pair, roll back when the callback rejects, and never retry the
 * callback invisibly. Recovery of an acknowledgement-unknown commit is owned
 * by the atomic repository using a fresh `query` call.
 */
export interface SqlDatabase extends SqlExecutor {
  transaction<Result>(
    operation: (transaction: SqlExecutor) => Promise<Result>,
  ): Promise<Result>;
}
