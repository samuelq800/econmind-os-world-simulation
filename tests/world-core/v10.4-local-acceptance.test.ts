import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  Money,
  OFFICE_APPROVAL_CAPABILITY,
  SimTime,
  acquireWorldWriterLease,
  canonicalSerialize,
  createAuthoritativeTransition,
  createNarrowTransferApprovalBundle,
  createOpeningSeed,
  createWorldWriterCommitAssertion,
  deliverNarrowTreasuryGcuTransfer,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryPostingId,
  inventoryReservationId,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  proposalId,
  rebuildV08LedgersFromLineage,
  reserveNarrowTreasuryGcuTransfer,
  shipNarrowTreasuryGcuTransfer,
  signApprovalProposal,
  authorizeOfficeCapability,
  workerId,
  worldWriterLeaseRequest,
  type CanonicalCommand,
  type FinancialLedgerState,
  type InventoryLedgerState,
} from '@econmind/core';
import { prepareNarrowTreasuryGcuDeliveryAtomicDraft } from '../../apps/world-worker/src/persistence/narrow-treasury-gcu-delivery-draft.js';
import { prepareAtomicTransitionCandidate } from '../../apps/world-worker/src/persistence/atomic-transition-repository.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';

const sha256Hex = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const SUBMITTED_AT = '2026-09-14T00:00:00.000Z';
const RESERVED_AT = '2026-09-14T00:01:00.000Z';

function transferCommand(): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const source = fixture.inventoryAccounts.sellerAvailable;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: 'COMMAND_V10_4_TREASURY_GCU_TRANSFER',
      idempotencyKey: 'IDEMPOTENCY_V10_4_TREASURY_GCU_TRANSFER',
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: SUBMITTED_AT,
      correlationId: 'CORRELATION_V10_4_TREASURY_GCU_TRANSFER',
      payload: {
        schemaVersion: 'core-goods-transfer-v1',
        commodityId: 'GRAIN',
        sellerCountryId: fixture.countries.seller,
        buyerCountryId: fixture.countries.buyer,
        quantity: { amount: '2', unit: source.unit },
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
        expiresAtReal: '2026-09-14T00:10:00.000Z',
      },
    },
    sha256Hex,
  );
}

function automaticCommand(input: {
  readonly commandId: string;
  readonly commandType: string;
  readonly expectedWorldVersion: string;
  readonly payload: unknown;
  readonly simTime: string;
}): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const actor = fixture.officeActors.sellerTrade;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: input.commandType,
      commandId: input.commandId,
      idempotencyKey: `IDEMPOTENCY_${input.commandId}`,
      worldId: fixture.worldId,
      actorId: actor.actorId,
      authSubject: actor.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: null,
      expectedWorldVersion: input.expectedWorldVersion,
      simTime: input.simTime,
      submittedAtReal: SUBMITTED_AT,
      correlationId: `CORRELATION_${input.commandId}`,
      payload: input.payload,
    },
    sha256Hex,
  );
}

function transition(
  command: CanonicalCommand,
  worldVersionBefore: string,
  sequence: string,
) {
  const worldVersionAfter = String(BigInt(worldVersionBefore) + 1n);
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: command.commandType,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: worldVersionAfter,
      sequence,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: SUBMITTED_AT,
      correctsEventId: null,
      payload: { commandFingerprint: command.fingerprint },
    },
    sha256Hex,
  );
  return Object.freeze({
    event,
    transition: createAuthoritativeTransition({
      command,
      worldVersionBefore,
      worldVersionAfter,
      events: [event],
    }),
  });
}

async function approvalContext(
  actor: ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors'][keyof ReturnType<
    typeof createV10TwoCountryTestFixture
  >['officeActors']],
  proposal: ReturnType<typeof createNarrowTransferApprovalBundle>['seller'],
) {
  return authorizeOfficeCapability({
    principal: actor.principal,
    resolver: actor.resolver,
    worldId: proposal.worldId,
    requestedCountryId: proposal.countryId,
    requestedOfficeId: actor.officeId,
    capability: OFFICE_APPROVAL_CAPABILITY,
    decisionScope: {
      proposalId: proposal.id,
      proposalVersion: proposal.version,
      worldId: proposal.worldId,
      countryId: proposal.countryId,
      payloadFingerprint: proposal.payloadFingerprint,
      policyVersion: proposal.policyVersion,
      requiredOffices: proposal.requiredOffices,
    },
  });
}

