import type { CanonicalCommand, Sha256Hex } from '../commands/command.js';
import { validateCanonicalCommand } from '../commands/command.js';
import type { AuthoritativeTransition } from '../commands/receipt.js';
import { DOMAIN_ERROR_CODES, DomainError } from '../errors.js';
import {
  financialAccountId,
  economicRecognitionId,
  inventoryLocationId,
  inventoryShipmentId,
  legalEntityId,
  type EventId,
  type FinancialPostingBatchId,
  type FinancialPostingLegId,
  type InventoryPostingId,
  type InventoryShipmentId,
} from '../ids.js';
import {
  applyFinancialPostingBatch,
  createFinancialAccount,
  createFinancialPostingBatch,
  type FinancialAccount,
  type FinancialLedgerState,
  type FinancialPostingResult,
} from '../finance/financial-ledger.js';
import {
  applyInventoryPosting,
  createDeliveryPosting,
  createInventoryAccount,
  createShipmentPosting,
  INVENTORY_POSTING_SCHEMA_VERSION,
  type InventoryAccount,
  type InventoryLedgerState,
  type InventoryPostingResult,
} from '../inventory/inventory-ledger.js';
import { FINANCIAL_POSTING_SCHEMA_VERSION } from '../finance/financial-ledger.js';

import {
  parseNarrowTreasuryGcuTransferTerms,
  NARROW_TREASURY_GCU_COMMAND_TYPE,
  type NarrowTreasuryGcuTransferTerms,
} from './narrow-treasury-gcu-transfer.js';

export const NARROW_TREASURY_GCU_SHIPMENT_COMMAND_TYPE =
  'CORE_GOODS_SHIPMENT_V1' as const;
export const NARROW_TREASURY_GCU_DELIVERY_COMMAND_TYPE =
  'CORE_GOODS_DELIVERY_V1' as const;
export const NARROW_TREASURY_GCU_SHIPMENT_PAYLOAD_SCHEMA =
  'core-goods-shipment-v1' as const;
export const NARROW_TREASURY_GCU_DELIVERY_PAYLOAD_SCHEMA =
  'core-goods-delivery-v1' as const;

type JsonRecord = Readonly<Record<string, unknown>>;

export interface NarrowTreasuryGcuShipmentTerms {
  readonly shipmentId: InventoryShipmentId;
}

export interface NarrowTreasuryGcuDeliveryTerms {
  readonly shipmentId: InventoryShipmentId;
  readonly destination: Readonly<{
    readonly economicRecognitionId: string | null;
    readonly physicalLocationId: string;
    readonly riskBearerId: string;
    readonly titleHolderId: string;
  }>;
  readonly buyerTreasuryAccountId: string;
  readonly sellerSettlementAccountId: string;
}

export interface NarrowTreasuryGcuShipmentResult {
  readonly posting: ReturnType<typeof createShipmentPosting>;
  readonly inventory: Readonly<InventoryPostingResult>;
}

export interface NarrowTreasuryGcuDeliveryResult {
  readonly posting: ReturnType<typeof createDeliveryPosting>;
  readonly settlement: ReturnType<typeof createFinancialPostingBatch>;
  readonly inventory: Readonly<InventoryPostingResult>;
  readonly financial: Readonly<FinancialPostingResult>;
}

function invalid(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.COMMAND_SCHEMA_INVALID, message);
}

