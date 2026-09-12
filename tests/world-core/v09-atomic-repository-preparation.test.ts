// PREPARATION_ONLY_NOT_V09_2_STARTED: exercises the private candidate locally.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Money,
  Quantity,
  SimTime,
  acquireWorldWriterLease,
  canonicalHashInput,
  canonicalSha256,
  canonicalSerialize,
  commandId,
  commodityId,
  countryId,
  createAuthoritativeTransition,
  createFinancialAccount,
  createFinancialPostingBatch,
  createFinalCommandReceipt,
  createInventoryAccount,
  createOutboxMessage,
  createReservationPosting,
  createWorldWriterCommitAssertion,
  eventId,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  legalEntityId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  workerId,
  worldId,
  worldWriterLeaseRequest,
  type Sha256Hex,
} from '@econmind/core';
import {
  AtomicTransitionRepository,
  prepareAtomicTransitionCandidate,
  type AtomicCommitCheckpoint,
  type AtomicCommitFaultInjector,
  type AtomicCommitAuthorizationGuard,
  type PrivateAtomicTransitionCandidate,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import type { SqlDatabase } from '../../apps/world-worker/src/persistence/sql-database.js';
import { createPGliteV09AtomicTestDatabase } from '../support/v09-atomic-database.js';
import {
  V09TransactionRolledBackError,
  type V09AtomicTestDatabase,
} from '../support/v09-atomic-contract.js';

const root = path.resolve(import.meta.dirname, '../..');
const migrationPaths = [
  'database/migrations/artifacts/0001_world_v2_namespace.sql',
  'database/migrations/artifacts/0002_world_v2_command_event_ledger.sql',
  'database/migrations/artifacts/0003_world_v2_command_receipts_outbox.sql',
  'database/migrations/artifacts/0004_world_v2_receipt_event_set_integrity.sql',
  'database/migrations/artifacts/0005_world_v2_writer_lease_fencing.sql',
  'database/migrations/artifacts/0006_world_v2_writer_lease_lineage_guard.sql',
  'database/migrations/artifacts/0007_world_v2_atomic_transition_facts.sql',
  'database/migrations/artifacts/0008_world_v2_materialization_recovery.sql',
  'database/migrations/artifacts/0009_world_v2_posting_payload_integrity.sql',
  'database/migrations/artifacts/0010_world_v2_command_claim_fencing.sql',
] as const;

const sha256Hex: Sha256Hex = (preimage: string) =>
  createHash('sha256').update(preimage, 'utf8').digest('hex');
const WORLD = worldId('WORLD_ATOMIC_REPOSITORY');
const WORKER = workerId('WORKER_ATOMIC');
const COUNTRY = countryId('COUNTRY_ATOMIC');
const OWNER = legalEntityId('ENTITY_ATOMIC_OWNER');
const OBSERVED_AT = '2026-09-12T00:00:01.000Z';
const EXPIRES_AT = '2026-09-12T00:05:00.000Z';

const rollbackCheckpoints = [
  'BEFORE_EVENTS',
  'AFTER_EVENTS',
  'BEFORE_INVENTORY_POSTINGS',
  'AFTER_INVENTORY_POSTINGS',
  'BEFORE_FINANCIAL_POSTINGS',
  'AFTER_FINANCIAL_POSTINGS',
  'BEFORE_AUTHORIZATION_AUDIT',
  'AFTER_AUTHORIZATION_AUDIT',
  'BEFORE_RECEIPT',
  'AFTER_RECEIPT',
  'BEFORE_MATERIALIZATIONS',
  'AFTER_MATERIALIZATIONS',
  'BEFORE_OUTBOX',
  'AFTER_OUTBOX',
  'BEFORE_QUEUE_FINALIZATION',
  'AFTER_QUEUE_FINALIZATION',
  'BEFORE_WORLD_HEAD',
  'AFTER_WORLD_HEAD',
  'BEFORE_TRANSACTION_COMMIT',
] as const satisfies readonly AtomicCommitCheckpoint[];

const automaticAuthorizationGuard: AtomicCommitAuthorizationGuard =
  Object.freeze({
    async assertCurrent(
      transaction: Parameters<
        AtomicCommitAuthorizationGuard['assertCurrent']
      >[0],
      input: Parameters<AtomicCommitAuthorizationGuard['assertCurrent']>[1],
    ) {
      expect(input).toMatchObject({
        authorityKind: 'VERSIONED_AUTOMATIC',
        expected: 'NOT_APPLICABLE',
        proof: null,
      });
      await transaction.query('select 1');
    },
  });

class InjectOnce implements AtomicCommitFaultInjector {
  readonly #checkpoint: AtomicCommitCheckpoint;

  constructor(checkpoint: AtomicCommitCheckpoint) {
    this.#checkpoint = checkpoint;
  }

  hit(checkpoint: AtomicCommitCheckpoint): void {
    if (checkpoint === this.#checkpoint) {
      throw new Error(`INJECTED_${checkpoint}`);
    }
  }
}

const databases: V09AtomicTestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database(): Promise<V09AtomicTestDatabase> {
  const value = createPGliteV09AtomicTestDatabase();
  databases.push(value);
  for (const migrationPath of migrationPaths) {
    await value.executeScript(
      await readFile(path.join(root, migrationPath), 'utf8'),
    );
  }
  return value;
}

function candidate(): PrivateAtomicTransitionCandidate {
  const simTime = SimTime.fromTicks('10000');
  const commandIdentity = commandId('COMMAND_ATOMIC_REPOSITORY');
  const eventIdentity = eventId('EVENT_ATOMIC_REPOSITORY');
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_ATOMIC_REPOSITORY',
      authSubject: '00000000-0000-4000-8000-000000000001',
      commandId: commandIdentity,
      commandType: 'TEST_ATOMIC_COMMAND',
      correlationId: 'CORRELATION_ATOMIC_REPOSITORY',
      countryId: COUNTRY,
      expectedWorldVersion: '0',
      idempotencyKey: 'IDEMPOTENCY_ATOMIC_REPOSITORY',
      officeId: null,
      payload: { operation: 'ATOMIC_REPOSITORY_TEST' },
      schemaVersion: COMMAND_SCHEMA_VERSION,
      simTime: simTime.toCanonicalValue(),
      submittedAtReal: '2026-09-12T00:00:00.000Z',
      worldId: WORLD,
    },
    sha256Hex,
  );
  const event = parseAuthoritativeEvent(
    {
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      correctsEventId: null,
      eventId: eventIdentity,
      eventType: 'TEST_ATOMIC_COMMITTED',
      payload: { commandId: command.commandId },
      recordedAtReal: OBSERVED_AT,
      schemaVersion: EVENT_SCHEMA_VERSION,
      sequence: '1',
      simTime: simTime.toCanonicalValue(),
      worldId: WORLD,
      worldVersion: '1',
    },
    sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
  const available = createInventoryAccount({
    worldId: WORLD,
    countryId: COUNTRY,
    commodityId: commodityId('ATOMIC_GOOD'),
    batchId: inventoryBatchId('ATOMIC_BATCH'),
    unit: 'tonne',
    physicalLocationId: inventoryLocationId('ATOMIC_LOCATION'),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: OWNER,
    riskBearerId: OWNER,
    economicRecognitionId: null,
  });
  const reserved = createInventoryAccount({
    ...available,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId('ATOMIC_RESERVATION'),
  });
  const cash = createFinancialAccount({
    worldId: WORLD,
    accountId: financialAccountId('ATOMIC_CASH'),
    ownerId: OWNER,
    countryId: COUNTRY,
    accountClass: 'CASH',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
  const equity = createFinancialAccount({
    ...cash,
    accountId: financialAccountId('ATOMIC_EQUITY'),
    accountClass: 'EQUITY',
  });
  const inventoryPosting = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId('INVENTORY_ATOMIC_REPOSITORY'),
      worldId: WORLD,
      causationCommandId: command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime,
      command,
      transition,
      quantity: Quantity.from('2', 'tonne'),
      source: available,
      destination: reserved,
    },
    sha256Hex,
  );
  const financialPosting = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: financialPostingBatchId('FINANCIAL_ATOMIC_REPOSITORY'),
      worldId: WORLD,
      causationCommandId: command.commandId,
      causationEventIds: transition.eventIds,
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime,
      command,
      transition,
      settlementCurrency: 'GCU',
      legs: [
        {
          legId: financialPostingLegId('ATOMIC_DEBIT'),
          account: cash,
          direction: 'DEBIT',
          amount: Money.from('25', 'GCU'),
          counterpartyAccountId: equity.accountId,
        },
        {
          legId: financialPostingLegId('ATOMIC_CREDIT'),
          account: equity,
          direction: 'CREDIT',
          amount: Money.from('25', 'GCU'),
          counterpartyAccountId: cash.accountId,
        },
      ],
    },
    sha256Hex,
  );
  const receipt = createFinalCommandReceipt({
    command,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition,
    simTime,
    recordedAtReal: OBSERVED_AT,
  });
  const outboxPayload = { commandId: command.commandId, kind: 'COMMITTED' };
  const outbox = createOutboxMessage({
    messageId: 'OUTBOX_ATOMIC_REPOSITORY',
    worldId: WORLD,
    commandId: command.commandId,
    eventId: eventIdentity,
    payload: outboxPayload,
    payloadHash: canonicalSha256(canonicalHashInput(outboxPayload), sha256Hex),
    availableAtSimTime: simTime,
  });
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      WORLD,
      WORKER,
      '2026-09-12T00:00:00.000Z',
      EXPIRES_AT,
    ),
  ).lease;

  return prepareAtomicTransitionCandidate({
    command,
    commitAuthorization: null,
    draft: {
      transition,
      inventoryPostings: [inventoryPosting],
      financialPostingBatches: [financialPosting],
      receipt,
      outboxMessages: [outbox],
      currentMaterializations: [
        { key: 'ATOMIC_STATE', payload: { worldVersion: '1' } },
      ],
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: createWorldWriterCommitAssertion(lease, '0'),
      observedAtReal: OBSERVED_AT,
    },
    sha256Hex,
  });
}

