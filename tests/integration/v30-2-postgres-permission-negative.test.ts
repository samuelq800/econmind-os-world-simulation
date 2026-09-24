import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  parseSupabaseAuthSubject,
  readAuthenticatedPostgresFinalCommandReceipt,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';
import { assertV09PostgresTestEnvironment } from '../../scripts/v09-postgres-test-environment.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0013_world_v2_read_projection_boundary.sql',
] as const;
const BROWSER_ROLE = 'v30_2_world_browser';
const API_ROLE = 'v30_2_world_api';
const WORLD_A = 'WORLD_V30_NATIVE_ALPHA';
const WORLD_B = 'WORLD_V30_NATIVE_BRAVO';
const COUNTRY_A = 'COUNTRY_ALPHA';
const COUNTRY_B = 'COUNTRY_BRAVO';
const SUBJECT_A = '550e8400-e29b-41d4-a716-446655440321';
const SUBJECT_B = '550e8400-e29b-41d4-a716-446655440322';
const FINGERPRINT = `sha256:${'5'.repeat(64)}`;
const PAYLOAD_HASH = `sha256:${'6'.repeat(64)}`;
const AT = '2026-09-24T00:00:00.000Z';
const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;

let admin: Pool | undefined;
let browser: Pool | undefined;
let api: Pool | undefined;

function currentAdmin(): Pool {
  if (admin === undefined) throw new Error('V30_2_ADMIN_POOL_UNAVAILABLE');
  return admin;
}

function currentBrowser(): Pool {
  if (browser === undefined) throw new Error('V30_2_BROWSER_POOL_UNAVAILABLE');
  return browser;
}

function currentApi(): Pool {
  if (api === undefined) throw new Error('V30_2_API_POOL_UNAVAILABLE');
  return api;
}

function roleConnectionString(connectionString: string, role: string): string {
  const value = new URL(connectionString);
  value.username = role;
  value.password = '';
  return value.toString();
}

async function dropTestRole(role: string): Promise<void> {
  await currentAdmin().query(
    `select pg_terminate_backend(pid)
       from pg_stat_activity
      where usename = $1 and pid <> pg_backend_pid()`,
    [role],
  );
  await currentAdmin().query(`drop role if exists ${role}`);
}

