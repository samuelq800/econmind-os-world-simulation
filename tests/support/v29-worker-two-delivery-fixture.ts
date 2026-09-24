// PREPARATION_ONLY_NOT_V29_STARTED: reusable local Worker test fixture, not runtime data.
import { createHash } from 'node:crypto';

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
import type { V09AtomicTestDatabase } from './v09-atomic-contract.js';

export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
export const AT = '2026-09-14T00:02:00.000Z';
export const WORKER = 'WORKER_V29_LOCAL_DELIVERY';

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

export function preparedTwoCountryDelivery(seed = 'V29_DEFAULT') {
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

export async function preparedSequentialDeliveries(seed: string) {
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

export async function seedClaimedDelivery(
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

export async function seedAdditionalClaimedCommand(
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
