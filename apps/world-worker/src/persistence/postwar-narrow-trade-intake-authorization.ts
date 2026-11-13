/** Fixed NarrowTrade intake lock delegation. No recovery rewrite, role change,
 * membership, raw metadata grant or authority result is manufactured here. */
import type { Pool } from 'pg';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../intake/postgres-office-command-intake.js';
export const TRADE_RECOVERY_BINDING_QUERY =
  'select * from world_v2.read_postwar_trade_recovery_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
export const TRADE_INTAKE_BINDING_LOCK_QUERY =
  'select * from world_v2.lock_postwar_trade_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
type IntakePool = Pick<Pool, 'connect'>;
const wrappers = new WeakMap<object, IntakePool>();
const issued = new WeakSet<object>();
/** Reuse one adapter identity for HTTP and the genuine intake construction.
 * Its cache is only borrowed transport identity, never admission/authorization. */
export function createPostwarNarrowTradeIntakeAuthorizationPool(
  pool: IntakePool,
): IntakePool {
  if (!pool || typeof pool.connect !== 'function')
    throw Error('TRADE_INTAKE_POOL_REQUIRED');
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
                parameters?.[3] === 'TRADE'
              ) {
                if (
                  parameters.length !== 8 ||
                  parameters[6] !== 'TRADE_CONTRACTS' ||
                  parameters.some((v) => typeof v !== 'string')
                )
                  throw Error('TRADE_INTAKE_FIXED_PARAMETERS_REQUIRED');
                return target.query(TRADE_INTAKE_BINDING_LOCK_QUERY, [
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
