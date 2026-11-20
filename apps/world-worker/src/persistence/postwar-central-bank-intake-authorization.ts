/** Fixed CentralBank intake lock delegation. No recovery rewrite, role change,
 * membership, raw metadata grant or authority result is manufactured here. */
import type { Pool } from 'pg';
import type { SqlDatabase, SqlExecutor } from './sql-database.js';
import {
  WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY,
  WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY,
} from './worker-authorization-sql.js';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../intake/postgres-office-command-intake.js';
export const CENTRAL_BANK_INTAKE_BINDING_LOCK_QUERY =
  'select * from world_v2.lock_postwar_central_bank_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
type IntakePool = Pick<Pool, 'connect'>;
const wrappers = new WeakMap<object, IntakePool>();
const issued = new WeakSet<object>();
/** Reuse one adapter identity for HTTP and the genuine intake construction.
 * Its cache is only borrowed transport identity, never admission/authorization. */
export function createPostwarCentralBankIntakeAuthorizationPool(
  pool: IntakePool,
): IntakePool {
  if (!pool || typeof pool.connect !== 'function')
    throw Error('CENTRAL_BANK_INTAKE_POOL_REQUIRED');
  if (issued.has(pool)) return pool;
  const prior = wrappers.get(pool);
  if (prior) return prior;
  const wrapped: IntakePool = Object.freeze({
    async connect() {
      const client = await pool.connect();
      return new Proxy(client, {
        get(target, key) {
          if (key === 'query')
            return (statement: string, parameters?: readonly unknown[]) => {
              if (
                (statement === OFFICE_COMMAND_CURRENT_BINDING_QUERY ||
                  statement ===
                    OFFICE_COMMAND_CURRENT_BINDING_QUERY +
                      ' for share of authz,entitlement') &&
                parameters?.[3] === 'CENTRAL_BANK'
              ) {
                if (
                  parameters.length !== 8 ||
                  parameters[6] !== 'CENTRAL_BANK_MONETARY_POLICY' ||
                  parameters.some((v) => typeof v !== 'string')
                )
                  throw Error('CENTRAL_BANK_INTAKE_FIXED_PARAMETERS_REQUIRED');
                return target.query(CENTRAL_BANK_INTAKE_BINDING_LOCK_QUERY, [
                  ...parameters,
                ]);
              }
              return target.query(
                statement,
                parameters ? [...parameters] : undefined,
              );
            };
          const value = Reflect.get(target, key, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  });
  issued.add(wrapped);
  wrappers.set(pool, wrapped);
  return wrapped;
}

/** These literals are intentionally exact: one private CentralBank guard, the
 * existing generic manual claim, and the two existing Atomic auth cutoffs. */
export const CENTRAL_BANK_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY =
  "select team_id,authorization_version from world_v2.current_commit_authorization where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id='CENTRAL_BANK' and capability='CENTRAL_BANK_MONETARY_POLICY' and active for share";
export const CENTRAL_BANK_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY = `select team_id,authorization_version from world_v2.current_commit_authorization
         where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4
           and capability=$5 and active for share`;
const currentRpc =
  'world_v2.lock_postwar_central_bank_current_authorization($1,$2::uuid,$3,$4,$5)';
const revokedRpc =
  'world_v2.lock_postwar_central_bank_revoked_authorization($1,$2::uuid,$3,$4)';
const databaseWrappers = new WeakMap<object, SqlDatabase>();
const databaseIssued = new WeakSet<object>();
/** Same borrowed transaction/backend, real SQL rows/errors, no role switch or
 * pool acquisition. Locks remain held by the caller's existing outer tx. This
 * adapter creates no proof: genuine Core and Atomic cutoff checks still apply. */
export function createPostwarCentralBankAuthorizationDatabase(
  database: SqlDatabase,
): SqlDatabase {
  if (
    !database ||
    typeof database.query !== 'function' ||
    typeof database.transaction !== 'function'
  )
    throw Error('CENTRAL_BANK_AUTHORIZATION_DATABASE_REQUIRED');
  if (databaseIssued.has(database)) return database;
  const prior = databaseWrappers.get(database);
  if (prior) return prior;
  const executors = new WeakMap<object, SqlExecutor>();
  const bind = (executor: SqlExecutor): SqlExecutor => {
    const prior = executors.get(executor);
    if (prior) return prior;
    const wrapped: SqlExecutor = Object.freeze({
      query<Row extends object>(
        statement: string,
        parameters: readonly unknown[] = [],
      ) {
        let mapped: string | undefined;
        let values = parameters;
        const strings = (count: number) => {
          if (
            parameters.length !== count ||
            parameters.some((v) => typeof v !== 'string')
          )
            throw Error('CENTRAL_BANK_AUTHORIZATION_FIXED_PARAMETERS_REQUIRED');
        };
        if (
          statement === CENTRAL_BANK_RUNTIME_CURRENT_AUTHORIZATION_LOCK_QUERY
        ) {
          strings(3);
          values = [
            ...parameters,
            'CENTRAL_BANK',
            'CENTRAL_BANK_MONETARY_POLICY',
          ];
          mapped = 'select team_id,authorization_version from ' + currentRpc;
        } else if (
          (statement === CENTRAL_BANK_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY ||
            statement === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY) &&
          parameters[3] === 'CENTRAL_BANK'
        ) {
          strings(5);
          if (parameters[4] !== 'CENTRAL_BANK_MONETARY_POLICY')
            throw Error('CENTRAL_BANK_AUTHORIZATION_FIXED_PARAMETERS_REQUIRED');
          mapped =
            (statement === WORKER_CURRENT_AUTHORIZATION_LOCK_QUERY
              ? 'select * from '
              : 'select team_id,authorization_version from ') + currentRpc;
        } else if (
          statement === WORKER_REVOKED_AUTHORIZATION_LOCK_QUERY &&
          parameters[3] === 'CENTRAL_BANK'
        ) {
          strings(4);
          mapped = 'select present as "?column?" from ' + revokedRpc;
        }
        return executor.query<Row>(
          mapped ?? statement,
          mapped ? [...values] : parameters,
        );
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
  databaseIssued.add(wrapped);
  databaseWrappers.set(database, wrapped);
  return wrapped;
}