async function seed(
  value: V09AtomicTestDatabase,
  prepared: PrivateAtomicTransitionCandidate,
): Promise<void> {
  const command = prepared.command;
  await value.query(`insert into world_v2.world_head (world_id) values ($1)`, [
    command.worldId,
  ]);
  await value.query(
    `insert into world_v2.command_submission
       (world_id, command_id, idempotency_key, command_type, schema_version,
        canonical_payload, payload_sha256, command_fingerprint, auth_subject,
        actor_id, country_id, office_id, expected_world_version, sim_time,
        correlation_id, submitted_at_real)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
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
      command.simTime.toCanonicalValue(),
      command.correlationId,
      command.submittedAtReal,
    ],
  );
  await value.query(
    `insert into world_v2.command_queue
       (world_id, command_id, authority_kind, queue_state, priority_rank,
        available_at_sim_time, attempt_count, claimed_by, claimed_at_real,
        claim_fencing_token)
     values ($1, $2, 'VERSIONED_AUTOMATIC', 'CLAIMED', 0, $3, 1, $4, $5, 1)`,
    [
      command.worldId,
      command.commandId,
      command.simTime.toCanonicalValue(),
      WORKER,
      '2026-09-12T00:00:00.500Z',
    ],
  );
  await value.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, $4)`,
    [command.worldId, WORKER, '2026-09-12T00:00:00.000Z', '300000'],
  );
}

