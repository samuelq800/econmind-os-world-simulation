import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Money,
  acquireWorldWriterLease,
  createAuthoritativeTransition,
  createInventoryAccount,
  createOpeningSeed,
  createReservationPosting,
  createWorldWriterCommitAssertion,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryPostingId,
  inventoryReservationId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  rebuildV08LedgersFromLineage,
  shipNarrowTreasuryGcuTransfer,
  workerId,
  worldWriterLeaseRequest,
  type CanonicalCommand,
} from '@econmind/core';
import {
  prepareNarrowTreasuryGcuDeliveryAtomicDraft,
  type NarrowTreasuryGcuDeliveryPreparationSource,
} from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import { createV10TwoCountryTestFixture } from './v10-two-country-fixture.js';
import { createPGliteV09AtomicTestDatabase } from './v09-atomic-database.js';
import type { V09AtomicTestDatabase } from './v09-atomic-contract.js';
import { executeV29LocalWorkerDelivery } from './v29-worker-delivery-driver.js';
import {
  V29WorkerReplayMismatchError,
  V29WorkerReplayStepError,
  assertV29WorkerFixedSeedReplay,
  readV29DurableWorkerStep,
} from './v29-worker-replay-evidence.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const AT = '2026-09-14T00:02:00.000Z';
const WORKER = 'WORKER_V29_LOCAL_DELIVERY';
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
  '0015_world_v2_narrow_transfer_approvals.sql',
  '0016_world_v2_opening_seed.sql',
] as const;

async function database(): Promise<V09AtomicTestDatabase> {
  const result = createPGliteV09AtomicTestDatabase();
  for (const migration of migrations) {
    await result.executeScript(
      await readFile(
        path.join(root, 'database/migrations/artifacts', migration),
        'utf8',
      ),
    );
  }
  return result;
}

function transition(
  command: CanonicalCommand,
  before: string,
  sequence: string,
) {
  const after = (BigInt(before) + 1n).toString();
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: command.commandType,
      worldId: command.worldId,
      worldVersion: after,
      sequence,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: AT,
      correctsEventId: null,
      payload: { commandFingerprint: command.fingerprint },
    },
    sha256,
  );
  return {
    event,
    transition: createAuthoritativeTransition({
      command,
      worldVersionBefore: before,
      worldVersionAfter: after,
      events: [event],
    }),
  };
}

function automaticCommand(input: {
  readonly id: string;
  readonly commandType: string;
  readonly before: string;
  readonly simTime: string;
  readonly payload: unknown;
}): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: input.commandType,
      commandId: input.id,
      idempotencyKey: `IDEMPOTENCY_${input.id}`,
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: null,
      expectedWorldVersion: input.before,
      simTime: input.simTime,
      submittedAtReal: AT,
      correlationId: `CORRELATION_${input.id}`,
      payload: input.payload,
    },
    sha256,
  );
}

