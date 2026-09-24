import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createLocalNonproductionAuthenticatedWorldHttpBridge,
  createLocalPostgresCurrentCommandScopeReader,
  createLocalTrustedPostgresReadExecutor,
  parseSupabaseAuthSubject,
  startLocalNonproductionWorldHttpBridge,
  WORLD_COMMAND_API_SCHEMA_VERSION,
  WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION,
  WORLD_READ_API_SCHEMA_VERSION,
  WORLD_V2_ENTITLED_PROJECTION_QUERY,
  type JwtSignatureVerifier,
  type RunningLocalNonproductionWorldHttpBridge,
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
const API_ROLE = 'v30_3_local_api';
const WORLD = 'WORLD_V30_3_AUTH_CHAIN';
const COUNTRY_ALPHA = 'COUNTRY_ALPHA';
const COUNTRY_BRAVO = 'COUNTRY_BRAVO';
const OFFICE_ALPHA = 'OFFICE_ALPHA_TRADE';
const OFFICE_BRAVO = 'OFFICE_BRAVO_FINANCE';
const SUBJECT_ALPHA = parseSupabaseAuthSubject(
  '550e8400-e29b-41d4-a716-446655440361',
);
const SUBJECT_BRAVO = parseSupabaseAuthSubject(
  '550e8400-e29b-41d4-a716-446655440362',
);
const REQUEST_ID = '550e8400-e29b-41d4-a716-446655440363';
const COMMAND_ID = 'COMMAND_V30_3_ALPHA';
const IDEMPOTENCY_KEY = 'IDEMPOTENCY_V30_3_ALPHA';
const FINGERPRINT = `sha256:${'7'.repeat(64)}`;
const PAYLOAD_HASH = `sha256:${'8'.repeat(64)}`;
const AT = '2026-09-24T00:00:00.000Z';
const JWT_SIGNING_KEY = randomBytes(32);
const postgresDescribe = process.env.V09_TEST_DATABASE_URL
  ? describe
  : describe.skip;

let admin: Pool | undefined;
let api: Pool | undefined;
let running: RunningLocalNonproductionWorldHttpBridge | undefined;
let durableReceiptFixtureCalls = 0;

function currentAdmin(): Pool {
  if (admin === undefined) throw new Error('V30_3_ADMIN_POOL_UNAVAILABLE');
  return admin;
}

function currentApi(): Pool {
  if (api === undefined) throw new Error('V30_3_API_POOL_UNAVAILABLE');
  return api;
}

function roleConnectionString(connectionString: string, role: string): string {
  const value = new URL(connectionString);
  value.username = role;
  value.password = '';
  return value.toString();
}

