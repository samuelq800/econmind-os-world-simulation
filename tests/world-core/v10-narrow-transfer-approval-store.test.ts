import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
  parseCanonicalCommand,
  type CanonicalCommand,
  type Sha256Hex,
} from '@econmind/core';
import { NarrowTransferApprovalStore } from '../../apps/world-worker/src/persistence/narrow-transfer-approval-store.js';
import type { SqlExecutor } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import type { V09AtomicTestDatabase } from '../support/v09-atomic-contract.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';

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
  '0015_world_v2_narrow_transfer_approvals.sql',
] as const;
const SUBMITTED = '2026-09-14T00:00:00.000Z';
const EXPIRES = '2026-09-14T00:10:00.000Z';
const sha256Hex: Sha256Hex = (preimage) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

function command(quantity = '2'): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const source = fixture.inventoryAccounts.sellerAvailable;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: 'COMMAND_V10_2_DURABLE_APPROVAL',
      idempotencyKey: 'IDEMPOTENCY_V10_2_DURABLE_APPROVAL',
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: SUBMITTED,
      correlationId: 'CORRELATION_V10_2_DURABLE_APPROVAL',
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: fixture.countries.seller,
        buyerCountryId: fixture.countries.buyer,
        quantity: { amount: quantity, unit: source.unit },
        price: { amount: '3', currency: 'GCU', perUnit: source.unit },
        assetSource: {
          batchId: source.batchId,
          physicalLocationId: source.physicalLocationId,
          titleHolderId: source.titleHolderId,
          riskBearerId: source.riskBearerId,
          economicRecognitionId: source.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: EXPIRES,
      },
    },
    sha256Hex,
  );
}