function preparedTwoCountryDelivery(seed = 'V29_DEFAULT') {
  const suffix = sha256(seed).slice(0, 12).toUpperCase();
  const fixture = createV10TwoCountryTestFixture();
  const available = fixture.inventoryAccounts.sellerAvailable;
  const transfer = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: `COMMAND_V29_LOCAL_TRANSFER_${suffix}`,
      idempotencyKey: `IDEMPOTENCY_V29_LOCAL_TRANSFER_${suffix}`,
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: AT,
      correlationId: `CORRELATION_V29_LOCAL_TRANSFER_${suffix}`,
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: fixture.countries.seller,
        buyerCountryId: fixture.countries.buyer,
        quantity: { amount: '2', unit: available.unit },
        price: { amount: '3', currency: 'GCU', perUnit: available.unit },
        assetSource: {
          batchId: available.batchId,
          physicalLocationId: available.physicalLocationId,
          titleHolderId: available.titleHolderId,
          riskBearerId: available.riskBearerId,
          economicRecognitionId: available.economicRecognitionId,
        },
        paymentSource: 'BUYER_TREASURY_GCU',
        policyVersion: 'V10_TREASURY_GCU_V1',
        threshold: {
          policyVersion: 'V10_TREASURY_GCU_THRESHOLD_V1',
          maxSettlement: { amount: '6', currency: 'GCU' },
        },
        expiresAtReal: '2026-09-14T00:10:00.000Z',
      },
    },
    sha256,
  );
  const reserve = transition(transfer, '0', '1');
  const reserved = fixture.inventoryAccounts.sellerReserved;
  const reservationPosting = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId(`POSTING_V29_LOCAL_RESERVE_${suffix}`),
      worldId: fixture.worldId,
      causationCommandId: transfer.commandId,
      causationEventIds: [reserve.event.eventId],
      worldVersionBefore: '0',
      worldVersionAfter: '1',
      simTime: transfer.simTime,
      command: transfer,
      transition: reserve.transition,
      quantity: fixture.transferIntent.quantity,
      source: available,
      destination: reserved,
    },
    sha256,
  );
  const afterReservation = rebuildV08LedgersFromLineage({
    seed: fixture.openingSeed,
    transitions: [
      {
        command: transfer,
        transition: reserve.transition,
        inventoryPostings: [reservationPosting],
        financialPostingBatches: [],
      },
    ],
    sha256Hex: sha256,
  });
  const shipmentId = `SHIPMENT_V29_LOCAL_TRANSFER_${suffix}`;
  const shipment = automaticCommand({
    id: `COMMAND_V29_LOCAL_SHIPMENT_${suffix}`,
    commandType: 'CORE_GOODS_SHIPMENT_V1',
    before: '1',
    simTime: '10100',
    payload: {
      schemaVersion: 'core-goods-shipment-v1',
      shipmentId,
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
    },
  });
  const ship = transition(shipment, '1', '2');
  const shipmentResult = shipNarrowTreasuryGcuTransfer({
    causationEventIds: [ship.event.eventId],
    inventoryState: afterReservation.inventory,
    postingId: inventoryPostingId(`POSTING_V29_LOCAL_SHIPMENT_${suffix}`),
    shipmentCommand: shipment,
    source: reserved,
    transferCommand: transfer,
    transition: ship.transition,
    sha256Hex: sha256,
  });
  const beforeDelivery = rebuildV08LedgersFromLineage({
    seed: fixture.openingSeed,
    transitions: [
      {
        command: transfer,
        transition: reserve.transition,
        inventoryPostings: [reservationPosting],
        financialPostingBatches: [],
      },
      {
        command: shipment,
        transition: ship.transition,
        inventoryPostings: [shipmentResult.posting],
        financialPostingBatches: [],
      },
    ],
    sha256Hex: sha256,
  });
  const delivery = automaticCommand({
    id: `COMMAND_V29_LOCAL_DELIVERY_${suffix}`,
    commandType: 'CORE_GOODS_DELIVERY_V1',
    before: '2',
    simTime: '10200',
    payload: {
      schemaVersion: 'core-goods-delivery-v1',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
      shipmentId,
      destination: {
        physicalLocationId:
          fixture.inventoryAccounts.buyerAvailable.physicalLocationId,
        titleHolderId: fixture.inventoryAccounts.buyerAvailable.titleHolderId,
        riskBearerId: fixture.inventoryAccounts.buyerAvailable.riskBearerId,
        economicRecognitionId:
          fixture.inventoryAccounts.buyerAvailable.economicRecognitionId,
      },
      buyerTreasuryAccountId: fixture.financialAccounts.buyerTreasury.accountId,
      sellerSettlementAccountId:
        fixture.financialAccounts.sellerSettlement.accountId,
    },
  });
  const transit = beforeDelivery.inventory.balances.find(
    ({ account }) => account.bucket === 'IN_TRANSIT',
  )?.account;
  if (transit === undefined)
    throw new Error('V29_LOCAL_TRANSIT_SOURCE_MISSING');
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      fixture.worldId,
      workerId(WORKER),
      AT,
      '2026-09-14T00:07:00.000Z',
    ),
  ).lease;
  const source: NarrowTreasuryGcuDeliveryPreparationSource = {
    async load() {
      return {
        buyerTreasury: fixture.financialAccounts.buyerTreasury,
        buyerTreasuryLegId: financialPostingLegId(
          `LEG_V29_LOCAL_BUYER_${suffix}`,
        ),
        commitAssertion: createWorldWriterCommitAssertion(lease, '2'),
        eventId: `EVENT_V29_LOCAL_DELIVERY_${suffix}`,
        eventSequence: '3',
        financialBatchId: financialPostingBatchId(
          `BATCH_V29_LOCAL_DELIVERY_${suffix}`,
        ),
        financialState: beforeDelivery.financial,
        inventoryPostingId: inventoryPostingId(
          `POSTING_V29_LOCAL_DELIVERY_${suffix}`,
        ),
        inventoryState: beforeDelivery.inventory,
        observedAtReal: AT,
        outboxMessageId: `OUTBOX_V29_LOCAL_DELIVERY_${suffix}`,
        sellerSettlement: fixture.financialAccounts.sellerSettlement,
        sellerSettlementLegId: financialPostingLegId(
          `LEG_V29_LOCAL_SELLER_${suffix}`,
        ),
        source: transit,
        transferCommand: transfer,
      };
    },
  };
  return {
    fixture,
    transfer,
    reserve,
    reservationPosting,
    shipment,
    ship,
    shipmentPosting: shipmentResult.posting,
    beforeDelivery,
    delivery,
    source,
  };
}

