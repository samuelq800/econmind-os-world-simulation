import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_SCHEMA_VERSION,
  EVENT_SCHEMA_VERSION,
  FINANCIAL_LEDGER_SCHEMA_VERSION,
  Money,
  createAuthoritativeTransition,
  financialPostingBatchId,
  financialPostingLegId,
  inventoryPostingId,
  parseNarrowTreasuryGcuTransferTerms,
  parseAuthoritativeEvent,
  parseCanonicalCommand,
  shipNarrowTreasuryGcuTransfer,
  deliverNarrowTreasuryGcuTransfer,
  type CanonicalCommand,
} from '../../packages/core/src/index.js';
import {
  authorizeFinancialLedgerState,
  authorizeInventoryLedgerState,
} from '../../packages/core/src/opening/ledger-authority.js';
import { createV10TwoCountryTestFixture } from '../support/v10-two-country-fixture.js';

const sha256 = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

const SUBMITTED_AT = '2026-09-14T00:00:00.000Z';

function transferCommand(): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const source = fixture.inventoryAccounts.sellerAvailable;
  return parseCanonicalCommand(
    {
      schemaVersion: COMMAND_SCHEMA_VERSION,
      commandType: 'CORE_GOODS_TRANSFER_V1',
      commandId: 'COMMAND_V10_2_RESERVE',
      idempotencyKey: 'IDEMPOTENCY_V10_2_RESERVE',
      worldId: fixture.worldId,
      actorId: fixture.officeActors.sellerTrade.actorId,
      authSubject: fixture.officeActors.sellerTrade.principal.authSubject,
      countryId: fixture.countries.seller,
      officeId: 'TRADE',
      expectedWorldVersion: '0',
      simTime: '10000',
      submittedAtReal: SUBMITTED_AT,
      correlationId: 'CORRELATION_V10_2_RESERVE',
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
    sha256,
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
    sha256,
  );
}

function transition(command: CanonicalCommand, versionBefore: string) {
  const versionAfter = String(BigInt(versionBefore) + 1n);
  const event = parseAuthoritativeEvent(
    {
      schemaVersion: EVENT_SCHEMA_VERSION,
      eventId: `EVENT_${command.commandId}`,
      eventType: command.commandType,
      worldId: command.worldId,
      causationCommandId: command.commandId,
      correlationId: command.correlationId,
      worldVersion: versionAfter,
      sequence: versionAfter,
      simTime: command.simTime.toCanonicalValue(),
      recordedAtReal: SUBMITTED_AT,
      correctsEventId: null,
      payload: { commandFingerprint: command.fingerprint },
    },
    sha256,
  );
  return Object.freeze({
    event,
    transition: createAuthoritativeTransition({
      command,
      worldVersionBefore: versionBefore,
      worldVersionAfter: versionAfter,
      events: [event],
    }),
  });
}

function shipmentCommand(transfer: CanonicalCommand): CanonicalCommand {
  return automaticCommand({
    commandId: 'COMMAND_V10_3_SHIPMENT',
    commandType: 'CORE_GOODS_SHIPMENT_V1',
    expectedWorldVersion: '1',
    simTime: '10100',
    payload: {
      schemaVersion: 'core-goods-shipment-v1',
      shipmentId: 'SHIPMENT_V10_TEST_TRANSFER',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
    },
  });
}

function deliveryCommand(
  transfer: CanonicalCommand,
  input: { readonly buyerTreasuryAccountId?: string } = {},
): CanonicalCommand {
  const fixture = createV10TwoCountryTestFixture();
  const destination = fixture.inventoryAccounts.buyerAvailable;
  return automaticCommand({
    commandId: 'COMMAND_V10_3_DELIVERY',
    commandType: 'CORE_GOODS_DELIVERY_V1',
    expectedWorldVersion: '2',
    simTime: '10200',
    payload: {
      schemaVersion: 'core-goods-delivery-v1',
      transferCommandId: transfer.commandId,
      transferFingerprint: transfer.fingerprint,
      shipmentId: 'SHIPMENT_V10_TEST_TRANSFER',
      destination: {
        physicalLocationId: destination.physicalLocationId,
        titleHolderId: destination.titleHolderId,
        riskBearerId: destination.riskBearerId,
        economicRecognitionId: destination.economicRecognitionId,
      },
      buyerTreasuryAccountId:
        input.buyerTreasuryAccountId ??
        fixture.financialAccounts.buyerTreasury.accountId,
      sellerSettlementAccountId:
        fixture.financialAccounts.sellerSettlement.accountId,
    },
  });
}

function reservedInventoryState(transfer: CanonicalCommand) {
  const fixture = createV10TwoCountryTestFixture();
  return authorizeInventoryLedgerState({
    schemaVersion: 'inventory-ledger-v1' as const,
    worldId: transfer.worldId,
    worldVersion: '1',
    balances: Object.freeze([
      Object.freeze({
        account: fixture.inventoryAccounts.sellerReserved,
        quantity: fixture.transferIntent.quantity,
      }),
    ]),
    appliedPostings: Object.freeze([]),
  });
}

