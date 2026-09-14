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
  CurrentNegotiationPartyReadPublisher,
  WorldReadProjectionPublisher,
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
const WORLD = worldId('WORLD_V10_PARTY_READ_TEST');
const WORKER = workerId('WORKER_V10_PARTY_READ_TEST');
const AT = '2026-09-14T00:00:00.000Z';
const EXPIRY = '2026-09-14T00:05:00.000Z';
const SELLER_SUBJECT = '550e8400-e29b-41d4-a716-446655440011';
const BUYER_SUBJECT = '550e8400-e29b-41d4-a716-446655440012';

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

async function acquireLease(database: V09AtomicTestDatabase): Promise<void> {
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, 300000)`,
    [WORLD, WORKER, AT],
  );
}

async function seedCurrentMembership(
  database: V09AtomicTestDatabase,
  input: Readonly<{
    authSubject: string;
    authorizationVersion: string;
    countryId: string;
    officeId: string;
    partyId: string;
    active?: boolean;
    withCurrentAuthorization?: boolean;
  }>,
): Promise<void> {
  await database.query(
    `insert into world_v2.current_negotiation_party_membership
       (world_id, party_id, auth_subject, country_id, office_id,
        authorization_version, active, refreshed_at_real)
     values ($1, $2, $3::uuid, $4, $5, $6, $7, $8::timestamptz)`,
    [
      WORLD,
      input.partyId,
      input.authSubject,
      input.countryId,
      input.officeId,
      input.authorizationVersion,
      input.active ?? true,
      AT,
    ],
  );
  if (input.withCurrentAuthorization ?? true) {
    await database.query(
      `insert into world_v2.current_commit_authorization
         (world_id, auth_subject, country_id, office_id, capability, team_id,
          authorization_version, active, refreshed_at_real)
       values ($1, $2::uuid, $3, $4, 'TRADE_PROPOSE', 'TEAM_PARTY_TEST',
               $5, true, $6::timestamptz)`,
      [
        WORLD,
        input.authSubject,
        input.countryId,
        input.officeId,
        input.authorizationVersion,
        AT,
      ],
    );
  }
}

describe('V10.1 current negotiation-party read publication', () => {
  it('rebuilds cross-country party members from only current server-held memberships', async () => {
    const testDatabase = await database();
    await acquireLease(testDatabase);
    await seedCurrentMembership(testDatabase, {
      authSubject: SELLER_SUBJECT,
      authorizationVersion: 'AUTH_SELLER_1',
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      partyId: 'PARTY_CROSS_COUNTRY',
    });
    await seedCurrentMembership(testDatabase, {
      authSubject: BUYER_SUBJECT,
      authorizationVersion: 'AUTH_BUYER_1',
      countryId: 'COUNTRY_BUYER',
      officeId: 'FINANCE',
      partyId: 'PARTY_CROSS_COUNTRY',
    });
    await testDatabase.query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, granted_at)
       values ($1, $2::uuid, 'NEGOTIATION_PARTY', 'PARTY_STALE', 'AUTH_OLD', $3),
              ($1, $2::uuid, 'COUNTRY', 'COUNTRY_PRESERVED', 'AUTH_OLD', $3)`,
      [WORLD, SELLER_SUBJECT, AT],
    );

    const publisher = new CurrentNegotiationPartyReadPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).resolves.toEqual({
      entitlementCount: 2,
      eventSequence: '0',
      partyProjections: 1,
      worldVersion: '0',
    });

    await expect(
      testDatabase.query<{
        readonly auth_subject: string;
        readonly authorization_version: string;
        readonly classification: string;
        readonly scope_key: string;
      }>(
        `select auth_subject::text as auth_subject, classification, scope_key,
                authorization_version
           from world_v2.projection_entitlement
          where world_id = $1
          order by classification, scope_key, auth_subject`,
        [WORLD],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          auth_subject: SELLER_SUBJECT,
          authorization_version: 'AUTH_OLD',
          classification: 'COUNTRY',
          scope_key: 'COUNTRY_PRESERVED',
        },
        {
          auth_subject: SELLER_SUBJECT,
          authorization_version: 'AUTH_SELLER_1',
          classification: 'NEGOTIATION_PARTY',
          scope_key: 'PARTY_CROSS_COUNTRY',
        },
        {
          auth_subject: BUYER_SUBJECT,
          authorization_version: 'AUTH_BUYER_1',
          classification: 'NEGOTIATION_PARTY',
          scope_key: 'PARTY_CROSS_COUNTRY',
        },
      ],
    });
    const projections = await testDatabase.query<{
      readonly payload: string;
      readonly scope_key: string;
    }>(
      `select scope_key, payload::text as payload
         from world_v2.read_projection
        where world_id = $1
        order by scope_key`,
      [WORLD],
    );
    expect(projections.rows.map((row) => row.scope_key)).toEqual([
      'PARTY_CROSS_COUNTRY',
    ]);
    expect(JSON.parse(projections.rows[0]?.payload ?? 'null')).toEqual({
      members: [
        { countryId: 'COUNTRY_BUYER', officeId: 'FINANCE' },
        { countryId: 'COUNTRY_SELLER', officeId: 'TRADE' },
      ],
      partyId: 'PARTY_CROSS_COUNTRY',
      schemaVersion: WORLD_NEGOTIATION_PARTY_PROJECTION_SCHEMA_VERSION,
    });

    await expect(
      new WorldReadProjectionPublisher({
        database: testDatabase,
        workerId: WORKER,
      }).replace({
        assertion: assertion(),
        observedAtReal: AT,
        projections: [
          {
            classification: 'NEGOTIATION_PARTY',
            scopeKey: 'PARTY_CROSS_COUNTRY',
            payload: { callerSuppliedOverride: true },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
    await expect(
      testDatabase.query<{
        readonly payload: string;
        readonly scope_key: string;
      }>(
        `select scope_key, payload::text as payload
           from world_v2.read_projection
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'
          order by scope_key`,
        [WORLD],
      ),
    ).resolves.toMatchObject({ rows: projections.rows });
    await expect(
      testDatabase.query(
        `select count(*)::text as count
           from world_v2.projection_entitlement
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'`,
        [WORLD],
      ),
    ).resolves.toMatchObject({ rows: [{ count: '2' }] });
  }, 30_000);

  it('clears stale party rows when no active membership source remains while preserving other classifications', async () => {
    const testDatabase = await database();
    await acquireLease(testDatabase);
    await seedCurrentMembership(testDatabase, {
      authSubject: SELLER_SUBJECT,
      authorizationVersion: 'AUTH_REVOKED',
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      partyId: 'PARTY_REVOKED',
      active: false,
    });
    await testDatabase.query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, granted_at)
       values ($1, $2::uuid, 'NEGOTIATION_PARTY', 'PARTY_STALE', 'AUTH_OLD', $3),
              ($1, $2::uuid, 'ADMIN', 'ADMIN_PRESERVED', 'AUTH_OLD', $3)`,
      [WORLD, SELLER_SUBJECT, AT],
    );
    await testDatabase.query(
      `insert into world_v2.read_projection
         (world_id, classification, scope_key, schema_version, world_version,
          event_sequence, payload, generated_at)
       values ($1, 'NEGOTIATION_PARTY', 'PARTY_STALE', 'world-projection-read-v1', 0, 0, '{}', $2),
              ($1, 'ADMIN', 'ADMIN_PRESERVED', 'world-projection-read-v1', 0, 0, '{}', $2)`,
      [WORLD, AT],
    );

    const publisher = new CurrentNegotiationPartyReadPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).resolves.toEqual({
      entitlementCount: 0,
      eventSequence: '0',
      partyProjections: 0,
      worldVersion: '0',
    });
    await expect(
      testDatabase.query(
        `select classification, scope_key
           from world_v2.projection_entitlement
          where world_id = $1
          order by classification, scope_key`,
        [WORLD],
      ),
    ).resolves.toMatchObject({
      rows: [{ classification: 'ADMIN', scope_key: 'ADMIN_PRESERVED' }],
    });
    await expect(
      testDatabase.query(
        `select classification, scope_key
           from world_v2.read_projection
          where world_id = $1
          order by classification, scope_key`,
        [WORLD],
      ),
    ).resolves.toMatchObject({
      rows: [{ classification: 'ADMIN', scope_key: 'ADMIN_PRESERVED' }],
    });
  }, 30_000);

  it('clears party access when an active membership no longer has matching current Office authorization', async () => {
    const testDatabase = await database();
    await acquireLease(testDatabase);
    await seedCurrentMembership(testDatabase, {
      authSubject: SELLER_SUBJECT,
      authorizationVersion: 'AUTH_MISSING_CURRENT',
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      partyId: 'PARTY_UNCONFIRMED',
      withCurrentAuthorization: false,
    });
    await testDatabase.query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, granted_at)
       values ($1, $2::uuid, 'NEGOTIATION_PARTY', 'PARTY_STALE', 'AUTH_OLD', $3)`,
      [WORLD, SELLER_SUBJECT, AT],
    );

    const publisher = new CurrentNegotiationPartyReadPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).resolves.toMatchObject({
      entitlementCount: 0,
      partyProjections: 0,
    });
    await expect(
      testDatabase.query(
        `select count(*)::text as count
           from world_v2.projection_entitlement
          where world_id = $1
            and classification = 'NEGOTIATION_PARTY'`,
        [WORLD],
      ),
    ).resolves.toMatchObject({ rows: [{ count: '0' }] });
  }, 30_000);

  it('fails closed without replacing party rows when current membership evidence is malformed', async () => {
    const testDatabase = await database();
    await acquireLease(testDatabase);
    await seedCurrentMembership(testDatabase, {
      authSubject: SELLER_SUBJECT,
      authorizationVersion: 'AUTH_BAD',
      countryId: 'country_not_canonical',
      officeId: 'TRADE',
      partyId: 'PARTY_BAD',
    });
    await testDatabase.query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, granted_at)
       values ($1, $2::uuid, 'NEGOTIATION_PARTY', 'PARTY_PRESERVED', 'AUTH_OLD', $3)`,
      [WORLD, BUYER_SUBJECT, AT],
    );

    const publisher = new CurrentNegotiationPartyReadPublisher({
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
           from world_v2.projection_entitlement
          where world_id = $1`,
        [WORLD],
      ),
    ).resolves.toMatchObject({
      rows: [
        { classification: 'NEGOTIATION_PARTY', scope_key: 'PARTY_PRESERVED' },
      ],
    });
  }, 30_000);

  it('rejects a foreign Worker before it reads or changes party membership', async () => {
    const testDatabase = await database();
    const publisher = new CurrentNegotiationPartyReadPublisher({
      database: testDatabase,
      workerId: 'WORKER_OTHER_TEST',
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
    await expect(
      testDatabase.query(
        `select count(*)::text as count
           from world_v2.projection_entitlement`,
      ),
    ).resolves.toMatchObject({ rows: [{ count: '0' }] });
  }, 30_000);
});
