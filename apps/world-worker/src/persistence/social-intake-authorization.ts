/** Fixed initial and cutoff metadata reads through one lock-read adapter. No membership/UPDATE grant, role
 * escalation, arbitrary SQL rewrite, source publication or Ready callback. */
import type { Pool } from 'pg';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../intake/postgres-office-command-intake.js';

export const SOCIAL_INTAKE_BINDING_LOCK_QUERY =
  'select * from world_v2.lock_social_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
/** Exact existing discretionary consumer statement. Keep economic worker
 * authority rows SELECT-only while the fixed definer acquires actual locks. */
export const SOCIAL_MANUAL_CLAIM_AUTHORIZATION_LOCK_QUERY = `select team_id,authorization_version from world_v2.current_commit_authorization
         where world_id=$1 and auth_subject=$2::uuid and country_id=$3 and office_id=$4
           and capability=$5 and active for share`;

type IntakePool = Pick<Pool, 'connect'>;
const wrappers = new WeakMap<object, IntakePool>();
const issued = new WeakSet<object>();
/** Reuse one adapter identity for HTTP and the genuine intake construction.
 * Its cache is only borrowed transport identity, never admission/authorization. */
export function createSocialIntakeAuthorizationPool(
  pool: IntakePool,
): IntakePool {
  if (!pool || typeof pool.connect !== 'function')
    throw Error('SOCIAL_INTAKE_POOL_REQUIRED');
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
                parameters?.[3] === 'SOCIAL'
              ) {
                if (
                  parameters.length !== 8 ||
                  parameters[6] !== 'SOCIAL_LABOUR' ||
                  parameters.some((v) => typeof v !== 'string')
                )
                  throw Error('SOCIAL_INTAKE_FIXED_PARAMETERS_REQUIRED');
                return target.query(SOCIAL_INTAKE_BINDING_LOCK_QUERY, [
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