async function resetWorldSchema(): Promise<void> {
  await currentAdmin().query('drop schema if exists world_v2 cascade');
  for (const migration of migrations) {
    await currentAdmin().query(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await currentAdmin().query(
    `grant usage on schema world_v2 to ${BROWSER_ROLE}, ${API_ROLE}`,
  );
  await currentAdmin().query(
    `grant select on world_v2.projection_entitlement,
                     world_v2.read_projection
       to ${BROWSER_ROLE}`,
  );
  await currentAdmin().query(
    `grant select on world_v2.command_submission,
                     world_v2.command_receipt,
                     world_v2.current_commit_authorization
       to ${API_ROLE}`,
  );
}

async function seedWorld(): Promise<void> {
  await resetWorldSchema();
  await currentAdmin().query(
    `insert into world_v2.world_head (world_id)
     values ($1), ($2)`,
    [WORLD_A, WORLD_B],
  );
  for (const entry of [
    {
      worldId: WORLD_A,
      authSubject: SUBJECT_A,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_A,
    },
    {
      worldId: WORLD_A,
      authSubject: SUBJECT_A,
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'OFFICE_ALPHA_TRADE',
    },
    {
      worldId: WORLD_A,
      authSubject: SUBJECT_B,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_B,
    },
    {
      worldId: WORLD_A,
      authSubject: SUBJECT_B,
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'OFFICE_BRAVO_FINANCE',
    },
    {
      worldId: WORLD_B,
      authSubject: SUBJECT_B,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_B,
    },
  ] as const) {
    await currentAdmin().query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, active, granted_at, revoked_at)
       values ($1, $2::uuid, $3, $4, 'AUTH_V30_NATIVE_1', true, $5, null)`,
      [
        entry.worldId,
        entry.authSubject,
        entry.classification,
        entry.scopeKey,
        AT,
      ],
    );
    await currentAdmin().query(
      `insert into world_v2.read_projection
         (world_id, classification, scope_key, schema_version,
          world_version, event_sequence, payload, generated_at)
       values ($1, $2, $3, 'world-projection-read-v1', 1, 1,
               $4::jsonb, $5)`,
      [
        entry.worldId,
        entry.classification,
        entry.scopeKey,
        JSON.stringify({ scope: entry.scopeKey }),
        AT,
      ],
    );
  }
  await currentAdmin().query(
    `insert into world_v2.current_commit_authorization
       (world_id, auth_subject, country_id, office_id, capability, team_id,
        authorization_version, active, refreshed_at_real)
     values ($1, $2::uuid, $3, 'TRADE', 'TRADE_CONTRACTS', 'TEAM_V30_NATIVE',
             'AUTH_V30_NATIVE_1', true, $4),
            ($1, $5::uuid, $6, 'FINANCE', 'TRADE_CONTRACTS', 'TEAM_V30_NATIVE',
             'AUTH_V30_NATIVE_1', true, $4),
            ($7, $5::uuid, $6, 'FINANCE', 'TRADE_CONTRACTS', 'TEAM_V30_NATIVE',
             'AUTH_V30_NATIVE_1', true, $4)`,
    [WORLD_A, SUBJECT_A, COUNTRY_A, AT, SUBJECT_B, COUNTRY_B, WORLD_B],
  );
  await currentAdmin().query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, 'COMMAND_V30_NATIVE_ALPHA', 'IDEMPOTENCY_V30_NATIVE_ALPHA',
             'V30_NATIVE_PERMISSION_TEST', 'command-v1', '{}', $2, $3,
             $4::uuid, 'ACTOR_V30_NATIVE', $5, 'TRADE', 0, 0,
             'CORRELATION_V30_NATIVE_ALPHA', $6)`,
    [WORLD_A, PAYLOAD_HASH, FINGERPRINT, SUBJECT_A, COUNTRY_A, AT],
  );
  await currentAdmin().query(
    `insert into world_v2.command_receipt
       (world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real)
     values ($1, 'COMMAND_V30_NATIVE_ALPHA', 'IDEMPOTENCY_V30_NATIVE_ALPHA',
             'command-receipt-v2', $2, 'REJECTED', 'POLICY_REJECTED', null,
             null, null, 0, '[]'::jsonb, $3)`,
    [WORLD_A, FINGERPRINT, AT],
  );
}

async function setBrowserSubject(authSubject: string): Promise<void> {
  await currentBrowser().query(
    `select set_config('request.jwt.claim.sub', $1, false)`,
    [authSubject],
  );
}

function apiExecutor(): ParameterizedPgReadExecutor {
  return {
    query: async ({ text, values }) => {
      const result = await currentApi().query(text, [...values]);
      return { rows: result.rows };
    },
  };
}

postgresDescribe('V30.2 real PostgreSQL World V2 permission negatives', () => {
  beforeAll(async () => {
    const environment = assertV09PostgresTestEnvironment();
    admin = new Pool({
      connectionString: environment.connectionString,
      max: 2,
    });
    await dropTestRole(BROWSER_ROLE);
    await dropTestRole(API_ROLE);
    await currentAdmin().query(
      `create role ${BROWSER_ROLE}
       login nosuperuser nocreatedb nocreaterole noinherit noreplication`,
    );
    await currentAdmin().query(
      `create role ${API_ROLE}
       login nosuperuser nocreatedb nocreaterole noinherit noreplication`,
    );
    browser = new Pool({
      connectionString: roleConnectionString(
        environment.connectionString,
        BROWSER_ROLE,
      ),
      max: 1,
    });
    api = new Pool({
      connectionString: roleConnectionString(
        environment.connectionString,
        API_ROLE,
      ),
      max: 1,
    });
  }, 30_000);

  afterAll(async () => {
    await browser?.end();
    await api?.end();
    browser = undefined;
    api = undefined;
    if (admin !== undefined) {
      await admin.query('drop schema if exists world_v2 cascade');
      await dropTestRole(BROWSER_ROLE);
      await dropTestRole(API_ROLE);
      await admin.end();
      admin = undefined;
    }
  });

  it('enforces the actual RLS policies for a supplied subject across World, Country, and Office projections', async () => {
    await seedWorld();
    await setBrowserSubject(SUBJECT_A);

    await expect(
      currentBrowser().query(
        `select classification, scope_key
           from world_v2.projection_entitlement
          order by classification, scope_key`,
      ),
    ).resolves.toMatchObject({
      rows: [
        { classification: 'COUNTRY', scope_key: COUNTRY_A },
        { classification: 'OFFICE_PRIVATE', scope_key: 'OFFICE_ALPHA_TRADE' },
      ],
    });
    await expect(
      currentBrowser().query(
        `select world_id, classification, scope_key
           from world_v2.read_projection
          order by world_id, classification, scope_key`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          world_id: WORLD_A,
          classification: 'COUNTRY',
          scope_key: COUNTRY_A,
        },
        {
          world_id: WORLD_A,
          classification: 'OFFICE_PRIVATE',
          scope_key: 'OFFICE_ALPHA_TRADE',
        },
      ],
    });
    for (const query of [
      `select 1 from world_v2.read_projection
        where world_id = '${WORLD_A}'
          and classification = 'COUNTRY'
          and scope_key = '${COUNTRY_B}'`,
      `select 1 from world_v2.read_projection
        where world_id = '${WORLD_A}'
          and classification = 'OFFICE_PRIVATE'
          and scope_key = 'OFFICE_BRAVO_FINANCE'`,
      `select 1 from world_v2.read_projection
        where world_id = '${WORLD_B}'
          and classification = 'COUNTRY'
          and scope_key = '${COUNTRY_B}'`,
    ]) {
      await expect(currentBrowser().query(query)).resolves.toMatchObject({
        rowCount: 0,
      });
    }
    await setBrowserSubject(SUBJECT_B);
    await expect(
      currentBrowser().query(
        `select 1 from world_v2.read_projection
          where world_id = $1 and classification = 'COUNTRY' and scope_key = $2`,
        [WORLD_A, COUNTRY_A],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  }, 30_000);

  it('hides a projection after the server revokes its entitlement', async () => {
    await seedWorld();
    await setBrowserSubject(SUBJECT_A);
    await expect(
      currentBrowser().query(
        `select 1 from world_v2.read_projection
          where world_id = $1 and classification = 'COUNTRY' and scope_key = $2`,
        [WORLD_A, COUNTRY_A],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });

    await currentAdmin().query(
      `update world_v2.projection_entitlement
          set active = false, revoked_at = $1
        where world_id = $2
          and auth_subject = $3::uuid
          and classification = 'COUNTRY'
          and scope_key = $4`,
      [AT, WORLD_A, SUBJECT_A, COUNTRY_A],
    );
    await expect(
      currentBrowser().query(
        `select 1 from world_v2.read_projection
          where world_id = $1 and classification = 'COUNTRY' and scope_key = $2`,
        [WORLD_A, COUNTRY_A],
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  }, 30_000);

  it('keeps browser-role write and current-authorization access denied while the server receipt query denies an inactive capability', async () => {
    await seedWorld();
    await setBrowserSubject(SUBJECT_A);

    await expect(
      currentBrowser().query(
        'select * from world_v2.current_commit_authorization',
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      currentBrowser().query(
        `insert into world_v2.command_receipt (world_id)
         values ($1)`,
        [WORLD_A],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      currentBrowser().query(
        `update world_v2.read_projection
            set payload = '{}'::jsonb
          where world_id = $1`,
        [WORLD_A],
      ),
    ).rejects.toMatchObject({ code: '42501' });

    const identity = {
      worldId: WORLD_A,
      commandId: 'COMMAND_V30_NATIVE_ALPHA',
      idempotencyKey: 'IDEMPOTENCY_V30_NATIVE_ALPHA',
    };
    await expect(
      readAuthenticatedPostgresFinalCommandReceipt({
        executor: apiExecutor(),
        identity,
        authSubject: parseSupabaseAuthSubject(SUBJECT_A),
      }),
    ).resolves.toMatchObject({
      source: 'DURABLE_FINAL_COMMAND_RECEIPT',
      commandId: identity.commandId,
    });
    await currentAdmin().query(
      `update world_v2.current_commit_authorization
          set active = false
        where world_id = $1
          and auth_subject = $2::uuid
          and country_id = $3
          and office_id = 'TRADE'
          and capability = 'TRADE_CONTRACTS'`,
      [WORLD_A, SUBJECT_A, COUNTRY_A],
    );
    await expect(
      readAuthenticatedPostgresFinalCommandReceipt({
        executor: apiExecutor(),
        identity,
        authSubject: parseSupabaseAuthSubject(SUBJECT_A),
      }),
    ).resolves.toBeNull();
  }, 30_000);
});
