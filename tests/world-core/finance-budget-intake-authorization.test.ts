import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { OFFICE_COMMAND_CURRENT_BINDING_QUERY } from '../../apps/world-worker/src/intake/postgres-office-command-intake.js';
import {
  createFinanceBudgetIntakeAuthorizationPool,
  FINANCE_BUDGET_INTAKE_BINDING_LOCK_QUERY,
} from '../../apps/world-worker/src/persistence/finance-budget-intake-authorization.js';

// Protocol regression for the real native failure: the initial query cannot
// bypass the narrow metadata reader and fall through to raw seed RLS.
function transport() {
  const calls: { sql: string; args: unknown[] | undefined }[] = [];
  const client = {
    async query(sql: string, args?: unknown[]) {
      calls.push({ sql, args });
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return {
    calls,
    pool: createFinanceBudgetIntakeAuthorizationPool({
      connect: async () => client,
    } as unknown as Pick<Pool, 'connect'>),
  };
}
const args = [
  'WORLD_TEST_ONLY',
  '11111111-1111-4111-8111-111111111111',
  'COUNTRY_01',
  'FINANCE',
  'SEAT_TEST_ONLY',
  '1',
  'FINANCE_BUDGET',
  'SCOPE_TEST_ONLY',
];
describe('Budget initial and locked intake metadata routing', () => {
  it('routes both real queries through the same fixed metadata-only function', async () => {
    const t = transport(),
      client = await t.pool.connect();
    for (const suffix of ['', ' for share of authz,entitlement'])
      await client.query(OFFICE_COMMAND_CURRENT_BINDING_QUERY + suffix, args);
    expect(t.calls).toEqual([
      { sql: FINANCE_BUDGET_INTAKE_BINDING_LOCK_QUERY, args },
      { sql: FINANCE_BUDGET_INTAKE_BINDING_LOCK_QUERY, args },
    ]);
    client.release();
  });
  it('does not turn near-match SQL or another capability into Budget authority', async () => {
    const t = transport(),
      client = await t.pool.connect();
    const otherCapability = [...args];
    otherCapability[6] = 'FINANCE_TREASURY';
    const otherOffice = [...args];
    otherOffice[3] = 'SOCIAL';
    const requests = [
      { sql: OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' ', args },
      { sql: OFFICE_COMMAND_CURRENT_BINDING_QUERY + ' for update', args },
      { sql: OFFICE_COMMAND_CURRENT_BINDING_QUERY, args: otherCapability },
      { sql: OFFICE_COMMAND_CURRENT_BINDING_QUERY, args: otherOffice },
      { sql: OFFICE_COMMAND_CURRENT_BINDING_QUERY, args: args.slice(0, 7) },
    ];
    for (const r of requests) await client.query(r.sql, r.args);
    expect(t.calls).toEqual(requests);
    client.release();
  });
});
