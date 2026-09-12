import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { WORLD_V2_READ_TABLE_COLUMNS } from '../../apps/world-api/src/integration/generated/world-v2-read-model.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPaths = [
  'database/migrations/artifacts/0001_world_v2_namespace.sql',
  'database/migrations/artifacts/0002_world_v2_command_event_ledger.sql',
  'database/migrations/artifacts/0003_world_v2_command_receipts_outbox.sql',
  'database/migrations/artifacts/0004_world_v2_receipt_event_set_integrity.sql',
  'database/migrations/artifacts/0005_world_v2_writer_lease_fencing.sql',
  'database/migrations/artifacts/0006_world_v2_writer_lease_lineage_guard.sql',
  'database/migrations/artifacts/0007_world_v2_read_projection_boundary.sql',
];

let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  for (const migrationPath of migrationPaths) {
    await database.exec(await readFile(path.join(root, migrationPath), 'utf8'));
  }
}, 30_000);

afterAll(async () => database.close());

describe('PREPARATION_ONLY_NOT_CONNECTED World V2 read projection DDL', () => {
  it('creates only derived read-model tables with matching generated types', async () => {
    for (const [tableName, expectedColumns] of Object.entries(
      WORLD_V2_READ_TABLE_COLUMNS,
    )) {
      const result = await database.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
         where table_schema = 'world_v2' and table_name = $1
         order by ordinal_position`,
        [tableName],
      );
      expect(result.rows.map((row) => row.column_name)).toEqual(
        expectedColumns,
      );
    }
  });

  it('enables and forces RLS with no write policies', async () => {
    const security = await database.query<{
      relname: string;
      relforcerowsecurity: boolean;
      relrowsecurity: boolean;
    }>(
      `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
       join pg_namespace on pg_namespace.oid = pg_class.relnamespace
       where pg_namespace.nspname = 'world_v2'
         and relname in ('projection_entitlement', 'read_projection')
       order by relname`,
    );
    expect(security.rows).toEqual([
      {
        relname: 'projection_entitlement',
        relforcerowsecurity: true,
        relrowsecurity: true,
      },
      {
        relname: 'read_projection',
        relforcerowsecurity: true,
        relrowsecurity: true,
      },
    ]);
    const policies = await database.query<{
      policy_name: string;
      command: string;
    }>(
      `select polname as policy_name,
              case polcmd when 'r' then 'SELECT' else polcmd::text end as command
       from pg_policy
       join pg_class on pg_class.oid = pg_policy.polrelid
       join pg_namespace on pg_namespace.oid = pg_class.relnamespace
       where pg_namespace.nspname = 'world_v2'
         and pg_class.relname in ('projection_entitlement', 'read_projection')
       order by polname`,
    );
    expect(policies.rows).toEqual([
      {
        policy_name: 'projection_entitlement_self_read',
        command: 'SELECT',
      },
      {
        policy_name: 'read_projection_entitled_read',
        command: 'SELECT',
      },
    ]);
  });

  it('keeps all browser access ungranted until a reviewed query facade exists', async () => {
    const sql = await readFile(
      path.join(
        root,
        'database/migrations/artifacts/0007_world_v2_read_projection_boundary.sql',
      ),
      'utf8',
    );
    expect(sql).toContain(
      "execute 'revoke all on table world_v2.read_projection from anon'",
    );
    expect(sql).toContain(
      "execute 'revoke usage on schema world_v2 from authenticated'",
    );
    expect(sql).not.toMatch(/\bgrant\s+/iu);
    expect(sql).not.toMatch(/\b(?:auth|public|storage)\s*\./iu);
  });
});