async function footprint(value: V09AtomicTestDatabase) {
  const result = await value.query<{
    readonly authorization_count: number;
    readonly event_count: number;
    readonly financial_count: number;
    readonly inventory_count: number;
    readonly materialization_count: number;
    readonly outbox_count: number;
    readonly queue_state: string;
    readonly receipt_count: number;
    readonly world_version: string;
  }>(
    `select
       (select count(*)::int from world_v2.authoritative_event) as event_count,
       (select count(*)::int from world_v2.inventory_posting) as inventory_count,
       (select count(*)::int from world_v2.financial_posting_batch) as financial_count,
       (select count(*)::int from world_v2.authoritative_commit_authorization) as authorization_count,
       (select count(*)::int from world_v2.command_receipt) as receipt_count,
       (select count(*)::int from world_v2.current_materialization) as materialization_count,
       (select count(*)::int from world_v2.notification_outbox) as outbox_count,
       (select queue_state from world_v2.command_queue) as queue_state,
       (select world_version::text from world_v2.world_head) as world_version`,
  );
  return result.rows[0]!;
}

function repository(
  value: V09AtomicTestDatabase,
  faultInjector?: AtomicCommitFaultInjector,
) {
  return new AtomicTransitionRepository({
    database: value as SqlDatabase,
    authorizationGuard: automaticAuthorizationGuard,
    workerId: WORKER,
    sha256Hex,
    ...(faultInjector === undefined ? {} : { faultInjector }),
  });
}

