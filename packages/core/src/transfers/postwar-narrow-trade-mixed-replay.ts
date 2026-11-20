/** Historical DATA replay of complete committed narrow Goods groups. Current
 * signatures/route/issuer authority remains a separate Worker cutoff check. */
import { DomainError, DOMAIN_ERROR_CODES } from '../errors.js';
import { canonicalSerialize } from '../serialization/canonical.js';
import type { CanonicalCommand, Sha256Hex } from '../commands/command.js';
import type { FinanceNativeBudgetCanonicalFrame } from '../commands/finance-budget-native.js';
import type { FinancialLedgerState } from '../finance/financial-ledger.js';
import {
  applyInventoryPosting,
  createInventoryAccount,
  createReservationPosting,
  type InventoryAccount,
  type InventoryLedgerState,
  type InventoryPosting,
} from '../inventory/inventory-ledger.js';
import { inventoryReservationId } from '../ids.js';
import {
  parseNarrowTreasuryGcuTransferTerms,
  NARROW_TREASURY_GCU_COMMAND_TYPE,
} from './narrow-treasury-gcu-transfer.js';
import {
  NARROW_TREASURY_GCU_SHIPMENT_COMMAND_TYPE,
  NARROW_TREASURY_GCU_DELIVERY_COMMAND_TYPE,
  shipNarrowTreasuryGcuTransfer,
  deliverNarrowTreasuryGcuTransfer,
  parseNarrowTreasuryGcuShipmentTerms,
  parseNarrowTreasuryGcuDeliveryTerms,
} from './narrow-treasury-gcu-delivery.js';

export const POSTWAR_NARROW_GOODS_TYPES: readonly string[] = Object.freeze([
  NARROW_TREASURY_GCU_COMMAND_TYPE,
  NARROW_TREASURY_GCU_SHIPMENT_COMMAND_TYPE,
  NARROW_TREASURY_GCU_DELIVERY_COMMAND_TYPE,
]);
export interface PostwarNarrowGoodsReplayEntry {
  readonly transfer: CanonicalCommand;
  readonly reservation: InventoryAccount;
  readonly shipmentId: string | null;
  readonly delivered: boolean;
}
function invalid(reason: string): never {
  throw new DomainError(
    DOMAIN_ERROR_CODES.TRANSITION_EVIDENCE_INVALID,
    'Complete narrow Goods replay: ' + reason,
  );
}
const same = (a: unknown, b: unknown) =>
  canonicalSerialize(a) === canonicalSerialize(b);
/** The enclosing reducer has independently validated the complete canonical
 * transition, receipt, global ordering and all sibling-domain effects. */