function financialState(input: { readonly buyerAmount?: string } = {}) {
  const fixture = createV10TwoCountryTestFixture();
  const base = fixture.rebuiltLedgers.financial;
  return authorizeFinancialLedgerState({
    ...base,
    schemaVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
    worldVersion: '2',
    positions: Object.freeze(
      base.positions.map((position) =>
        position.account.accountId ===
        fixture.financialAccounts.buyerTreasury.accountId
          ? Object.freeze({
              ...position,
              netDebitBalance: Money.from(
                input.buyerAmount ?? '8',
                position.netDebitBalance.currency,
              ),
            })
          : position,
      ),
    ),
  });
}

function shippedScenario() {
  const fixture = createV10TwoCountryTestFixture();
  const transfer = transferCommand();
  const shipment = shipmentCommand(transfer);
  const shipmentTransition = transition(shipment, '1');
  const shipped = shipNarrowTreasuryGcuTransfer({
    causationEventIds: [shipmentTransition.event.eventId],
    inventoryState: reservedInventoryState(transfer),
    postingId: inventoryPostingId('POSTING_V10_3_SHIPMENT'),
    shipmentCommand: shipment,
    source: fixture.inventoryAccounts.sellerReserved,
    transferCommand: transfer,
    transition: shipmentTransition.transition,
    sha256Hex: sha256,
  });
  return Object.freeze({
    fixture,
    transfer,
    shipment,
    shipmentTransition,
    shipped,
  });
}

function shippedSource(scenario: ReturnType<typeof shippedScenario>) {
  const balance = scenario.shipped.inventory.state.balances.find(
    (candidate) => candidate.account.bucket === 'IN_TRANSIT',
  );
  if (balance === undefined) {
    throw new Error(
      'Expected the shipment scenario to contain an in-transit source',
    );
  }
  return balance.account;
}