async function preparedSequentialDeliveries(seed: string) {
  const first = preparedTwoCountryDelivery(`${seed}_A`);
  const suffix = sha256(`${seed}_B`).slice(0, 12).toUpperCase();
  const available = first.fixture.inventoryAccounts.sellerAvailable;
  const buyerTreasury = first.fixture.financialAccounts.buyerTreasury.accountId;
  const buyerEquity =
    first.fixture.financialAccounts.buyerOpeningEquity.accountId;
  const fundedOpening = createOpeningSeed(
    {
      ...first.fixture.openingSeed,
      financialBatches: first.fixture.openingSeed.financialBatches.map(
        (batch) => ({
          ...batch,
          legs: batch.legs.map((leg) =>
            leg.account.accountId === buyerTreasury ||
            leg.account.accountId === buyerEquity
              ? { ...leg, amount: Money.from('14', leg.amount.currency) }
              : leg,
          ),
        }),
      ),
    },
    sha256,
  );
  const firstLineage = [
    {
      command: first.transfer,
      transition: first.reserve.transition,
      inventoryPostings: [first.reservationPosting],
      financialPostingBatches: [],
    },
    {
      command: first.shipment,
      transition: first.ship.transition,
      inventoryPostings: [first.shipmentPosting],
      financialPostingBatches: [],
    },
  ];
  const transferB = parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: `COMMAND_V29_SECOND_TRANSFER_${suffix}`,
      idempotencyKey: `IDEMPOTENCY_V29_SECOND_TRANSFER_${suffix}`,
      worldId: first.fixture.worldId,
      actorId: first.fixture.officeActors.sellerTrade.actorId,
      authSubject: first.fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: first.fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '2',
      simTime: '10200',
      submittedAtReal: AT,
      correlationId: `CORRELATION_V29_SECOND_TRANSFER_${suffix}`,
      payload: JSON.parse(first.transfer.canonicalPayload),
    },
    sha256,
  );
  const reserveB = transition(transferB, '2', '3');
  const reservedB = createInventoryAccount({
    ...available,
    bucket: 'RESERVED',
    reservationId: inventoryReservationId(`RESERVATION_V29_SECOND_${suffix}`),
    shipmentId: null,
  });
  const reservationPostingB = createReservationPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: inventoryPostingId(`POSTING_V29_SECOND_RESERVE_${suffix}`),
      worldId: first.fixture.worldId,
      causationCommandId: transferB.commandId,
      causationEventIds: [reserveB.event.eventId],
      worldVersionBefore: '2',
      worldVersionAfter: '3',
      simTime: transferB.simTime,
      command: transferB,
      transition: reserveB.transition,
      quantity: first.fixture.transferIntent.quantity,
      source: available,
      destination: reservedB,
    },
    sha256,
  );
  const afterSecondReservation = rebuildV08LedgersFromLineage({
    seed: fundedOpening,
    transitions: [
      ...firstLineage,
      {
        command: transferB,
        transition: reserveB.transition,
        inventoryPostings: [reservationPostingB],
        financialPostingBatches: [],
      },
    ],
    sha256Hex: sha256,
  });
  const shipmentIdB = `SHIPMENT_V29_SECOND_${suffix}`;
  const shipmentB = automaticCommand({
    id: `COMMAND_V29_SECOND_SHIPMENT_${suffix}`,
    commandType: 'CORE_GOODS_SHIPMENT_V1',
    before: '3',
    simTime: '10300',
    payload: {
      schemaVersion: 'core-goods-shipment-v1',
      shipmentId: shipmentIdB,
      transferCommandId: transferB.commandId,
      transferFingerprint: transferB.fingerprint,
    },
  });
  const shipB = transition(shipmentB, '3', '4');
  const shipmentResultB = shipNarrowTreasuryGcuTransfer({
    causationEventIds: [shipB.event.eventId],
    inventoryState: afterSecondReservation.inventory,
    postingId: inventoryPostingId(`POSTING_V29_SECOND_SHIPMENT_${suffix}`),
    shipmentCommand: shipmentB,
    source: reservedB,
    transferCommand: transferB,
    transition: shipB.transition,
    sha256Hex: sha256,
  });
  const beforeDeliveries = rebuildV08LedgersFromLineage({
    seed: fundedOpening,
    transitions: [
      ...firstLineage,
      {
        command: transferB,
        transition: reserveB.transition,
        inventoryPostings: [reservationPostingB],
        financialPostingBatches: [],
      },
      {
        command: shipmentB,
        transition: shipB.transition,
        inventoryPostings: [shipmentResultB.posting],
        financialPostingBatches: [],
      },
    ],
    sha256Hex: sha256,
  });
  const deliveryA = automaticCommand({
    id: `COMMAND_V29_FIRST_DELIVERY_${suffix}`,
    commandType: 'CORE_GOODS_DELIVERY_V1',
    before: '4',
    simTime: '10400',
    payload: JSON.parse(first.delivery.canonicalPayload),
  });
  const deliveryB = automaticCommand({
    id: `COMMAND_V29_SECOND_DELIVERY_${suffix}`,
    commandType: 'CORE_GOODS_DELIVERY_V1',
    before: '5',
    simTime: '10500',
    payload: {
      ...JSON.parse(first.delivery.canonicalPayload),
      transferCommandId: transferB.commandId,
      transferFingerprint: transferB.fingerprint,
      shipmentId: shipmentIdB,
    },
  });
  const shipmentIdA = first.beforeDelivery.inventory.balances.find(
    ({ account }) => account.bucket === 'IN_TRANSIT',
  )?.account.shipmentId;
  const transitA = beforeDeliveries.inventory.balances.find(
    ({ account }) =>
      account.bucket === 'IN_TRANSIT' && account.shipmentId === shipmentIdA,
  )?.account;
  const transitB = beforeDeliveries.inventory.balances.find(
    ({ account }) =>
      account.bucket === 'IN_TRANSIT' && account.shipmentId === shipmentIdB,
  )?.account;
  if (transitA === undefined || transitB === undefined) {
    throw new Error('V29_SEQUENTIAL_TRANSIT_SOURCES_MISSING');
  }
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      first.fixture.worldId,
      workerId(WORKER),
      AT,
      '2026-09-14T00:07:00.000Z',
    ),
  ).lease;
  const sourceA: NarrowTreasuryGcuDeliveryPreparationSource = {
    async load() {
      return {
        buyerTreasury: first.fixture.financialAccounts.buyerTreasury,
        buyerTreasuryLegId: financialPostingLegId(
          `LEG_V29_FIRST_BUYER_${suffix}`,
        ),
        commitAssertion: createWorldWriterCommitAssertion(lease, '4'),
        eventId: `EVENT_V29_FIRST_DELIVERY_${suffix}`,
        eventSequence: '5',
        financialBatchId: financialPostingBatchId(`BATCH_V29_FIRST_${suffix}`),
        financialState: beforeDeliveries.financial,
        inventoryPostingId: inventoryPostingId(`POSTING_V29_FIRST_${suffix}`),
        inventoryState: beforeDeliveries.inventory,
        observedAtReal: AT,
        outboxMessageId: `OUTBOX_V29_FIRST_${suffix}`,
        sellerSettlement: first.fixture.financialAccounts.sellerSettlement,
        sellerSettlementLegId: financialPostingLegId(
          `LEG_V29_FIRST_SELLER_${suffix}`,
        ),
        source: transitA,
        transferCommand: first.transfer,
      };
    },
  };
  const afterFirstDelivery = prepareNarrowTreasuryGcuDeliveryAtomicDraft({
    ...(await sourceA.load({ deliveryCommand: deliveryA, observedAtReal: AT })),
    deliveryCommand: deliveryA,
    sha256Hex: sha256,
  });
  const sourceB: NarrowTreasuryGcuDeliveryPreparationSource = {
    async load() {
      return {
        buyerTreasury: first.fixture.financialAccounts.buyerTreasury,
        buyerTreasuryLegId: financialPostingLegId(
          `LEG_V29_SECOND_BUYER_${suffix}`,
        ),
        commitAssertion: createWorldWriterCommitAssertion(lease, '5'),
        eventId: `EVENT_V29_SECOND_DELIVERY_${suffix}`,
        eventSequence: '6',
        financialBatchId: financialPostingBatchId(`BATCH_V29_SECOND_${suffix}`),
        financialState: afterFirstDelivery.financialState,
        inventoryPostingId: inventoryPostingId(`POSTING_V29_SECOND_${suffix}`),
        inventoryState: afterFirstDelivery.inventoryState,
        observedAtReal: AT,
        outboxMessageId: `OUTBOX_V29_SECOND_${suffix}`,
        sellerSettlement: first.fixture.financialAccounts.sellerSettlement,
        sellerSettlementLegId: financialPostingLegId(
          `LEG_V29_SECOND_SELLER_${suffix}`,
        ),
        source: transitB,
        transferCommand: transferB,
      };
    },
  };
  return { first, transferB, deliveryA, deliveryB, sourceA, sourceB };
}

