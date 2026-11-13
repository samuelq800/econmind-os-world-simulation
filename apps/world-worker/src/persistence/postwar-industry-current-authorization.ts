/** Fixed Industry worker metadata delegation on the existing held executor.
 * No pool, role change, grants, proof issuance or synthetic authorization rows. */
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from './worker-authorization-sql.js';
import { SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY } from './social-intake-authorization.js';
export const INDUSTRY_CURRENT_AUTHORIZATION_LOCK_QUERY =
  'select * from world_v2.lock_postwar_industry_current_authorization($1,$2::uuid,$3,$4,$5)';
export const INDUSTRY_REVOKED_AUTHORIZATION_LOCK_QUERY =
  'select present as "?column?" from world_v2.lock_postwar_industry_revoked_authorization($1,$2::uuid,$3,$4)';
const wrappers = new WeakMap<object, SqlDatabase>();
const issued = new WeakSet<object>();
export function createPostwarIndustryAuthorizationDatabase(
  database: SqlDatabase,
): SqlDatabase {
  if (
    !database ||
    typeof database.query !== 'function' ||
    typeof database.transaction !== 'function'
  )
    throw Error('INDUSTRY_AUTHORIZATION_DATABASE_REQUIRED');
  if (issued.has(database)) return database;
  const previous = wrappers.get(database);
  if (previous) return previous;
  const executors = new WeakMap<object, SqlExecutor>();
  const bind = (executor: SqlExecutor): SqlExecutor => {
    const previous = executors.get(executor);
    if (previous) return previous;
    const wrapped: SqlExecutor = Object.freeze({
      query<Row extends object>(
        statement: string,
        parameters: readonly unknown[] = [],
      ) {
        const current = statement === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
          manual = statement === SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY,
          revoked = statement === WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY;
        if ((current || manual || revoked) && parameters[3] === 'INDUSTRY') {
          if (
            parameters.length !== (revoked ? 4 : 5) ||
            parameters.some((p) => typeof p !== 'string') ||
            (!revoked && parameters[4] !== 'INDUSTRY_PRODUCTION')
          )
            throw Error('INDUSTRY_AUTHORIZATION_FIXED_PARAMETERS_REQUIRED');
          const query = revoked
            ? INDUSTRY_REVOKED_AUTHORIZATION_LOCK_QUERY
            : manual
              ? 'select team_id,authorization_version from world_v2.lock_postwar_industry_current_authorization($1,$2::uuid,$3,$4,$5)'
              : INDUSTRY_CURRENT_AUTHORIZATION_LOCK_QUERY;
          return executor.query<Row>(query, [...parameters]);
        }
        return executor.query<Row>(statement, parameters);
      },
    });
    executors.set(executor, wrapped);
    return wrapped;
  };
  const wrapped: SqlDatabase = Object.freeze({
    query: bind(database).query,
    transaction<Result>(
      consume: (tx: SqlExecutor) => Promise<Result>,
    ): Promise<Result> {
      return database.transaction((tx) => consume(bind(tx)));
    },
  });
  issued.add(wrapped);
  wrappers.set(database, wrapped);
  return wrapped;
}
