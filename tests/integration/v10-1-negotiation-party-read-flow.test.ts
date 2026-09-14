import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireWorldWriterLease,
  createWorldWriterCommitAssertion,
  workerId,
  worldId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import {
  createAuthenticatedWorldReadQueryHandler,
  createWorldReadRequest,
  type ParameterizedPgReadExecutor,
} from '../../apps/world-api/src/index.js';
import {
  CurrentNegotiationPartyReadPublisher,
  WORLD_NEGOTIATION_PARTY_PROJECTION_SCHEMA_VERSION,
} from '../../apps/world-worker/src/index.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrations = [
  '0001_world_v2_namespace.sql',
  '0002_world_v2_command_event_ledger.sql',
  '0003_world_v2_command_receipts_outbox.sql',
  '0004_world_v2_receipt_event_set_integrity.sql',
  '0005_world_v2_writer_lease_fencing.sql',
  '0006_world_v2_writer_lease_lineage_guard.sql',
  '0007_world_v2_atomic_transition_facts.sql',
  '0008_world_v2_materialization_recovery.sql',
  '0009_world_v2_posting_payload_integrity.sql',
  '0010_world_v2_command_claim_fencing.sql',
  '0011_world_v2_current_commit_authorization.sql',
  '0012_world_v2_command_claim_active_lease_guard.sql',
  '0013_world_v2_read_projection_boundary.sql',
  '0014_world_v2_current_negotiation_party_membership.sql',
] as const;
const WORLD = worldId('WORLD_V10_PARTY_FLOW_TEST');
const WORKER = workerId('WORKER_V10_PARTY_FLOW_TEST');
const AT = '2026-09-14T00:00:00.000Z';
const EXPIRY = '2026-09-14T00:05:00.000Z';
const SELLER_SUBJECT = '550e8400-e29b-41d4-a716-446655440031';
const BUYER_SUBJECT = '550e8400-e29b-41d4-a716-446655440032';
const UNENTITLED_SUBJECT = '550e8400-e29b-41d4-a716-446655440033';
const policy = {
  jwt: {
    expectedIssuer: 'https://issuer.example.test',
    expectedAudience: 'world-api',
    nowEpochSeconds: 1_800_000_000,
  },
  timeoutMs: 50,
} as const;

const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database(): Promise<V09AtomicTestDatabase> {
  const result = createPGliteV09AtomicTestDatabase();
  databases.push(result);
  for (const migration of migrations) {
    await result.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await result.query('insert into world_v2.world_head (world_id) values ($1)', [
    WORLD,
  ]);
  return result;
}

function assertion() {
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(WORLD, WORKER, AT, EXPIRY),
  );
  return createWorldWriterCommitAssertion(lease.lease, '0');
}

function verifiedClaims(subject: string) {
  return {
    sub: subject,
    iss: policy.jwt.expectedIssuer,
    aud: policy.jwt.expectedAudience,
    iat: 1_799_999_000,
    exp: 1_800_001_000,
  };
}

async function seedCurrentPartyMembership(
  database: V09AtomicTestDatabase,
): Promise<void> {
  await database.query(
    `insert into world_v2.current_negotiation_party_membership
       (world_id, party_id, auth_subject, country_id, office_id,
        authorization_version, active, refreshed_at_real)
     values ($1, 'PARTY_CROSS_COUNTRY', $2::uuid, 'COUNTRY_SELLER', 'TRADE',
             'AUTH_SELLER_1', true, $4::timestamptz),
            ($1, 'PARTY_CROSS_COUNTRY', $3::uuid, 'COUNTRY_BUYER', 'FINANCE',
             'AUTH_BUYER_1', true, $4::timestamptz)`,
    [WORLD, SELLER_SUBJECT, BUYER_SUBJECT, AT],
  );
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, 300000)`,
    [WORLD, WORKER, AT],
  );
}

function executor(
  database: V09AtomicTestDatabase,
): ParameterizedPgReadExecutor {
  return {
    query: async ({ text, values }) => database.query(text, values),
  };
}

async function materializePartyRead(
  database: V09AtomicTestDatabase,
): Promise<void> {
  await new CurrentNegotiationPartyReadPublisher({
    database,
    workerId: WORKER,
  }).replace({ assertion: assertion(), observedAtReal: AT });
}

describe('V10.1 named-party source-to-query flow', () => {
  it('serves a cross-country party projection only to its current member', async () => {
    const testDatabase = await database();
    await seedCurrentPartyMembership(testDatabase);
    await materializePartyRead(testDatabase);
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: executor(testDatabase),
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(SELLER_SUBJECT);
        },
      },
    });

    await expect(
      handler.handle({
        authorization: 'Bearer verified-by-injected-test-verifier',
        request: createWorldReadRequest({
          requestId: '123e4567-e89b-42d3-a456-426614174131',
          worldId: WORLD,
          classification: 'NEGOTIATION_PARTY',
          scopeKey: 'PARTY_CROSS_COUNTRY',
        }),
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        classification: 'NEGOTIATION_PARTY',
        scopeKey: 'PARTY_CROSS_COUNTRY',
        watermark: { worldVersion: '0', eventSequence: '0' },
        payload: {
          members: [
            { countryId: 'COUNTRY_BUYER', officeId: 'FINANCE' },
            { countryId: 'COUNTRY_SELLER', officeId: 'TRADE' },
          ],
          partyId: 'PARTY_CROSS_COUNTRY',
          schemaVersion: WORLD_NEGOTIATION_PARTY_PROJECTION_SCHEMA_VERSION,
        },
      },
    });
  }, 30_000);

  it('does not disclose the materialized party projection to a valid but unentitled subject', async () => {
    const testDatabase = await database();
    await seedCurrentPartyMembership(testDatabase);
    await materializePartyRead(testDatabase);
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: executor(testDatabase),
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(UNENTITLED_SUBJECT);
        },
      },
    });

    await expect(
      handler.handle({
        authorization: 'Bearer verified-but-unentitled-subject',
        request: createWorldReadRequest({
          requestId: '123e4567-e89b-42d3-a456-426614174132',
          worldId: WORLD,
          classification: 'NEGOTIATION_PARTY',
          scopeKey: 'PARTY_CROSS_COUNTRY',
        }),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'World projection is unavailable',
        retryable: false,
      },
    });
  }, 30_000);
});