function deny(message: string): never {
  throw new DomainError(DOMAIN_ERROR_CODES.AUTHORIZATION_DENIED, message);
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exactKeys(
  value: JsonRecord,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (
    actual.length !== keys.length ||
    actual.some((key, index) => key !== keys[index])
  ) {
    invalid(`${label} has an unsupported or missing field`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    invalid(`${label} must be a non-empty string`);
  }
  return value;
}

function payload(command: CanonicalCommand): JsonRecord {
  try {
    return record(JSON.parse(command.canonicalPayload), 'Lifecycle payload');
  } catch (error) {
    if (error instanceof DomainError) throw error;
    invalid('Lifecycle payload must be canonical JSON');
  }
}

function sourceTransfer(
  transferCommand: CanonicalCommand,
  sha256Hex: Sha256Hex,
): Readonly<{
  readonly command: CanonicalCommand;
  readonly terms: NarrowTreasuryGcuTransferTerms;
}> {
  const command = validateCanonicalCommand(transferCommand, sha256Hex);
  if (command.commandType !== NARROW_TREASURY_GCU_COMMAND_TYPE) {
    invalid('Lifecycle source must be a narrow Treasury-GCU transfer Command');
  }
  return Object.freeze({
    command,
    terms: parseNarrowTreasuryGcuTransferTerms(command),
  });
}

function lifecycleCommand(
  command: CanonicalCommand,
  transfer: CanonicalCommand,
  expectedType:
    | typeof NARROW_TREASURY_GCU_SHIPMENT_COMMAND_TYPE
    | typeof NARROW_TREASURY_GCU_DELIVERY_COMMAND_TYPE,
  sha256Hex: Sha256Hex,
): Readonly<CanonicalCommand> {
  const parsed = validateCanonicalCommand(command, sha256Hex);
  if (
    parsed.commandType !== expectedType ||
    parsed.worldId !== transfer.worldId ||
    parsed.countryId !== transfer.countryId ||
    parsed.officeId !== null
  ) {
    invalid('Lifecycle Command is outside the narrow automatic delivery scope');
  }
  return parsed;
}

function transferReference(
  value: JsonRecord,
  transfer: CanonicalCommand,
): void {
  if (
    requiredString(value.transferCommandId, 'transferCommandId') !==
      transfer.commandId ||
    requiredString(value.transferFingerprint, 'transferFingerprint') !==
      transfer.fingerprint
  ) {
    invalid('Lifecycle Command does not bind the original transfer identity');
  }
}

function assertReservedSource(
  source: InventoryAccount,
  terms: NarrowTreasuryGcuTransferTerms,
  transfer: CanonicalCommand,
): Readonly<InventoryAccount> {
  const account = createInventoryAccount(source);
  if (
    account.worldId !== transfer.worldId ||
    account.countryId !== terms.sellerCountryId ||
    account.commodityId !== terms.commodityId ||
    account.unit !== terms.quantity.unit ||
    account.batchId !== terms.assetSource.batchId ||
    account.physicalLocationId !== terms.assetSource.physicalLocationId ||
    account.titleHolderId !== terms.assetSource.titleHolderId ||
    account.riskBearerId !== terms.assetSource.riskBearerId ||
    account.economicRecognitionId !== terms.assetSource.economicRecognitionId ||
    account.bucket !== 'RESERVED' ||
    account.reservationId === null ||
    account.shipmentId !== null
  ) {
    deny('Shipment source is not the reserved asset bound by the transfer');
  }
  return account;
}

function assertTransitSource(
  source: InventoryAccount,
  terms: NarrowTreasuryGcuTransferTerms,
  transfer: CanonicalCommand,
  shipmentId: InventoryShipmentId,
): Readonly<InventoryAccount> {
  const account = createInventoryAccount(source);
  if (
    account.worldId !== transfer.worldId ||
    account.countryId !== terms.sellerCountryId ||
    account.commodityId !== terms.commodityId ||
    account.unit !== terms.quantity.unit ||
    account.batchId !== terms.assetSource.batchId ||
    account.titleHolderId !== terms.assetSource.titleHolderId ||
    account.riskBearerId !== terms.assetSource.riskBearerId ||
    account.economicRecognitionId !== terms.assetSource.economicRecognitionId ||
    account.bucket !== 'IN_TRANSIT' ||
    account.reservationId !== null ||
    account.shipmentId !== shipmentId
  ) {
    deny('Delivery source is not the in-transit asset bound by the shipment');
  }
  return account;
}

function assertSettlementAccounts(input: {
  readonly buyer: FinancialAccount;
  readonly delivery: NarrowTreasuryGcuDeliveryTerms;
  readonly seller: FinancialAccount;
  readonly source: InventoryAccount;
  readonly terms: NarrowTreasuryGcuTransferTerms;
}): Readonly<{
  readonly buyer: FinancialAccount;
  readonly seller: FinancialAccount;
}> {
  const buyer = createFinancialAccount(input.buyer);
  const seller = createFinancialAccount(input.seller);
  if (
    buyer.accountId !==
      financialAccountId(input.delivery.buyerTreasuryAccountId) ||
    seller.accountId !==
      financialAccountId(input.delivery.sellerSettlementAccountId) ||
    buyer.countryId !== input.terms.buyerCountryId ||
    seller.countryId !== input.terms.sellerCountryId ||
    buyer.accountClass !== 'CASH' ||
    seller.accountClass !== 'CASH' ||
    buyer.currency !== input.terms.price.currency ||
    seller.currency !== input.terms.price.currency ||
    buyer.claimId !== null ||
    seller.claimId !== null ||
    buyer.counterpartyEntityId !== null ||
    seller.counterpartyEntityId !== null ||
    seller.ownerId !== input.source.titleHolderId ||
    buyer.ownerId !== legalEntityId(input.delivery.destination.titleHolderId)
  ) {
    deny(
      'Delivery settlement accounts are outside the bound Treasury-GCU scope',
    );
  }
  return Object.freeze({ buyer, seller });
}

function assertBuyerFunds(
  state: FinancialLedgerState,
  buyerAccount: FinancialAccount,
  amount: NarrowTreasuryGcuTransferTerms['threshold']['maxSettlement'],
): void {
  const position = state.positions.find(
    (candidate) => candidate.account.accountId === buyerAccount.accountId,
  );
  if (position === undefined) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
      'Buyer Treasury does not have an authoritative ledger position',
    );
  }
  if (position.account.currency !== amount.currency) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
      'Buyer Treasury settlement currency does not match the transfer',
    );
  }
  if (position.netDebitBalance.amount.lessThan(amount.amount)) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.SETTLEMENT_MAPPING_INVALID,
      'Buyer Treasury has insufficient exact GCU funds for delivery settlement',
    );
  }
}