async function approvedTransfer(transfer: CanonicalCommand) {
  const fixture = createV10TwoCountryTestFixture();
  const initial = createNarrowTransferApprovalBundle({
    command: transfer,
    sellerProposalId: proposalId('PROPOSAL_V10_4_SELLER'),
    buyerProposalId: proposalId('PROPOSAL_V10_4_BUYER'),
    proposalVersion: 'VERSION_1',
  });
  const sellerContext = await approvalContext(
    fixture.officeActors.sellerTrade,
    initial.seller,
  );
  const seller = await signApprovalProposal({
    proposal: initial.seller,
    context: sellerContext,
    actorId: fixture.officeActors.sellerTrade.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  const buyerTradeContext = await approvalContext(
    fixture.officeActors.buyerTrade,
    initial.buyer,
  );
  let buyer = await signApprovalProposal({
    proposal: initial.buyer,
    context: buyerTradeContext,
    actorId: fixture.officeActors.buyerTrade.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  const buyerFinanceContext = await approvalContext(
    fixture.officeActors.buyerFinance,
    buyer,
  );
  buyer = await signApprovalProposal({
    proposal: buyer,
    context: buyerFinanceContext,
    actorId: fixture.officeActors.buyerFinance.actorId,
    expectedVersion: 'VERSION_1',
    signedAt: SUBMITTED_AT,
  });
  return Object.freeze({
    fixture,
    approvals: Object.freeze({ ...initial, seller, buyer }),
    contexts: Object.freeze({
      sellerTrade: Object.freeze({
        actorId: fixture.officeActors.sellerTrade.actorId,
        context: sellerContext,
      }),
      buyerTrade: Object.freeze({
        actorId: fixture.officeActors.buyerTrade.actorId,
        context: buyerTradeContext,
      }),
      buyerFinance: Object.freeze({
        actorId: fixture.officeActors.buyerFinance.actorId,
        context: buyerFinanceContext,
      }),
    }),
  });
}

function shipmentCommand(transfer: CanonicalCommand): CanonicalCommand {
  return automaticCommand({
    commandId: 'COMMAND_V10_4_SHIPMENT',
    commandType: 'CORE_GOODS_SHIPMENT_V1',
    expectedWorldVersion: '1',
    simTime: '10100',
    payload: {
      schemaVersion: 'core-goods-shipment-v1',
      shipmentId: 'SHIPMENT_V10_4_TREASURY_GCU',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
    },
  });
}

function deliveryCommand(transfer: CanonicalCommand): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const destination = fixture.inventoryAccounts.buyerAvailable;
  return automaticCommand({
    commandId: 'COMMAND_V10_4_DELIVERY',
    commandType: 'CORE_GOODS_DELIVERY_V1',
    expectedWorldVersion: '2',
    simTime: '10200',
    payload: {
      schemaVersion: 'core-goods-delivery-v1',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
      shipmentId: 'SHIPMENT_V10_4_TREASURY_GCU',
      destination: {
        physicalLocationId: destination.physicalLocationId,
        titleHolderId: destination.titleHolderId,
        riskBearerId: destination.riskBearerId,
        economicRecognitionId: destination.economicRecognitionId,
      },
      buyerTreasuryAccountId: fixture.financialAccounts.buyerTreasury.accountId,
      sellerSettlementAccountId:
        fixture.financialAccounts.sellerSettlement.accountId,
    },
  });
}

function accountBalance(state: FinancialLedgerState, accountId: string) {
  const position = state.positions.find(
    (candidate) => candidate.account.accountId === accountId,
  );
  if (position === undefined) throw new Error('V10_4_EXPECTED_ACCOUNT_BALANCE');
  return position.netDebitBalance;
}

function commodityQuantity(state: InventoryLedgerState, commodityId: string) {
  const balances = state.balances.filter(
    (balance) => balance.account.commodityId === commodityId,
  );
  if (balances.length === 0) throw new Error('V10_4_EXPECTED_COMMODITY');
  return balances
    .slice(1)
    .reduce(
      (total, balance) => total.add(balance.quantity),
      balances[0]!.quantity,
    );
}

function withBuyerTreasuryBalance(
  fixture: ReturnType<typeof createV10TwoCountryTestFixture>,
  buyerAmount: string,
) {
  const buyerTreasuryId = fixture.financialAccounts.buyerTreasury.accountId;
  const buyerEquityId = fixture.financialAccounts.buyerOpeningEquity.accountId;
  return createOpeningSeed(
    {
      ...fixture.openingSeed,
      financialBatches: fixture.openingSeed.financialBatches.map((batch) =>
        Object.freeze({
          ...batch,
          legs: Object.freeze(
            batch.legs.map((leg) =>
              leg.account.accountId === buyerTreasuryId ||
              leg.account.accountId === buyerEquityId
                ? Object.freeze({
                    ...leg,
                    amount: Money.from(buyerAmount, leg.amount.currency),
                  })
                : leg,
            ),
          ),
        }),
      ),
    },
    sha256Hex,
  );
}

async function preparedDelivery(
  input: {
    readonly openingSeed?: ReturnType<
      typeof createV10TwoCountryTestFixture
    >['openingSeed'];
  } = {},
) {
  const transfer = transferCommand();
  const approved = await approvedTransfer(transfer);
  const reserve = transition(transfer, '0', '1');
  const reservation = await reserveNarrowTreasuryGcuTransfer({
    approvals: approved.approvals,
    contexts: approved.contexts,
    atReal: RESERVED_AT,
    inventoryState: approved.fixture.rebuiltLedgers.inventory,
    source: approved.fixture.inventoryAccounts.sellerAvailable,
    reservationId: inventoryReservationId('RESERVATION_V10_4_TREASURY_GCU'),
    postingId: inventoryPostingId('POSTING_V10_4_RESERVE'),
    transition: reserve.transition,
    simTime: SimTime.fromTicks('10000'),
    causationEventIds: [reserve.event.eventId],
    sha256Hex,
  });
  const shipment = shipmentCommand(transfer);
  const ship = transition(shipment, '1', '2');
  const reservedSource = reservation.inventory.state.balances.find(
    (balance) => balance.account.bucket === 'RESERVED',
  )?.account;
  if (reservedSource === undefined) {
    throw new Error('V10_4_EXPECTED_RESERVED_SOURCE');
  }
  const shipmentResult = shipNarrowTreasuryGcuTransfer({
    causationEventIds: [ship.event.eventId],
    inventoryState: reservation.inventory.state,
    postingId: inventoryPostingId('POSTING_V10_4_SHIPMENT'),
    shipmentCommand: shipment,
    source: reservedSource,
    transferCommand: transfer,
    transition: ship.transition,
    sha256Hex,
  });
  const preDelivery = rebuildV08LedgersFromLineage({
    seed: input.openingSeed ?? approved.fixture.openingSeed,
    transitions: [
      {
        command: transfer,
        transition: reserve.transition,
        inventoryPostings: [reservation.posting],
        financialPostingBatches: [],
      },
      {
        command: shipment,
        transition: ship.transition,
        inventoryPostings: [shipmentResult.posting],
        financialPostingBatches: [],
      },
    ],
    sha256Hex,
  });
  const source = preDelivery.inventory.balances.find(
    (balance) => balance.account.bucket === 'IN_TRANSIT',
  )?.account;
  if (source === undefined) throw new Error('V10_4_EXPECTED_TRANSIT_SOURCE');
  const delivery = deliveryCommand(transfer);
  const deliver = transition(delivery, '2', '3');
  return Object.freeze({
    fixture: approved.fixture,
    transfer,
    preDelivery,
    source,
    delivery,
    deliver,
  });
}

type DeliveryStates = Pick<
  Awaited<ReturnType<typeof preparedDelivery>>['preDelivery'],
  'financial' | 'inventory'
>;

function settle(
  input: Awaited<ReturnType<typeof preparedDelivery>>,
  states: DeliveryStates = input.preDelivery,
) {
  return deliverNarrowTreasuryGcuTransfer({
    buyerTreasury: input.fixture.financialAccounts.buyerTreasury,
    buyerTreasuryLegId: financialPostingLegId('LEG_V10_4_BUYER_TREASURY'),
    causationEventIds: [input.deliver.event.eventId],
    deliveryCommand: input.delivery,
    financialBatchId: financialPostingBatchId('BATCH_V10_4_DELIVERY'),
    financialState: states.financial,
    inventoryPostingId: inventoryPostingId('POSTING_V10_4_DELIVERY'),
    inventoryState: states.inventory,
    sellerSettlement: input.fixture.financialAccounts.sellerSettlement,
    sellerSettlementLegId: financialPostingLegId('LEG_V10_4_SELLER_SETTLEMENT'),
    source: input.source,
    transferCommand: input.transfer,
    transition: input.deliver.transition,
    sha256Hex,
  });
}

describe('V10.4 local Treasury-GCU acceptance', () => {
  it('delivers the full exact quantity and preserves bilateral GCU and goods conservation', async () => {
    const prepared = await preparedDelivery();
    const goodsBefore = commodityQuantity(
      prepared.preDelivery.inventory,
      prepared.fixture.commodity.id,
    );
    const gcuBefore = accountBalance(
      prepared.preDelivery.financial,
      prepared.fixture.financialAccounts.buyerTreasury.accountId,
    ).add(
      accountBalance(
        prepared.preDelivery.financial,
        prepared.fixture.financialAccounts.sellerSettlement.accountId,
      ),
    );

    const settled = settle(prepared);

    expect(settled.inventory.receipt.outcome).toBe('APPLIED');
    expect(settled.financial.receipt.outcome).toBe('APPLIED');
    expect(
      commodityQuantity(
        settled.inventory.state,
        prepared.fixture.commodity.id,
      ).toCanonicalValue(),
    ).toEqual(goodsBefore.toCanonicalValue());
    expect(
      accountBalance(
        settled.financial.state,
        prepared.fixture.financialAccounts.buyerTreasury.accountId,
      )
        .add(
          accountBalance(
            settled.financial.state,
            prepared.fixture.financialAccounts.sellerSettlement.accountId,
          ),
        )
        .toCanonicalValue(),
    ).toEqual(gcuBefore.toCanonicalValue());
    expect(
      settled.inventory.state.balances
        .find(
          (balance) =>
            balance.account.countryId === prepared.fixture.countries.buyer &&
            balance.account.bucket === 'AVAILABLE',
        )
        ?.quantity.toCanonicalValue().amount,
    ).toBe('2');
  });

  it('replays the exact delivery without a second goods or GCU effect', async () => {
    const prepared = await preparedDelivery();
    const settled = settle(prepared);
    const duplicate = settle(prepared, {
      inventory: settled.inventory.state,
      financial: settled.financial.state,
    });

    expect(duplicate.inventory.receipt.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.financial.receipt.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.inventory.state).toBe(settled.inventory.state);
    expect(duplicate.financial.state).toBe(settled.financial.state);
  });

  it('rejects insufficient Buyer Treasury funds before returning any partial delivery effect', async () => {
    const fixture = createV10TwoCountryTestFixture();
    const prepared = await preparedDelivery({
      openingSeed: withBuyerTreasuryBalance(fixture, '5'),
    });
    const before = canonicalSerialize({
      financial: prepared.preDelivery.financial,
      inventory: prepared.preDelivery.inventory,
    });

    expect(() => settle(prepared)).toThrow(/insufficient exact GCU funds/u);
    expect(
      canonicalSerialize({
        financial: prepared.preDelivery.financial,
        inventory: prepared.preDelivery.inventory,
      }),
    ).toBe(before);
  });

  it('binds the applied delivery to one automatic atomic draft, receipt, and outbox fact', async () => {
    const prepared = await preparedDelivery();
    const lease = acquireWorldWriterLease(
      null,
      worldWriterLeaseRequest(
        prepared.delivery.worldId,
        workerId('WORKER_V10_4_LOCAL'),
        '2026-09-14T00:02:00.000Z',
        '2026-09-14T00:07:00.000Z',
      ),
    ).lease;
    const result = prepareNarrowTreasuryGcuDeliveryAtomicDraft({
      buyerTreasury: prepared.fixture.financialAccounts.buyerTreasury,
      buyerTreasuryLegId: financialPostingLegId('LEG_V10_4_DRAFT_BUYER'),
      commitAssertion: createWorldWriterCommitAssertion(lease, '2'),
      deliveryCommand: prepared.delivery,
      eventId: 'EVENT_V10_4_DELIVERY_DRAFT',
      eventSequence: '3',
      financialBatchId: financialPostingBatchId('BATCH_V10_4_DRAFT_DELIVERY'),
      financialState: prepared.preDelivery.financial,
      inventoryPostingId: inventoryPostingId('POSTING_V10_4_DRAFT_DELIVERY'),
      inventoryState: prepared.preDelivery.inventory,
      observedAtReal: '2026-09-14T00:02:00.000Z',
      outboxMessageId: 'OUTBOX_V10_4_DELIVERY_DRAFT',
      sellerSettlement: prepared.fixture.financialAccounts.sellerSettlement,
      sellerSettlementLegId: financialPostingLegId('LEG_V10_4_DRAFT_SELLER'),
      source: prepared.source,
      transferCommand: prepared.transfer,
      sha256Hex,
    });
    const candidate = prepareAtomicTransitionCandidate({
      command: prepared.delivery,
      commitAuthorization: null,
      draft: result.draft,
      sha256Hex,
    });

    expect(candidate.authorityKind).toBe('VERSIONED_AUTOMATIC');
    expect(candidate.receipt.outcome).toBe('COMMITTED');
    expect(candidate.inventoryPostings).toHaveLength(1);
    expect(candidate.financialPostingBatches).toHaveLength(1);
    expect(candidate.outboxMessages).toHaveLength(1);
    expect(candidate.outboxMessages[0]?.eventId).toBe(
      candidate.transition.eventIds[0],
    );
  });
});
