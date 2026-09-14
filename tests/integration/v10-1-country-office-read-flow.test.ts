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
  AuthoritativeActivityReadProjectionPublisher,
  CurrentAuthorizationEntitlementPublisher,
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
] as const;
const WORLD = worldId('WORLD_V10_COUNTRY_FLOW_TEST');
const WORKER = workerId('WORKER_V10_COUNTRY_FLOW_TEST');
const AT = '2026-09-14T00:00:00.000Z';
const EXPIRY = '2026-09-14T00:05:00.000Z';
const SELLER_SUBJECT = '550e8400-e29b-41d4-a716-446655440021';
const FORGED_SUBJECT = '550e8400-e29b-41d4-a716-446655440022';
const HASH = `sha256:${'b'.repeat(64)}`;
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
  return createWorldWriterCommitAssertion(lease.lease, '1');
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

async function seedAuthoritativeCountryActivity(
  database: V09AtomicTestDatabase,
): Promise<void> {
  await database.query(
    `insert into world_v2.current_commit_authorization
       (world_id, auth_subject, country_id, office_id, capability, team_id,
        authorization_version, active, refreshed_at_real)
     values ($1, $2::uuid, 'COUNTRY_SELLER', 'TRADE', 'TRADE_PROPOSE',
             'TEAM_SELLER', 'AUTH_SELLER_1', true, $3)`,
    [WORLD, SELLER_SUBJECT, AT],
  );
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, 'COMMAND_COUNTRY_ACTIVITY', null, 'V10_ACTIVITY_TEST',
             'command-v1', '{}', $2, $2, $3::uuid, 'ACTOR_SELLER',
             'COUNTRY_SELLER', 'TRADE', 0, 0, 'CORRELATION_COUNTRY_ACTIVITY', $4)`,
    [WORLD, HASH, SELLER_SUBJECT, AT],
  );
  await database.query(
    `insert into world_v2.authoritative_event
       (world_id, event_id, event_sequence, world_version,
        causation_command_id, correlation_id, event_type, schema_version,
        canonical_payload, payload_sha256, event_fingerprint, sim_time,
        recorded_at_real, corrects_event_id)
     values ($1, 'EVENT_COUNTRY_ACTIVITY', 1, 1, 'COMMAND_COUNTRY_ACTIVITY',
             'CORRELATION_COUNTRY_ACTIVITY', 'V10_ACTIVITY_RECORDED', 'event-v1',
             '{}', $2, $2, 0, $3, null)`,
    [WORLD, HASH, AT],
  );
  await database.query(
    `update world_v2.world_head
        set world_version = 1, event_sequence = 1
      where world_id = $1`,
    [WORLD],
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

describe('V10.1 Country/Office source-to-query flow', () => {
  it('serves the source-bound Country and Office-private activity projections only to the current entitled subject', async () => {
    const testDatabase = await database();
    await seedAuthoritativeCountryActivity(testDatabase);
    const commitAssertion = assertion();
    await new AuthoritativeActivityReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });
    await new CurrentAuthorizationEntitlementPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });

    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: executor(testDatabase),
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(SELLER_SUBJECT);
        },
      },
    });
    const countryRequest = createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174121',
      worldId: WORLD,
      classification: 'COUNTRY',
      scopeKey: 'COUNTRY_SELLER',
    });
    await expect(
      handler.handle({
        authorization: 'Bearer verified-by-injected-test-verifier',
        request: countryRequest,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        classification: 'COUNTRY',
        scopeKey: 'COUNTRY_SELLER',
        watermark: { worldVersion: '1', eventSequence: '1' },
        payload: {
          activity: {
            authoritativeEventCount: '1',
            lastAuthoritativeEventSequence: '1',
            lastAuthoritativeEventWorldVersion: '1',
          },
          countryId: 'COUNTRY_SELLER',
          schemaVersion: 'world-activity-projection-v1',
        },
      },
    });
    const officeRequest = createWorldReadRequest({
      requestId: '123e4567-e89b-42d3-a456-426614174122',
      worldId: WORLD,
      classification: 'OFFICE_PRIVATE',
      scopeKey: 'OFFICE_434F554E5452595F53454C4C4552_5452414445',
    });
    await expect(
      handler.handle({
        authorization: 'Bearer verified-by-injected-test-verifier',
        request: officeRequest,
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        classification: 'OFFICE_PRIVATE',
        watermark: { worldVersion: '1', eventSequence: '1' },
        payload: { countryId: 'COUNTRY_SELLER', officeId: 'TRADE' },
      },
    });
  }, 30_000);

  it('does not disclose the materialized Country projection to a valid but unentitled subject', async () => {
    const testDatabase = await database();
    await seedAuthoritativeCountryActivity(testDatabase);
    const commitAssertion = assertion();
    await new AuthoritativeActivityReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });
    await new CurrentAuthorizationEntitlementPublisher({
      database: testDatabase,
      workerId: WORKER,
    }).replace({ assertion: commitAssertion, observedAtReal: AT });
    const handler = createAuthenticatedWorldReadQueryHandler({
      executor: executor(testDatabase),
      policy,
      verifier: {
        async verify() {
          return verifiedClaims(FORGED_SUBJECT);
        },
      },
    });
    await expect(
      handler.handle({
        authorization: 'Bearer verified-but-unentitled-subject',
        request: createWorldReadRequest({
          requestId: '123e4567-e89b-42d3-a456-426614174123',
          worldId: WORLD,
          classification: 'COUNTRY',
          scopeKey: 'COUNTRY_SELLER',
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
