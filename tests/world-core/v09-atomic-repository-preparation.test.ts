// PREPARATION_ONLY_NOT_V09_2_STARTED: exercises the private candidate locally.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  DOMAIN_ERROR_CODES,
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
  type CurrentMaterializationInput,
} from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import {
  observeCurrentMaterialization,
  type CurrentMaterializationObservation,
} from '../../apps/world-worker/src/persistence/current-materialization-observation.js';
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
  'database/migrations/artifacts/0011_world_v2_current_commit_authorization.sql',
  'database/migrations/artifacts/0012_world_v2_command_claim_active_lease_guard.sql',
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

function candidate(
  commandType: string = 'TEST_ATOMIC_COMMAND',
  options: {
    readonly worldVersionBefore?: string;
    readonly materializations?: readonly CurrentMaterializationInput[];
  } = {},
): PrivateAtomicTransitionCandidate {
  const before = options.worldVersionBefore ?? '0';
  const after = String(BigInt(before) + 1n);
  const suffix = before === '0' ? '' : `_${before}`;
  const simTime = SimTime.fromTicks('10000');
  const commandIdentity = commandId(`COMMAND_ATOMIC_REPOSITORY${suffix}`);
  const eventIdentity = eventId(`EVENT_ATOMIC_REPOSITORY${suffix}`);
  const command = parseCanonicalCommand(
    {
      actorId: 'ACTOR_ATOMIC_REPOSITORY',
      authSubject: '00000000-0000-4000-8000-000000000001',
      commandId: commandIdentity,
      commandType,
      correlationId: 'CORRELATION_ATOMIC_REPOSITORY',
      countryId: COUNTRY,
      expectedWorldVersion: before,
      idempotencyKey: `IDEMPOTENCY_ATOMIC_REPOSITORY${suffix}`,
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
      sequence: after,
      simTime: simTime.toCanonicalValue(),
      worldId: WORLD,
      worldVersion: after,
    },
    sha256Hex,
  );
  const transition = createAuthoritativeTransition({
    command,
    worldVersionBefore: before,
    worldVersionAfter: after,
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
      worldVersionBefore: before,
      worldVersionAfter: after,
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
      worldVersionBefore: before,
      worldVersionAfter: after,
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
    messageId: `OUTBOX_ATOMIC_REPOSITORY${suffix}`,
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
      inventoryPostings: before === '0' ? [inventoryPosting] : [],
      financialPostingBatches: before === '0' ? [financialPosting] : [],
      receipt,
      outboxMessages: [outbox],
      currentMaterializations: options.materializations ?? [
        { key: 'ATOMIC_STATE', payload: { worldVersion: after } },
      ],
      authorityKind: 'VERSIONED_AUTOMATIC',
      commitAssertion: createWorldWriterCommitAssertion(lease, before),
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
  if (command.expectedWorldVersion === '0') {
    await value.query(
      `insert into world_v2.world_head (world_id) values ($1)`,
      [command.worldId],
    );
  }
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
  if (command.expectedWorldVersion === '0') {
    await value.query(
      `select * from world_v2.acquire_world_writer_lease($1, $2, $3, $4)`,
      [command.worldId, WORKER, '2026-09-12T00:00:00.000Z', '300000'],
    );
  }
  await value.query(
    `insert into world_v2.command_queue
       (world_id, command_id, authority_kind, priority_rank,
        available_at_sim_time, attempt_count)
     values ($1, $2, 'VERSIONED_AUTOMATIC', 0, $3, 0)`,
    [command.worldId, command.commandId, command.simTime.toCanonicalValue()],
  );
  await value.query(
    `update world_v2.command_queue
        set queue_state = 'CLAIMED',
            attempt_count = 1,
            claimed_by = $3,
            claimed_at_real = $4,
            claim_fencing_token = 1
      where world_id = $1 and command_id = $2`,
    [command.worldId, command.commandId, WORKER, '2026-09-12T00:00:00.500Z'],
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

describe('sparse materialization compare-and-swap', () => {
  async function sparseWorld() {
    const value = await database();
    const first = candidate();
    await seed(value, first);
    await repository(value).commit(first);
    const unrelated = candidate('TEST_ATOMIC_COMMAND', {
      worldVersionBefore: '1',
      materializations: [{ key: 'OTHER_STATE', payload: { counter: '1' } }],
    });
    await seed(value, unrelated);
    await repository(value).commit(unrelated);
    return value;
  }

  async function observe(value: V09AtomicTestDatabase, key = 'ATOMIC_STATE') {
    return observeCurrentMaterialization({
      executor: value,
      worldId: WORLD,
      key,
      expectedWorldVersion: '2',
      sha256Hex,
    });
  }

  function third(observation?: CurrentMaterializationObservation) {
    return candidate('TEST_ATOMIC_COMMAND', {
      worldVersionBefore: '2',
      materializations: [
        {
          key: observation?.key ?? 'ATOMIC_STATE',
          payload: { counter: '2' },
          ...(observation === undefined ? {} : { observation }),
        },
      ],
    });
  }

  async function head(value: V09AtomicTestDatabase) {
    return (
      await value.query<{ readonly world_version: string }>(
        'select world_version::text from world_v2.world_head where world_id = $1',
        [WORLD],
      )
    ).rows[0]!.world_version;
  }

  it('retains old global CAS rejection, then commits an observed version1 country at global2 once', async () => {
    const value = await sparseWorld();
    const old = third();
    await seed(value, old);
    await expect(repository(value).commit(old)).rejects.toThrow();
    expect(await head(value)).toBe('2');
    const observation = await observe(value);
    expect(observation).toMatchObject({
      observedWorldVersion: '2',
      valueWorldVersion: '1',
    });
    const prepared = third(observation);
    expect((await repository(value).commit(prepared)).source).toBe(
      'NEW_COMMIT',
    );
    expect((await repository(value).commit(prepared)).source).toBe(
      'EXISTING_COMMIT',
    );
    expect(await head(value)).toBe('3');
    expect(
      (
        await value.query(
          'select world_version::text, canonical_payload from world_v2.current_materialization where materialization_key=$1',
          ['ATOMIC_STATE'],
        )
      ).rows[0],
    ).toEqual({ world_version: '3', canonical_payload: '{"counter":"2"}' });
    expect(
      (
        await value.query(
          'select count(*)::int as n from world_v2.authoritative_event',
        )
      ).rows[0],
    ).toEqual({ n: 3 });
  });

  it.each(['HASH_CHANGED', 'ROW_DELETED'] as const)(
    'rolls back all third-command effects on %s after observation',
    async (change) => {
      const value = await sparseWorld();
      const prepared = third(await observe(value));
      await seed(value, prepared);
      if (change === 'ROW_DELETED') {
        await value.query(
          'delete from world_v2.current_materialization where materialization_key=$1',
          ['ATOMIC_STATE'],
        );
      } else {
        const payload = { counter: 'externally-rebuilt' };
        await value.query(
          'update world_v2.current_materialization set canonical_payload=$2,payload_sha256=$3 where materialization_key=$1',
          [
            'ATOMIC_STATE',
            canonicalSerialize(payload),
            canonicalSha256(canonicalHashInput(payload), sha256Hex),
          ],
        );
      }
      await expect(repository(value).commit(prepared)).rejects.toThrow();
      expect(await head(value)).toBe('2');
      expect(
        (
          await value.query(
            'select count(*)::int as n from world_v2.authoritative_event',
          )
        ).rows[0],
      ).toEqual({ n: 2 });
      expect(
        (
          await value.query(
            'select count(*)::int as n from world_v2.command_receipt',
          )
        ).rows[0],
      ).toEqual({ n: 2 });
    },
  );

  it('requires an observed absent row to remain absent and permits a genuine first write', async () => {
    const value = await sparseWorld();
    const observation = await observe(value, 'NEW_STATE');
    expect(observation.valueWorldVersion).toBeNull();
    const prepared = third(observation);
    await seed(value, prepared);
    await value.query(`insert into world_v2.current_materialization
      (world_id,materialization_key,world_version,source_command_id,canonical_payload,payload_sha256)
      select world_id,'NEW_STATE',world_version,source_command_id,canonical_payload,payload_sha256
      from world_v2.current_materialization where materialization_key='OTHER_STATE'`);
    await expect(repository(value).commit(prepared)).rejects.toThrow();
    expect(await head(value)).toBe('2');
    await value.query(
      "delete from world_v2.current_materialization where materialization_key='NEW_STATE'",
    );
    expect((await repository(value).commit(prepared)).source).toBe(
      'NEW_COMMIT',
    );
    expect(await head(value)).toBe('3');
  });

  it('rejects forged, wrong-key, wrong-world and stale-head observations before candidate creation', async () => {
    const value = await sparseWorld();
    const observation = await observe(value);
    for (const forged of [
      { ...observation },
      { ...observation, key: 'OTHER_STATE' },
      { ...observation, worldId: worldId('OTHER_WORLD') },
      { ...observation, observedWorldVersion: '1' },
    ]) {
      expect(() =>
        third(forged as CurrentMaterializationObservation),
      ).toThrow();
    }
    expect(() =>
      candidate('TEST_ATOMIC_COMMAND', {
        worldVersionBefore: '2',
        materializations: [{ key: 'OTHER_STATE', payload: {}, observation }],
      }),
    ).toThrow();
    await expect(
      observeCurrentMaterialization({
        executor: value,
        worldId: WORLD,
        key: 'ATOMIC_STATE',
        expectedWorldVersion: '1',
        sha256Hex,
      }),
    ).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.WORLD_VERSION_MISMATCH,
    });
    expect(await head(value)).toBe('2');
  });

  it('refuses a corrupt current cache hash rather than branding it as a domain observation', async () => {
    const value = await sparseWorld();
    await value.query(
      "update world_v2.current_materialization set payload_sha256=$1 where materialization_key='ATOMIC_STATE'",
      [`sha256:${'0'.repeat(64)}`],
    );
    await expect(observe(value)).rejects.toMatchObject({
      code: DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    });
    expect(await head(value)).toBe('2');
  });
});

describe('V09 private atomic repository preparation', () => {
  it('fails closed before any effect when a V10 narrow transfer lacks the server-held approval guard', async () => {
    const value = await database();
    const prepared = candidate('CORE_GOODS_TRANSFER_V1');
    await seed(value, prepared);

    await expect(repository(value).commit(prepared)).rejects.toEqual(
      expect.objectContaining({
        name: V09TransactionRolledBackError.name,
        cause: expect.objectContaining({ code: 'AUTHORIZATION_DENIED' }),
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
  });

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
    void _inventoryFingerprint;
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
    void _batchFingerprint;
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
