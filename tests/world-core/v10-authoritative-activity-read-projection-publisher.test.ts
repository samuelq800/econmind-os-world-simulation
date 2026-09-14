import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireWorldWriterLease,
  countryId,
  createWorldWriterCommitAssertion,
  officeId,
  workerId,
  worldId,
  worldWriterLeaseRequest,
} from '@econmind/core';
import {
  AuthoritativeActivityReadProjectionPublisher,
  officePrivateReadProjectionScopeKey,
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
const WORLD = worldId('WORLD_V10_ACTIVITY_TEST');
const WORKER = workerId('WORKER_V10_ACTIVITY_TEST');
const AT = '2026-09-14T00:00:00.000Z';
const EXPIRY = '2026-09-14T00:05:00.000Z';
const SELLER_SUBJECT = '550e8400-e29b-41d4-a716-446655440011';
const BUYER_SUBJECT = '550e8400-e29b-41d4-a716-446655440012';
const HASH = `sha256:${'a'.repeat(64)}`;

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

function assertion(expectedWorldVersion = '0') {
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(WORLD, WORKER, AT, EXPIRY),
  );
  return createWorldWriterCommitAssertion(lease.lease, expectedWorldVersion);
}

async function acquireLease(database: V09AtomicTestDatabase): Promise<void> {
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, 300000)`,
    [WORLD, WORKER, AT],
  );
}

async function seedCurrentAuthorization(
  database: V09AtomicTestDatabase,
  input: Readonly<{
    authSubject: string;
    capability: string;
    countryId: string;
    officeId: string;
  }>,
): Promise<void> {
  await database.query(
    `insert into world_v2.current_commit_authorization
       (world_id, auth_subject, country_id, office_id, capability, team_id,
        authorization_version, active, refreshed_at_real)
     values ($1, $2::uuid, $3, $4, $5, 'TEAM_V10_ACTIVITY', 'AUTH_V10_1', true, $6)`,
    [
      WORLD,
      input.authSubject,
      input.countryId,
      input.officeId,
      input.capability,
      AT,
    ],
  );
}

async function seedAuthoritativeEvent(
  database: V09AtomicTestDatabase,
  input: Readonly<{
    authSubject: string;
    commandId: string;
    countryId: string;
    eventId: string;
    officeId: string;
    sequence: string;
  }>,
): Promise<void> {
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, null, 'V10_ACTIVITY_TEST', 'command-v1', '{}', $3, $3,
             $4::uuid, 'ACTOR_V10_ACTIVITY', $5, $6, 0, 0, $7, $8)`,
    [
      WORLD,
      input.commandId,
      HASH,
      input.authSubject,
      input.countryId,
      input.officeId,
      `CORRELATION_${input.commandId}`,
      AT,
    ],
  );
  await database.query(
    `insert into world_v2.authoritative_event
       (world_id, event_id, event_sequence, world_version,
        causation_command_id, correlation_id, event_type, schema_version,
        canonical_payload, payload_sha256, event_fingerprint, sim_time,
        recorded_at_real, corrects_event_id)
     values ($1, $2, $3::bigint, $3::bigint, $4, $5, 'V10_ACTIVITY_RECORDED',
             'event-v1', '{}', $6, $6, 0, $7, null)`,
    [
      WORLD,
      input.eventId,
      input.sequence,
      input.commandId,
      `CORRELATION_${input.commandId}`,
      HASH,
      AT,
    ],
  );
}

function rowByScope(
  rows: readonly Readonly<{
    classification: string;
    payload: string;
    scope_key: string;
  }>[],
  classification: string,
  scopeKey: string,
) {
  const row = rows.find(
    (candidate) =>
      candidate.classification === classification &&
      candidate.scope_key === scopeKey,
  );
  expect(row).toBeDefined();
  return JSON.parse(row!.payload);
}

