import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_POSTING_SCHEMA_VERSION,
  INVENTORY_POSTING_SCHEMA_VERSION,
  Money,
  Price,
  Quantity,
  acquireWorldWriterLease,
  canonicalHashInput,
  canonicalSha256,
  countryId,
  createAuthoritativeTransition,
  createDeliveryPosting,
  createFinancialAccount,
  createFinancialPostingBatch,
  createFinalCommandReceipt,
  createOutboxMessage,
  createShipmentPosting,
  createWorldWriterCommitAssertion,
  commodityId,
  economicRecognitionId,
  financialAccountId,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryBatchId,
  inventoryLocationId,
  inventoryPostingId,
  inventoryReservationId,
  inventoryShipmentId,
  legalEntityId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  workerId,
  worldId,
  worldWriterLeaseRequest,
  type CanonicalCommand,
  type InventoryAccount,
} from '@econmind/core';
import {
  createV10DeliveryCommitAuthorizationGuard,
  createV10DeliverySettlementCandidateFactory,
  prepareV10DeliverySettlementCandidate,
  prepareV10ShipmentCandidate,
  type V10DeliverySettlementCandidateInput,
  type V10ShipmentCandidateInput,
} from '../../apps/world-worker/src/v10/atomic-transfer-candidates.js';

const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
const AT = '2026-09-12T00:00:00.000Z';
const world = worldId('WORLD_ATOMIC_TRANSFER_TEST');
const seller = countryId('COUNTRY_SELLER_ATOMIC_TEST');
const buyer = countryId('COUNTRY_BUYER_ATOMIC_TEST');
const sellerEntity = legalEntityId('ENTITY_SELLER_ATOMIC_TEST');
const buyerEntity = legalEntityId('ENTITY_BUYER_ATOMIC_TEST');

function command(phase: 'SHIPMENT' | 'DELIVERY'): CanonicalCommand {
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: `GOODS_${phase}_TEST`,
      commandId: `COMMAND_${phase}_ATOMIC_TEST`,
      idempotencyKey: `IDEMPOTENCY_${phase}_ATOMIC_TEST`,
      worldId: world,
      actorId: 'ACTOR_SELLER_ATOMIC_TEST',
      authSubject: '11111111-1111-4111-8111-111111111111',
      countryId: seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: AT,
      correlationId: `CORRELATION_${phase}_ATOMIC_TEST`,
      payload: { phase },
    },
    sha256,
  );
}

function transition(command: CanonicalCommand) {
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: 'GOODS_TRANSFER_TEST',
      worldId: command.worldId,
      worldVersion: '1',
      sequence: '1',
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: AT,
      payload: { commandId: command.commandId },
      correctsEventId: null,
    },
    sha256,
  );
  return createAuthoritativeTransition({
    command,
    worldVersionBefore: '0',
    worldVersionAfter: '1',
    events: [event],
  });
}

function inventoryAccount(input: {
  readonly country: ReturnType<typeof countryId>;
  readonly location: string;
  readonly bucket: 'RESERVED' | 'IN_TRANSIT' | 'AVAILABLE';
  readonly titleHolder: ReturnType<typeof legalEntityId>;
  readonly riskBearer: ReturnType<typeof legalEntityId>;
  readonly recognition: ReturnType<typeof economicRecognitionId> | null;
}): Readonly<InventoryAccount> {
  return {
    worldId: world,
    countryId: input.country,
    commodityId: commodityId('GRAIN'),
    batchId: inventoryBatchId('BATCH_ATOMIC_TRANSFER_TEST'),
    unit: 'tonne',
    physicalLocationId: inventoryLocationId(input.location),
    bucket: input.bucket,
    reservationId:
      input.bucket === 'RESERVED'
        ? inventoryReservationId('RESERVATION_ATOMIC_TRANSFER_TEST')
        : null,
    shipmentId:
      input.bucket === 'IN_TRANSIT'
        ? inventoryShipmentId('SHIPMENT_ATOMIC_TRANSFER_TEST')
        : null,
    titleHolderId: input.titleHolder,
    riskBearerId: input.riskBearer,
    economicRecognitionId: input.recognition,
  } as InventoryAccount;
}