export function parseNarrowTreasuryGcuShipmentTerms(input: {
  readonly shipmentCommand: CanonicalCommand;
  readonly transferCommand: CanonicalCommand;
  readonly sha256Hex: Sha256Hex;
}): Readonly<NarrowTreasuryGcuShipmentTerms> {
  const transfer = sourceTransfer(input.transferCommand, input.sha256Hex);
  const shipment = lifecycleCommand(
    input.shipmentCommand,
    transfer.command,
    NARROW_TREASURY_GCU_SHIPMENT_COMMAND_TYPE,
    input.sha256Hex,
  );
  const value = payload(shipment);
  exactKeys(
    value,
    ['schemaVersion', 'shipmentId', 'transferCommandId', 'transferFingerprint'],
    'Shipment payload',
  );
  if (value.schemaVersion !== NARROW_TREASURY_GCU_SHIPMENT_PAYLOAD_SCHEMA) {
    invalid('Shipment payload schema is unsupported');
  }
  transferReference(value, transfer.command);
  return Object.freeze({
    shipmentId: inventoryShipmentId(
      requiredString(value.shipmentId, 'shipmentId'),
    ),
  });
}

export function parseNarrowTreasuryGcuDeliveryTerms(input: {
  readonly deliveryCommand: CanonicalCommand;
  readonly transferCommand: CanonicalCommand;
  readonly sha256Hex: Sha256Hex;
}): Readonly<NarrowTreasuryGcuDeliveryTerms> {
  const transfer = sourceTransfer(input.transferCommand, input.sha256Hex);
  const delivery = lifecycleCommand(
    input.deliveryCommand,
    transfer.command,
    NARROW_TREASURY_GCU_DELIVERY_COMMAND_TYPE,
    input.sha256Hex,
  );
  const value = payload(delivery);
  exactKeys(
    value,
    [
      'buyerTreasuryAccountId',
      'destination',
      'schemaVersion',
      'sellerSettlementAccountId',
      'shipmentId',
      'transferCommandId',
      'transferFingerprint',
    ],
    'Delivery payload',
  );
  if (value.schemaVersion !== NARROW_TREASURY_GCU_DELIVERY_PAYLOAD_SCHEMA) {
    invalid('Delivery payload schema is unsupported');
  }
  transferReference(value, transfer.command);
  const destination = record(value.destination, 'destination');
  exactKeys(
    destination,
    [
      'economicRecognitionId',
      'physicalLocationId',
      'riskBearerId',
      'titleHolderId',
    ],
    'Delivery destination',
  );
  if (
    destination.economicRecognitionId !== null &&
    typeof destination.economicRecognitionId !== 'string'
  ) {
    invalid('destination.economicRecognitionId must be a string or null');
  }
  return Object.freeze({
    shipmentId: inventoryShipmentId(
      requiredString(value.shipmentId, 'shipmentId'),
    ),
    destination: Object.freeze({
      economicRecognitionId: destination.economicRecognitionId,
      physicalLocationId: requiredString(
        destination.physicalLocationId,
        'destination.physicalLocationId',
      ),
      riskBearerId: requiredString(
        destination.riskBearerId,
        'destination.riskBearerId',
      ),
      titleHolderId: requiredString(
        destination.titleHolderId,
        'destination.titleHolderId',
      ),
    }),
    buyerTreasuryAccountId: requiredString(
      value.buyerTreasuryAccountId,
      'buyerTreasuryAccountId',
    ),
    sellerSettlementAccountId: requiredString(
      value.sellerSettlementAccountId,
      'sellerSettlementAccountId',
    ),
  });
}

