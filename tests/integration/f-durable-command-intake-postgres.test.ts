import { Pool } from 'pg';

import { PostgresSqlDatabase } from '../../apps/world-worker/src/persistence/postgres-sql-database.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';
import { defineDurableIntakeSuite } from '../support/f-durable-command-intake-suite.js';

defineDurableIntakeSuite(
  'F staged intake / native PG16',
  () => {
    const target = assertV09PostgresTestEnvironment(process.env);
    const pool = new Pool({
      connectionString: target.connectionString,
      max: 4,
      options: '-c lock_timeout=2000 -c statement_timeout=10000',
    });
    const database = new PostgresSqlDatabase(pool);
    return {
      native: true,
      query: (sql, parameters) => database.query(sql, parameters),
      transaction: (operation) => database.transaction(operation),
      executeScript: async (script) => {
        await pool.query(script);
      },
      close: () => pool.end(),
    };
  },
  process.env.V09_TEST_DATABASE_URL !== undefined,
  true,
);