function draftFor(
  phase: 'SHIPMENT' | 'DELIVERY',
  options: { readonly settlementAmount?: string } = {},
) {
  const canonicalCommand = command(phase);
  const authoritativeTransition = transition(canonicalCommand);
  const quantity = Quantity.from('2', 'tonne');
  const price = Price.from('3', 'GCU', 'tonne');
  const sellerReserved = inventoryAccount({
    country: seller,
    location: 'LOCATION_SELLER_PORT',
    bucket: 'RESERVED',
    titleHolder: sellerEntity,
    riskBearer: sellerEntity,
    recognition: null,
  });
  const sellerTransit = inventoryAccount({
    country: seller,
    location: 'LOCATION_CORRIDOR',
    bucket: 'IN_TRANSIT',
    titleHolder: sellerEntity,
    riskBearer: sellerEntity,
    recognition: null,
  });
  const buyerAvailable = inventoryAccount({
    country: buyer,
    location: 'LOCATION_BUYER_PORT',
    bucket: 'AVAILABLE',
    titleHolder: buyerEntity,
    riskBearer: buyerEntity,
    recognition: economicRecognitionId('RECOGNITION_IMPORT_ATOMIC_TEST'),
  });
  const sellerSettlement = createFinancialAccount({
    worldId: world,
    accountId: financialAccountId('ACCOUNT_SELLER_SETTLEMENT_TEST'),
    ownerId: sellerEntity,
    countryId: seller,
    accountClass: 'CASH',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
  const buyerTreasury = createFinancialAccount({
    worldId: world,
    accountId: financialAccountId('ACCOUNT_BUYER_TREASURY_TEST'),
    ownerId: buyerEntity,
    countryId: buyer,
    accountClass: 'CASH',
    currency: 'GCU',
    claimId: null,
    counterpartyEntityId: null,
  });
  const inventoryPosting =
    phase === 'SHIPMENT'
      ? createShipmentPosting(
          {
            schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
            postingId: inventoryPostingId('POSTING_SHIPMENT_ATOMIC_TEST'),
            worldId: world,
            causationCommandId: canonicalCommand.commandId,
            causationEventIds: authoritativeTransition.eventIds,
            worldVersionBefore: '0',
            worldVersionAfter: '1',
            simTime: canonicalCommand.simTime,
            command: canonicalCommand,
            transition: authoritativeTransition,
            quantity,
            source: sellerReserved,
            destination: sellerTransit,
          },
          sha256,
        )
      : createDeliveryPosting(
          {
            schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
            postingId: inventoryPostingId('POSTING_DELIVERY_ATOMIC_TEST'),
            worldId: world,
            causationCommandId: canonicalCommand.commandId,
            causationEventIds: authoritativeTransition.eventIds,
            worldVersionBefore: '0',
            worldVersionAfter: '1',
            simTime: canonicalCommand.simTime,
            command: canonicalCommand,
            transition: authoritativeTransition,
            quantity,
            source: sellerTransit,
            destination: buyerAvailable,
          },
          sha256,
        );
  const settlementAmount = Money.from(options.settlementAmount ?? '6', 'GCU');
  const financialPostingBatches =
    phase === 'SHIPMENT'
      ? []
      : [
          createFinancialPostingBatch(
            {
              schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
              batchId: financialPostingBatchId('BATCH_DELIVERY_PAYMENT_TEST'),
              worldId: world,
              causationCommandId: canonicalCommand.commandId,
              causationEventIds: authoritativeTransition.eventIds,
              worldVersionBefore: '0',
              worldVersionAfter: '1',
              simTime: canonicalCommand.simTime,
              settlementCurrency: 'GCU',
              command: canonicalCommand,
              transition: authoritativeTransition,
              legs: [
                {
                  legId: financialPostingLegId('LEG_BUYER_PAYMENT_TEST'),
                  account: buyerTreasury,
                  direction: 'CREDIT',
                  amount: settlementAmount,
                  counterpartyAccountId: sellerSettlement.accountId,
                },
                {
                  legId: financialPostingLegId('LEG_SELLER_PAYMENT_TEST'),
                  account: sellerSettlement,
                  direction: 'DEBIT',
                  amount: settlementAmount,
                  counterpartyAccountId: buyerTreasury.accountId,
                },
              ],
            },
            sha256,
          ),
        ];
  const receipt = createFinalCommandReceipt({
    command: canonicalCommand,
    outcome: 'COMMITTED',
    reasonCode: null,
    transition: authoritativeTransition,
    simTime: canonicalCommand.simTime,
    recordedAtReal: AT,
  });
  const outboxPayload = { commandId: canonicalCommand.commandId, phase };
  const outbox = createOutboxMessage({
    messageId: `OUTBOX_${phase}_ATOMIC_TEST`,
    worldId: world,
    commandId: canonicalCommand.commandId,
    eventId: authoritativeTransition.eventIds[0]!,
    payload: outboxPayload,
    payloadHash: canonicalSha256(canonicalHashInput(outboxPayload), sha256),
    availableAtSimTime: canonicalCommand.simTime,
  });
  const lease = acquireWorldWriterLease(
    null,
    worldWriterLeaseRequest(
      world,
      workerId('WORKER_ATOMIC_TRANSFER_TEST'),
      AT,
      '2026-09-12T00:01:00.000Z',
    ),
  );
  const draft = {
    transition: authoritativeTransition,
    inventoryPostings: [inventoryPosting],
    financialPostingBatches,
    receipt,
    outboxMessages: [outbox],
    currentMaterializations: [],
    authorityKind: 'VERSIONED_AUTOMATIC' as const,
    commitAssertion: createWorldWriterCommitAssertion(lease.lease, '0'),
    observedAtReal: AT,
  };
  return {
    command: canonicalCommand,
    draft,
    shipmentInput: {
      command: canonicalCommand,
      commitAuthorization: null,
      reference: {
        worldId: world,
        commandId: canonicalCommand.commandId,
        commandFingerprint: canonicalCommand.fingerprint,
        expectedWorldVersion: '0',
        sellerCountryId: seller,
        quantity,
        sourceInventoryAccount: sellerReserved,
        destinationInventoryAccount: sellerTransit,
      },
      draft,
      sha256Hex: sha256,
    } satisfies V10ShipmentCandidateInput,
    deliveryInput: {
      command: canonicalCommand,
      commitAuthorization: null,
      reference: {
        worldId: world,
        commandId: canonicalCommand.commandId,
        commandFingerprint: canonicalCommand.fingerprint,
        expectedWorldVersion: '0',
        sellerCountryId: seller,
        buyerCountryId: buyer,
        sellerEntityId: sellerEntity,
        buyerEntityId: buyerEntity,
        quantity,
        price,
        sourceInventoryAccount: sellerTransit,
        destinationInventoryAccount: buyerAvailable,
        buyerTreasuryAccount: buyerTreasury,
        sellerSettlementAccount: sellerSettlement,
      },
      draft,
      sha256Hex: sha256,
    } satisfies V10DeliverySettlementCandidateInput,
  };
}

describe('V10.3 atomic transfer candidate adapter', () => {
  it('allows only the exact RESERVED -> IN_TRANSIT candidate with no payment', () => {
    const fixture = draftFor('SHIPMENT');
    const candidate = prepareV10ShipmentCandidate(fixture.shipmentInput);
    expect(candidate.inventoryPostings[0]?.operation).toBe('SHIP');
    expect(candidate.financialPostingBatches).toHaveLength(0);
  });

  it('requires delivery and the exact GCU price-by-quantity settlement together', () => {
    const fixture = draftFor('DELIVERY');
    const candidate = prepareV10DeliverySettlementCandidate(
      fixture.deliveryInput,
    );
    expect(candidate.inventoryPostings[0]?.operation).toBe('DELIVER');
    expect(candidate.financialPostingBatches[0]?.settlementCurrency).toBe(
      'GCU',
    );
  });

  it('fails closed when a balanced settlement does not equal the exact price', () => {
    const fixture = draftFor('DELIVERY', { settlementAmount: '5' });
    expect(() =>
      prepareV10DeliverySettlementCandidate(fixture.deliveryInput),
    ).toThrowError(
      expect.objectContaining({ code: 'TRANSITION_EVIDENCE_INVALID' }),
    );
  });

  it('fails closed when a delivery reference names an AVAILABLE source', () => {
    const fixture = draftFor('DELIVERY');
    const invalidInput: V10DeliverySettlementCandidateInput = {
      ...fixture.deliveryInput,
      reference: {
        ...fixture.deliveryInput.reference,
        sourceInventoryAccount:
          fixture.deliveryInput.reference.destinationInventoryAccount,
      },
    };
    expect(() =>
      prepareV10DeliverySettlementCandidate(invalidInput),
    ).toThrowError(
      expect.objectContaining({ code: 'TRANSITION_EVIDENCE_INVALID' }),
    );
  });

  it('keeps V10.2 bilateral re-resolution inside the V09 transaction guard', async () => {
    const calls: string[] = [];
    const transaction = { query: async () => ({ rowCount: 0, rows: [] }) };
    const guard = createV10DeliveryCommitAuthorizationGuard({
      base: {
        async assertCurrent(receivedTransaction) {
          expect(receivedTransaction).toBe(transaction);
          calls.push('V09_COMMAND_AUTHORIZATION');
        },
      },
      transfer: {
        async assertCurrent(receivedTransaction) {
          expect(receivedTransaction).toBe(transaction);
          calls.push('V10_BILATERAL_APPROVAL');
        },
      },
    });
    const fixture = draftFor('DELIVERY');
    await guard.assertCurrent(transaction, {
      command: fixture.command,
      authorityKind: 'VERSIONED_AUTOMATIC',
      proof: null,
    });
    expect(calls).toEqual([
      'V09_COMMAND_AUTHORIZATION',
      'V10_BILATERAL_APPROVAL',
    ]);
  });

  it('validates a factory response before V09 receives its draft', async () => {
    const fixture = draftFor('DELIVERY');
    const factory = createV10DeliverySettlementCandidateFactory({
      sha256Hex: sha256,
      factory: {
        async prepare() {
          return {
            reference: fixture.deliveryInput.reference,
            draft: fixture.deliveryInput.draft,
          };
        },
      },
    });
    await expect(
      factory.prepare({ command: fixture.command, commitAuthorization: null }),
    ).resolves.toBe(fixture.deliveryInput.draft);
  });
});