export function replayPostwarNarrowGoodsFrame(input: {
  readonly frame: FinanceNativeBudgetCanonicalFrame;
  readonly inventory: Readonly<InventoryLedgerState>;
  readonly financial: Readonly<FinancialLedgerState>;
  readonly entries: ReadonlyMap<string, PostwarNarrowGoodsReplayEntry>;
  readonly sha256Hex: Sha256Hex;
}): Readonly<{
  inventory: Readonly<InventoryLedgerState>;
  financial: Readonly<FinancialLedgerState>;
  entries: ReadonlyMap<string, PostwarNarrowGoodsReplayEntry>;
}> {
  const { frame, sha256Hex: sha } = input,
    command = frame.command,
    event = frame.events[0];
  if (
    frame.inventoryPostings.length !== 1 ||
    frame.events.length !== 1 ||
    !event ||
    input.inventory.worldId !== command.worldId ||
    input.financial.worldId !== command.worldId ||
    input.inventory.worldVersion !== frame.transition.worldVersionBefore ||
    input.financial.worldVersion !== frame.transition.worldVersionBefore
  )
    invalid('EXACT_CURRENT_GENUINE_LEDGERS_AND_ONE_POSTING_REQUIRED');
  const actual = frame.inventoryPostings[0] as InventoryPosting;
  if (
    actual.schemaVersion !== 'inventory-posting-v1' ||
    actual.entries.length !== 2
  )
    invalid('NARROW_MOVEMENT_REQUIRED');
  const entries = new Map(input.entries);
  let inventory: Readonly<InventoryLedgerState>,
    financial = input.financial;
  let expected: InventoryPosting;
  if (command.commandType === NARROW_TREASURY_GCU_COMMAND_TYPE) {
    const terms = parseNarrowTreasuryGcuTransferTerms(command),
      source = actual.entries[0]!.account;
    if (
      command.officeId !== 'TRADE' ||
      entries.has(command.commandId) ||
      actual.operation !== 'RESERVE' ||
      frame.financialPostingBatches.length !== 0 ||
      source.worldId !== command.worldId ||
      source.countryId !== terms.sellerCountryId ||
      source.commodityId !== terms.commodityId ||
      source.unit !== terms.quantity.unit ||
      source.bucket !== 'AVAILABLE' ||
      source.reservationId !== null ||
      source.shipmentId !== null ||
      source.batchId !== terms.assetSource.batchId ||
      source.physicalLocationId !== terms.assetSource.physicalLocationId ||
      source.titleHolderId !== terms.assetSource.titleHolderId ||
      source.riskBearerId !== terms.assetSource.riskBearerId ||
      source.economicRecognitionId !==
        terms.assetSource.economicRecognitionId ||
      actual.entries[1]!.account.reservationId === null ||
      input.inventory.balances.some(
        (b) =>
          b.account.reservationId === actual.entries[1]!.account.reservationId,
      )
    )
      invalid('EXACT_UNIQUE_TRANSFER_STOCK_REQUIRED');
    const destination = createInventoryAccount({
      ...source,
      bucket: 'RESERVED',
      reservationId: inventoryReservationId(
        actual.entries[1]!.account.reservationId,
      ),
      shipmentId: null,
    });
    expected = createReservationPosting(
      {
        schemaVersion: 'inventory-posting-v1',
        postingId: actual.postingId,
        worldId: command.worldId,
        causationCommandId: command.commandId,
        causationEventIds: frame.transition.eventIds,
        worldVersionBefore: frame.transition.worldVersionBefore,
        worldVersionAfter: frame.transition.worldVersionAfter,
        simTime: command.simTime,
        command,
        transition: frame.transition,
        quantity: terms.quantity,
        source,
        destination,
      },
      sha,
    );
    if (
      event.eventType !== 'NARROW_TREASURY_GCU_RESERVED_V1' ||
      !same(JSON.parse(event.canonicalPayload), {
        schemaVersion: 'narrow-treasury-gcu-reservation-event-v1',
        transferFingerprint: command.fingerprint,
      })
    )
      invalid('EXACT_RESERVATION_EVENT_REQUIRED');
    inventory = applyInventoryPosting(input.inventory, expected).state;
    entries.set(
      command.commandId,
      Object.freeze({
        transfer: command,
        reservation: destination,
        shipmentId: null,
        delivered: false,
      }),
    );
  } else {
    const body = JSON.parse(command.canonicalPayload) as {
      transferCommandId?: unknown;
    };
    const entry =
      typeof body.transferCommandId === 'string'
        ? entries.get(body.transferCommandId)
        : undefined;
    if (
      !entry ||
      entry.delivered ||
      command.simTime.ticks < entry.transfer.simTime.ticks
    )
      invalid('ACTUAL_UNDELIVERED_TRANSFER_REQUIRED');
    if (command.commandType === NARROW_TREASURY_GCU_SHIPMENT_COMMAND_TYPE) {
      const terms = parseNarrowTreasuryGcuShipmentTerms({
        shipmentCommand: command,
        transferCommand: entry.transfer,
        sha256Hex: sha,
      });
      if (
        entry.shipmentId !== null ||
        frame.financialPostingBatches.length !== 0 ||
        [...entries.values()].some((e) => e.shipmentId === terms.shipmentId)
      )
        invalid('UNIQUE_SHIPMENT_REQUIRED');
      const reduced = shipNarrowTreasuryGcuTransfer({
        shipmentCommand: command,
        transferCommand: entry.transfer,
        inventoryState: input.inventory,
        source: entry.reservation,
        postingId: actual.postingId,
        causationEventIds: frame.transition.eventIds,
        transition: frame.transition,
        sha256Hex: sha,
      });
      expected = reduced.posting;
      inventory = reduced.inventory.state;
      entries.set(
        entry.transfer.commandId,
        Object.freeze({ ...entry, shipmentId: terms.shipmentId }),
      );
      if (
        event.eventType !== 'NARROW_TREASURY_GCU_SHIPPED_V1' ||
        !same(JSON.parse(event.canonicalPayload), {
          schemaVersion: 'narrow-treasury-gcu-shipment-event-v1',
          shipmentId: terms.shipmentId,
          transferCommandId: entry.transfer.commandId,
          transferFingerprint: entry.transfer.fingerprint,
        })
      )
        invalid('EXACT_SHIPMENT_EVENT_REQUIRED');
    } else if (
      command.commandType === NARROW_TREASURY_GCU_DELIVERY_COMMAND_TYPE
    ) {
      const terms = parseNarrowTreasuryGcuDeliveryTerms({
        deliveryCommand: command,
        transferCommand: entry.transfer,
        sha256Hex: sha,
      });
      const batch = frame.financialPostingBatches[0] as
        | import('../finance/financial-ledger.js').FinancialPostingBatch
        | undefined;
      if (
        entry.shipmentId !== terms.shipmentId ||
        frame.financialPostingBatches.length !== 1 ||
        !batch ||
        batch.legs.length !== 2
      )
        invalid('ACTUAL_SHIPMENT_AND_ONE_TWO_LEG_SETTLEMENT_REQUIRED');
      const buyer = input.financial.accounts.find(
          (a) => a.accountId === terms.buyerTreasuryAccountId,
        ),
        seller = input.financial.accounts.find(
          (a) => a.accountId === terms.sellerSettlementAccountId,
        );
      if (!buyer || !seller)
        invalid('ACTUAL_EXISTING_SETTLEMENT_ACCOUNTS_REQUIRED');
      const buyerLeg = batch.legs.find(
          (l) => l.account.accountId === buyer.accountId,
        ),
        sellerLeg = batch.legs.find(
          (l) => l.account.accountId === seller.accountId,
        );
      if (!buyerLeg || !sellerLeg)
        invalid('EXACT_BUYER_AND_SELLER_SETTLEMENT_LEGS_REQUIRED');
      const reduced = deliverNarrowTreasuryGcuTransfer({
        deliveryCommand: command,
        transferCommand: entry.transfer,
        inventoryState: input.inventory,
        financialState: input.financial,
        source: createInventoryAccount({
          ...entry.reservation,
          bucket: 'IN_TRANSIT',
          reservationId: null,
          shipmentId: terms.shipmentId,
        }),
        inventoryPostingId: actual.postingId,
        financialBatchId: batch.batchId,
        buyerTreasury: buyer,
        sellerSettlement: seller,
        buyerTreasuryLegId: buyerLeg.legId,
        sellerSettlementLegId: sellerLeg.legId,
        causationEventIds: frame.transition.eventIds,
        transition: frame.transition,
        sha256Hex: sha,
      });
      if (!same(reduced.settlement, batch))
        invalid('EXACT_DERIVED_SETTLEMENT_REQUIRED');
      expected = reduced.posting;
      inventory = reduced.inventory.state;
      financial = reduced.financial.state;
      entries.set(
        entry.transfer.commandId,
        Object.freeze({ ...entry, delivered: true }),
      );
      if (
        event.eventType !== 'NARROW_TREASURY_GCU_DELIVERED_V1' ||
        !same(JSON.parse(event.canonicalPayload), {
          schemaVersion: 'narrow-treasury-gcu-delivery-event-v1',
          shipmentId: terms.shipmentId,
          transferCommandId: entry.transfer.commandId,
          transferFingerprint: entry.transfer.fingerprint,
        })
      )
        invalid('EXACT_DELIVERY_EVENT_REQUIRED');
    } else invalid('UNKNOWN_GOODS_FAMILY');
  }
  if (!same(expected, actual))
    invalid('EXACT_DERIVED_INVENTORY_POSTING_REQUIRED');
  return Object.freeze({ inventory, financial, entries });
}
