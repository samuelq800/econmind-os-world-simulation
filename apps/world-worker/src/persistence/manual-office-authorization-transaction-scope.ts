/** Same-executor resolution of one fixed authorization lookup. No membership,
 * authorization verdict, head, source or lease is cached. Bootstrap reads still
 * use the original DB; only an active callback on this exact wrapper may use
 * its actual executor. Escaped asynchronous work cannot revive that scope. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY } from './manual-office-authorization-sql.js';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
const wrappers = new WeakMap<SqlDatabase, SqlDatabase>();
const issued = new WeakSet<object>();
export function createManualOfficeAuthorizationTransactionDatabase(
  database: SqlDatabase,
): SqlDatabase {
  if (issued.has(database)) return database;
  const prior = wrappers.get(database);
  if (prior) return prior;
  const current = new AsyncLocalStorage<{
    readonly executor: SqlExecutor;
    active: boolean;
  }>();
  const wrapped: SqlDatabase = Object.freeze({
    query: <Row extends object>(
      statement: string,
      parameters: readonly unknown[] = [],
    ) => {
      const scope = current.getStore();
      if (statement === MANUAL_OFFICE_CURRENT_MEMBERSHIP_QUERY && scope) {
        if (!scope.active)
          return Promise.reject(
            Error('MANUAL_AUTHORIZATION_TRANSACTION_SCOPE_RETIRED'),
          );
        return scope.executor.query<Row>(statement, parameters);
      }
      return database.query<Row>(statement, parameters);
    },
    transaction: <Result>(
      consume: (executor: SqlExecutor) => Promise<Result>,
    ) =>
      database.transaction((executor) => {
        const scope = { executor, active: true };
        return current.run(scope, async () => {
          try {
            return await consume(executor);
          } finally {
            scope.active = false;
          }
        });
      }),
  });
  wrappers.set(database, wrapped);
  issued.add(wrapped);
  return wrapped;
}