async function database(
  command: CanonicalCommand,
): Promise<V09AtomicTestDatabase> {
  const database = createPGliteV09AtomicTestDatabase();
  databases.push(database);
  for (const migration of migrations) {
    await database.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  await database.query(
    'insert into world_v2.world_head (world_id) values ($1)',
    [command.worldId],
  );
  await database.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10, $11, $12, $13,
             $14, $15, $16::timestamptz)`,
    [
      command.worldId,
      command.commandId,
      command.idempotencyKey,
      command.commandType,
      command.schemaVersion,
      command.canonicalPayload,
      command.payloadHash,
      command.fingerprint,
      command.authSubject,
      command.actorId,
      command.countryId,
      command.officeId,
      command.expectedWorldVersion,
      command.simTime.ticks,
      command.correlationId,
      command.submittedAtReal,
    ],
  );
  const fixture = createV10TwoCountryTestFixture();
  for (const actor of [
    fixture.officeActors.sellerTrade,
    fixture.officeActors.buyerTrade,
    fixture.officeActors.buyerFinance,
  ]) {
    await database.query(
      `insert into world_v2.current_commit_authorization
         (world_id, auth_subject, country_id, office_id, capability, team_id,
          authorization_version, active, refreshed_at_real)
       values ($1, $2::uuid, $3, $4, $5, $6, $7, true, $8::timestamptz)`,
      [
        command.worldId,
        actor.principal.authSubject,
        actor.membership.countryId,
        actor.officeId,
        actor.capability,
        actor.membership.teamId,
        actor.membership.authorizationVersion,
        SUBMITTED,
      ],
    );
  }
  return database;
}

describe('V10.2 durable narrow transfer approval store', () => {
  it('rejects a different canonical intent with the same durable Command identity before creating a proposal', async () => {
    const accepted = command();
    const testDatabase = await database(accepted);
    const fixture = createV10TwoCountryTestFixture();
    const store = new NarrowTransferApprovalStore({
      database: testDatabase,
      sha256Hex,
    });

    await expect(
      store.openSellerOffer({
        command: command('1'),
        signer: {
          actorId: fixture.officeActors.sellerTrade.actorId,
          authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
          signedAtReal: '2026-09-14T00:00:01.000Z',
        },
      }),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT },
    });
    await expect(
      testDatabase.query<{ readonly count: string }>(
        `select count(*)::text as count
           from world_v2.narrow_transfer_proposal
          where world_id = $1`,
        [accepted.worldId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: '0' }] });
  });

  it('binds all three current Office signatures and rechecks their revision at the atomic cutoff', async () => {
    const value = command();
    const fixture = createV10TwoCountryTestFixture();
    const testDatabase = await database(value);
    const store = new NarrowTransferApprovalStore({
      database: testDatabase,
      sha256Hex,
    });

    await expect(
      testDatabase.query<{
        readonly capability: string;
        readonly country_id: string;
        readonly office_id: string;
      }>(
        `select country_id, office_id, capability
           from world_v2.current_commit_authorization
          where world_id = $1
          order by country_id, office_id`,
        [value.worldId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          capability: 'FINANCE_TREASURY',
          country_id: fixture.countries.buyer,
          office_id: 'FINANCE',
        },
        {
          capability: 'TRADE_CONTRACTS',
          country_id: fixture.countries.buyer,
          office_id: 'TRADE',
        },
        {
          capability: 'TRADE_CONTRACTS',
          country_id: fixture.countries.seller,
          office_id: 'TRADE',
        },
      ],
    });
    await store.openSellerOffer({
      command: value,
      signer: {
        actorId: fixture.officeActors.sellerTrade.actorId,
        authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
        signedAtReal: '2026-09-14T00:00:01.000Z',
      },
    });
    await store.signBuyerOffice({
      command: value,
      office: 'TRADE',
      signer: {
        actorId: fixture.officeActors.buyerTrade.actorId,
        authSubject: fixture.officeActors.buyerTrade.principal.authSubject,
        signedAtReal: '2026-09-14T00:00:02.000Z',
      },
    });
    await store.signBuyerOffice({
      command: value,
      office: 'FINANCE',
      signer: {
        actorId: fixture.officeActors.buyerFinance.actorId,
        authSubject: fixture.officeActors.buyerFinance.principal.authSubject,
        signedAtReal: '2026-09-14T00:00:03.000Z',
      },
    });

    const cutoffAuthorizationQueries: string[] = [];
    await expect(
      testDatabase.transaction((transaction) => {
        const observingTransaction: SqlExecutor = {
          query<Row extends object = Record<string, unknown>>(
            statement: string,
            parameters?: readonly unknown[],
          ) {
            if (
              statement.includes('from world_v2.current_commit_authorization')
            ) {
              cutoffAuthorizationQueries.push(statement);
            }
            return transaction.query<Row>(statement, parameters);
          },
        };
        return store.assertCurrent(observingTransaction, {
          command: value,
          observedAtReal: '2026-09-14T00:00:04.000Z',
        });
      }),
    ).resolves.toBe(undefined);
    expect(cutoffAuthorizationQueries).toHaveLength(3);
    for (const statement of cutoffAuthorizationQueries) {
      expect(statement).toMatch(/for update/u);
      expect(statement).not.toMatch(/for key share/u);
    }
    await expect(
      testDatabase.query<{
        readonly proposal_id: string;
        readonly status: string;
      }>(
        `select proposal_id, status
           from world_v2.narrow_transfer_proposal
          where world_id = $1
          order by proposal_id`,
        [value.worldId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          proposal_id: `BUYER_APPROVAL_${value.commandId}`,
          status: 'APPROVED',
        },
        {
          proposal_id: `SELLER_APPROVAL_${value.commandId}`,
          status: 'APPROVED',
        },
      ],
    });

    await testDatabase.query(
      `update world_v2.current_commit_authorization
          set authorization_version = 'AUTH_V10_BUYER_2'
        where world_id = $1
          and auth_subject = $2::uuid
          and office_id = 'FINANCE'`,
      [value.worldId, fixture.officeActors.buyerFinance.principal.authSubject],
    );
    await expect(
      testDatabase.transaction((transaction) =>
        store.assertCurrent(transaction as SqlExecutor, {
          command: value,
          observedAtReal: '2026-09-14T00:00:04.000Z',
        }),
      ),
    ).rejects.toMatchObject({
      cause: { code: DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED },
    });
  });
});