async function seedClaimedDelivery(
  database: V09AtomicTestDatabase,
  command: CanonicalCommand,
  worldVersion = '2',
) {
  await database.query(
    `insert into world_v2.world_head (world_id, world_version, event_sequence)
     values ($1, $2, $2)`,
    [command.worldId, worldVersion],
  );
  await database.query(
    `select * from world_v2.acquire_world_writer_lease($1, $2, $3, $4)`,
    [command.worldId, WORKER, AT, '300000'],
  );
  await seedAdditionalClaimedCommand(database, command);
}

async function seedAdditionalClaimedCommand(
  database: V09AtomicTestDatabase,
  command: CanonicalCommand,
) {
  await database.query(
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
  await database.query(
    `insert into world_v2.command_queue
       (world_id, command_id, authority_kind, priority_rank,
        available_at_sim_time, attempt_count)
     values ($1, $2, 'VERSIONED_AUTOMATIC', 0, $3, 0)`,
    [command.worldId, command.commandId, command.simTime.toCanonicalValue()],
  );
  await database.query(
    `update world_v2.command_queue
        set queue_state = 'CLAIMED', attempt_count = 1,
            claimed_by = $3, claimed_at_real = $4, claim_fencing_token = 1
      where world_id = $1 and command_id = $2`,
    [command.worldId, command.commandId, WORKER, AT],
  );
}

async function runFreshWorkerSequence(
  seed: string,
  sessionTimeZone?: 'UTC' | 'Asia/Shanghai',
) {
  const prepared = preparedTwoCountryDelivery(seed);
  const local = await database();
  try {
    if (sessionTimeZone !== undefined) {
      await local.query(
        sessionTimeZone === 'UTC'
          ? `set time zone 'UTC'`
          : `set time zone 'Asia/Shanghai'`,
      );
      const zone = await local.query<{ readonly zone: string }>(
        `select current_setting('TimeZone') as zone`,
      );
      expect(zone.rows[0]?.zone).toBe(sessionTimeZone);
    }
    await seedClaimedDelivery(local, prepared.delivery);
    const input = {
      database: local,
      productionTarget: false as const,
      workerId: WORKER,
      deliveryCommand: prepared.delivery,
      observedAtReal: AT,
      source: prepared.source,
    };
    const executeStep = async (commandIndex: number) => {
      try {
        const result = await executeV29LocalWorkerDelivery(input);
        const durable = await readV29DurableWorkerStep({
          database: local,
          command: prepared.delivery,
          commandIndex,
        });
        return { result, durable };
      } catch {
        throw new V29WorkerReplayStepError(commandIndex);
      }
    };
    const first = await executeStep(0);
    if (sessionTimeZone !== undefined) {
      const offset = await local.query<{ readonly seconds: string }>(
        `select extract(timezone from recorded_at_real)::text as seconds
           from world_v2.command_receipt where command_id = $1`,
        [prepared.delivery.commandId],
      );
      expect(offset.rows[0]?.seconds).toBe(
        sessionTimeZone === 'UTC' ? '0' : '28800',
      );
    }
    const retry = await executeStep(1);
    if (
      first.result.source !== 'NEW_FINAL' ||
      retry.result.source !== 'EXISTING_FINAL'
    ) {
      throw new V29WorkerReplayStepError(
        first.result.source !== 'NEW_FINAL' ? 0 : 1,
      );
    }
    return [first.durable, retry.durable] as const;
  } finally {
    await local.close();
  }
}

async function runFreshSequentialWorkerSequence(seed: string) {
  const prepared = await preparedSequentialDeliveries(seed);
  const local = await database();
  try {
    await seedClaimedDelivery(local, prepared.deliveryA, '4');
    await seedAdditionalClaimedCommand(local, prepared.deliveryB);
    const execute = async (
      command: CanonicalCommand,
      source: NarrowTreasuryGcuDeliveryPreparationSource,
      commandIndex: number,
    ) => {
      try {
        const result = await executeV29LocalWorkerDelivery({
          database: local,
          productionTarget: false,
          workerId: WORKER,
          deliveryCommand: command,
          observedAtReal: AT,
          source,
        });
        const durable = await readV29DurableWorkerStep({
          database: local,
          command,
          commandIndex,
        });
        return { result, durable };
      } catch {
        throw new V29WorkerReplayStepError(commandIndex);
      }
    };
    const first = await execute(prepared.deliveryA, prepared.sourceA, 0);
    const second = await execute(prepared.deliveryB, prepared.sourceB, 1);
    const retry = await execute(prepared.deliveryB, prepared.sourceB, 2);
    if (
      first.result.source !== 'NEW_FINAL' ||
      second.result.source !== 'NEW_FINAL' ||
      retry.result.source !== 'EXISTING_FINAL'
    ) {
      throw new V29WorkerReplayStepError(
        first.result.source !== 'NEW_FINAL'
          ? 0
          : second.result.source !== 'NEW_FINAL'
            ? 1
            : 2,
      );
    }
    return [first.durable, second.durable, retry.durable] as const;
  } finally {
    await local.close();
  }
}

describe('V29 preparation-only real Worker narrow-delivery adapter', () => {
  it('commits one two-country goods/GCU delivery through Worker and returns the same durable receipt on retry', async () => {
    const prepared = preparedTwoCountryDelivery();
    const local = await database();
    try {
      await seedClaimedDelivery(local, prepared.delivery);
      const input = {
        database: local,
        productionTarget: false as const,
        workerId: WORKER,
        deliveryCommand: prepared.delivery,
        observedAtReal: AT,
        source: prepared.source,
      };
      const first = await executeV29LocalWorkerDelivery(input);
      const retry = await executeV29LocalWorkerDelivery(input);
      expect(first).toMatchObject({
        status: 'LOCAL_PGLITE_NARROW_DELIVERY_NOT_V29_ACCEPTANCE',
        source: 'NEW_FINAL',
        receipt: { outcome: 'COMMITTED', worldVersionAfter: '3' },
        worldVersion: '3',
        eventCount: 1,
        inventoryPostingCount: 1,
        financialPostingCount: 1,
        outboxCount: 1,
      });
      expect(retry.source).toBe('EXISTING_FINAL');
      expect(retry.durableTraceHash).toBe(first.durableTraceHash);
      const postings = await local.query<{
        readonly inventory: string;
        readonly financial: string;
      }>(
        `select
           (select canonical_payload from world_v2.inventory_posting where causation_command_id = $1)::text as inventory,
           (select canonical_payload from world_v2.financial_posting_batch where causation_command_id = $1)::text as financial`,
        [prepared.delivery.commandId],
      );
      const inventory = JSON.parse(postings.rows[0]!.inventory) as {
        readonly entries: readonly {
          readonly delta: { readonly amount: string };
          readonly account: {
            readonly countryId: string;
            readonly bucket: string;
          };
        }[];
      };
      const financial = JSON.parse(postings.rows[0]!.financial) as {
        readonly legs: readonly {
          readonly amount: { readonly amount: string };
          readonly account: { readonly countryId: string };
        }[];
      };
      expect(
        inventory.entries.map((entry) => entry.delta.amount).sort(),
      ).toEqual(['-2', '2']);
      expect(
        inventory.entries.find((entry) => entry.delta.amount === '2')?.account,
      ).toMatchObject({
        countryId: prepared.fixture.countries.buyer,
        bucket: 'AVAILABLE',
      });
      expect(financial.legs.map((leg) => leg.amount.amount)).toEqual([
        '6',
        '6',
      ]);
      expect(financial.legs.map((leg) => leg.account.countryId).sort()).toEqual(
        [
          prepared.fixture.countries.seller,
          prepared.fixture.countries.buyer,
        ].sort(),
      );
    } finally {
      await local.close();
    }
  }, 30_000);

  it('rejects production-target flag before Worker execution', async () => {
    const prepared = preparedTwoCountryDelivery();
    const local = createPGliteV09AtomicTestDatabase();
    try {
      await expect(
        executeV29LocalWorkerDelivery({
          database: local,
          productionTarget: true as false,
          workerId: WORKER,
          deliveryCommand: prepared.delivery,
          observedAtReal: AT,
          source: prepared.source,
        }),
      ).rejects.toThrow(
        'only a disposable local PGlite Worker driver is allowed',
      );
    } finally {
      await local.close();
    }
  });

  it('cannot commit an unsubmitted command into an empty local database', async () => {
    const prepared = preparedTwoCountryDelivery();
    const local = await database();
    try {
      await expect(
        executeV29LocalWorkerDelivery({
          database: local,
          productionTarget: false,
          workerId: WORKER,
          deliveryCommand: prepared.delivery,
          observedAtReal: AT,
          source: prepared.source,
        }),
      ).rejects.toThrow();
      const durable = await local.query<{
        readonly events: string;
        readonly inventory: string;
        readonly financial: string;
        readonly receipts: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as events,
           (select count(*)::text from world_v2.inventory_posting) as inventory,
           (select count(*)::text from world_v2.financial_posting_batch) as financial,
           (select count(*)::text from world_v2.command_receipt) as receipts`,
      );
      expect(durable.rows[0]).toEqual({
        events: '0',
        inventory: '0',
        financial: '0',
        receipts: '0',
      });
    } finally {
      await local.close();
    }
  }, 30_000);
});

describe('V29.3 preparation-only fresh-PGlite Worker replay evidence', () => {
  it('matches every durable fact hash after two independent initializations with the same test seed and command sequence', async () => {
    let initializations = 0;
    const evidence = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_REPLAY_SEED_1',
      async createAndRunFreshDatabase(seed) {
        initializations += 1;
        return runFreshWorkerSequence(seed);
      },
    });
    expect(initializations).toBe(2);
    expect(evidence.sequenceHash).toBe(
      // The receipt instant is hashed in canonical UTC, not in the DB session zone.
      'sha256:c814790513c1e8d4fea354111dabd12c39d2051b56a084af01bb4555033cd44c',
    );
    expect(evidence).toMatchObject({
      status: 'LOCAL_PGLITE_FIXED_SEQUENCE_NOT_V29_3_ACCEPTANCE',
      seed: 'V29_REPLAY_SEED_1',
      commandCount: 2,
    });
    expect(evidence.steps[0]?.stepHash).toBe(evidence.steps[1]?.stepHash);
    expect(evidence.steps.every((step) => step.worldVersion === '3')).toBe(
      true,
    );
    const different = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_REPLAY_SEED_2',
      createAndRunFreshDatabase: runFreshWorkerSequence,
    });
    expect(different.sequenceHash).not.toBe(evidence.sequenceHash);
  }, 60_000);

  it('replays identical durable hashes across UTC and Asia/Shanghai database sessions', async () => {
    let run = 0;
    const evidence = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_CROSS_TZ_SEED',
      createAndRunFreshDatabase(seed) {
        run += 1;
        return runFreshWorkerSequence(
          seed,
          run === 1 ? 'UTC' : 'Asia/Shanghai',
        );
      },
    });
    expect(run).toBe(2);
    expect(evidence.commandCount).toBe(2);
    expect(evidence.steps[0]?.stepHash).toBe(evidence.steps[1]?.stepHash);
  }, 60_000);

  it('reports a reproducible seed/index/minimal hash trace on mismatch, without payloads', async () => {
    let run = 0;
    let error: unknown;
    try {
      await assertV29WorkerFixedSeedReplay({
        seed: 'V29_MISMATCH_SEED',
        createAndRunFreshDatabase(seed) {
          run += 1;
          return runFreshWorkerSequence(
            run === 1 ? seed : 'V29_DIFFERENT_SEED',
          );
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(V29WorkerReplayMismatchError);
    const mismatch = error as V29WorkerReplayMismatchError;
    expect(mismatch.reproduction).toMatchObject({
      seed: 'V29_MISMATCH_SEED',
      commandIndex: 0,
      first: { worldVersion: '3' },
      second: { worldVersion: '3' },
    });
    expect(JSON.stringify(mismatch.reproduction)).not.toContain(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(JSON.stringify(mismatch.reproduction)).not.toContain(
      'canonical_payload',
    );
    expect(mismatch.message).toContain('"eventHash"');
    expect(mismatch.message).not.toContain('canonical_payload');
  }, 60_000);

  it('fails a missing sequence with the same redacted reproduction envelope', async () => {
    await expect(
      assertV29WorkerFixedSeedReplay({
        seed: 'V29_EMPTY_SEED',
        async createAndRunFreshDatabase() {
          return [];
        },
      }),
    ).rejects.toMatchObject({
      reproduction: {
        seed: 'V29_EMPTY_SEED',
        commandIndex: 0,
        first: null,
        second: null,
      },
    });
  });

  it('redacts an execution error while retaining its seed and command index', async () => {
    let error: unknown;
    try {
      await assertV29WorkerFixedSeedReplay({
        seed: 'V29_STEP_FAILURE',
        async createAndRunFreshDatabase() {
          throw new V29WorkerReplayStepError(1);
        },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(V29WorkerReplayMismatchError);
    expect((error as V29WorkerReplayMismatchError).reproduction).toMatchObject({
      seed: 'V29_STEP_FAILURE',
      commandIndex: 1,
      first: null,
      second: null,
    });
  });
});

describe('V29 preparation-only same-World sequential Worker deliveries', () => {
  it('commits two distinct two-country deliveries through Worker with separate durable numeric trails', async () => {
    const prepared = await preparedSequentialDeliveries('V29_TWO_DELIVERIES');
    expect(prepared.first.fixture.transferIntent.quantity.unit).toBe('tonne');
    const local = await database();
    try {
      await seedClaimedDelivery(local, prepared.deliveryA, '4');
      await seedAdditionalClaimedCommand(local, prepared.deliveryB);
      const first = await executeV29LocalWorkerDelivery({
        database: local,
        productionTarget: false,
        workerId: WORKER,
        deliveryCommand: prepared.deliveryA,
        observedAtReal: AT,
        source: prepared.sourceA,
      });
      const firstDurable = await readV29DurableWorkerStep({
        database: local,
        command: prepared.deliveryA,
        commandIndex: 0,
      });
      const second = await executeV29LocalWorkerDelivery({
        database: local,
        productionTarget: false,
        workerId: WORKER,
        deliveryCommand: prepared.deliveryB,
        observedAtReal: AT,
        source: prepared.sourceB,
      });
      const secondDurable = await readV29DurableWorkerStep({
        database: local,
        command: prepared.deliveryB,
        commandIndex: 1,
      });
      expect(first).toMatchObject({
        source: 'NEW_FINAL',
        worldVersion: '5',
        eventCount: 1,
        inventoryPostingCount: 1,
        financialPostingCount: 1,
        outboxCount: 1,
      });
      expect(second).toMatchObject({
        source: 'NEW_FINAL',
        worldVersion: '6',
        eventCount: 1,
        inventoryPostingCount: 1,
        financialPostingCount: 1,
        outboxCount: 1,
      });
      expect(first.receipt.commandId).not.toBe(second.receipt.commandId);
      expect(firstDurable.worldVersion).toBe('5');
      expect(secondDurable.worldVersion).toBe('6');
      expect(firstDurable.stepHash).not.toBe(secondDurable.stepHash);
      for (const key of [
        'eventHash',
        'inventoryHash',
        'financialHash',
        'receiptHash',
        'worldVersionHash',
      ] as const) {
        expect(firstDurable[key]).toMatch(/^sha256:[0-9a-f]{64}$/u);
        expect(secondDurable[key]).toMatch(/^sha256:[0-9a-f]{64}$/u);
        expect(firstDurable[key]).not.toBe(secondDurable[key]);
      }
      const retry = await executeV29LocalWorkerDelivery({
        database: local,
        productionTarget: false,
        workerId: WORKER,
        deliveryCommand: prepared.deliveryB,
        observedAtReal: AT,
        source: prepared.sourceB,
      });
      expect(retry.source).toBe('EXISTING_FINAL');
      expect(retry.durableTraceHash).toBe(second.durableTraceHash);
      expect(
        await readV29DurableWorkerStep({
          database: local,
          command: prepared.deliveryB,
          commandIndex: 1,
        }),
      ).toEqual(secondDurable);
      const postings = await local.query<{
        readonly command_id: string;
        readonly event: string;
        readonly inventory: string;
        readonly financial: string;
        readonly world_version_before: string;
        readonly world_version_after: string;
      }>(
        `select command_id,
                (select canonical_payload from world_v2.authoritative_event
                  where causation_command_id = command_id)::text as event,
                (select canonical_payload from world_v2.inventory_posting
                  where causation_command_id = command_id)::text as inventory,
                (select canonical_payload from world_v2.financial_posting_batch
                  where causation_command_id = command_id)::text as financial,
                world_version_before::text, world_version_after::text
           from world_v2.command_receipt
          where command_id in ($1, $2)
          order by world_version_after`,
        [prepared.deliveryA.commandId, prepared.deliveryB.commandId],
      );
      expect(postings.rows).toHaveLength(2);
      let deliveredTonnes = 0n;
      let settledGcu = 0n;
      for (const [index, row] of postings.rows.entries()) {
        const transfer =
          index === 0 ? prepared.first.transfer : prepared.transferB;
        const event = JSON.parse(row.event) as {
          readonly transferCommandId: string;
          readonly transferFingerprint: string;
        };
        expect(event).toMatchObject({
          transferCommandId: transfer.commandId,
          transferFingerprint: transfer.fingerprint,
        });
        expect(row.world_version_before).toBe(index === 0 ? '4' : '5');
        expect(row.world_version_after).toBe(index === 0 ? '5' : '6');
        const inventory = JSON.parse(row.inventory) as {
          readonly entries: readonly {
            readonly delta: { readonly amount: string };
            readonly account: {
              readonly countryId: string;
              readonly bucket: string;
            };
          }[];
        };
        const financial = JSON.parse(row.financial) as {
          readonly legs: readonly {
            readonly amount: { readonly amount: string };
            readonly direction: string;
            readonly account: { readonly countryId: string };
          }[];
        };
        expect(
          inventory.entries.map((entry) => entry.delta.amount).sort(),
        ).toEqual(['-2', '2']);
        expect(
          inventory.entries.find((entry) => entry.delta.amount === '2')
            ?.account,
        ).toMatchObject({
          countryId: prepared.first.fixture.countries.buyer,
          bucket: 'AVAILABLE',
        });
        deliveredTonnes += BigInt(
          inventory.entries.find((entry) => entry.delta.amount === '2')!.delta
            .amount,
        );
        expect(financial.legs.map((leg) => leg.amount.amount)).toEqual([
          '6',
          '6',
        ]);
        const buyerPayment = financial.legs.find(
          (leg) =>
            leg.account.countryId === prepared.first.fixture.countries.buyer,
        );
        expect(buyerPayment?.direction).toBe('CREDIT');
        settledGcu += BigInt(buyerPayment!.amount.amount);
        expect(
          financial.legs.map((leg) => leg.account.countryId).sort(),
        ).toEqual(
          [
            prepared.first.fixture.countries.seller,
            prepared.first.fixture.countries.buyer,
          ].sort(),
        );
      }
      expect(deliveredTonnes).toBe(4n);
      expect(settledGcu).toBe(12n);
      const counts = await local.query<{
        readonly events: string;
        readonly inventory: string;
        readonly financial: string;
        readonly receipts: string;
        readonly outbox: string;
        readonly world_version: string;
      }>(
        `select
           (select count(*)::text from world_v2.authoritative_event) as events,
           (select count(*)::text from world_v2.inventory_posting) as inventory,
           (select count(*)::text from world_v2.financial_posting_batch) as financial,
           (select count(*)::text from world_v2.command_receipt) as receipts,
           (select count(*)::text from world_v2.notification_outbox) as outbox,
           (select world_version::text from world_v2.world_head) as world_version`,
      );
      expect(counts.rows[0]).toEqual({
        events: '2',
        inventory: '2',
        financial: '2',
        receipts: '2',
        outbox: '2',
        world_version: '6',
      });
    } finally {
      await local.close();
    }
  }, 30_000);

  it('replays the same two-command Worker sequence and retry in two fresh PGlite worlds', async () => {
    let initializations = 0;
    const evidence = await assertV29WorkerFixedSeedReplay({
      seed: 'V29_TWO_DELIVERIES_REPLAY',
      async createAndRunFreshDatabase(seed) {
        initializations += 1;
        return runFreshSequentialWorkerSequence(seed);
      },
    });
    expect(initializations).toBe(2);
    expect(evidence.commandCount).toBe(3);
    expect(evidence.sequenceHash).toBe(
      'sha256:8638d34d83bc1dd44fa7f11a9404e7fd53077901dcaf4f1eb7db3105b0501ae2',
    );
    expect(evidence.steps.map((step) => step.worldVersion)).toEqual([
      '5',
      '6',
      '6',
    ]);
    expect(evidence.steps[0]?.stepHash).not.toBe(evidence.steps[1]?.stepHash);
    expect(evidence.steps[1]?.stepHash).toBe(evidence.steps[2]?.stepHash);
  }, 60_000);
});