describe('V09 private atomic repository preparation', () => {
  it('commits every authoritative fact once and returns the durable receipt on retry', async () => {
    const value = await database();
    const prepared = candidate();
    await seed(value, prepared);

    await expect(repository(value).commit(prepared)).resolves.toMatchObject({
      source: 'NEW_COMMIT',
      receipt: { outcome: 'COMMITTED' },
    });
    await expect(repository(value).commit(prepared)).resolves.toMatchObject({
      source: 'EXISTING_COMMIT',
      receipt: { outcome: 'COMMITTED' },
    });
    await expect(footprint(value)).resolves.toEqual({
      authorization_count: 1,
      event_count: 1,
      financial_count: 1,
      inventory_count: 1,
      materialization_count: 1,
      outbox_count: 1,
      queue_state: 'FINALIZED',
      receipt_count: 1,
      world_version: '1',
    });
  });

  it('rejects direct forged Inventory and Financial evidence despite valid V07 source binding', async () => {
    const value = await database();
    const prepared = candidate();
    await seed(value, prepared);
    await repository(value).commit(prepared);

    const inventory = prepared.inventoryPostings[0]!;
    const { fingerprint: _inventoryFingerprint, ...inventoryIntent } =
      inventory;
    const canonicalInventoryPayload = canonicalSerialize(inventoryIntent);
    const changedInventoryId = canonicalInventoryPayload.replace(
      'INVENTORY_ATOMIC_REPOSITORY',
      'INVENTORY_FORGED_EVIDENCE',
    );
    const inventoryColumns = [
      inventory.worldId,
      'INVENTORY_FORGED_EVIDENCE',
      inventory.causationCommandId,
      inventory.worldVersionBefore,
      inventory.worldVersionAfter,
      inventory.simTime.toCanonicalValue(),
      canonicalSerialize(inventory.causationEventIds),
      canonicalSerialize(inventory.transitionBinding),
      inventory.operation,
    ] as const;
    await expect(
      value.query(
        `insert into world_v2.inventory_posting
           (world_id, posting_id, causation_command_id,
            world_version_before, world_version_after, sim_time, event_ids,
            transition_binding, operation, canonical_payload, posting_fingerprint)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [...inventoryColumns, changedInventoryId, inventory.fingerprint],
      ),
    ).rejects.toThrow('fingerprint does not hash its canonical intent');
    const unbalancedInventoryPayload = changedInventoryId.replace(
      '"amount":"-2"',
      '"amount":"-3"',
    );
    await expect(
      value.query(
        `insert into world_v2.inventory_posting
           (world_id, posting_id, causation_command_id,
            world_version_before, world_version_after, sim_time, event_ids,
            transition_binding, operation, canonical_payload, posting_fingerprint)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [
          ...inventoryColumns,
          unbalancedInventoryPayload,
          canonicalSha256(
            canonicalHashInput(JSON.parse(unbalancedInventoryPayload)),
            sha256Hex,
          ),
        ],
      ),
    ).rejects.toThrow('conservation or account shape');

    const batch = prepared.financialPostingBatches[0]!;
    const { fingerprint: _batchFingerprint, ...batchIntent } = batch;
    const canonicalBatchPayload = canonicalSerialize(batchIntent);
    const changedBatchId = canonicalBatchPayload.replace(
      'FINANCIAL_ATOMIC_REPOSITORY',
      'FINANCIAL_FORGED_EVIDENCE',
    );
    const batchColumns = [
      batch.worldId,
      'FINANCIAL_FORGED_EVIDENCE',
      batch.causationCommandId,
      batch.worldVersionBefore,
      batch.worldVersionAfter,
      batch.simTime.toCanonicalValue(),
      canonicalSerialize(batch.causationEventIds),
      canonicalSerialize(batch.transitionBinding),
      batch.settlementCurrency,
    ] as const;
    await expect(
      value.query(
        `insert into world_v2.financial_posting_batch
           (world_id, batch_id, causation_command_id,
            world_version_before, world_version_after, sim_time, event_ids,
            transition_binding, settlement_currency, canonical_payload,
            batch_fingerprint)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [...batchColumns, changedBatchId, batch.fingerprint],
      ),
    ).rejects.toThrow('fingerprint does not hash its canonical intent');
    const unbalancedBatchPayload = changedBatchId.replace(
      '"amount":"25"',
      '"amount":"26"',
    );
    await expect(
      value.query(
        `insert into world_v2.financial_posting_batch
           (world_id, batch_id, causation_command_id,
            world_version_before, world_version_after, sim_time, event_ids,
            transition_binding, settlement_currency, canonical_payload,
            batch_fingerprint)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)`,
        [
          ...batchColumns,
          unbalancedBatchPayload,
          canonicalSha256(
            canonicalHashInput(JSON.parse(unbalancedBatchPayload)),
            sha256Hex,
          ),
        ],
      ),
    ).rejects.toThrow('Financial Posting legs violate exact V08 balance');
    await expect(footprint(value)).resolves.toMatchObject({
      financial_count: 1,
      inventory_count: 1,
    });
  });

  it.each(rollbackCheckpoints)(
    'leaves no partial authoritative fact when %s fails',
    async (checkpoint) => {
      const value = await database();
      const prepared = candidate();
      await seed(value, prepared);

      await expect(
        repository(value, new InjectOnce(checkpoint)).commit(prepared),
      ).rejects.toEqual(
        expect.objectContaining({
          name: V09TransactionRolledBackError.name,
          cause: expect.objectContaining({
            message: `INJECTED_${checkpoint}`,
          }),
        }),
      );
      await expect(footprint(value)).resolves.toEqual({
        authorization_count: 0,
        event_count: 0,
        financial_count: 0,
        inventory_count: 0,
        materialization_count: 0,
        outbox_count: 0,
        queue_state: 'CLAIMED',
        receipt_count: 0,
        world_version: '0',
      });
    },
  );

  it('recovers a committed receipt after acknowledgement is lost', async () => {
    const value = await database();
    const prepared = candidate();
    await seed(value, prepared);
    const acknowledgementLost: SqlDatabase = {
      query: value.query,
      async transaction(operation) {
        await value.transaction(operation);
        throw new Error('COMMIT_ACKNOWLEDGEMENT_LOST');
      },
    };
    const atomicRepository = new AtomicTransitionRepository({
      database: acknowledgementLost,
      authorizationGuard: automaticAuthorizationGuard,
      workerId: WORKER,
      sha256Hex,
    });

    await expect(atomicRepository.commit(prepared)).resolves.toMatchObject({
      source: 'RECOVERED_AFTER_UNKNOWN_ACKNOWLEDGEMENT',
      receipt: { outcome: 'COMMITTED' },
    });
    await expect(footprint(value)).resolves.toMatchObject({
      event_count: 1,
      financial_count: 1,
      inventory_count: 1,
      receipt_count: 1,
      world_version: '1',
    });
  });
});