function encodedJson(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signedJwt(subject: string): string {
  const signingInput = [
    encodedJson({ alg: 'HS256', typ: 'JWT' }),
    encodedJson({
      aud: 'authenticated',
      exp: 1_100,
      iat: 900,
      iss: 'https://local-gate-b.example.test',
      sub: subject,
    }),
  ].join('.');
  const signature = createHmac('sha256', JWT_SIGNING_KEY)
    .update(signingInput, 'utf8')
    .digest('base64url');
  return `${signingInput}.${signature}`;
}

function signedTestJwtVerifier(): JwtSignatureVerifier {
  return {
    async verify(token) {
      const [header, payload, signature, extra] = token.split('.');
      if (
        header === undefined ||
        payload === undefined ||
        signature === undefined ||
        extra !== undefined
      ) {
        throw new Error('LOCAL_TEST_JWT_INVALID');
      }
      const signingInput = `${header}.${payload}`;
      const expected = createHmac('sha256', JWT_SIGNING_KEY)
        .update(signingInput, 'utf8')
        .digest('base64url');
      const supplied = Buffer.from(signature, 'utf8');
      const verified = Buffer.from(expected, 'utf8');
      if (
        supplied.byteLength !== verified.byteLength ||
        !timingSafeEqual(supplied, verified)
      ) {
        throw new Error('LOCAL_TEST_JWT_SIGNATURE_INVALID');
      }
      const parsedHeader = JSON.parse(
        Buffer.from(header, 'base64url').toString('utf8'),
      ) as Record<string, unknown>;
      if (parsedHeader.alg !== 'HS256' || parsedHeader.typ !== 'JWT') {
        throw new Error('LOCAL_TEST_JWT_HEADER_INVALID');
      }
      return JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as unknown;
    },
  };
}

function readRequest(
  classification: 'COUNTRY' | 'OFFICE_PRIVATE',
  scopeKey: string,
  worldId = WORLD,
) {
  return {
    schemaVersion: WORLD_READ_API_SCHEMA_VERSION,
    requestId: REQUEST_ID,
    operation: 'READ_WORLD_PROJECTION',
    payload: { worldId, classification, scopeKey },
  } as const;
}

function receiptRequest() {
  return {
    schemaVersion: WORLD_FINAL_RECEIPT_READ_API_SCHEMA_VERSION,
    requestId: REQUEST_ID,
    operation: 'READ_FINAL_NARROW_TRANSFER_RECEIPT',
    payload: {
      worldId: WORLD,
      commandId: COMMAND_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  } as const;
}

function commandRequest(countryId = COUNTRY_ALPHA) {
  return {
    schemaVersion: WORLD_COMMAND_API_SCHEMA_VERSION,
    requestId: REQUEST_ID,
    operation: 'SUBMIT_NARROW_TREASURY_GCU_TRANSFER',
    payload: {
      worldId: WORLD,
      countryId,
      officeId: 'TRADE',
      commandId: 'COMMAND_V30_3_NEW',
      idempotencyKey: 'IDEMPOTENCY_V30_3_NEW',
      expectedWorldVersion: '0',
      proposalRef: 'PROPOSAL_V30_3_ALPHA',
      buyerCountryId: COUNTRY_BRAVO,
      buyerFinanceApprovalRef: 'APPROVAL_V30_3_BRAVO',
    },
  } as const;
}

async function post(pathname: string, body: unknown, token: string) {
  if (running === undefined) throw new Error('V30_3_BRIDGE_UNAVAILABLE');
  return fetch(`${running.origin}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function dropTestRole(): Promise<void> {
  await currentAdmin().query(
    `select pg_terminate_backend(pid)
       from pg_stat_activity
      where usename = $1 and pid <> pg_backend_pid()`,
    [API_ROLE],
  );
  await currentAdmin().query(`drop role if exists ${API_ROLE}`);
}

async function resetAndSeed(): Promise<void> {
  await currentAdmin().query('drop schema if exists world_v2 cascade');
  for (const migration of migrations) {
    await currentAdmin().query(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await currentAdmin().query(`grant usage on schema world_v2 to ${API_ROLE}`);
  await currentAdmin().query(
    `grant select on world_v2.projection_entitlement,
                     world_v2.read_projection,
                     world_v2.command_submission,
                     world_v2.command_receipt,
                     world_v2.current_commit_authorization
       to ${API_ROLE}`,
  );
  await currentAdmin().query(
    `insert into world_v2.world_head (world_id)
     values ($1), ('WORLD_V30_3_OTHER')`,
    [WORLD],
  );
  for (const entry of [
    {
      authSubject: SUBJECT_ALPHA,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_ALPHA,
    },
    {
      authSubject: SUBJECT_ALPHA,
      classification: 'OFFICE_PRIVATE',
      scopeKey: OFFICE_ALPHA,
    },
    {
      authSubject: SUBJECT_BRAVO,
      classification: 'COUNTRY',
      scopeKey: COUNTRY_BRAVO,
    },
    {
      authSubject: SUBJECT_BRAVO,
      classification: 'OFFICE_PRIVATE',
      scopeKey: OFFICE_BRAVO,
    },
  ] as const) {
    await currentAdmin().query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, active, granted_at, revoked_at)
       values ($1, $2::uuid, $3, $4, 'AUTH_V30_3_1', true, $5, null)`,
      [WORLD, entry.authSubject, entry.classification, entry.scopeKey, AT],
    );
    await currentAdmin().query(
      `insert into world_v2.read_projection
         (world_id, classification, scope_key, schema_version,
          world_version, event_sequence, payload, generated_at)
       values ($1, $2, $3, 'world-projection-read-v1', 1, 1, $4::jsonb, $5)`,
      [
        WORLD,
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
     values ($1, $2::uuid, $3, 'TRADE', 'TRADE_TREASURY', 'TEAM_ALPHA',
             'AUTH_V30_3_1', true, $4),
            ($1, $5::uuid, $6, 'FINANCE', 'FINANCE_TREASURY', 'TEAM_BRAVO',
             'AUTH_V30_3_1', true, $4)`,
    [WORLD, SUBJECT_ALPHA, COUNTRY_ALPHA, AT, SUBJECT_BRAVO, COUNTRY_BRAVO],
  );
  await currentAdmin().query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, 'V30_3_TEST_COMMAND', 'command-v1', '{}', $4, $5,
             $6::uuid, 'ACTOR_ALPHA', $7, 'TRADE', 0, 0,
             'CORRELATION_V30_3_ALPHA', $8)`,
    [
      WORLD,
      COMMAND_ID,
      IDEMPOTENCY_KEY,
      PAYLOAD_HASH,
      FINGERPRINT,
      SUBJECT_ALPHA,
      COUNTRY_ALPHA,
      AT,
    ],
  );
  await currentAdmin().query(
    `insert into world_v2.command_receipt
       (world_id, command_id, idempotency_key, schema_version,
        command_fingerprint, outcome, reason_code, transition_id,
        world_version_before, world_version_after, sim_time, event_ids,
        recorded_at_real)
     values ($1, $2, $3, 'command-receipt-v2', $4, 'REJECTED',
             'POLICY_REJECTED', null, null, null, 0, '[]'::jsonb, $5)`,
    [WORLD, COMMAND_ID, IDEMPOTENCY_KEY, FINGERPRINT, AT],
  );
}

postgresDescribe(
  'V30.3 local authenticated HTTP bridge with native PostgreSQL',
  () => {
    beforeAll(async () => {
      const environment = assertV09PostgresTestEnvironment();
      admin = new Pool({
        connectionString: environment.connectionString,
        max: 2,
      });
      await dropTestRole();
      await currentAdmin().query(
        `create role ${API_ROLE}
       login nosuperuser nocreatedb nocreaterole noinherit noreplication`,
      );
      api = new Pool({
        connectionString: roleConnectionString(
          environment.connectionString,
          API_ROLE,
        ),
        max: 4,
      });
      await resetAndSeed();
      durableReceiptFixtureCalls = 0;
      running = await startLocalNonproductionWorldHttpBridge({
        bridge: createLocalNonproductionAuthenticatedWorldHttpBridge({
          command: {
            // Fixture only: migration 0015 has no API approval-reader adapter.
            approvalReader: {
              async readCurrent(request) {
                if (
                  request.worldId !== WORLD ||
                  request.buyerCountryId !== COUNTRY_BRAVO ||
                  request.proposalRef !== 'PROPOSAL_V30_3_ALPHA' ||
                  request.buyerFinanceApprovalRef !== 'APPROVAL_V30_3_BRAVO'
                ) {
                  return null;
                }
                return {
                  worldId: WORLD,
                  buyerCountryId: COUNTRY_BRAVO,
                  officeId: 'FINANCE' as const,
                  proposalRef: 'PROPOSAL_V30_3_ALPHA',
                  approvalRef: 'APPROVAL_V30_3_BRAVO',
                  status: 'APPROVED' as const,
                };
              },
            },
            // Fixture only: no Worker-owned durable command port is bound here.
            receiptPort: {
              async acceptOrRead(request) {
                durableReceiptFixtureCalls += 1;
                return {
                  source: 'DURABLE_FINAL_COMMAND_RECEIPT' as const,
                  worldId: request.request.payload.worldId,
                  commandId: request.request.payload.commandId,
                  idempotencyKey: request.request.payload.idempotencyKey,
                  commandFingerprint: FINGERPRINT,
                  outcome: 'REJECTED' as const,
                  reasonCode: 'POLICY_REJECTED',
                  worldVersionAfter: null,
                  eventIds: [],
                  recordedAtReal: AT,
                };
              },
            },
            scopeReader: createLocalPostgresCurrentCommandScopeReader({
              pool: currentApi(),
            }),
          },
          environment: { ECONMIND_ENV: 'ci' },
          executor: createLocalTrustedPostgresReadExecutor({
            pool: currentApi(),
          }),
          policy: {
            jwt: {
              expectedIssuer: 'https://local-gate-b.example.test',
              expectedAudience: 'authenticated',
              nowEpochSeconds: 1_000,
            },
            timeoutMs: 1_000,
          },
          verifier: signedTestJwtVerifier(),
        }),
      });
    }, 30_000);

    afterAll(async () => {
      await running?.shutdown();
      running = undefined;
      await api?.end();
      api = undefined;
      if (admin !== undefined) {
        await currentAdmin().query('drop schema if exists world_v2 cascade');
        await dropTestRole();
        await admin.end();
        admin = undefined;
      }
    });

    it('binds a verified local JWT to native RLS while keeping command durability explicitly fixture-only', async () => {
      const alphaToken = signedJwt(SUBJECT_ALPHA);
      const bravoToken = signedJwt(SUBJECT_BRAVO);

      // The API database role alone cannot see an entitled row: it has no
      // client-set GUC. The bridge must first verify the JWT and bind it itself.
      await expect(
        currentApi().query(WORLD_V2_ENTITLED_PROJECTION_QUERY, [
          SUBJECT_ALPHA,
          WORLD,
          'COUNTRY',
          COUNTRY_ALPHA,
          '0',
          '0',
        ]),
      ).resolves.toMatchObject({ rowCount: 0 });

      const ownCountry = await post(
        '/local/v1/world-read',
        readRequest('COUNTRY', COUNTRY_ALPHA),
        alphaToken,
      );
      expect(ownCountry.status).toBe(200);
      await expect(ownCountry.json()).resolves.toMatchObject({
        data: { payload: { scope: COUNTRY_ALPHA } },
        ok: true,
      });
      for (const request of [
        readRequest('COUNTRY', COUNTRY_BRAVO),
        readRequest('OFFICE_PRIVATE', OFFICE_BRAVO),
        readRequest('COUNTRY', COUNTRY_BRAVO, 'WORLD_V30_3_OTHER'),
      ]) {
        const denied = await post('/local/v1/world-read', request, alphaToken);
        expect(denied.status).toBe(404);
      }
      const ownOffice = await post(
        '/local/v1/world-read',
        readRequest('OFFICE_PRIVATE', OFFICE_ALPHA),
        alphaToken,
      );
      expect(ownOffice.status).toBe(200);

      const receipt = await post(
        '/local/v1/narrow-transfer-receipt',
        receiptRequest(),
        alphaToken,
      );
      expect(receipt.status).toBe(200);
      await expect(receipt.json()).resolves.toMatchObject({
        ok: true,
        receipt: {
          commandId: COMMAND_ID,
          source: 'DURABLE_FINAL_COMMAND_RECEIPT',
        },
      });
      const foreignReceipt = await post(
        '/local/v1/narrow-transfer-receipt',
        receiptRequest(),
        bravoToken,
      );
      expect(foreignReceipt.status).toBe(404);

      const command = await post(
        '/local/v1/narrow-transfer-command',
        commandRequest(),
        alphaToken,
      );
      expect(command.status).toBe(200);
      expect(durableReceiptFixtureCalls).toBe(1);
      const crossCountryCommand = await post(
        '/local/v1/narrow-transfer-command',
        commandRequest(COUNTRY_ALPHA),
        bravoToken,
      );
      expect(crossCountryCommand.status).toBe(403);
      expect(durableReceiptFixtureCalls).toBe(1);

      const invalidSignature = `${alphaToken.slice(0, -1)}${
        alphaToken.endsWith('A') ? 'B' : 'A'
      }`;
      const invalidRead = await post(
        '/local/v1/world-read',
        readRequest('COUNTRY', COUNTRY_ALPHA),
        invalidSignature,
      );
      expect(invalidRead.status).toBe(401);

      await currentAdmin().query(
        `update world_v2.projection_entitlement
          set active = false, revoked_at = $1
        where world_id = $2 and auth_subject = $3::uuid
          and classification = 'COUNTRY' and scope_key = $4`,
        [AT, WORLD, SUBJECT_ALPHA, COUNTRY_ALPHA],
      );
      const revokedProjection = await post(
        '/local/v1/world-read',
        readRequest('COUNTRY', COUNTRY_ALPHA),
        alphaToken,
      );
      expect(revokedProjection.status).toBe(404);

      await currentAdmin().query(
        `update world_v2.current_commit_authorization
          set active = false
        where world_id = $1 and auth_subject = $2::uuid
          and country_id = $3 and office_id = 'TRADE'`,
        [WORLD, SUBJECT_ALPHA, COUNTRY_ALPHA],
      );
      const revokedCommand = await post(
        '/local/v1/narrow-transfer-command',
        commandRequest(),
        alphaToken,
      );
      expect(revokedCommand.status).toBe(403);
      expect(durableReceiptFixtureCalls).toBe(1);
      const revokedReceipt = await post(
        '/local/v1/narrow-transfer-receipt',
        receiptRequest(),
        alphaToken,
      );
      expect(revokedReceipt.status).toBe(404);
    }, 30_000);
  },
);