describe('V10.1 authoritative activity read-projection publication', () => {
  it('rebuilds compact Country and Office activity payloads from authoritative Events without inventing balances', async () => {
    const testDatabase = await database();
    await seedCurrentAuthorization(testDatabase, {
      authSubject: SELLER_SUBJECT,
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      capability: 'TRADE_PROPOSE',
    });
    await seedCurrentAuthorization(testDatabase, {
      authSubject: SELLER_SUBJECT,
      countryId: 'COUNTRY_SELLER',
      officeId: 'FINANCE',
      capability: 'TREASURY_APPROVE',
    });
    await seedCurrentAuthorization(testDatabase, {
      authSubject: BUYER_SUBJECT,
      countryId: 'COUNTRY_BUYER',
      officeId: 'TRADE',
      capability: 'TRADE_ACCEPT',
    });
    await seedAuthoritativeEvent(testDatabase, {
      authSubject: SELLER_SUBJECT,
      commandId: 'COMMAND_ACTIVITY_SELLER_TRADE',
      countryId: 'COUNTRY_SELLER',
      eventId: 'EVENT_ACTIVITY_SELLER_TRADE',
      officeId: 'TRADE',
      sequence: '1',
    });
    await seedAuthoritativeEvent(testDatabase, {
      authSubject: SELLER_SUBJECT,
      commandId: 'COMMAND_ACTIVITY_SELLER_FINANCE',
      countryId: 'COUNTRY_SELLER',
      eventId: 'EVENT_ACTIVITY_SELLER_FINANCE',
      officeId: 'FINANCE',
      sequence: '2',
    });
    await testDatabase.query(
      `update world_v2.world_head
          set world_version = 2, event_sequence = 2
        where world_id = $1`,
      [WORLD],
    );
    await testDatabase.query(
      `insert into world_v2.read_projection
         (world_id, classification, scope_key, schema_version, world_version,
          event_sequence, payload, generated_at)
       values
         ($1, 'NEGOTIATION_PARTY', 'PARTY_FUTURE', 'world-projection-read-v1', 2, 2, '{}', $2),
         ($1, 'ADMIN', 'ADMIN_FUTURE', 'world-projection-read-v1', 2, 2, '{}', $2)`,
      [WORLD, AT],
    );
    await acquireLease(testDatabase);

    const publisher = new AuthoritativeActivityReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    await expect(
      publisher.replace({ assertion: assertion('2'), observedAtReal: AT }),
    ).resolves.toEqual({
      countryProjections: 2,
      eventSequence: '2',
      officePrivateProjections: 3,
      worldVersion: '2',
    });
    const result = await testDatabase.query<{
      readonly classification: string;
      readonly payload: string;
      readonly scope_key: string;
      readonly world_version: string;
    }>(
      `select classification, scope_key, payload::text as payload,
              world_version::text as world_version
         from world_v2.read_projection
        where world_id = $1
        order by classification, scope_key`,
      [WORLD],
    );
    expect(result.rows).toHaveLength(7);
    expect(rowByScope(result.rows, 'COUNTRY', 'COUNTRY_SELLER')).toEqual({
      activity: {
        authoritativeEventCount: '2',
        lastAuthoritativeEventSequence: '2',
        lastAuthoritativeEventWorldVersion: '2',
      },
      countryId: 'COUNTRY_SELLER',
      schemaVersion: 'world-activity-projection-v1',
    });
    expect(rowByScope(result.rows, 'COUNTRY', 'COUNTRY_BUYER')).toEqual({
      activity: {
        authoritativeEventCount: '0',
        lastAuthoritativeEventSequence: '0',
        lastAuthoritativeEventWorldVersion: '0',
      },
      countryId: 'COUNTRY_BUYER',
      schemaVersion: 'world-activity-projection-v1',
    });
    expect(
      rowByScope(
        result.rows,
        'OFFICE_PRIVATE',
        officePrivateReadProjectionScopeKey({
          countryId: countryId('COUNTRY_SELLER'),
          officeId: officeId('TRADE'),
        }),
      ),
    ).toMatchObject({
      activity: { authoritativeEventCount: '1' },
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
    });
    expect(
      rowByScope(result.rows, 'NEGOTIATION_PARTY', 'PARTY_FUTURE'),
    ).toEqual({});
    expect(rowByScope(result.rows, 'ADMIN', 'ADMIN_FUTURE')).toEqual({});
    expect(result.rows.every((row) => row.world_version === '2')).toBe(true);

    await testDatabase.query(
      `update world_v2.read_projection
          set payload = '{"tampered":true}'::jsonb
        where world_id = $1
          and classification = 'COUNTRY'
          and scope_key = 'COUNTRY_SELLER'`,
      [WORLD],
    );
    await testDatabase.query(
      `delete from world_v2.read_projection
        where world_id = $1
          and classification = 'OFFICE_PRIVATE'
          and scope_key = $2`,
      [
        WORLD,
        officePrivateReadProjectionScopeKey({
          countryId: countryId('COUNTRY_SELLER'),
          officeId: officeId('TRADE'),
        }),
      ],
    );
    await expect(
      publisher.replace({ assertion: assertion('2'), observedAtReal: AT }),
    ).resolves.toEqual({
      countryProjections: 2,
      eventSequence: '2',
      officePrivateProjections: 3,
      worldVersion: '2',
    });
    await expect(
      testDatabase.query<{
        readonly classification: string;
        readonly payload: string;
        readonly scope_key: string;
        readonly world_version: string;
      }>(
        `select classification, scope_key, payload::text as payload,
                world_version::text as world_version
           from world_v2.read_projection
          where world_id = $1
          order by classification, scope_key`,
        [WORLD],
      ),
    ).resolves.toMatchObject({ rows: result.rows });
  }, 30_000);

  it('fails closed before replacement when active scope evidence is malformed', async () => {
    const testDatabase = await database();
    await testDatabase.query(
      `insert into world_v2.current_commit_authorization
         (world_id, auth_subject, country_id, office_id, capability, team_id,
          authorization_version, active, refreshed_at_real)
       values ($1, $2::uuid, 'country_not_canonical', 'TRADE', 'TRADE_PROPOSE',
               'TEAM_BAD', 'AUTH_BAD', true, $3)`,
      [WORLD, SELLER_SUBJECT, AT],
    );
    await testDatabase.query(
      `insert into world_v2.read_projection
         (world_id, classification, scope_key, schema_version, world_version,
          event_sequence, payload, generated_at)
       values ($1, 'COUNTRY', 'COUNTRY_PRESERVED', 'world-projection-read-v1', 0, 0, '{}', $2)`,
      [WORLD, AT],
    );
    await acquireLease(testDatabase);
    const publisher = new AuthoritativeActivityReadProjectionPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).rejects.toMatchObject({
      name: 'V09TransactionRolledBackError',
      cause: { code: 'TRANSITION_EVIDENCE_INVALID' },
    });
    await expect(
      testDatabase.query(
        `select classification, scope_key
           from world_v2.read_projection
          where world_id = $1`,
        [WORLD],
      ),
    ).resolves.toMatchObject({
      rows: [{ classification: 'COUNTRY', scope_key: 'COUNTRY_PRESERVED' }],
    });
  }, 30_000);

  it('rejects a foreign Worker before it reads or changes authoritative facts', async () => {
    const testDatabase = await database();
    const publisher = new AuthoritativeActivityReadProjectionPublisher({
      database: testDatabase,
      workerId: 'WORKER_OTHER_TEST',
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
    await expect(
      testDatabase.query(
        'select count(*)::text as count from world_v2.read_projection',
      ),
    ).resolves.toMatchObject({ rows: [{ count: '0' }] });
  }, 30_000);
});