/** Produces and applies the exact RESERVED -> IN_TRANSIT lifecycle movement. */
export function shipNarrowTreasuryGcuTransfer(input: {
  readonly causationEventIds: readonly EventId[];
  readonly inventoryState: InventoryLedgerState;
  readonly postingId: InventoryPostingId;
  readonly shipmentCommand: CanonicalCommand;
  readonly source: InventoryAccount;
  readonly transferCommand: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly sha256Hex: Sha256Hex;
}): Readonly<NarrowTreasuryGcuShipmentResult> {
  const transfer = sourceTransfer(input.transferCommand, input.sha256Hex);
  const shipment = parseNarrowTreasuryGcuShipmentTerms({
    shipmentCommand: input.shipmentCommand,
    transferCommand: transfer.command,
    sha256Hex: input.sha256Hex,
  });
  const source = assertReservedSource(
    input.source,
    transfer.terms,
    transfer.command,
  );
  const destination = createInventoryAccount({
    ...source,
    bucket: 'IN_TRANSIT',
    reservationId: null,
    shipmentId: shipment.shipmentId,
  });
  const posting = createShipmentPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: input.postingId,
      worldId: transfer.command.worldId,
      causationCommandId: input.shipmentCommand.commandId,
      causationEventIds: input.causationEventIds,
      worldVersionBefore: input.transition.worldVersionBefore,
      worldVersionAfter: input.transition.worldVersionAfter,
      simTime: input.shipmentCommand.simTime,
      command: input.shipmentCommand,
      transition: input.transition,
      quantity: transfer.terms.quantity,
      source,
      destination,
    },
    input.sha256Hex,
  );
  return Object.freeze({
    posting,
    inventory: applyInventoryPosting(input.inventoryState, posting),
  });
}

/**
 * Produces delivery inventory and financial facts before applying either one.
 * Both facts bind the one delivery transition; a rejection returns no partial
 * candidate state to a caller.
 */
