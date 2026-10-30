/** Borrowed intake adapter for the two exact initial/locked binding queries.
 * No pool creation, role change, environment lookup, facts callback or authority
 * DML grant. Fixed SQL definer holds real metadata locks in the same transaction. */
import type { Pool } from 'pg';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../intake/postgres-office-command-intake.js';
export const FINANCE_BUDGET_INTAKE_BINDING_LOCK_QUERY =
  'select * from world_v2.lock_finance_budget_intake_binding($1,$2::uuid,$3,$4,$5,$6,$7,$8)';
export function createFinanceBudgetIntakeAuthorizationPool(
  pool: Pick<Pool, 'connect'>,
): Pick<Pool, 'connect'> {
  return Object.freeze({
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
                parameters?.length === 8 &&
                parameters[3] === 'FINANCE' &&
                parameters[6] === 'FINANCE_BUDGET'
              )
                return target.query(FINANCE_BUDGET_INTAKE_BINDING_LOCK_QUERY, [
                  ...parameters,
                ]);
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
}