describe('V10.3 narrow Treasury-GCU shipment and delivery', () => {
  it('moves the exact reserved asset to transit before Buyer availability', () => {
    const scenario = shippedScenario();
    expect(scenario.shipped.posting.operation).toBe('SHIP');
    expect(
      scenario.shipped.inventory.state.balances.some(
        (balance) =>
          balance.account.countryId === scenario.fixture.countries.buyer,
      ),
    ).toBe(false);
    expect(
      scenario.shipped.inventory.state.balances
        .find((balance) => balance.account.bucket === 'IN_TRANSIT')
        ?.quantity.toCanonicalValue().amount,
    ).toBe('2');
  });

  it('delivers goods and GCU together with exact bilateral conservation', () => {
    const scenario = shippedScenario();
    const delivery = deliveryCommand(scenario.transfer);
    const deliveryTransition = transition(delivery, '2');
    expect(
      financialState()
        .positions.find(
          (position) =>
            position.account.accountId ===
            scenario.fixture.financialAccounts.buyerTreasury.accountId,
        )
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('8');
    expect(
      financialState()
        .positions.find(
          (position) =>
            position.account.accountId ===
            scenario.fixture.financialAccounts.buyerTreasury.accountId,
        )
        ?.netDebitBalance.amount.lessThan(Money.from('6', 'GCU').amount),
    ).toBe(false);
    expect(
      parseNarrowTreasuryGcuTransferTerms(scenario.transfer)
        .price.multiply(
          parseNarrowTreasuryGcuTransferTerms(scenario.transfer).quantity,
        )
        .toCanonicalValue().amount,
    ).toBe('6');
    const settled = deliverNarrowTreasuryGcuTransfer({
      buyerTreasury: scenario.fixture.financialAccounts.buyerTreasury,
      buyerTreasuryLegId: financialPostingLegId('LEG_V10_3_BUYER_TREASURY'),
      causationEventIds: [deliveryTransition.event.eventId],
      deliveryCommand: delivery,
      financialBatchId: financialPostingBatchId('BATCH_V10_3_DELIVERY'),
      financialState: financialState(),
      inventoryPostingId: inventoryPostingId('POSTING_V10_3_DELIVERY'),
      inventoryState: scenario.shipped.inventory.state,
      sellerSettlement: scenario.fixture.financialAccounts.sellerSettlement,
      sellerSettlementLegId: financialPostingLegId(
        'LEG_V10_3_SELLER_SETTLEMENT',
      ),
      source: shippedSource(scenario),
      transferCommand: scenario.transfer,
      transition: deliveryTransition.transition,
      sha256Hex: sha256,
    });

    expect(settled.posting.operation).toBe('DELIVER');
    expect(settled.inventory.receipt.outcome).toBe('APPLIED');
    expect(settled.financial.receipt.outcome).toBe('APPLIED');
    expect(
      settled.inventory.state.balances
        .find(
          (balance) =>
            balance.account.countryId === scenario.fixture.countries.buyer,
        )
        ?.quantity.toCanonicalValue().amount,
    ).toBe('2');
    expect(
      settled.financial.state.positions
        .find(
          (position) =>
            position.account.accountId ===
            scenario.fixture.financialAccounts.buyerTreasury.accountId,
        )
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('2');
    expect(
      settled.financial.state.positions
        .find(
          (position) =>
            position.account.accountId ===
            scenario.fixture.financialAccounts.sellerSettlement.accountId,
        )
        ?.netDebitBalance.toCanonicalValue().amount,
    ).toBe('8');

    const duplicate = deliverNarrowTreasuryGcuTransfer({
      buyerTreasury: scenario.fixture.financialAccounts.buyerTreasury,
      buyerTreasuryLegId: financialPostingLegId('LEG_V10_3_BUYER_TREASURY'),
      causationEventIds: [deliveryTransition.event.eventId],
      deliveryCommand: delivery,
      financialBatchId: financialPostingBatchId('BATCH_V10_3_DELIVERY'),
      financialState: settled.financial.state,
      inventoryPostingId: inventoryPostingId('POSTING_V10_3_DELIVERY'),
      inventoryState: settled.inventory.state,
      sellerSettlement: scenario.fixture.financialAccounts.sellerSettlement,
      sellerSettlementLegId: financialPostingLegId(
        'LEG_V10_3_SELLER_SETTLEMENT',
      ),
      source: shippedSource(scenario),
      transferCommand: scenario.transfer,
      transition: deliveryTransition.transition,
      sha256Hex: sha256,
    });
    expect(duplicate.inventory.receipt.outcome).toBe('EXACT_DUPLICATE');
    expect(duplicate.financial.receipt.outcome).toBe('EXACT_DUPLICATE');
  });

  it('fails before returning an effect when Buyer Treasury funds are insufficient', () => {
    const scenario = shippedScenario();
    const delivery = deliveryCommand(scenario.transfer);
    const deliveryTransition = transition(delivery, '2');
    expect(() =>
      deliverNarrowTreasuryGcuTransfer({
        buyerTreasury: scenario.fixture.financialAccounts.buyerTreasury,
        buyerTreasuryLegId: financialPostingLegId('LEG_V10_3_BUYER_TREASURY'),
        causationEventIds: [deliveryTransition.event.eventId],
        deliveryCommand: delivery,
        financialBatchId: financialPostingBatchId('BATCH_V10_3_NO_FUNDS'),
        financialState: financialState({ buyerAmount: '5' }),
        inventoryPostingId: inventoryPostingId('POSTING_V10_3_NO_FUNDS'),
        inventoryState: scenario.shipped.inventory.state,
        sellerSettlement: scenario.fixture.financialAccounts.sellerSettlement,
        sellerSettlementLegId: financialPostingLegId(
          'LEG_V10_3_SELLER_SETTLEMENT',
        ),
        source: shippedSource(scenario),
        transferCommand: scenario.transfer,
        transition: deliveryTransition.transition,
        sha256Hex: sha256,
      }),
    ).toThrow(/insufficient exact GCU funds/u);
  });

  it('rejects a delivery whose bound Treasury account does not match the server-held account', () => {
    const scenario = shippedScenario();
    const delivery = deliveryCommand(scenario.transfer, {
      buyerTreasuryAccountId: 'ACCOUNT_V10_OTHER_TREASURY',
    });
    const deliveryTransition = transition(delivery, '2');
    expect(() =>
      deliverNarrowTreasuryGcuTransfer({
        buyerTreasury: scenario.fixture.financialAccounts.buyerTreasury,
        buyerTreasuryLegId: financialPostingLegId('LEG_V10_3_BUYER_TREASURY'),
        causationEventIds: [deliveryTransition.event.eventId],
        deliveryCommand: delivery,
        financialBatchId: financialPostingBatchId('BATCH_V10_3_FORGED_ACCOUNT'),
        financialState: financialState(),
        inventoryPostingId: inventoryPostingId('POSTING_V10_3_FORGED_ACCOUNT'),
        inventoryState: scenario.shipped.inventory.state,
        sellerSettlement: scenario.fixture.financialAccounts.sellerSettlement,
        sellerSettlementLegId: financialPostingLegId(
          'LEG_V10_3_SELLER_SETTLEMENT',
        ),
        source: shippedSource(scenario),
        transferCommand: scenario.transfer,
        transition: deliveryTransition.transition,
        sha256Hex: sha256,
      }),
    ).toThrow(
      /Delivery settlement accounts are outside the bound Treasury-GCU scope/u,
    );
  });
});