export function deliverNarrowTreasuryGcuTransfer(input: {
  readonly buyerTreasury: FinancialAccount;
  readonly causationEventIds: readonly EventId[];
  readonly deliveryCommand: CanonicalCommand;
  readonly financialBatchId: FinancialPostingBatchId;
  readonly financialState: FinancialLedgerState;
  readonly inventoryState: InventoryLedgerState;
  readonly inventoryPostingId: InventoryPostingId;
  readonly sellerSettlement: FinancialAccount;
  readonly sellerSettlementLegId: FinancialPostingLegId;
  readonly buyerTreasuryLegId: FinancialPostingLegId;
  readonly source: InventoryAccount;
  readonly transferCommand: CanonicalCommand;
  readonly transition: AuthoritativeTransition;
  readonly sha256Hex: Sha256Hex;
}): Readonly<NarrowTreasuryGcuDeliveryResult> {
  const transfer = sourceTransfer(input.transferCommand, input.sha256Hex);
  const delivery = parseNarrowTreasuryGcuDeliveryTerms({
    deliveryCommand: input.deliveryCommand,
    transferCommand: transfer.command,
    sha256Hex: input.sha256Hex,
  });
  const source = assertTransitSource(
    input.source,
    transfer.terms,
    transfer.command,
    delivery.shipmentId,
  );
  const destination = createInventoryAccount({
    ...source,
    countryId: transfer.terms.buyerCountryId,
    physicalLocationId: inventoryLocationId(
      delivery.destination.physicalLocationId,
    ),
    bucket: 'AVAILABLE',
    reservationId: null,
    shipmentId: null,
    titleHolderId: legalEntityId(delivery.destination.titleHolderId),
    riskBearerId: legalEntityId(delivery.destination.riskBearerId),
    economicRecognitionId:
      delivery.destination.economicRecognitionId === null
        ? null
        : economicRecognitionId(delivery.destination.economicRecognitionId),
  });
  if (
    destination.countryId !== transfer.terms.buyerCountryId ||
    destination.bucket !== 'AVAILABLE' ||
    destination.reservationId !== null ||
    destination.shipmentId !== null
  ) {
    deny('Delivery destination is outside the Buyer available scope');
  }
  const accounts = assertSettlementAccounts({
    buyer: input.buyerTreasury,
    delivery,
    seller: input.sellerSettlement,
    source,
    terms: transfer.terms,
  });
  const settlementAmount = transfer.terms.price.multiply(
    transfer.terms.quantity,
  );
  const posting = createDeliveryPosting(
    {
      schemaVersion: INVENTORY_POSTING_SCHEMA_VERSION,
      postingId: input.inventoryPostingId,
      worldId: transfer.command.worldId,
      causationCommandId: input.deliveryCommand.commandId,
      causationEventIds: input.causationEventIds,
      worldVersionBefore: input.transition.worldVersionBefore,
      worldVersionAfter: input.transition.worldVersionAfter,
      simTime: input.deliveryCommand.simTime,
      command: input.deliveryCommand,
      transition: input.transition,
      quantity: transfer.terms.quantity,
      source,
      destination,
    },
    input.sha256Hex,
  );
  const settlement = createFinancialPostingBatch(
    {
      schemaVersion: FINANCIAL_POSTING_SCHEMA_VERSION,
      batchId: input.financialBatchId,
      worldId: transfer.command.worldId,
      causationCommandId: input.deliveryCommand.commandId,
      causationEventIds: input.causationEventIds,
      worldVersionBefore: input.transition.worldVersionBefore,
      worldVersionAfter: input.transition.worldVersionAfter,
      simTime: input.deliveryCommand.simTime,
      command: input.deliveryCommand,
      transition: input.transition,
      settlementCurrency: settlementAmount.currency,
      legs: [
        {
          legId: input.buyerTreasuryLegId,
          account: accounts.buyer,
          direction: 'CREDIT',
          amount: settlementAmount,
          counterpartyAccountId: accounts.seller.accountId,
        },
        {
          legId: input.sellerSettlementLegId,
          account: accounts.seller,
          direction: 'DEBIT',
          amount: settlementAmount,
          counterpartyAccountId: accounts.buyer.accountId,
        },
      ],
    },
    input.sha256Hex,
  );
  const inventory = applyInventoryPosting(input.inventoryState, posting);
  const financial = applyFinancialPostingBatch(
    input.financialState,
    settlement,
  );
  if (inventory.receipt.outcome !== financial.receipt.outcome) {
    throw new DomainError(
      DOMAIN_ERROR_CODES.IDEMPOTENCY_CONFLICT,
      'Delivery inventory and financial facts have inconsistent replay state',
    );
  }
  if (inventory.receipt.outcome !== 'EXACT_DUPLICATE') {
    assertBuyerFunds(input.financialState, accounts.buyer, settlementAmount);
  }
  return Object.freeze({ posting, settlement, inventory, financial });
}
