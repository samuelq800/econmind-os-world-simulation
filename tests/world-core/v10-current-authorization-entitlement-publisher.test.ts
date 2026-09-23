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
  CurrentAuthorizationEntitlementPublisher,
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
const WORLD = worldId('WORLD_V10_ENTITLEMENT_TEST');
const WORKER = workerId('WORKER_V10_ENTITLEMENT_TEST');
const AT = '2026-09-13T00:00:00.000Z';
const EXPIRY = '2026-09-13T00:05:00.000Z';
const SELLER_SUBJECT = '550e8400-e29b-41d4-a716-446655440001';
const BUYER_SUBJECT = '550e8400-e29b-41d4-a716-446655440002';
const INACTIVE_SUBJECT = '550e8400-e29b-41d4-a716-446655440003';

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

async function seedCurrentAuthorization(
  database: V09AtomicTestDatabase,
  input: Readonly<{
    authSubject: string;
    authorizationVersion: string;
    capability: string;
    countryId: string;
    officeId: string;
    active?: boolean;
  }>,
): Promise<void> {
  await database.query(
    `insert into world_v2.current_commit_authorization
       (world_id, auth_subject, country_id, office_id, capability, team_id,
        authorization_version, active, refreshed_at_real)
     values ($1, $2::uuid, $3, $4, $5, 'TEAM_V10_TEST', $6, $7, $8)`,
    [
      WORLD,
      input.authSubject,
      input.countryId,
      input.officeId,
      input.capability,
      input.authorizationVersion,
      input.active ?? true,
      AT,
    ],
  );
}

describe('V10.1 current-authorization entitlement publication', () => {
  it('rebuilds Country and Office-private entitlements from active server facts while preserving future owners', async () => {
    const testDatabase = await database();
    await acquireLease(testDatabase);
    await seedCurrentAuthorization(testDatabase, {
      authSubject: SELLER_SUBJECT,
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      capability: 'TRADE_PROPOSE',
      authorizationVersion: 'AUTH_SELLER_1',
    });
    await seedCurrentAuthorization(testDatabase, {
      authSubject: SELLER_SUBJECT,
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      capability: 'TRADE_SIGN',
      authorizationVersion: 'AUTH_SELLER_1',
    });
    await seedCurrentAuthorization(testDatabase, {
      authSubject: BUYER_SUBJECT,
      countryId: 'COUNTRY_BUYER',
      officeId: 'FINANCE',
      capability: 'TREASURY_APPROVE',
      authorizationVersion: 'AUTH_BUYER_1',
    });
    await seedCurrentAuthorization(testDatabase, {
      authSubject: INACTIVE_SUBJECT,
      countryId: 'COUNTRY_INACTIVE',
      officeId: 'TRADE',
      capability: 'TRADE_SIGN',
      authorizationVersion: 'AUTH_INACTIVE_1',
      active: false,
    });
    await testDatabase.query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, granted_at)
       values
         ($1, $2::uuid, 'NEGOTIATION_PARTY', 'PARTY_FUTURE', 'AUTH_PARTY_1', $3),
         ($1, $2::uuid, 'ADMIN', 'ADMIN_FUTURE', 'AUTH_ADMIN_1', $3),
         ($1, $2::uuid, 'COUNTRY', 'COUNTRY_STALE', 'AUTH_STALE_1', $3)`,
      [WORLD, SELLER_SUBJECT, AT],
    );

    const publisher = new CurrentAuthorizationEntitlementPublisher({
      database: testDatabase,
      workerId: WORKER,
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).resolves.toEqual({
      countryEntitlements: 2,
      officePrivateEntitlements: 2,
      worldVersion: '0',
    });

    const rows = await testDatabase.query<{
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
    );
    expect(rows.rows).toEqual([
      {
        auth_subject: SELLER_SUBJECT,
        classification: 'ADMIN',
        scope_key: 'ADMIN_FUTURE',
        authorization_version: 'AUTH_ADMIN_1',
      },
      {
        auth_subject: BUYER_SUBJECT,
        classification: 'COUNTRY',
        scope_key: 'COUNTRY_BUYER',
        authorization_version: 'AUTH_BUYER_1',
      },
      {
        auth_subject: SELLER_SUBJECT,
        classification: 'COUNTRY',
        scope_key: 'COUNTRY_SELLER',
        authorization_version: 'AUTH_SELLER_1',
      },
      {
        auth_subject: SELLER_SUBJECT,
        classification: 'NEGOTIATION_PARTY',
        scope_key: 'PARTY_FUTURE',
        authorization_version: 'AUTH_PARTY_1',
      },
      {
        auth_subject: BUYER_SUBJECT,
        classification: 'OFFICE_PRIVATE',
        scope_key: officePrivateReadProjectionScopeKey({
          countryId: 'COUNTRY_BUYER' as never,
          officeId: 'FINANCE' as never,
        }),
        authorization_version: 'AUTH_BUYER_1',
      },
      {
        auth_subject: SELLER_SUBJECT,
        classification: 'OFFICE_PRIVATE',
        scope_key: officePrivateReadProjectionScopeKey({
          countryId: 'COUNTRY_SELLER' as never,
          officeId: 'TRADE' as never,
        }),
        authorization_version: 'AUTH_SELLER_1',
      },
    ]);
  }, 30_000);

  it('fails closed without replacing rows when one current entitlement has conflicting revisions', async () => {
    const testDatabase = await database();
    await acquireLease(testDatabase);
    await seedCurrentAuthorization(testDatabase, {
      authSubject: SELLER_SUBJECT,
      countryId: 'COUNTRY_SELLER',
      officeId: 'TRADE',
      capability: 'TRADE_PROPOSE',
      authorizationVersion: 'AUTH_SELLER_1',
    });
    await seedCurrentAuthorization(testDatabase, {
      authSubject: SELLER_SUBJECT,
      countryId: 'COUNTRY_SELLER',
      officeId: 'FINANCE',
      capability: 'TREASURY_APPROVE',
      authorizationVersion: 'AUTH_SELLER_2',
    });
    await testDatabase.query(
      `insert into world_v2.projection_entitlement
         (world_id, auth_subject, classification, scope_key,
          authorization_version, granted_at)
       values ($1, $2::uuid, 'COUNTRY', 'COUNTRY_PRESERVED', 'AUTH_OLD_1', $3)`,
      [WORLD, BUYER_SUBJECT, AT],
    );

    const publisher = new CurrentAuthorizationEntitlementPublisher({
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
      rows: [{ classification: 'COUNTRY', scope_key: 'COUNTRY_PRESERVED' }],
    });
  }, 30_000);

  it('rejects a foreign Worker before it reads or changes server-held authorization', async () => {
    const testDatabase = await database();
    const publisher = new CurrentAuthorizationEntitlementPublisher({
      database: testDatabase,
      workerId: 'WORKER_OTHER_TEST',
    });
    await expect(
      publisher.replace({ assertion: assertion(), observedAtReal: AT }),
    ).rejects.toMatchObject({ code: 'TRANSITION_EVIDENCE_INVALID' });
    await expect(
      testDatabase.query(
        'select count(*)::text as count from world_v2.projection_entitlement',
      ),
    ).resolves.toMatchObject({ rows: [{ count: '0' }] });
  }, 30_000);
});
